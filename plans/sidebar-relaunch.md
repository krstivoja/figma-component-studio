# Sidebar relaunch button

## Goal
After the plugin has run once in a file, "Component Studio" appears in Figma's right sidebar under Tools, like "Open Winden Tokens", so it reopens with one click.

## How (same as Winden Tokens, `Local Sites/winden-tokens/src/plugin/code.ts:193`)
- `manifest.json`: add `relaunchButtons`:
  - `{ "command": "open", "name": "Open Component Studio" }` — shown in the sidebar for the file and page.
  - `{ "command": "check", "name": "Check with Component Studio" }` — shown when a component the plugin has worked on is selected; opens straight into QA mode (needs `plans/qa-mode.md`).
- `code.ts` on start: `figma.root.setRelaunchData({ open: "" })` and `figma.currentPage.setRelaunchData({ open: "" })`.
- `code.ts` after Apply: `root.setRelaunchData({ open: "", check: "Lint names and tokens" })` on the component root.
- `figma.command` decides the start: `"check"` opens with QA mode on and runs the check; anything else opens as today.

## Note
Relaunch data is file metadata, not design: it changes no layer, token or look, but it is stored in the file.
QA mode itself never sets it, so a QA run stays fully read-only.

## Tests (tests/studio/)
- Start sets relaunch data on root and page; Apply sets it on the component root; a check run sets none.
- `figma.command === "check"` sends the UI into QA mode.

## Verification
- `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- Real Figma: run once, close, the Tools entry shows; select an applied component, the Check button shows and opens QA mode.

## Status
- [x] Plan approved (Open + Check, 2026-10-16)
- [x] Manifest + relaunch data + command routing + tests
- [ ] Real Figma run

## Implementation notes
- Figma docs: no `forSelection` field exists; `multipleSelection` (default false) is the only option, so Check shows for a single selected component, which is what we want.
- Descriptions: up to 1000 characters (throws above), the sidebar shows 3 lines; each `setRelaunchData` call replaces the node's data, so the component root gets `{ open, check }` together.
- The UI sends `ui/ready`; the plugin answers `plugin/launch` with the command, so the message is never lost before React listens.
- Start-up relaunch writes are wrapped in try/catch (view-only files).
