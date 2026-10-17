import { afterEach, describe, expect, it, vi } from "vitest";
import { Hub, type Link, parseRequest } from "../../mcp/hub";
import { DISCONNECTED_ERROR } from "../../mcp/relay";
import { NOT_OPEN_ERROR, REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON } from "../../mcp/tools";

class FakeLink implements Link {
  sent: string[] = [];
  closed: [number | undefined, string | undefined] | null = null;
  send(frame: string): void {
    this.sent.push(frame);
  }
  close(code?: number, reason?: string): void {
    this.closed = [code, reason];
  }
  frames(): unknown[] {
    return this.sent.map((f) => JSON.parse(f));
  }
}

function setup() {
  let n = 0;
  const hub = new Hub(30_000, () => `p-${++n}`);
  const plugin = new FakeLink();
  hub.pluginOpened(plugin);
  return { hub, plugin };
}

describe("parseRequest", () => {
  it("accepts a request for a known tool", () => {
    expect(parseRequest('{"id":"a","tool":"studio_status","args":{}}')).toEqual({ id: "a", tool: "studio_status", args: {} });
    expect(parseRequest('{"id":"a","tool":"studio_get_tokens","args":null}')).toEqual({ id: "a", tool: "studio_get_tokens", args: null });
  });

  it.each([
    "not json",
    "null",
    "[]",
    '{"tool":"studio_status","args":{}}',
    '{"id":"","tool":"studio_status","args":{}}',
    '{"id":5,"tool":"studio_status","args":{}}',
    '{"id":"a","tool":"studio_apply","args":{}}',
    // Answered by each server itself, never forwarded to the plugin.
    '{"id":"a","tool":"studio_get_rules","args":{"topic":"naming"}}',
    '{"id":"a","tool":"studio_status"}',
    '{"id":"a","ok":true,"result":1}',
  ])("rejects %s", (raw) => {
    expect(parseRequest(raw)).toBeNull();
  });
});

