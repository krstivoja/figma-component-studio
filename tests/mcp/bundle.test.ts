import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const bundle = resolve(root, "build/mcpb/server/index.js");

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

const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;

// The .mcpb ships only the bundle: it must run on plain node, outside the repo, without tsx or node_modules.
describe("mcpb bundle", () => {
  let cwd: string;
  let client: Client;

  beforeAll(async () => {
    execFileSync(process.execPath, ["scripts/pack-mcpb.mjs", "--bundle-only"], { cwd: root, stdio: "pipe" });
    // A copy outside the repo, so module resolution cannot fall back to the repo's node_modules.
    cwd = mkdtempSync(join(tmpdir(), "component-studio-bundle-"));
    copyFileSync(bundle, join(cwd, "index.js"));
    const port = await freePort();
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [join(cwd, "index.js")],
      cwd,
      env: { PATH: process.env.PATH ?? "", COMPONENT_STUDIO_PORT: String(port) },
      stderr: "pipe",
    });
    client = new Client({ name: "test", version: "0.0.0" });
    await client.connect(transport);
  }, 30_000);

  afterAll(async () => {
    await client?.close();
    if (cwd) rmSync(cwd, { recursive: true, force: true });
  });

  it("lists the tools the manifest declares", async () => {
    const { tools } = await client.listTools();
    const manifest = JSON.parse(readFileSync(resolve(root, "build/mcpb/manifest.json"), "utf8"));
    expect(tools.map((t) => t.name).sort()).toEqual(manifest.tools.map((t: { name: string }) => t.name).sort());
    expect(tools.map((t) => t.name)).toContain("studio_get_rules");
    expect(tools).toHaveLength(7);
  });

  it("lists the prompts the manifest declares, with their full text", async () => {
    const { prompts } = await client.listPrompts();
    const manifest = JSON.parse(readFileSync(resolve(root, "build/mcpb/manifest.json"), "utf8"));
    expect(prompts.map((p) => p.name)).toEqual(["name-component", "find-tokens"]);
    expect(manifest.prompts.map((p: { name: string }) => p.name)).toEqual(["name-component", "find-tokens"]);
    for (const entry of manifest.prompts as Array<{ name: string; description: string; text: string }>) {
      expect(entry.description).toBe(prompts.find((p) => p.name === entry.name)?.description);
      const { messages } = await client.getPrompt({ name: entry.name });
      expect(messages).toEqual([{ role: "user", content: { type: "text", text: entry.text } }]);
      expect(entry.text).toContain("studio_get_rules");
    }
  });

  it("answers studio_get_rules from the bundle alone", async () => {
    const rules = (await client.callTool({ name: "studio_get_rules", arguments: { topic: "naming" } })) as CallToolResult;
    expect(rules.isError).toBeFalsy();
    expect(text(rules)).toContain("## Vocabulary");
    expect(text(rules)).toContain("Parent-context naming");
  });

  it("takes its version from package.json", () => {
    const { version } = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
    const manifest = JSON.parse(readFileSync(resolve(root, "build/mcpb/manifest.json"), "utf8"));
    expect(manifest.version).toBe(version);
    expect(client.getServerVersion()).toEqual({ name: "component-studio", version });
  });

  it("reports not connected without a plugin", async () => {
    const status = (await client.callTool({ name: "studio_status", arguments: {} })) as CallToolResult;
    expect(status.isError).toBeFalsy();
    expect(JSON.parse(text(status))).toEqual({ connected: false, role: "hub" });
  });
});
