import { createServer } from "node:net";
import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { NOT_OPEN_ERROR, PORT_IN_USE_ERROR, REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON } from "../../mcp/tools";

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

async function waitFor(check: () => boolean, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

function connectPlugin(port: number, origin?: string): Promise<WebSocket> {
  return new Promise((done, fail) => {
    const ws = new WebSocket(`ws://localhost:${port}`, origin ? { origin } : {});
    ws.once("open", () => done(ws));
    ws.once("unexpected-response", (_req, res) => fail(new Error(`HTTP ${res.statusCode}`)));
    ws.once("error", fail);
  });
}

function answer(ws: WebSocket): void {
  ws.on("message", (data) => {
    const { id, tool, args } = JSON.parse(data.toString());
    if (tool === "studio_get_component") {
      ws.send(JSON.stringify({ id, ok: true, result: { tree: "Button" }, image: { mimeType: "image/png", base64: "iVBORw0KGgo=" } }));
    } else if (tool === "studio_status") {
      ws.send(JSON.stringify({ id, ok: true, result: { fileName: "Kit", page: "Buttons" } }));
    } else if (tool === "studio_propose_names") {
      ws.send(JSON.stringify({ id, ok: true, result: { stored: args.renames.length } }));
    } else {
      ws.send(JSON.stringify({ id, ok: false, error: `no handler for ${tool}` }));
    }
  });
}

const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;

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

  it("lists the six studio tools", async () => {
    const { tools } = await main.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "studio_get_component",
      "studio_get_tokens",
      "studio_inspect_variables",
      "studio_propose_names",
      "studio_propose_tokens",
      "studio_status",
    ]);
  });

  it("reports not connected without a plugin", async () => {
    const status = (await main.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(status.isError).toBeFalsy();
    expect(JSON.parse(text(status))).toEqual({ connected: false });
    const comp = (await main.client.callTool({ name: "studio_get_component", arguments: {} })) as CallToolResult;
    expect(comp.isError).toBe(true);
    expect(text(comp)).toBe(NOT_OPEN_ERROR);
  });

  it("rejects a browser origin with 403", async () => {
    await expect(connectPlugin(port, "https://evil.example")).rejects.toThrow("HTTP 403");
  });

  it("relays tool calls to the plugin, image included", async () => {
    const ws = await connectPlugin(port, "null");
    answer(ws);
    await waitFor(() => main.stderr().includes("Component Studio connected"));

    const status = (await main.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(JSON.parse(text(status))).toEqual({ fileName: "Kit", page: "Buttons", connected: true });

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

  it("a second instance reports that the port is owned", async () => {
    const other = await startServer(port);
    try {
      await waitFor(() => other.stderr().includes("in use"));
      const status = (await other.client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
      expect(status.isError).toBe(true);
      expect(text(status)).toBe(PORT_IN_USE_ERROR(port));
    } finally {
      await other.client.close();
    }
  }, 20_000);
});
