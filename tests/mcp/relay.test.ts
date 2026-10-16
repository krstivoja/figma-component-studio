import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { DISCONNECTED_ERROR, originAllowed, parseResponse, Relay, TIMEOUT_ERROR } from "../../mcp/relay";
import { proposeNamesShape, proposeTokensShape, TOOLS } from "../../mcp/tools";

describe("parseResponse", () => {
  it("accepts success, error and image frames", () => {
    expect(parseResponse('{"id":"a","ok":true,"result":{"x":1}}')).toEqual({ id: "a", ok: true, result: { x: 1 } });
    expect(parseResponse('{"id":"a","ok":true,"result":null}')).toEqual({ id: "a", ok: true, result: null });
    expect(parseResponse('{"id":"a","ok":false,"error":"boom"}')).toEqual({ id: "a", ok: false, error: "boom" });
    expect(
      parseResponse(JSON.stringify({ id: "a", ok: true, result: 1, image: { mimeType: "image/png", base64: "AAA" } })),
    ).toEqual({ id: "a", ok: true, result: 1, image: { mimeType: "image/png", base64: "AAA" } });
  });

  it.each([
    "not json",
    "null",
    "[]",
    '{"ok":true,"result":1}',
    '{"id":"","ok":true,"result":1}',
    '{"id":5,"ok":true,"result":1}',
    '{"id":"a","ok":true}',
    '{"id":"a","ok":"yes","result":1}',
    '{"id":"a","ok":false}',
    '{"id":"a","ok":false,"error":{}}',
    '{"id":"a","ok":true,"result":1,"image":{"mimeType":"image/jpeg","base64":"AAA"}}',
    '{"id":"a","ok":true,"result":1,"image":{"mimeType":"image/png"}}',
  ])("rejects %s", (raw) => {
    expect(parseResponse(raw)).toBeNull();
  });
});

describe("Relay", () => {
  afterEach(() => vi.useRealTimers());

  it("sends a request frame and resolves on the matching response", async () => {
    const relay = new Relay(30_000, () => "id-1");
    const sent: string[] = [];
    const promise = relay.request((f) => sent.push(f), "studio_get_tokens", {});
    expect(JSON.parse(sent[0])).toEqual({ id: "id-1", tool: "studio_get_tokens", args: {} });
    expect(relay.handleMessage('{"id":"other","ok":true,"result":1}')).toBe(false);
    expect(relay.handleMessage('{"id":"id-1","ok":true,"result":{"n":2}}')).toBe(true);
    await expect(promise).resolves.toEqual({ result: { n: 2 } });
    expect(relay.size).toBe(0);
  });

  it("rejects with the plugin's error", async () => {
    const relay = new Relay(30_000, () => "id-1");
    const promise = relay.request(() => {}, "studio_status", {});
    relay.handleMessage('{"id":"id-1","ok":false,"error":"No component selected"}');
    await expect(promise).rejects.toThrow("No component selected");
  });

  it("times out after 30 s", async () => {
    vi.useFakeTimers();
    const relay = new Relay();
    const promise = relay.request(() => {}, "studio_status", {});
    const check = expect(promise).rejects.toThrow(TIMEOUT_ERROR);
    vi.advanceTimersByTime(29_999);
    expect(relay.size).toBe(1);
    vi.advanceTimersByTime(1);
    await check;
    expect(relay.size).toBe(0);
  });

  it("rejects all pending requests on disconnect", async () => {
    let n = 0;
    const relay = new Relay(30_000, () => `id-${++n}`);
    const a = relay.request(() => {}, "studio_status", {});
    const b = relay.request(() => {}, "studio_get_component", {});
    relay.rejectAll();
    await expect(a).rejects.toThrow(DISCONNECTED_ERROR);
    await expect(b).rejects.toThrow(DISCONNECTED_ERROR);
    expect(relay.size).toBe(0);
  });

  it("rejects when sending throws", async () => {
    const relay = new Relay();
    await expect(
      relay.request(() => {
        throw new Error("socket closed");
      }, "studio_status", {}),
    ).rejects.toThrow("socket closed");
    expect(relay.size).toBe(0);
  });
});

describe("originAllowed", () => {
  it("allows only a missing or null origin", () => {
    expect(originAllowed(undefined)).toBe(true);
    expect(originAllowed("null")).toBe(true);
    expect(originAllowed("https://evil.example")).toBe(false);
    expect(originAllowed("https://www.figma.com")).toBe(false);
  });
});

describe("tool argument schemas", () => {
  const names = z.object(proposeNamesShape);
  const tokens = z.object(proposeTokensShape);

  it("lists every studio tool once", () => {
    expect(TOOLS.map((t) => t.name)).toEqual([
      "studio_status",
      "studio_get_component",
      "studio_get_tokens",
      "studio_propose_names",
      "studio_propose_tokens",
    ]);
    for (const tool of TOOLS) expect(tool.description).toMatch(/Apply/);
  });

  it("validates propose_names", () => {
    const rename = { indexPath: [0, 2], oldName: "Frame 1", newName: "icon", reason: "svg", outsideVocabulary: false };
    expect(names.safeParse({ rootId: "1:2", componentName: null, renames: [rename] }).success).toBe(true);
    expect(names.safeParse({ rootId: "1:2", componentName: "Button", renames: [] }).success).toBe(true);
    expect(names.safeParse({ rootId: "1:2", renames: [] }).success).toBe(false);
    expect(names.safeParse({ rootId: "1:2", componentName: null, renames: [{ ...rename, indexPath: [-1] }] }).success).toBe(false);
    expect(names.safeParse({ rootId: "1:2", componentName: null, renames: [{ ...rename, newName: "" }] }).success).toBe(false);
  });

  it("validates propose_tokens", () => {
    const s = { key: "button/bg|#0059FF", variableId: "VariableID:1:2", reason: "primary fill" };
    expect(tokens.safeParse({ rootId: "1:2", suggestions: [s] }).success).toBe(true);
    expect(tokens.safeParse({ rootId: "1:2", suggestions: [{ ...s, variableId: "" }] }).success).toBe(false);
    expect(tokens.safeParse({ suggestions: [] }).success).toBe(false);
  });
});
