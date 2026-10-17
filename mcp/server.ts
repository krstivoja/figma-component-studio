import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { version } from "../package.json";
import { BRIDGE_PORT, type StudioToolName } from "../src/types";
import { Hub, listenHub } from "./hub";
import { ForeignPortError, Peer } from "./peer";
import type { RelayResult } from "./relay";
import { PROMPTS, rulesMarkdown } from "./rules";
import { FOREIGN_PORT_ERROR, NOT_OPEN_ERROR, RECONNECTING_ERROR, RULES_TOOL, TOOLS } from "./tools";

// Every Claude client starts its own server. The first to bind the port is the hub and owns the plugin socket;
// the others join it as peers. When the hub exits, the peers race to bind again and the loser rejoins the winner.
type Role = "hub" | "peer";

const FOREIGN_RETRY_MS = 2000;

const port = Number(process.env.COMPONENT_STUDIO_PORT) || BRIDGE_PORT;
const log = (message: string) => process.stderr.write(`[component-studio] ${message}\n`);

const hub = new Hub();
const peer = new Peer(log);
let role: Role | null = null;
let foreign = false;
let stopping = false;
let closeHub: (() => void) | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;

// A short random delay, so peers that lost the same hub do not all bind at the same instant.
const takeoverDelay = () => 50 + Math.floor(Math.random() * 200);

function retry(ms: number): void {
  if (stopping) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void takeover();
  }, ms);
}

async function takeover(): Promise<void> {
  try {
    closeHub = await listenHub(port, hub, log);
    role = "hub";
    foreign = false;
    log(`listening on ws://127.0.0.1:${port}`);
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EADDRINUSE") {
      log(`WebSocket server error: ${(error as Error).message}`);
      retry(FOREIGN_RETRY_MS);
      return;
    }
  }
  try {
    await peer.connect(port, () => {
      role = null;
      log("hub closed; taking over the port");
      retry(takeoverDelay());
    });
    role = "peer";
    foreign = false;
    log(`port ${port} is held by another Component Studio server; joined it as a peer`);
  } catch (error) {
    if (error instanceof ForeignPortError) {
      if (!foreign) log(`port ${port} is used by another program (${error.message}); retrying`);
      foreign = true;
      retry(FOREIGN_RETRY_MS);
    } else {
      retry(takeoverDelay());
    }
  }
}

function errorResult(message: string): CallToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function jsonResult(payload: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
}

function toResult(tool: StudioToolName, current: Role, { result, image }: RelayResult): CallToolResult {
  const out = jsonResult(tool === "studio_status" ? { ...(result as object), connected: true, role: current } : result);
  if (image) out.content.push({ type: "image", data: image.base64, mimeType: image.mimeType });
  return out;
}

async function callPlugin(tool: StudioToolName, args: unknown): Promise<CallToolResult> {
  if (foreign) return errorResult(FOREIGN_PORT_ERROR(port));
  const current = role;
  if (!current) return errorResult(RECONNECTING_ERROR);
  try {
    return toResult(tool, current, await (current === "hub" ? hub.call(tool, args) : peer.call(tool, args)));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // The hub answers a peer with NOT_OPEN_ERROR when no plugin is connected, so both roles land here.
    if (tool === "studio_status" && message === NOT_OPEN_ERROR) return jsonResult({ connected: false, role: current });
    return errorResult(message);
  }
}

const mcp = new McpServer({ name: "component-studio", version });
for (const tool of TOOLS) {
  mcp.registerTool(tool.name, { description: tool.description, inputSchema: tool.shape }, (args: unknown) =>
    callPlugin(tool.name, args ?? {}),
  );
}
// Rules and prompts are answered here, in every role and with the plugin closed.
mcp.registerTool(RULES_TOOL.name, { description: RULES_TOOL.description, inputSchema: RULES_TOOL.shape }, ({ topic }) => ({
  content: [{ type: "text", text: rulesMarkdown(topic) }],
}));
for (const prompt of PROMPTS) {
  mcp.registerPrompt(prompt.name, { description: prompt.description }, () => ({
    messages: [{ role: "user", content: { type: "text", text: prompt.text } }],
  }));
}

function shutdown(): void {
  stopping = true;
  if (retryTimer) clearTimeout(retryTimer);
  closeHub?.();
  peer.close();
  process.exit(0);
}

process.stdin.on("close", shutdown);
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

void takeover();

mcp.connect(new StdioServerTransport()).catch((error: Error) => {
  log(`MCP transport failed: ${error.message}`);
  process.exit(1);
});
