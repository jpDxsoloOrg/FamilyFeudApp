/**
 * In-memory stand-in for the single table (ported from Know It Owl). Evaluates
 * the ConditionExpressions the handlers actually write, so a test exercises the
 * real invariants. Unsupported expression forms throw loudly.
 */
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { mockClient } from "aws-sdk-client-mock";
import { setClient } from "../lib/db.js";
import { setMessageTransport } from "../lib/messages.js";

type Item = Record<string, unknown>;
type Values = Record<string, unknown>;
type Names = Record<string, string>;

function itemKey(pk: unknown, sk: unknown): string {
  return `${String(pk)} :: ${String(sk)}`;
}

function resolveName(token: string, names: Names): string {
  return token.startsWith("#") ? (names[token] ?? token) : token;
}

function splitTop(expression: string, operator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const token of expression.split(/\s+/)) {
    if (token.toUpperCase() === operator && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    depth += (token.match(/\(/g) ?? []).length - (token.match(/\)/g) ?? []).length;
    current += `${token} `;
  }
  parts.push(current.trim());
  return parts;
}

function evaluateAtom(atom: string, item: Item | undefined, names: Names, values: Values): boolean {
  const exists = /^attribute_exists\((.+)\)$/.exec(atom);
  if (exists) return item !== undefined && resolveName(exists[1], names) in item;
  const notExists = /^attribute_not_exists\((.+)\)$/.exec(atom);
  if (notExists) return item === undefined || !(resolveName(notExists[1], names) in item);
  const inList = /^(\S+) IN \((.+)\)$/.exec(atom);
  if (inList) {
    if (!item) return false;
    const actual = item[resolveName(inList[1], names)];
    return inList[2]
      .split(",")
      .map((token) => values[token.trim()])
      .some((candidate) => candidate === actual);
  }
  const equals = /^(\S+) = (\S+)$/.exec(atom);
  if (equals) {
    if (!item) return false;
    return item[resolveName(equals[1], names)] === values[equals[2]];
  }
  throw new Error(`fakeDynamo: unsupported condition atom "${atom}"`);
}

function evaluateCondition(
  expression: string | undefined,
  item: Item | undefined,
  names: Names,
  values: Values,
): boolean {
  if (!expression) return true;
  return splitTop(expression, "OR").some((clause) =>
    splitTop(clause, "AND").every((atom) =>
      evaluateAtom(atom.replace(/^\((.*)\)$/, "$1").trim(), item, names, values),
    ),
  );
}

/** Only `SET a = :v` and `SET a = a + :v`. */
function applyUpdate(item: Item, expression: string, names: Names, values: Values): Item {
  const body = /^SET (.+)$/i.exec(expression.trim());
  if (!body) throw new Error(`fakeDynamo: unsupported update "${expression}"`);
  const updated = { ...item };
  for (const assignment of body[1].split(",")) {
    const sum = /^(\S+) = (\S+) \+ (\S+)$/.exec(assignment.trim());
    if (sum) {
      const left = updated[resolveName(sum[2], names)];
      const right = values[sum[3]];
      if (typeof left !== "number" || typeof right !== "number") {
        throw new Error(`fakeDynamo: cannot add non-numbers in "${assignment}"`);
      }
      updated[resolveName(sum[1], names)] = left + right;
      continue;
    }
    const set = /^(\S+) = (\S+)$/.exec(assignment.trim());
    if (!set) throw new Error(`fakeDynamo: unsupported assignment "${assignment}"`);
    updated[resolveName(set[1], names)] = values[set[2]];
  }
  return updated;
}

class ConditionFailed extends Error {
  constructor() {
    super("The conditional request failed");
    this.name = "ConditionalCheckFailedException";
  }
}

export interface FakeTable {
  get(pk: string, sk: string): Item | undefined;
  all(): Item[];
  seed(...items: Item[]): void;
  delete(pk: string, sk: string): void;
  reset(): void;
}

/**
 * Install the fake as the document client and return its backing store. Also
 * silences private-message publishing; a test that cares installs its own
 * transport afterwards.
 */
