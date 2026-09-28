/**
 * Publishing private per-player messages.
 *
 * AppSync only fans out a mutation's own return value, so the Lambda has to
 * *call a mutation* to reach `onPlayerMessage` subscribers: it POSTs
 * `sendPlayerMessage` to its own API, authorised by INTERNAL_SECRET. The API
 * location is read from SSM (`API_PARAM_NAME`) because the Lambda cannot be
 * handed its own API's URL at deploy time; tests and local runs set
 * API_URL / API_KEY directly.
 *
 * Delivery is best-effort: a failed self-call is logged, never surfaced to the
 * host action that triggered it.
 */
import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import type { PlayerMessageType } from "@familyfeud/core";
import { serverTime } from "./time.js";

export interface PlayerMessage {
  gameId: string;
  playerId: string;
  type: PlayerMessageType;
  detail: string | null;
  serverTime: number;
}

interface ApiLocation {
  url: string;
  key: string;
}

let cachedLocation: ApiLocation | undefined;
let ssm: SSMClient | undefined;

/** Override the transport (tests). `undefined` restores the real one. */
let transport: ((message: PlayerMessage) => Promise<void>) | undefined;
export function setMessageTransport(fn: ((message: PlayerMessage) => Promise<void>) | undefined): void {
  transport = fn;
}

export function internalSecret(): string | undefined {
  return process.env.INTERNAL_SECRET;
}

async function apiLocation(): Promise<ApiLocation> {
  if (cachedLocation) return cachedLocation;
  const url = process.env.API_URL;
  const key = process.env.API_KEY;
  if (url && key) {
    cachedLocation = { url, key };
    return cachedLocation;
  }
  const name = process.env.API_PARAM_NAME;
  if (!name) throw new Error("API location is not configured (set API_URL/API_KEY or API_PARAM_NAME)");
  ssm ??= new SSMClient({});
  const result = await ssm.send(new GetParameterCommand({ Name: name }));
  const parsed: unknown = JSON.parse(result.Parameter?.Value ?? "{}");
  if (!parsed || typeof parsed !== "object") throw new Error(`SSM parameter ${name} is not JSON`);
  const { url: parsedUrl, key: parsedKey } = parsed as Record<string, unknown>;
  if (typeof parsedUrl !== "string" || typeof parsedKey !== "string") {
    throw new Error(`SSM parameter ${name} lacks url/key`);
  }
  cachedLocation = { url: parsedUrl, key: parsedKey };
  return cachedLocation;
}

const SEND_PLAYER_MESSAGE = `mutation SendPlayerMessage($gameId: ID!, $hostToken: String!, $playerId: ID!, $type: PlayerMessageType!, $detail: String) {
  sendPlayerMessage(gameId: $gameId, hostToken: $hostToken, playerId: $playerId, type: $type, detail: $detail) {
    gameId playerId type detail serverTime
  }
}`;

async function selfCall(message: PlayerMessage): Promise<void> {
  const secret = internalSecret();
  if (!secret) throw new Error("INTERNAL_SECRET is not set");
  const { url, key } = await apiLocation();
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key },
    body: JSON.stringify({
      query: SEND_PLAYER_MESSAGE,
      variables: {
        gameId: message.gameId,
        hostToken: secret,
        playerId: message.playerId,
        type: message.type,
        detail: message.detail,
      },
    }),
  });
  const body = (await response.json()) as { errors?: { message?: string }[] };
  if (body.errors?.length) throw new Error(body.errors[0]?.message ?? "sendPlayerMessage failed");
}

export function playerMessage(
  gameId: string,
  playerId: string,
  type: PlayerMessageType,
  detail: string | null = null,
): PlayerMessage {
  return { gameId, playerId, type, detail, serverTime: serverTime() };
}

/** Publish one private message. Never throws. */
export async function publishPlayerMessage(message: PlayerMessage): Promise<void> {
  try {
    await (transport ?? selfCall)(message);
  } catch (error) {
    console.error("publishPlayerMessage failed", message.type, message.playerId, error);
  }
}

/** Publish several, concurrently. Never throws. */
export async function publishPlayerMessages(messages: readonly PlayerMessage[]): Promise<void> {
  await Promise.all(messages.map(publishPlayerMessage));
}
