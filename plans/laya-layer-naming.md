# Laya layer-naming plugin

## Goal
Figma plugin that sends selected layer(s) + question set to local Laya server (`http://127.0.0.1:8000/v1/systemone`), gets back a role classification (label/icon/container/background/...), and renames/tags the node.

## Stack
TypeScript + esbuild, no framework. `code.ts` (plugin sandbox) + `ui.html`/`ui.ts` (iframe).

## Architecture
- `code.ts`: runs in Figma sandbox. No network access. Reads selection, extracts `state` (component path, node type, text content, width/height). Sends to UI via `postMessage`. Receives Laya answer back, writes result (rename node, or set a plugin-data tag) back onto the node.
- `ui.html` + `ui.ts`: hidden/minimal iframe UI. Has network access. Receives state from plugin code, builds `questions` payload, `fetch`s Laya server, posts result back to `code.ts`.
- `manifest.json`: needs `networkAccess.allowedDomains` (or `devAllowedDomains` while laya-serve isn't https) = `["http://127.0.0.1:8000"]`.

## Flow
1. User selects one or more layers, runs plugin command "Classify with Laya".
2. `code.ts` builds `state` per node (component, type, text, width, height) → posts to UI.
3. `ui.ts` POSTs to `/v1/systemone` with fixed `role` question (label/icon/container/background criteria).
4. UI posts answer back to `code.ts`.
5. `code.ts` applies result: sets `node.setPluginData('laya-role', answer)` and optionally renames node to `${role}/${original name}` if confidence > threshold (0.6).
6. Batch mode: loop selection, one fetch per node to start (optimize to `predict_batch` later if needed).

## Open items / decisions needed
- Rename node outright vs. just tag via setPluginData — tagging is safer/reversible. Default: tag only, rename opt-in via a checkbox in UI (keep UI minimal: one button "Classify selection", one checkbox "also rename").
- Confidence threshold for auto-apply: default 0.6, surface low-confidence ones in UI list instead of silently applying.
- No web UI exists for Laya itself — this plugin's own iframe is the only UI surface.

## Files to create
- `manifest.json`
- `package.json` (esbuild, typescript, @figma/plugin-typings)
- `tsconfig.json`
- `src/code.ts`
- `src/ui.html`
- `src/ui.ts`
- `esbuild.config.mjs` or build script in package.json

## Decision: rename (changed from tag-only)
- Confidence >= 0.6: layer renamed to just `<role>` (e.g. `container`); below: tag only, name untouched.
- Plugin data (`laya-role`, `laya-confidence`) is still written for every layer.
- First rename stores the old name in `laya-original-name`; that name is what gets sent to Laya as `component`, so re-runs are stable.

## Root naming
- Root = selected node whose parent is PAGE or SECTION. Never renamed (user decision); still tagged with `laya-role` / `laya-confidence`.
- Component-type question for roots was tried and dropped: zero-shot accuracy too weak (120x40 "Sign in" frame -> card 0.81). Revisit only with a fine-tuned model.
- State sent to Laya includes a `children` summary (first 12, type + text/name) so containers have signal beyond size.

## Server
- Stock `laya-serve` has no CORS (preflight 405) — plugin iframe fetch is blocked.
- Run `/Users/marko/laya/serve_cors.py` instead (`source .venv/bin/activate && python serve_cors.py`, port 8000, 127.0.0.1) — wraps laya's `create_app()` with CORSMiddleware, laya package untouched.
- Manifest + UI use `http://localhost:8000` (Figma rejects the `127.0.0.1` literal in devAllowedDomains).

## Status
- [x] Scaffold confirmed with user (TS + esbuild, tag-only, batch endpoint)
- [x] Files written
- [x] Build passes (`npm run build`, `tsc --noEmit` clean)
- [ ] Manual test in Figma desktop (import plugin via manifest, laya-serve must be running)