describe("Hub", () => {
  afterEach(() => vi.useRealTimers());

  it("forwards under a fresh id and answers only the peer that asked", () => {
    const { hub, plugin } = setup();
    const a = new FakeLink();
    const b = new FakeLink();
    // Both peers use the same id on purpose: the hub must keep them apart.
    expect(hub.peerMessage(a, '{"id":"1","tool":"studio_status","args":{}}')).toBe(true);
    expect(hub.peerMessage(b, '{"id":"1","tool":"studio_get_component","args":{}}')).toBe(true);
    expect(plugin.frames()).toEqual([
      { id: "p-1", tool: "studio_status", args: {} },
      { id: "p-2", tool: "studio_get_component", args: {} },
    ]);
    expect(hub.forwardedCount).toBe(2);

    const image = { mimeType: "image/png", base64: "AAA" };
    expect(hub.pluginMessage(JSON.stringify({ id: "p-2", ok: true, result: { tree: "x" }, image }))).toBe(true);
    expect(a.sent).toEqual([]);
    expect(b.frames()).toEqual([{ id: "1", ok: true, result: { tree: "x" }, image }]);

    expect(hub.pluginMessage('{"id":"p-1","ok":false,"error":"No component selected"}')).toBe(true);
    expect(a.frames()).toEqual([{ id: "1", ok: false, error: "No component selected" }]);
    expect(b.sent).toHaveLength(1);
    expect(hub.forwardedCount).toBe(0);

    // A repeated answer matches nothing any more.
    expect(hub.pluginMessage('{"id":"p-1","ok":true,"result":1}')).toBe(false);
  });

  it("keeps its own calls apart from forwarded ones", async () => {
    const { hub, plugin } = setup();
    const peer = new FakeLink();
    const own = hub.call("studio_get_tokens", {});
    hub.peerMessage(peer, '{"id":"x","tool":"studio_get_tokens","args":{}}');
    expect(plugin.frames()).toEqual([
      { id: "p-1", tool: "studio_get_tokens", args: {} },
      { id: "p-2", tool: "studio_get_tokens", args: {} },
    ]);
    hub.pluginMessage('{"id":"p-1","ok":true,"result":"own"}');
    await expect(own).resolves.toEqual({ result: "own" });
    expect(peer.sent).toEqual([]);
    hub.pluginMessage('{"id":"p-2","ok":true,"result":"peer"}');
    expect(peer.frames()).toEqual([{ id: "x", ok: true, result: "peer" }]);
  });

  it("answers NOT_OPEN_ERROR without a plugin", async () => {
    const hub = new Hub();
    const peer = new FakeLink();
    expect(hub.connected).toBe(false);
    expect(hub.peerMessage(peer, '{"id":"1","tool":"studio_status","args":{}}')).toBe(true);
    expect(peer.frames()).toEqual([{ id: "1", ok: false, error: NOT_OPEN_ERROR }]);
    await expect(hub.call("studio_status", {})).rejects.toThrow(NOT_OPEN_ERROR);
  });

  it("drops a closed peer's pending requests", () => {
    const { hub, plugin } = setup();
    const gone = new FakeLink();
    const stays = new FakeLink();
    hub.peerMessage(gone, '{"id":"1","tool":"studio_status","args":{}}');
    hub.peerMessage(gone, '{"id":"2","tool":"studio_get_tokens","args":{}}');
    hub.peerMessage(stays, '{"id":"3","tool":"studio_status","args":{}}');
    hub.peerClosed(gone);
    expect(hub.forwardedCount).toBe(1);
    expect(hub.pluginMessage('{"id":"p-1","ok":true,"result":1}')).toBe(false);
    expect(gone.sent).toEqual([]);
    expect(hub.pluginMessage('{"id":"p-3","ok":true,"result":3}')).toBe(true);
    expect(stays.frames()).toEqual([{ id: "3", ok: true, result: 3 }]);
    expect(plugin.sent).toHaveLength(3);
  });

  it("ignores malformed peer frames", () => {
    const { hub, plugin } = setup();
    const peer = new FakeLink();
    for (const raw of ["garbage", '{"id":"1","tool":"figma_execute","args":{}}', '{"id":"1","tool":"studio_status"}', '{"tool":"studio_status","args":{}}']) {
      expect(hub.peerMessage(peer, raw)).toBe(false);
    }
    expect(plugin.sent).toEqual([]);
    expect(peer.sent).toEqual([]);
    expect(hub.forwardedCount).toBe(0);
  });

  it("ignores malformed plugin frames", () => {
    const { hub } = setup();
    expect(hub.pluginMessage("garbage")).toBe(false);
    expect(hub.pluginMessage('{"id":"p-9","ok":true}')).toBe(false);
  });

  it("fails pending peer and own calls when the plugin disconnects", async () => {
    const { hub, plugin } = setup();
    const peer = new FakeLink();
    const own = hub.call("studio_status", {});
    hub.peerMessage(peer, '{"id":"1","tool":"studio_status","args":{}}');
    hub.pluginClosed(plugin);
    await expect(own).rejects.toThrow(DISCONNECTED_ERROR);
    expect(peer.frames()).toEqual([{ id: "1", ok: false, error: DISCONNECTED_ERROR }]);
    expect(hub.connected).toBe(false);
    expect(hub.forwardedCount).toBe(0);
  });

  it("replaces an older plugin window and fails what was sent to it", () => {
    const { hub, plugin } = setup();
    const peer = new FakeLink();
    hub.peerMessage(peer, '{"id":"1","tool":"studio_status","args":{}}');
    const newer = new FakeLink();
    hub.pluginOpened(newer);
    expect(plugin.closed).toEqual([REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON]);
    expect(peer.frames()).toEqual([{ id: "1", ok: false, error: DISCONNECTED_ERROR }]);
    // The old window's late close must not disconnect the new one.
    hub.pluginClosed(plugin);
    expect(hub.connected).toBe(true);
    hub.peerMessage(peer, '{"id":"2","tool":"studio_status","args":{}}');
    expect(newer.frames()).toEqual([{ id: "p-2", tool: "studio_status", args: {} }]);
  });

  it("answers the peer when sending to the plugin throws", () => {
    const hub = new Hub();
    hub.pluginOpened({
      send: () => {
        throw new Error("socket closed");
      },
      close: () => {},
    });
    const peer = new FakeLink();
    hub.peerMessage(peer, '{"id":"1","tool":"studio_status","args":{}}');
    expect(peer.frames()).toEqual([{ id: "1", ok: false, error: "socket closed" }]);
    expect(hub.forwardedCount).toBe(0);
  });

  it("forgets a never-answered request after the timeout", () => {
    vi.useFakeTimers();
    const hub = new Hub(1000);
    hub.pluginOpened(new FakeLink());
    hub.peerMessage(new FakeLink(), '{"id":"1","tool":"studio_status","args":{}}');
    vi.advanceTimersByTime(999);
    expect(hub.forwardedCount).toBe(1);
    vi.advanceTimersByTime(1);
    expect(hub.forwardedCount).toBe(0);
  });
});
