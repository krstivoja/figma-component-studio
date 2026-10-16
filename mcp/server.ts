import type { IncomingMessage } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { WebSocketServer, type WebSocket } from "ws";
import { BRIDGE_PORT, type StudioToolName } from "../src/types";
import { originAllowed, Relay, type RelayResult } from "./relay";
import { NOT_OPEN_ERROR, PORT_IN_USE_ERROR, REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON, TOOLS } from "./tools";

const port = Number(process.env.COMPONENT_STUDIO_PORT) || BRIDGE_PORT;
const log = (message: string) => process.stderr.write(`[component-studio] ${message}\n`);

const relay = new Relay();
let plugin: WebSocket | null = null;
let portInUse = false;

const wss = new WebSocketServer({
  host: "127.0.0.1",
  port,
  // Any browser tab could reach localhost; only Figma plugin iframes (Origin "null") or non-browser clients may feed Claude.
  verifyClient: (info: { req: IncomingMessage }, done: (ok: boolean, code?: number, message?: string) => void) => {
    if (originAllowed(info.req.headers.origin)) done(true);
    else done(false, 403, "Forbidden");
  },
});

wss.on("listening", () => log(`listening on ws://127.0.0.1:${port}`));

wss.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    portInUse = true;
    log(`port ${port} is in use; tools will report it`);
  } else {
    log(`WebSocket server error: ${error.message}`);
  }
});

wss.on("connection", (socket) => {
  if (plugin) {
    relay.rejectAll();
    plugin.close(REPLACED_CLOSE_CODE, REPLACED_CLOSE_REASON);
  }
  plugin = socket;
  log("Component Studio connected");
  socket.on("message", (data) => {
    if (!relay.handleMessage(data.toString())) log("ignored malformed or unknown frame");
  });
  socket.on("close", () => {
    if (plugin !== socket) return;
    plugin = null;
    relay.rejectAll();
    log("Component Studio disconnected");
  });
  socket.on("error", (error) => log(`socket error: ${error.message}`));
});

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function toResult(tool: StudioToolName, { result, image }: RelayResult): CallToolResult {
  const payload = tool === "studio_status" ? { ...(result as object), connected: true } : result;
  const content: CallToolResult["content"] = [{ type: "text", text: JSON.stringify(payload, null, 2) }];
  if (image) content.push({ type: "image", data: image.base64, mimeType: image.mimeType });
  return { content };
}

async function callPlugin(tool: StudioToolName, args: unknown): Promise<CallToolResult> {
  if (portInUse) return errorResult(PORT_IN_USE_ERROR(port));
  const socket = plugin;
  if (!socket) {
    if (tool === "studio_status") return { content: [{ type: "text", text: JSON.stringify({ connected: false }) }] };
    return errorResult(NOT_OPEN_ERROR);
  }
  try {
    return toResult(tool, await relay.request((frame) => socket.send(frame), tool, args));
  } catch (error) {
    return errorResult(error instanceof Error ? error.message : String(error));
  }
}

const mcp = new McpServer({ name: "component-studio", version: "0.1.0" });
for (const tool of TOOLS) {
  mcp.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, (args: unknown) =>
    callPlugin(tool.name, args ?? {}),
  );
}

function shutdown(): void {
  for (const client of wss.clients) client.terminate();
  wss.close();
  process.exit(0);
}

process.stdin.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

mcp.connect(new StdioServerTransport()).catch((error: Error) => {
  log(`MCP transport failed: ${error.message}`);
  process.exit(1);
});
