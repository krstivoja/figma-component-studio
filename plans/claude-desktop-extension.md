# Component Studio in Claude Desktop chat

## Goal
Use Component Studio from the Claude Desktop app's chat, not only from Claude Code in this repo.
No Figma Desktop Bridge.
Claude Code and Claude Desktop can both be connected at the same time.
The Apply button in the plugin stays the only way to write to the Figma file.

## Non-goals
- No claude.ai web connector (remote server); route B, maybe later.
- No new write tools: no apply, rename or variable tools, no code execution.
- No plugin UI redesign; only the status text may change.

## Part 1: share port 9240 between several MCP server processes (hub + peers)

### Problem today
Each Claude client starts its own `mcp/server.ts`.
The first one binds `ws://127.0.0.1:9240`; every later one gets `EADDRINUSE` and all its tools answer `PORT_IN_USE_ERROR`.
With Claude Code and Claude Desktop both running, one of them is always dead.

### Approach
- The process that binds 9240 is the **hub**: it owns the plugin socket (as today) and also accepts **peers**.
- A process that gets `EADDRINUSE` becomes a **peer**: it connects to the hub at `ws://127.0.0.1:9240/peer` and sends its tool calls there.
- The hub forwards a peer's request to the plugin with a fresh id, maps the plugin's answer back to the peer's id, and sends it to that peer only.
- The plugin keeps connecting to `/` and does not know about peers. No plugin change needed for routing.
- Hub exits (its Claude client closed) -> peers see the close, each retries binding 9240 (short random delay), one wins and becomes the hub, the others reconnect to it as peers.
  The plugin's existing reconnect (3 s, then up to 10 s) finds the new hub.
  Calls made during the switch wait up to the existing 30 s timeout, then fail with a clear "reconnecting" error.
- Peer requests are checked like plugin frames (same `parseResponse`/request validation, tool name must be in `TOOLS`).
- Security stays as today: binds 127.0.0.1 only; browser pages are refused by the Origin check (plugin iframe sends Origin `null`, peers send none).
  Any local process could connect as a peer, the same as any local process can connect as the plugin today; it still can only read and propose.
- Two Figma windows: unchanged (newest replaces older, older shows "conflict").
- Two clients proposing for the same component: last proposal wins, same as stored proposals today; the plugin's "Claude updated the proposal - Load it" covers it.
- `PORT_IN_USE_ERROR` goes away; a new error only if 9240 is held by something that is not a Component Studio hub (peer handshake fails): "Port 9240 is used by another program".

### Files
- `mcp/hub.ts` (new): hub side: plugin socket, peer sockets, id mapping, forwarding, cleanup on peer close.
- `mcp/peer.ts` (new): peer side: connect to `/peer`, send requests through the existing `Relay`, takeover loop on close.
- `mcp/server.ts`: start as hub, fall back to peer, `callPlugin` goes through whichever role is active.
- `mcp/tools.ts`: replace `PORT_IN_USE_ERROR`, add the reconnecting/foreign-port errors; `studio_status` reports `role: "hub" | "peer"`.
- `src/types.ts`: peer frame types if the hub needs any beyond `BridgeRequest`/`BridgeResponse`.

### Tests (`tests/mcp/`)
- `hub.test.ts`: unit: id mapping, answer reaches only the asking peer, peer close drops its pending requests, malformed peer frames ignored.
- `server.test.ts` (extend, real processes like today): two servers on one free port + a fake plugin socket -> both servers' tools work; kill the hub -> the peer becomes hub, fake plugin reconnects, tools work again; foreign program on the port -> clear error.

## Part 2: package the server as a Claude Desktop extension (`.mcpb`)

### What it is
A `.mcpb` file is a zip with an MCPB `manifest.json` and the server code.
Double-click it (or Claude Desktop > Settings > Extensions > Install) and the tools appear in Claude Desktop chat.
Claude Desktop runs Node extensions with its own bundled Node, so nothing to install.

### Approach
- `mcpb/manifest.json` (new, MCPB manifest, its own folder because the repo root `manifest.json` is the Figma plugin's):
  name `component-studio`, display name "Component Studio", `server.type: "node"`, `entry_point: "server/index.js"`, command `node ${__dirname}/server/index.js`, tool list, no user config.
  Manifest version and field names checked against the current MCPB spec when implementing.
- Bundle `mcp/server.ts` with esbuild (`platform: "node"`, single file, `ws` optional native deps external) to `build/mcpb/server/index.js`.
  Same server code for Claude Code (`.mcp.json` keeps running it via tsx) and Claude Desktop (bundle).
- Version: server version, MCPB manifest version and `package.json` version all come from `package.json` at build (today `"0.1.0"` is hardcoded in `server.ts`).
- `npm run pack:mcpb`: bundle, copy manifest into `build/mcpb/`, `mcpb validate`, `mcpb pack` -> `build/component-studio-<version>.mcpb`.
  `@anthropic-ai/mcpb` as a pinned devDependency.
- `build/` in `.gitignore`.

### Naming and token rules in chat
The two skills live in `.claude/skills/` and read repo files (`src/vocabulary.ts`, `plans/component-naming-tokens.md`) and the second brain's Naming Conventions.
Claude Desktop chat has none of these files.
Plan: the server exposes them itself, so the extension is self-contained:
- MCP prompts `name-component` and `find-tokens` (picked from the "+" menu in Claude Desktop) with the skill instructions.
- Read-only tool `studio_get_rules` returning the vocabulary and the naming/token rules the skills need, bundled at build time.
- Skill text written once: each `SKILL.md` is the source.
  `npm run rules` (`scripts/gen-rules.ts`) reads the files and quoted headings listed in the skill's "Read the rules first" section, extracts those sections, and writes the prompt as the skill body with that section replaced by a `studio_get_rules` call.
  Output is the committed `mcp/rules.generated.ts`; the vocabulary is imported from `src/vocabulary.ts` at run time.
  A test regenerates it and compares (skipped without the second brain); a missing heading or a local path left in a prompt fails the generator.
- `pack:mcpb` fills the built manifest's `tools` and `prompts` from the bundled server itself; `mcpb/manifest.json` lists neither.

### Tests
- `tests/mcp/bundle.test.ts`: build the bundle, start it with plain `node` over stdio, list tools and prompts, call `studio_status` (not connected) -> works without tsx or the repo's `node_modules`.
- Manual E2E in Figma: install the `.mcpb` in Claude Desktop, open Component Studio, in chat "name the selected component" -> proposal shows in the plugin review with the Claude badge, Apply there.
  Then the same with Claude Code open at the same time.

## Steps (parallel where marked)
1. [ ] Part 1 hub + peer + tests (sub-agent A).
2. [ ] Part 2 bundle + MCPB manifest + `pack:mcpb` + bundle test (sub-agent B, parallel with 1; only `mcp/server.ts` version line overlaps, B touches nothing else in `mcp/`).
3. [x] Rules prompts + `studio_get_rules` (after 1, touches `mcp/tools.ts` and `mcp/server.ts`).
4. [ ] Update `plans/claude-connection.md` port decision and the skills' "Connect" sections.
5. [ ] `npm run typecheck`, `npm test`, `npm run build`, `npm run pack:mcpb`; manual Figma E2E.

## Decisions (user, 2026-10-17)
1. `.mcpb` goes to `build/` and is also copied to `~/Desktop/plugin-zips/component-studio.<version>.mcpb`.
2. Naming Conventions: bundle the needed sections from the second-brain path at build time.
3. No extension icon for now.
4. Version ownership: sub-agent A makes `server.ts` read its version from `package.json`; sub-agent B does not touch `mcp/`.
