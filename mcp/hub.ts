import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer, type WebSocket } from "ws";
import type { BridgeRequest, BridgeResponse, StudioToolName } from "../src/types";
import { DISCONNECTED_ERROR, originAllowed, parseResponse, Relay, REQUEST_TIMEOUT_MS, type RelayResult } from "./relay";
import { NOT_OPEN_ERROR, REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON, TOOLS } from "./tools";

// The plugin connects to "/"; other Component Studio servers on this machine join the hub here.
export const PEER_PATH = "/peer";

/** The part of a WebSocket the hub uses; plain fakes in tests. */
export interface Link {
  send(frame: string): void;
  close(code?: number, reason?: string): void;
}

interface Forwarded {
  peer: Link;
  peerId: string;
  timer: ReturnType<typeof setTimeout>;
}

const TOOL_NAMES: ReadonlySet<string> = new Set(TOOLS.map((tool) => tool.name));

/** A peer's request, checked like the plugin checks the hub's: non-empty id, known tool, args present. */
export function parseRequest(raw: string): BridgeRequest | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return null;
  const r = data as Record<string, unknown>;
  if (typeof r.id !== "string" || r.id === "" || typeof r.tool !== "string" || !TOOL_NAMES.has(r.tool) || !("args" in r)) {
    return null;
  }
  return { id: r.id, tool: r.tool as StudioToolName, args: r.args };
}

function answer(peer: Link, response: BridgeResponse): void {
  try {
    peer.send(JSON.stringify(response));
  } catch {
    // The peer is gone; its own close handler cleans up.
  }
}

/**
 * Owns the plugin socket and forwards peers' requests to it under a fresh id, so two peers can never
 * collide on ids and an answer only ever reaches the peer that asked.
 * With no plugin, a peer gets NOT_OPEN_ERROR right away, the same error the hub's own calls get.
 */
export class Hub {
  private plugin: Link | null = null;
  private readonly relay: Relay;
  private readonly forwarded = new Map<string, Forwarded>();

  constructor(
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly newId: () => string = randomUUID,
  ) {
    this.relay = new Relay(timeoutMs, newId);
  }

  get connected(): boolean {
    return this.plugin !== null;
  }

  get forwardedCount(): number {
    return this.forwarded.size;
  }

  /** A tool call from this process's own MCP client. */
  call(tool: StudioToolName, args: unknown): Promise<RelayResult> {
    const plugin = this.plugin;
    if (!plugin) return Promise.reject(new Error(NOT_OPEN_ERROR));
    return this.relay.request((frame) => plugin.send(frame), tool, args);
  }

  /** The newest plugin window wins; the older one is told why it was closed. */
  pluginOpened(link: Link): void {
    const previous = this.plugin;
    this.plugin = link;
    if (previous) {
      this.dropPluginCalls();
      previous.close(REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON);
    }
  }

  pluginClosed(link: Link): void {
    if (this.plugin !== link) return;
    this.plugin = null;
    this.dropPluginCalls();
  }

  /** Returns false when the frame is malformed or matches no pending request. */
  pluginMessage(raw: string): boolean {
    if (this.relay.handleMessage(raw)) return true;
    const response = parseResponse(raw);
    if (!response) return false;
    const entry = this.forwarded.get(response.id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.forwarded.delete(response.id);
    answer(entry.peer, { ...response, id: entry.peerId });
    return true;
  }

  /** Returns false when the frame is malformed. */
  peerMessage(peer: Link, raw: string): boolean {
    const request = parseRequest(raw);
    if (!request) return false;
    const plugin = this.plugin;
    if (!plugin) {
      answer(peer, { id: request.id, ok: false, error: NOT_OPEN_ERROR });
      return true;
    }
    const id = this.newId();
    // The peer's own relay times the call out; this only stops a never-answered entry from lingering.
    const timer = setTimeout(() => this.forwarded.delete(id), this.timeoutMs);
    this.forwarded.set(id, { peer, peerId: request.id, timer });
    const frame: BridgeRequest = { id, tool: request.tool, args: request.args };
    try {
      plugin.send(JSON.stringify(frame));
    } catch (error) {
      clearTimeout(timer);
      this.forwarded.delete(id);
      answer(peer, { id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return true;
  }

  peerClosed(peer: Link): void {
    for (const [id, entry] of this.forwarded) {
      if (entry.peer !== peer) continue;
      clearTimeout(entry.timer);
      this.forwarded.delete(id);
    }
  }

  private dropPluginCalls(): void {
    this.relay.rejectAll();
    for (const [id, entry] of this.forwarded) {
      clearTimeout(entry.timer);
      this.forwarded.delete(id);
      answer(entry.peer, { id: entry.peerId, ok: false, error: DISCONNECTED_ERROR });
    }
  }
}

/** Resolves with a close function once the port is bound; rejects with the listen error (EADDRINUSE: another hub or program). */
export function listenHub(port: number, hub: Hub, log: (message: string) => void): Promise<() => void> {
  return new Promise((resolve, reject) => {
    const http = createServer((_req, res) => {
      res.writeHead(426, { "Content-Type": "text/plain" });
      res.end("Upgrade Required");
    });
    http.once("error", reject);
    http.listen(port, "127.0.0.1", () => {
      http.off("error", reject);
      http.on("error", (error) => log(`WebSocket server error: ${error.message}`));
      // Created only once bound, so a failed bind leaves nothing behind.
      const wss = new WebSocketServer({
        server: http,
        // Any browser tab could reach localhost; only Figma plugin iframes (Origin "null") or non-browser clients may feed Claude.
        verifyClient: (info: { req: IncomingMessage }, done: (ok: boolean, code?: number, message?: string) => void) => {
          if (info.req.url !== "/" && info.req.url !== PEER_PATH) done(false, 404, "Not Found");
          else if (originAllowed(info.req.headers.origin)) done(true);
          else done(false, 403, "Forbidden");
        },
      });
      wss.on("error", (error) => log(`WebSocket server error: ${error.message}`));
      wss.on("connection", (socket: WebSocket, req: IncomingMessage) => {
        if (req.url === PEER_PATH) wirePeer(socket);
        else wirePlugin(socket);
      });
      resolve(() => {
        for (const client of wss.clients) client.terminate();
        wss.close();
        http.close();
      });
    });
  });

  function wirePlugin(socket: WebSocket): void {
    hub.pluginOpened(socket);
    log("Component Studio connected");
    socket.on("message", (data) => {
      if (!hub.pluginMessage(data.toString())) log("ignored malformed or unknown frame");
    });
    socket.on("close", () => {
      const wasCurrent = hub.connected;
      hub.pluginClosed(socket);
      if (wasCurrent && !hub.connected) log("Component Studio disconnected");
    });
    socket.on("error", (error) => log(`socket error: ${error.message}`));
  }

  function wirePeer(socket: WebSocket): void {
    log("peer joined");
    socket.on("message", (data) => {
      if (!hub.peerMessage(socket, data.toString())) log("ignored malformed peer frame");
    });
    socket.on("close", () => {
      hub.peerClosed(socket);
      log("peer left");
    });
    socket.on("error", (error) => log(`peer socket error: ${error.message}`));
  }
}
