/**
 * DynamoDB document client + thin helpers over the single table.
 * Ported from Know It Owl: the table name arrives via `TABLE_NAME` (sst.config.ts
 * passes it through) with an `SST_RESOURCE_Table` fallback.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import type { TableKey } from "./keys.js";

export type Item = Record<string, unknown> & TableKey;

let documentClient: DynamoDBDocumentClient | undefined;

export function getClient(): DynamoDBDocumentClient {
  if (!documentClient) {
    documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return documentClient;
}

/** Override the client (tests inject a mocked instance). */
export function setClient(client: DynamoDBDocumentClient | undefined): void {
  documentClient = client;
}

export function tableName(): string {
  const explicit = process.env.TABLE_NAME;
  if (explicit) return explicit;
  const linked = process.env.SST_RESOURCE_Table;
  if (linked) {
    const parsed: unknown = JSON.parse(linked);
    if (parsed && typeof parsed === "object" && "name" in parsed) {
      const name = (parsed as { name: unknown }).name;
      if (typeof name === "string") return name;
    }
  }
  throw new Error("Table name is not configured (set TABLE_NAME or link the SST table)");
}

export async function getItem<T extends Item = Item>(key: TableKey): Promise<T | undefined> {
  const result = await getClient().send(new GetCommand({ TableName: tableName(), Key: key }));
  return result.Item as T | undefined;
}

export interface PutOptions {
  ifNotExists?: boolean;
}

export async function putItem(item: Item, options: PutOptions = {}): Promise<void> {
  await getClient().send(
    new PutCommand({
      TableName: tableName(),
      Item: item,
      ...(options.ifNotExists
        ? { ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)" }
        : {}),
    }),
  );
}

export interface UpdateOptions {
  updateExpression: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
  conditionExpression?: string;
}

/** Update an item and return the resulting item (`ALL_NEW`). */
export async function updateItem<T extends Item = Item>(
  key: TableKey,
  options: UpdateOptions,
): Promise<T | undefined> {
  const result = await getClient().send(
    new UpdateCommand({
      TableName: tableName(),
      Key: key,
      UpdateExpression: options.updateExpression,
      ...(options.names ? { ExpressionAttributeNames: options.names } : {}),
      ...(options.values ? { ExpressionAttributeValues: options.values } : {}),
      ...(options.conditionExpression ? { ConditionExpression: options.conditionExpression } : {}),
      ReturnValues: "ALL_NEW",
    }),
  );
  return result.Attributes as T | undefined;
}

export async function deleteItem(key: TableKey): Promise<void> {
  await getClient().send(new DeleteCommand({ TableName: tableName(), Key: key }));
}

const DEFAULT_MAX_PAGES = 20;

/** Query one partition, optionally restricted to a sort-key prefix, paging to the end. */
export async function queryPrefix<T extends Item = Item>(
  pk: string,
  skPrefix?: string,
  maxPages: number = DEFAULT_MAX_PAGES,
): Promise<T[]> {
  const items: T[] = [];
  let startKey: Record<string, unknown> | undefined;
  let pages = 0;
  do {
    if (pages >= maxPages) {
      throw new Error(`Query exceeded ${maxPages} pages for ${pk}; narrow the query`);
    }
    const result = await getClient().send(
      new QueryCommand({
        TableName: tableName(),
        KeyConditionExpression: skPrefix ? "pk = :pk AND begins_with(sk, :sk)" : "pk = :pk",
        ExpressionAttributeValues: skPrefix ? { ":pk": pk, ":sk": skPrefix } : { ":pk": pk },
        ...(startKey ? { ExclusiveStartKey: startKey } : {}),
      }),
    );
    items.push(...((result.Items ?? []) as T[]));
    startKey = result.LastEvaluatedKey;
    pages += 1;
  } while (startKey);
  return items;
}

const TRANSACTION_CANCELLED = "TransactionCanceledException";
export const CONDITION_FAILED = "ConditionalCheckFailedException";

export function isTransactionCancelled(error: unknown): boolean {
  return error instanceof Error && error.name === TRANSACTION_CANCELLED;
}

export function isConditionFailure(error: unknown): boolean {
  return error instanceof Error && error.name === CONDITION_FAILED;
}

export type TransactItems = NonNullable<TransactWriteCommandInput["TransactItems"]>;

/** DynamoDB rejects a transaction of more than 100 items. */
export const MAX_TRANSACT_ITEMS = 100;

/** Write several items atomically. */
export async function transactWrite(items: TransactItems): Promise<void> {
  await getClient().send(new TransactWriteCommand({ TransactItems: items }));
}

const BATCH_SIZE = 25;

/**
 * Put and/or delete many items, 25 per request, retrying unprocessed items.
 * Not atomic — use `transactWrite` when the writes must land together.
 */
export async function batchWrite(puts: Item[], deletes: TableKey[] = []): Promise<void> {
  const table = tableName();
  let requests: Record<string, unknown>[] = [
    ...puts.map((item) => ({ PutRequest: { Item: item } })),
    ...deletes.map((key) => ({ DeleteRequest: { Key: key } })),
  ];
  while (requests.length > 0) {
    const chunk = requests.slice(0, BATCH_SIZE);
    requests = requests.slice(BATCH_SIZE);
    const result = await getClient().send(
      new BatchWriteCommand({ RequestItems: { [table]: chunk } }),
    );
    const unprocessed = result.UnprocessedItems?.[table];
    if (unprocessed && unprocessed.length > 0) {
      requests = [...(unprocessed as Record<string, unknown>[]), ...requests];
    }
  }
}
