import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DISCONNECTED_ERROR } from "../../mcp/relay";
import { PROMPTS, rulesMarkdown } from "../../mcp/rules";
import {
  FOREIGN_PORT_ERROR,
  NOT_OPEN_ERROR,
  RECONNECTING_ERROR,
  REPLACED_CLOSE_CODE,
  REPLACED_CLOSE_REASON,
} from "../../mcp/tools";

const root = resolve(__dirname, "../..");

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => done(port));
    });
  });
}

async function startServer(port: number): Promise<{ client: Client; stderr: () => string }> {
  const transport = new StdioClientTransport({
    command: resolve(root, "node_modules/.bin/tsx"),
    args: ["mcp/server.ts"],
    cwd: root,
    env: { ...(process.env as Record<string, string>), COMPONENT_STUDIO_PORT: String(port) },
    stderr: "pipe",
  });
  let log = "";
  transport.stderr?.on("data", (chunk) => (log += chunk.toString()));
  const client = new Client({ name: "test", version: "0.0.0" });
  await client.connect(transport);
  return { client, stderr: () => log };
}

async function waitFor(check: () => boolean | Promise<boolean>, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

function connectPlugin(port: number, origin?: string, path = ""): Promise<WebSocket> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://localhost:${port}${path}`, origin ? { origin } : {});
    ws.once("open", () => done(ws));
    ws.once("unexpected-response", (_req, res) => fail(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", fail);
  });
}

function answer(ws: WebSocket, seen: string[] = []): void {
  ws.on("message", (data) => {
    const { id, tool, args } = JSON.parse(data.toString());
    seen.push(tool);
    if (tool === "studio_get_component") {
      ws.send(JSON.stringify({ id, ok: true, result: { tree: "Button" }, image: { mimeType: "image/png", base64: "iVBORw0KGgo=" } }));
    } else if (tool === "studio_status") {
      ws.send(JSON.stringify({ id, ok: true, result: { fileName: "Kit", page: "Buttons" } }));
    } else if (tool === "studio_inspect_variables") {
      // Never answered: lets a test hold a call open across a hub switch.
    } else if (tool === "studio_propose_names") {
      ws.send(JSON.stringify({ id, ok: true, result: { stored: args.renames.length } }));
    } else {
      ws.send(JSON.stringify({ id, ok: false, error: `no handler for ${tool}` }));
    }
  });
}

/** Like the plugin's bridge: reconnects every 50 ms whenever its socket closes, answering on each new socket. */
function reconnectingPlugin(port: number): { seen: string[]; stop: () => void } {
  const seen: string[] = [];
  let stopped = false;
  let current: WebSocket | null = null;
  const connect = () => {
    if (stopped) return;
    const ws = new WebSocket(`ws://localhost:${port}`, { origin: "null" });
    current = ws;
    answer(ws, seen);
    ws.on("error", () => {});
    ws.on("close", () => setTimeout(connect, 50));
  };
  connect();
  return {
    seen,
    stop: () => {
      stopped = true;
      current?.terminate();
    },
  };
}

const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;
const call = async (client: Client, name: string, args: Record<string, unknown> = {}) =>
  (await client.callTool({ name, arguments: args })) as CallToolResult;
const statusOf = async (client: Client) => JSON.parse(text(await call(client, "studio_status")));

/** studio_get_rules is answered by the server itself: same text in every role, plugin or not. */
async function expectRules(client: Client): Promise<void> {
  for (const topic of ["naming", "tokens"] as const) {
    const rules = await call(client, "studio_get_rules", { topic });
    expect(rules.isError).toBeFalsy();
    expect(text(rules)).toBe(rulesMarkdown(topic));
  }
  const invalid = await call(client, "studio_get_rules", { topic: "colors" });
  expect(invalid.isError).toBe(true);
}

