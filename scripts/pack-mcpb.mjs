import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";

// Packs mcp/server.ts as a Claude Desktop extension (.mcpb). `--bundle-only` stops after build/mcpb/ is written.
const bundleOnly = process.argv.includes("--bundle-only");
const MCPB_BIN = "node_modules/.bin/mcpb";
const OUT_DIR = "build/mcpb";

function freePort() {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => done(port));
    });
  });
}

// The manifest's tools and prompts are read from the built server itself, so they cannot drift from it.
// A free port keeps this run away from a Component Studio hub that may be holding the real one.
async function describeServer(entry) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [entry],
    env: { PATH: process.env.PATH ?? "", COMPONENT_STUDIO_PORT: String(await freePort()) },
    stderr: "ignore",
  });
  const client = new Client({ name: "pack-mcpb", version });
  await client.connect(transport);
  try {
    const { tools } = await client.listTools();
    const { prompts } = await client.listPrompts();
    return {
      tools: tools.map(({ name, description }) => ({ name, description })),
      prompts: await Promise.all(
        prompts.map(async ({ name, description }) => {
          const { messages } = await client.getPrompt({ name });
          return { name, description, text: messages.map((m) => m.content.text).join("\n\n") };
        }),
      ),
    };
  } finally {
    await client.close();
  }
}

// package.json is the only version source; mcpb/manifest.json carries no version, tools or prompts.
const { version } = JSON.parse(readFileSync("package.json", "utf8"));
const { manifest_version, name, ...rest } = JSON.parse(readFileSync("mcpb/manifest.json", "utf8"));

rmSync(OUT_DIR, { recursive: true, force: true });

await build({
  entryPoints: ["mcp/server.ts"],
  outfile: `${OUT_DIR}/server/index.js`,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  // ws loads these optional native speedups in a try/catch and falls back to JS.
  external: ["bufferutil", "utf-8-validate"],
  logLevel: "info",
});

const { tools, prompts } = await describeServer(`${OUT_DIR}/server/index.js`);
const manifest = { manifest_version, name, version, ...rest, tools, prompts };
writeFileSync(`${OUT_DIR}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);

if (!bundleOnly) {
  const mcpb = `build/${name}-${version}.mcpb`;
  execFileSync(MCPB_BIN, ["validate", `${OUT_DIR}/manifest.json`], { stdio: "inherit" });
  execFileSync(MCPB_BIN, ["pack", OUT_DIR, mcpb], { stdio: "inherit" });
  const zips = join(homedir(), "Desktop", "plugin-zips");
  mkdirSync(zips, { recursive: true });
  copyFileSync(mcpb, join(zips, `${name}.${version}.mcpb`));
  console.log(`copied to ${join(zips, `${name}.${version}.mcpb`)}`);
}
