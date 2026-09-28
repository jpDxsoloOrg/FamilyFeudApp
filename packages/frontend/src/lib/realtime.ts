/**
 * AppSync's realtime protocol, hand-rolled (ported from Know It Owl). It borrows
 * the `graphql-ws` subprotocol name but not its message shapes: the operation
 * travels as a JSON-encoded *string* inside `payload.data`, auth is repeated per
 * subscription in `extensions.authorization`, and the signed `host` is the
 * appsync-api host even though we dial the appsync-realtime-api one.
 *
 * Sockets drop (phones sleep, wifi changes); everything here exists to make
 * that a non-event: reconnect with backoff, and tell the caller when we went
 * away so it can re-read what it missed.
 */
import { apiConfig } from "./config";

/** `connecting` covers the first attempt and every retry; `live` means acked. */
export type RealtimeStatus = "connecting" | "live" | "offline";

export interface SubscribeOptions<T> {
  query: string;
  variables: Record<string, unknown>;
  /** Called with `payload.data` of each `data` frame. */
  onData: (data: T) => void;
  /** A `live` after a previous `live` means the socket dropped and came back. */
  onStatusChange?: (status: RealtimeStatus) => void;
}

const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 15_000;
/** AppSync sends `ka` about once a minute; miss two and the socket is dead. */
const KEEP_ALIVE_GRACE_MS = 150_000;

interface ServerMessage<T> {
  type: string;
  id?: string;
  payload?: { connectionTimeoutMs?: number; data?: T; errors?: unknown };
}

function encode(value: unknown): string {
  return btoa(JSON.stringify(value));
}

/** Full jitter backoff. */
function backoff(attempt: number): number {
  return Math.random() * Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
}

/** Open one subscription. Returns a teardown; calling it stops all reconnection. */
export function subscribe<T>(options: SubscribeOptions<T>): () => void {
  const { query, variables, onData, onStatusChange } = options;
  const { realtimeUrl, apiKey, url } = apiConfig();
  const auth = { host: new URL(url).host, "x-api-key": apiKey };

  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;
  let status: RealtimeStatus | undefined;

  const setStatus = (next: RealtimeStatus): void => {
    if (status === next && next !== "live") return;
    status = next;
    onStatusChange?.(next);
  };

  const detach = (ws: WebSocket): void => {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // Already closing.
    }
  };

  /** Give up on a socket and queue a fresh one, without waiting for `onclose`. */
  const dropAndRetry = (ws: WebSocket | undefined): void => {
    if (!ws || ws !== socket) return;
    socket = undefined;
    detach(ws);
    scheduleRetry();
  };

  const armKeepAlive = (timeoutMs: number): void => {
    if (keepAliveTimer !== undefined) clearTimeout(keepAliveTimer);
    keepAliveTimer = setTimeout(() => dropAndRetry(socket), timeoutMs);
  };

  function scheduleRetry(): void {
    if (closed || retryTimer !== undefined) return;
    setStatus("offline");
    const delay = backoff(attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      connect();
    }, delay);
  }

  function connect(): void {
    if (closed) return;
    setStatus("connecting");
    const subscriptionId = crypto.randomUUID();
    const ws = new WebSocket(`${realtimeUrl}?header=${encode(auth)}&payload=${encode({})}`, ["graphql-ws"]);
    socket = ws;

    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init" }));

    ws.onmessage = (frame: MessageEvent<string>) => {
      if (closed || socket !== ws) return;
      let message: ServerMessage<T>;
      try {
        message = JSON.parse(frame.data) as ServerMessage<T>;
      } catch {
        return;
      }
      switch (message.type) {
        case "connection_ack":
          armKeepAlive(Math.min(message.payload?.connectionTimeoutMs ?? KEEP_ALIVE_GRACE_MS, KEEP_ALIVE_GRACE_MS));
          ws.send(
            JSON.stringify({
              id: subscriptionId,
              type: "start",
              payload: {
                data: JSON.stringify({ query, variables }),
                extensions: { authorization: auth },
              },
            }),
          );
          break;
        case "start_ack":
          attempt = 0;
          setStatus("live");
          break;
        case "ka":
          armKeepAlive(KEEP_ALIVE_GRACE_MS);
          break;
        case "data":
          if (message.payload?.data) onData(message.payload.data);
          break;
        case "error":
        case "connection_error":
          dropAndRetry(ws);
          break;
        default:
          break;
      }
    };
    ws.onclose = () => dropAndRetry(ws);
    ws.onerror = () => dropAndRetry(ws);
  }

  /** The browser knows about a reconnection before any timer does. */
  const onOnline = (): void => {
    if (closed) return;
    const stale = socket;
    socket = undefined;
    if (stale) detach(stale);
    if (retryTimer !== undefined) {
      clearTimeout(retryTimer);
      retryTimer = undefined;
    }
    attempt = 0;
    connect();
  };
  globalThis.addEventListener?.("online", onOnline);

  connect();

  return () => {
    closed = true;
    globalThis.removeEventListener?.("online", onOnline);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    if (keepAliveTimer !== undefined) clearTimeout(keepAliveTimer);
    const open = socket;
    socket = undefined;
    if (open && open.readyState === WebSocket.OPEN) {
      open.send(JSON.stringify({ type: "connection_terminate" }));
    }
    open?.close();
  };
}