describe("mcp/server.ts", () => {
  let port: number;
  let main: { client: Client; stderr: () => string };

  beforeAll(async () => {
    port = await freePort();
    main = await startServer(port);
    await waitFor(() => main.stderr().includes("listening"));
  }, 20_000);

  afterAll(async () => {
    await main?.client.close();
  });

  it("lists the studio tools and the prompts", async () => {
    const { tools } = await main.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "studio_get_component",
      "studio_get_rules",
      "studio_get_tokens",
      "studio_inspect_variables",
      "studio_propose_names",
      "studio_propose_tokens",
      "studio_status",
    ]);
    const { prompts } = await main.client.listPrompts();
    expect(prompts.map((p) => p.name)).toEqual(["name-component", "find-tokens"]);
    for (const { name, text: body } of PROMPTS) {
      const { messages } = await main.client.getPrompt({ name });
      expect(messages).toEqual([{ role: "user", content: { type: "text", text: body } }]);
    }
  });

  it("answers studio_get_rules without a plugin", async () => {
    await expectRules(main.client);
  });

  it("reports not connected without a plugin", async () => {
    const status = (await main.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(status.isError).toBeFalsy();
    expect(JSON.parse(text(status))).toEqual({ connected: false, role: "hub" });
    const comp = (await main.client.callTool({ name: "studio_get_component", arguments: {} })) as CallToolResult;
    expect(comp.isError).toBe(true);
    expect(text(comp)).toBe(NOT_OPEN_ERROR);
  });

  it("rejects a browser origin with 403 and unknown paths with 404", async () => {
    await expect(connectPlugin(port, "https://evil.example")).rejects.toThrow("HTTP 403");
    await expect(connectPlugin(port, "https://evil.example", "/peer")).rejects.toThrow("HTTP 403");
    await expect(connectPlugin(port, "null", "/other")).rejects.toThrow("HTTP 404");
  });

  it("relays tool calls to the plugin, image included", async () => {
    const ws = await connectPlugin(port, "null");
    answer(ws);
    await waitFor(() => main.stderr().includes("Component Studio connected"));

    const status = (await main.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(JSON.parse(text(status))).toEqual({ fileName: "Kit", page: "Buttons", connected: true, role: "hub" });

    const comp = (await main.client.callTool({ name: "studio_get_component", arguments: {} })) as CallToolResult;
    expect(JSON.parse(text(comp))).toEqual({ tree: "Button" });
    expect(comp.content[1]).toEqual({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" });

    const names = (await main.client.callTool({
      name: "studio_propose_names",
      arguments: {
        rootId: "1:2",
        componentName: null,
        renames: [{ indexPath: [0], oldName: "Frame 1", newName: "label", reason: "text", outsideVocabulary: false }],
      },
    })) as CallToolResult;
    expect(JSON.parse(text(names))).toEqual({ stored: 1 });

    const tokens = (await main.client.callTool({ name: "studio_get_tokens", arguments: {} })) as CallToolResult;
    expect(tokens.isError).toBe(true);
    expect(text(tokens)).toBe("no handler for studio_get_tokens");

    const invalid = (await main.client.callTool({
      name: "studio_propose_tokens",
      arguments: { rootId: "1:2", suggestions: [{ key: "k" }] },
    })) as CallToolResult;
    expect(invalid.isError).toBe(true);

    const closed = new Promise<[number, string]>((done) => ws.once("close", (code, reason) => done([code, reason.toString()])));
    const second = await connectPlugin(port, "null");
    await expect(closed).resolves.toEqual([REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON]);
    answer(second);
    const again = (await main.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(JSON.parse(text(again)).connected).toBe(true);
    second.close();
  }, 20_000);
});

describe("mcp/server.ts hub and peers", () => {
  it("shares one port between servers and hands the hub over when it exits", async () => {
    const port = await freePort();
    const a = await startServer(port);
    await waitFor(() => a.stderr().includes("listening"));
    const b = await startServer(port);
    const c = await startServer(port);
    let plugin: ReturnType<typeof reconnectingPlugin> | null = null;
    try {
      await waitFor(() => b.stderr().includes("joined it as a peer") && c.stderr().includes("joined it as a peer"));

      expect(await statusOf(b.client)).toEqual({ connected: false, role: "peer" });
      await expectRules(b.client);
      const notOpen = await call(b.client, "studio_get_component");
      expect(notOpen.isError).toBe(true);
      expect(text(notOpen)).toBe(NOT_OPEN_ERROR);

      plugin = reconnectingPlugin(port);
      await waitFor(() => a.stderr().includes("Component Studio connected"));

      // All three at once: each answer must reach the server that asked.
      const [sa, sb, sc] = await Promise.all([statusOf(a.client), statusOf(b.client), statusOf(c.client)]);
      expect(sa).toEqual({ fileName: "Kit", page: "Buttons", connected: true, role: "hub" });
      expect(sb).toEqual({ fileName: "Kit", page: "Buttons", connected: true, role: "peer" });
      expect(sc).toEqual({ fileName: "Kit", page: "Buttons", connected: true, role: "peer" });

      const comp = await call(b.client, "studio_get_component");
      expect(JSON.parse(text(comp))).toEqual({ tree: "Button" });
      expect(comp.content[1]).toEqual({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" });
      const names = await call(c.client, "studio_propose_names", {
        rootId: "1:2",
        componentName: null,
        renames: [{ indexPath: [0], oldName: "Frame 1", newName: "label", reason: "text", outsideVocabulary: false }],
      });
      expect(JSON.parse(text(names))).toEqual({ stored: 1 });
      const tokens = await call(b.client, "studio_get_tokens");
      expect(tokens.isError).toBe(true);
      expect(text(tokens)).toBe("no handler for studio_get_tokens");

      // A call still open when the hub exits fails cleanly instead of hanging.
      const held = call(b.client, "studio_inspect_variables");
      const live = plugin;
      await waitFor(() => live.seen.includes("studio_inspect_variables"));
      await a.client.close();
      const failed = await held;
      expect(failed.isError).toBe(true);
      expect([RECONNECTING_ERROR, DISCONNECTED_ERROR]).toContain(text(failed));

      // One peer binds the port, the other rejoins it, and the plugin finds the new hub.
      await waitFor(async () => {
        const roles = await Promise.all([statusOf(b.client), statusOf(c.client)].map((p) => p.catch(() => null)));
        return roles.every((r) => r?.connected === true) && roles.map((r) => r.role).sort().join() === "hub,peer";
      }, 10_000);
      const again = await call(c.client, "studio_get_component");
      expect(JSON.parse(text(again))).toEqual({ tree: "Button" });
      const againB = await call(b.client, "studio_get_component");
      expect(JSON.parse(text(againB))).toEqual({ tree: "Button" });
    } finally {
      plugin?.stop();
      await Promise.all([a.client.close(), b.client.close(), c.client.close()]);
    }
  }, 30_000);

  it("reports a port held by another program, and takes it over once free", async () => {
    const port = await freePort();
    const foreign: Server = createHttpServer((_req, res) => res.end("hello"));
    await new Promise<void>((done) => foreign.listen(port, "127.0.0.1", done));
    const server = await startServer(port);
    try {
      await waitFor(() => server.stderr().includes("used by another program"));
      const status = await call(server.client, "studio_status");
      expect(status.isError).toBe(true);
      expect(text(status)).toBe(FOREIGN_PORT_ERROR(port));
      expect(text(status)).toContain(`Port ${port} is used by another program`);
      const comp = await call(server.client, "studio_get_component");
      expect(text(comp)).toBe(FOREIGN_PORT_ERROR(port));
      await expectRules(server.client);

      await new Promise<void>((done) => foreign.close(() => done()));
      await waitFor(() => server.stderr().includes("listening"), 10_000);
      expect(await statusOf(server.client)).toEqual({ connected: false, role: "hub" });
    } finally {
      foreign.close();
      await server.client.close();
    }
  }, 30_000);
});