export function installFakeDynamo(): FakeTable {
  process.env.TABLE_NAME ??= "familyfeud-test";
  setMessageTransport(async () => {});
  const items = new Map<string, Item>();
  const ddbMock = mockClient(DynamoDBDocumentClient);
  ddbMock.reset();
  setClient(DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" })));

  const table: FakeTable = {
    get: (pk, sk) => items.get(itemKey(pk, sk)),
    all: () => [...items.values()],
    delete: (pk, sk) => {
      items.delete(itemKey(pk, sk));
    },
    seed: (...seeded) => {
      for (const item of seeded) items.set(itemKey(item.pk, item.sk), { ...item });
    },
    reset: () => items.clear(),
  };

  ddbMock.on(GetCommand).callsFake((input: { Key: Item }) => ({
    Item: items.get(itemKey(input.Key.pk, input.Key.sk)),
  }));

  ddbMock.on(PutCommand).callsFake((input: Record<string, unknown>) => {
    const item = input.Item as Item;
    const key = itemKey(item.pk, item.sk);
    const ok = evaluateCondition(
      input.ConditionExpression as string | undefined,
      items.get(key),
      (input.ExpressionAttributeNames ?? {}) as Names,
      (input.ExpressionAttributeValues ?? {}) as Values,
    );
    if (!ok) throw new ConditionFailed();
    items.set(key, { ...item });
    return {};
  });

  ddbMock.on(UpdateCommand).callsFake((input: Record<string, unknown>) => {
    const inputKey = input.Key as Item;
    const key = itemKey(inputKey.pk, inputKey.sk);
    const names = (input.ExpressionAttributeNames ?? {}) as Names;
    const values = (input.ExpressionAttributeValues ?? {}) as Values;
    const existing = items.get(key);
    if (!evaluateCondition(input.ConditionExpression as string | undefined, existing, names, values)) {
      throw new ConditionFailed();
    }
    const updated = applyUpdate(existing ?? { ...inputKey }, input.UpdateExpression as string, names, values);
    items.set(key, updated);
    return { Attributes: updated };
  });

  ddbMock.on(DeleteCommand).callsFake((input: { Key: Item }) => {
    items.delete(itemKey(input.Key.pk, input.Key.sk));
    return {};
  });

  ddbMock.on(QueryCommand).callsFake((input: Record<string, unknown>) => {
    const values = (input.ExpressionAttributeValues ?? {}) as Values;
    const pk = String(values[":pk"]);
    const prefix = values[":sk"];
    const matched = table
      .all()
      .filter((item) => item.pk === pk)
      .filter((item) => (typeof prefix === "string" ? String(item.sk).startsWith(prefix) : true))
      .sort((a, b) => String(a.sk).localeCompare(String(b.sk)));
    return { Items: matched };
  });

  ddbMock.on(BatchWriteCommand).callsFake((input: Record<string, unknown>) => {
    const requestItems = input.RequestItems as Record<string, Record<string, Record<string, Item>>[]>;
    for (const requests of Object.values(requestItems)) {
      for (const request of requests) {
        if (request.PutRequest) {
          const item = request.PutRequest.Item;
          items.set(itemKey(item.pk, item.sk), { ...item });
        } else if (request.DeleteRequest) {
          const key = request.DeleteRequest.Key;
          items.delete(itemKey(key.pk, key.sk));
        }
      }
    }
    return {};
  });

  ddbMock.on(TransactWriteCommand).callsFake((input: Record<string, unknown>) => {
    const entries = (input.TransactItems ?? []) as Record<string, Record<string, unknown>>[];
    const reasons = entries.map((entry) => {
      const operation = entry.Put ?? entry.Update ?? entry.Delete ?? entry.ConditionCheck;
      const target = (operation.Item ?? operation.Key) as Item;
      const ok = evaluateCondition(
        operation.ConditionExpression as string | undefined,
        items.get(itemKey(target.pk, target.sk)),
        (operation.ExpressionAttributeNames ?? {}) as Names,
        (operation.ExpressionAttributeValues ?? {}) as Values,
      );
      return { Code: ok ? "None" : "ConditionalCheckFailed" };
    });
    if (reasons.some((reason) => reason.Code !== "None")) {
      const error = new Error("Transaction cancelled, please refer cancellation reasons");
      error.name = "TransactionCanceledException";
      Object.assign(error, { CancellationReasons: reasons });
      throw error;
    }
    for (const entry of entries) {
      if (entry.Put) {
        const item = entry.Put.Item as Item;
        items.set(itemKey(item.pk, item.sk), { ...item });
      } else if (entry.Update) {
        const key = entry.Update.Key as Item;
        const id = itemKey(key.pk, key.sk);
        items.set(
          id,
          applyUpdate(
            items.get(id) ?? { ...key },
            entry.Update.UpdateExpression as string,
            (entry.Update.ExpressionAttributeNames ?? {}) as Names,
            (entry.Update.ExpressionAttributeValues ?? {}) as Values,
          ),
        );
      } else if (entry.Delete) {
        const key = entry.Delete.Key as Item;
        items.delete(itemKey(key.pk, key.sk));
      }
    }
    return {};
  });

  return table;
}
