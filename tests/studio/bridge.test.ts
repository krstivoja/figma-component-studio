import { describe, expect, it } from "vitest";
import { isBridgeRequest, nextRetryDelay, parseBridgeFrame } from "../../src/bridge";

describe("isBridgeRequest", () => {
  it("accepts every studio tool with an id and args", () => {
    for (const tool of ["studio_status", "studio_get_component", "studio_get_tokens", "studio_propose_names", "studio_propose_tokens"]) {
      expect(isBridgeRequest({ id: "1", tool, args: {} })).toBe(true);
    }
  });

  it("rejects garbage", () => {
    expect(isBridgeRequest(null)).toBe(false);
    expect(isBridgeRequest([])).toBe(false);
    expect(isBridgeRequest("x")).toBe(false);
    expect(isBridgeRequest({ tool: "studio_status", args: {} })).toBe(false);
    expect(isBridgeRequest({ id: "", tool: "studio_status", args: {} })).toBe(false);
    expect(isBridgeRequest({ id: 1, tool: "studio_status", args: {} })).toBe(false);
    expect(isBridgeRequest({ id: "1", tool: "figma_execute", args: {} })).toBe(false);
    expect(isBridgeRequest({ id: "1", tool: "studio_status" })).toBe(false);
  });
});

describe("parseBridgeFrame", () => {
  it("parses a request frame and ignores bad JSON or non-text frames", () => {
    expect(parseBridgeFrame(JSON.stringify({ id: "a", tool: "studio_status", args: null }))).toEqual({
      id: "a",
      tool: "studio_status",
      args: null,
    });
    expect(parseBridgeFrame("{not json")).toBeNull();
    expect(parseBridgeFrame(new ArrayBuffer(2))).toBeNull();
    expect(parseBridgeFrame(JSON.stringify({ id: "a", tool: "rm -rf", args: {} }))).toBeNull();
  });
});

describe("nextRetryDelay", () => {
  it("starts at 3 s and backs off to at most 10 s", () => {
    const delays: number[] = [];
    let d: number | null = null;
    for (let i = 0; i < 4; i++) delays.push((d = nextRetryDelay(d)));
    expect(delays).toEqual([3000, 6000, 10000, 10000]);
  });
});
