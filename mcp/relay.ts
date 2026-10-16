import { randomUUID } from "node:crypto";
import type { BridgeRequest, BridgeResponse, StudioToolName } from "../src/types";

export const REQUEST_TIMEOUT_MS = 30_000;
export const TIMEOUT_ERROR = "Component Studio did not answer within 30 s";
export const DISCONNECTED_ERROR = "Component Studio disconnected";

export interface RelayResult {
  result: unknown;
  image?: { mimeType: "image/png"; base64: string };
}

interface Pending {
  resolve: (value: RelayResult) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export function originAllowed(origin: string | undefined): boolean {
  return origin === undefined || origin === "null";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseResponse(raw: string): BridgeResponse | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(data) || typeof data.id !== "string" || data.id === "") return null;
  if (data.ok === false) {
    return typeof data.error === "string" ? { id: data.id, ok: false, error: data.error } : null;
  }
  if (data.ok !== true || !("result" in data)) return null;
  if (data.image === undefined) return { id: data.id, ok: true, result: data.result };
  const image = data.image;
  if (!isRecord(image) || image.mimeType !== "image/png" || typeof image.base64 !== "string" || image.base64 === "") {
    return null;
  }
  return { id: data.id, ok: true, result: data.result, image: { mimeType: "image/png", base64: image.base64 } };
}

export class Relay {
  private readonly pending = new Map<string, Pending>();

  constructor(
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
    private readonly newId: () => string = randomUUID,
  ) {}

  get size(): number {
    return this.pending.size;
  }

  request(send: (frame: string) => void, tool: StudioToolName, args: unknown): Promise<RelayResult> {
    const id = this.newId();
    const frame: BridgeRequest = { id, tool, args };
    return new Promise<RelayResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(TIMEOUT_ERROR));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        send(JSON.stringify(frame));
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /** Returns false when the frame is malformed or matches no pending request. */
  handleMessage(raw: string): boolean {
    const response = parseResponse(raw);
    if (!response) return false;
    const entry = this.pending.get(response.id);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(response.id);
    if (response.ok) {
      entry.resolve(response.image ? { result: response.result, image: response.image } : { result: response.result });
    } else {
      entry.reject(new Error(response.error));
    }
    return true;
  }

  rejectAll(message: string = DISCONNECTED_ERROR): void {
    for (const [id, entry] of this.pending) {
      clearTimeout(entry.timer);
      this.pending.delete(id);
      entry.reject(new Error(message));
    }
  }
}
