import WebSocket from "ws";
import type { StudioToolName } from "../src/types";
import { PEER_PATH } from "./hub";
import { Relay, type RelayResult } from "./relay";
import { RECONNECTING_ERROR } from "./tools";

// A Component Studio hub answers the upgrade at once; a program that hangs on it is not one.
const HANDSHAKE_TIMEOUT_MS = 2000;

/** The port is held, but not by a Component Studio hub (HTTP error, no WebSocket, hung handshake). */
export class ForeignPortError extends Error {}

/** Nothing listens any more: the hub exited between our bind attempt and this connect. */
export class HubGoneError extends Error {}

/** Sends this process's tool calls to the hub, which forwards them to the plugin. */
export class Peer {
  private readonly relay = new Relay();
  private socket: WebSocket | null = null;

  constructor(private readonly log: (message: string) => void) {}

  get open(): boolean {
    return this.socket !== null;
  }

  /** Resolves once joined; `onLost` runs when the hub goes away later, after pending calls failed with RECONNECTING_ERROR. */
  connect(port: number, onLost: () => void): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(`ws://127.0.0.1:${port}${PEER_PATH}`, { handshakeTimeout: HANDSHAKE_TIMEOUT_MS });
      let joined = false;
      const fail = (error: Error) => {
        if (joined) return;
        joined = true;
        socket.terminate();
        reject(error);
      };
      socket.once("unexpected-response", (_req, res) => fail(new ForeignPortError(`HTTP ${res.statusCode}`)));
      socket.on("error", (error: NodeJS.ErrnoException) => {
        if (this.socket === socket) this.log(`peer socket error: ${error.message}`);
        else fail(error.code === "ECONNREFUSED" ? new HubGoneError(error.message) : new ForeignPortError(error.message));
      });
      socket.once("open", () => {
        if (joined) return;
        joined = true;
        this.socket = socket;
        resolve();
      });
      socket.on("message", (data) => {
        if (!this.relay.handleMessage(data.toString())) this.log("ignored malformed or unknown frame from the hub");
      });
      socket.on("close", () => {
        if (this.socket !== socket) return;
        this.socket = null;
        this.relay.rejectAll(RECONNECTING_ERROR);
        onLost();
      });
    });
  }

  call(tool: StudioToolName, args: unknown): Promise<RelayResult> {
    const socket = this.socket;
    if (!socket) return Promise.reject(new Error(RECONNECTING_ERROR));
    return this.relay.request((frame) => socket.send(frame), tool, args);
  }

  close(): void {
    const socket = this.socket;
    this.socket = null;
    this.relay.rejectAll(RECONNECTING_ERROR);
    socket?.terminate();
  }
}
