import { BRIDGE_PORT, type BridgeRequest, type BridgeResponse, type BridgeStatus, type StudioToolName } from "./types";

const TOOLS: readonly StudioToolName[] = [
  "studio_status",
  "studio_get_component",
  "studio_get_tokens",
  "studio_propose_names",
  "studio_propose_tokens",
];
const RETRY_FIRST_MS = 3000;
const RETRY_MAX_MS = 10000;
const REPLACED_CLOSE_CODE = 4002;

export function isBridgeRequest(x: unknown): x is BridgeRequest {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const r = x as Record<string, unknown>;
  return typeof r.id === "string" && r.id !== "" && TOOLS.includes(r.tool as StudioToolName) && "args" in r;
}

export function parseBridgeFrame(data: unknown): BridgeRequest | null {
  if (typeof data !== "string") return null;
  try {
    const parsed: unknown = JSON.parse(data);
    return isBridgeRequest(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function nextRetryDelay(previous: number | null): number {
  return previous === null ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, previous * 2);
}

export function startBridge(onStatus: (s: BridgeStatus) => void): void {
  let ws: WebSocket | null = null;
  let delay: number | null = null;
  let stopped = false;

  window.addEventListener("message", (event: MessageEvent) => {
    const msg = event.data?.pluginMessage as { type?: string; response?: BridgeResponse } | undefined;
    if (msg?.type !== "bridge/response" || !msg.response) return;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg.response));
  });

  const retry = () => {
    if (stopped) return;
    delay = nextRetryDelay(delay);
    setTimeout(connect, delay);
  };

  const connect = () => {
    let socket: WebSocket;
    try {
      socket = new WebSocket(`ws://localhost:${BRIDGE_PORT}`);
    } catch {
      onStatus("disconnected");
      retry();
      return;
    }
    ws = socket;
    socket.onopen = () => {
      delay = null;
      onStatus("connected");
    };
    socket.onmessage = (event: MessageEvent) => {
      const request = parseBridgeFrame(event.data);
      if (request) parent.postMessage({ pluginMessage: { type: "bridge/request", request } }, "*");
    };
    // An error is always followed by close, so only close schedules the retry.
    socket.onerror = () => onStatus("disconnected");
    socket.onclose = (event: CloseEvent) => {
      if (ws === socket) ws = null;
      if (event.code === REPLACED_CLOSE_CODE) {
        stopped = true;
        onStatus("conflict");
        return;
      }
      onStatus("disconnected");
      retry();
    };
  };

  connect();
}
