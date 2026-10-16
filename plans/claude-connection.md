# Claude Code connection inside Component Studio

## Goal
Claude Code (CLI) reads and proposes through Component Studio itself.
No Desktop Bridge, no switching plugins.
The human gate stays: Claude can read and propose, only the user's Apply click writes to the file.

## Why
Figma runs one plugin at a time per file.
Today Claude needs the Desktop Bridge to see the file, so the user switches between the bridge and Component Studio.

## Approach: own small MCP server in this repo
- `mcp/` (Node + TypeScript): an MCP server for Claude Code (stdio) that also listens on `ws://localhost:9240` for the plugin.
- Registered in the repo's `.mcp.json`, so Claude Code starts it automatically when `claude` runs in this folder. Nothing to start by hand.
- Port 9240 is outside the Desktop Bridge range (9223-9232), so both can coexist.
- The plugin UI (iframe) opens the WebSocket, relays each request to `code.ts` with `postMessage`, sends the answer back. Reconnects automatically; shows "Claude connected" / "Claude not connected" in the window.
- `manifest.json`: `networkAccess.allowedDomains` gets `ws://localhost:9240` (localhost, not 127.0.0.1: Figma rejects the IP form).

Rejected alternative: speak the Desktop Bridge protocol from Component Studio to reuse the figma-console tools.
It is internal to figma-console-mcp, changes with its versions (now 1.39.0), and includes arbitrary code execution, which this plugin should not expose.

## Tools Claude gets (read + propose only)
| Tool | Does |
|---|---|
| `studio_status` | connected?, file name, current page, selected root (same root rules as the plugin) |
| `studio_get_component` | tree summary of the reference variant (reuses `scan.ts`), placement (page, parent, neighbours), PNG screenshot (`exportAsync`, scale 1) as an image |
| `studio_get_tokens` | semantic variables with resolved light/dark + desktop/mobile values (reuses `loadCatalog`), and the component's raw values with their current match (exact / nearest / none) from the proposal logic |
| `studio_propose_names` | renames (same shape as the stored proposal); appear in the step-1 review immediately with the Claude badge |
| `studio_propose_tokens` | alias suggestions for unmatched or nearest values (token name, semantic variable, reason); appear in the step-2 review with the Claude badge |

- No apply tool, no rename tool, no arbitrary code execution.
- Proposals are also written to shared plugin data (as today), so they survive closing the plugin.

## Flow
1. Open Component Studio in Figma (it connects by itself; status line shows "Claude connected").
2. In the terminal (`claude` started in this repo), say "name the selected component" or "find tokens for the selected component".
3. Claude calls the `studio_*` tools, the proposal shows up in the open review.
4. Review, edit, Apply in the plugin.
Claude cannot be started from the plugin: Claude Code only acts when you type in the terminal.

## Plugin changes
- New message types between UI and sandbox for the relay (request id, tool name, args, result / error).
- Token review: unmatched values get a semantic-token dropdown; a Claude suggestion pre-fills it with a reason and badge.
  Choosing a token for an unmatched value changes the look; the result screen lists it under "intended look changes", not as an error.
- "Help with Claude Code" checkbox stays: on = Claude proposals (live or stored) are used.

## Skills
- `component-studio-naming`: switch from `figma_*` bridge tools to `studio_*` tools.
- New `component-studio-tokens`: read tokens + raw values, decide role/surface-correct aliases for values without an exact match (e.g. black text on a white card -> `color/on-surface/1/enabled`), call `studio_propose_tokens`. Never alias into `_global` except `color/transparent` and `metrics/*`.

## Decisions (user, 2026-10-15)
1. Own MCP server.
2. Port 9240 (coordinator's choice: outside the bridge range 9223-9232). One Claude Code session owns it; a second session gets "port in use" and its tools say so.
3. Proposals are also written to shared plugin data.

## Contract details (in src/types.ts)
- WebSocket frames: `BridgeRequest { id, tool, args }`, `BridgeResponse { id, ok, result | error, image? }`. Server times out a request after 30 s.
- Relay UI <-> sandbox: `bridge/request` and `bridge/response` messages; sandbox posts `claude/proposal-stored { phase }` after a propose tool, the UI shows "Claude updated the proposal - Load it" (never replaces a review with unsaved edits by itself).
- Unmatched values get a stable `key` = `<tokenName>|<value>`; Claude's token suggestions refer to that key.
- Token suggestions stored under key `token_proposal` (`StoredTokenSuggestions`), same namespace as names.
- `TokenProposal.match` gains `"manual"` and `source: "match" | "claude" | "user"`: a value mapped to a token whose value differs (Claude suggestion or user pick). Result screen calls the resulting look changes "intended", not errors.

## Role-default suggestion for unmatched values (from Figma test 2026-10-15, screenshot 22.58)
Problem: black text (#000000) showed "nearest is color/on-surface/feedback/success (#012E1C)", because RGB distance ranks dark green closer than Core's navy text (#001B4D). Plain text should point to the role default.
- `UnmatchedValue.suggestion: { variableId, variableName, reason } | null` computed by the rules, no Claude needed.
- Surface pairing (user, from Naming Conventions "Surfaces"), applies to ALL text/icon matching, not only suggestions:
  1. Surface of a text/icon use = nearest ancestor with a visible solid fill, mapped to `color/surface/<s>/<state>` or `color/background/primary` (exact, else the closest by color). No filled ancestor up to the root -> page -> `color/background/primary`.
  2. Text/icon candidates only from the pair: `background/primary` -> `color/on-background/*`; `surface/<s>` -> `color/on-surface/<s>/*` (`<s>` may be `1`, `2`, `3`, `brand`, `accent`, `subtle`, `feedback/<kind>`).
  3. Feedback/brand/accent text colors only on their own surface: no green text unless the surface is the green feedback surface.
  4. Exact value outside the pair is not a match (note "same value as X, but X pairs with another surface").
  5. No exact match in the pair -> suggestion = nearest within the pair, ties prefer `enabled` (`on-background/primary` for the page).
- Background (no surface parent needed): `color/surface/*` + `color/background/primary`, exact else suggestion = closest. Border: `color/border/*`, else suggestion `color/border/medium`. Numbers: nearest step of the right group (unchanged).
- card-marko consequence: root yellow #FFF07E -> closest surface `surface/feedback/warning` -> its text pairs with `on-surface/feedback/warning`. If the user maps the background to `surface/1/enabled` instead, a re-scan pairs the text with `on-surface/1/*`.
- Only suggested if that variable exists; reason e.g. "Text on surface 1 uses on-surface/1/enabled (#001B4D)."
- Review: dropdown pre-selected with the suggestion + "Suggested" label; still needs "Use token" (look changes). Reason line shows the suggestion instead of the RGB-nearest.
- A Claude suggestion for the same key wins over the rule suggestion.

## Re-check bound values (from Figma test 2026-10-15, screenshots 23.11)
Problem: after a first apply, the user set card-marko's root fill directly to `color/surface/3/enabled`. Step 2 proposed nothing: scan only collects UNBOUND values, so (a) the fill bound straight to a semantic variable was skipped (breaks Token Creation Logic rule 9: every value goes through a `components` token) and (b) text bound to `card-marko/color/text` -> `on-surface/1/enabled` was never re-checked against its new surface 3.
Also a naming bug: the root frame fill got token `card-marko/color/card-marko`; rules: component frame fill -> `background`; a child layer fill -> `<component>/<part>/color/background` (part = layer name).

1. Scan also reports BOUND color/number values with the bound variable (id, name, collection, and for `components` variables the alias target per mode).
2. Bound directly to a non-`components` variable -> row "Wrap in component token": new `components` token (name by the naming rules) aliasing that same variable in both modes; rebind. Look unchanged -> `match: "exact"`, checked by default.
3. Pairing audit for every text/icon color (raw or bound): resolve to its semantic variable (through the components alias); not in the pair of the current surface -> mismatch row with the suggestion = nearest within the pair (ties `enabled`).
   - Bound to this component's own token (name starts with `<component>/`) -> "Change alias" row: `card-marko/color/text`: `on-surface/1/enabled` -> `on-surface/3/enabled`. Changes the look -> `match: "manual"`, unchecked by default, warning "changes every use of this token".
   - Bound to another component's token or a semantic variable -> new own token with the paired alias, unchecked.
4. Surfaces of bound fills count for pairing (root bound to `surface/3/enabled` -> surface 3).
5. Existing wrongly named tokens (e.g. `card-marko/color/card-marko`) are not renamed automatically (Naming Conventions: renaming tokens can break code); the review lists them under a warning "Token name does not follow the pattern".
6. Token order: Figma cannot reorder variables, so new tokens are created (and the review table sorted) by part depth (root `<component>/<category>/...` first), then the part layer's indexPath, then color -> spacing -> shape, then name; existing tokens are not moved or recreated.

## Fix automatically, no "pick by hand" (from Figma test 2026-10-15, screenshots 23.30)
Observed: (a) after an apply, `card-marko/color/text` pointed to `on-surface/3/enabled` while the root ended on `surface/1/enabled` (white); (b) a re-scan warned "card-marko/color/text is used on different surfaces (surface 1, surface feedback/warning); pick its alias by hand" with no rows; (c) audit listed every label's fontFamily/fontStyle/fontSize/lineHeight/letterSpacing as raw.
1. Split by surface: text/icon colors that sit on different surfaces never share a token. The part segment = the layer that owns the surface (nearest ancestor with the fill), root -> no part. Example: navbar labels on the root (surface 1) -> `card-marko/color/text` -> `on-surface/1/enabled`; the label inside `text-content` (warning surface) -> `card-marko/text-content/color/text` -> `on-surface/feedback/warning`. Existing token used by both -> keep it for the root group (alias fixed to its pair), new part token for the other group, rebind those layers. Checked by default when the paired alias has the same value as today, otherwise a normal look-change row.
2. Pairing is computed on the state AFTER the proposal's own background changes (a row that changes a surface re-pairs the text on it in the same review); no "pick by hand" warnings remain.
3. Reuse safety: a wrap/new row never rebinds a layer to an existing token whose alias differs from what the row shows; it becomes an explicit alias-change row or a new part token.
4. Typography (Token Creation Logic rule 7): step 2 binds TEXT layers' `fontFamily`, `fontStyle` (String `font/weight/<Family>/<role>`), `fontSize`, `lineHeight`, `letterSpacing` directly to `typography` variables. Pick the role (`display|heading|body|label` + size `l|m|s|xs`) whose five values all equal the layer's -> exact, checked. No full match -> suggestion = closest role (unchecked, look change). Mixed text styles in one layer -> skipped with a reason. No component typography tokens.

## Role families + state pairing (from Core board "Semantic Color System" 12453:2303, check 2026-10-15 23.52)
card-marko (12453:19) in the real file was invalid: root bg -> `on-background/brand` (text color as bg); navbar labels -> `on-surface/brand/disabled` on `surface/brand/enabled`; text-content bg -> `border/warning` (border color as bg); its label -> `on-surface/accent/enabled` without an accent surface.
Token structure in Core: `surface/<s>/<state>` <-> `on-surface/<s>/<state>` for s in 1, 2, 3, subtle, accent, brand (states enabled, hover, pressed, disabled, loading); intents without state: `on-surface/<s>/{dimmed, brand, dark brand, success, warning, error}` (brand has success/warning/error only); `surface/feedback/<kind>` <-> `on-surface/feedback/<kind>`; `background/primary` <-> `on-background/{primary, brand, dark brand, success, warning, error, disabled}`.
1. Role families, enforced for raw AND bound values (also user/Claude picks in the review): background -> `color/surface/*` or `color/background/primary`; text/icon -> `color/on-surface/*` or `color/on-background/*`; border -> `color/border/*` or `color/transparent`. A bound value in the wrong family is a fix row: same value in the right family if it exists (no look change, checked), else the closest member (look change, checked, listed as intended).
2. State pairing: the surface's state decides the text: default = `on-surface/<s>/<same state>`; an intent only when the value matches it exactly and the state is enabled/hover/pressed; never another state's color; never "nearest by RGB" across states. Page: default `on-background/primary`.
3. Review dropdowns only offer the role family (and for text: the current pair first); picks outside are impossible.
4. Real-case expectations: root bg -> `surface/brand/enabled` (same #0059FF, checked, no look change); navbar labels -> `on-surface/brand/enabled`; text-content bg #E3AA1D -> closest surface `surface/accent/enabled` (#FBBC2C); its label keeps `on-surface/accent/enabled` (now valid). Re-scan proposes nothing.

## Token picker with swatches and search (user-approved 2026-10-16)
Native `<select>` can't show color swatches or search; one custom picker replaces every token dropdown in the review.
- Closed: rounded-square swatch (like Figma's variables panel) + short token name + chevron; number tokens show the value instead of a swatch (`padding/m · 16`).
- Open: search field (filters as you type; several words match in any order, e.g. "brand hov"), groups ("Fits this surface" first, then the rest of the role family), each row = swatch, name, value (hex or number); current choice marked.
- Order inside groups: by surface (background/primary, 1, 2, 3, subtle, accent, brand, feedback), then states enabled, hover, pressed, disabled, loading, then intents.
- Swatch shows the light-mode value; a transparent or semi-transparent value shows a checkerboard behind it.
- Keyboard: Enter/Space/ArrowDown opens, arrows move, Enter picks, Esc closes, typing goes to search; ARIA combobox + listbox; focus returns to the trigger.
- Data: the `semantic` list sent to the UI gets each variable's resolved light value (hex + opacity) and, for numbers, the desktop value.

## Renamed components and layers -> rename tokens in place (planned 2026-10-16)
Problem: tokens are named after the component and its layers (`card-marko/text-content/color/text`). After renaming the component (`card-marko` -> `card`) or a layer (`text-content` -> `content`), step 2 would create new tokens under the new names and leave the old ones orphaned, or mix prefixes.
Approach: rename the existing variable (`variable.name = ...`). The id stays, every binding stays, nothing changes visually, nothing is duplicated.

### Detection (step 2 scan)
1. For every live `components` variable bound in the component, compute the name step 2 would give that use today (current component name, current layer/part names, element, variant/state segments: the existing naming code).
2. All uses of that variable inside the component agree on one expected name, and it differs from the current name -> rename row.
   Uses disagree (e.g. only some layers were renamed) -> no rename; the existing split/rebind logic handles it.
3. Ownership: the variable belongs to this component when its plugin data `componentId` equals the root id (new: written on every token the plugin creates, next to `createdBy`), or, for older tokens without it, when its first segment is not another existing component's name. Tokens of other components are never renamed.
4. Collision: the expected name already exists as another variable -> no rename; same alias -> rebind row to the existing one; different alias -> the existing alias-change rules.

### Review
- Row kind `rename`: old name -> new name, uses count, note "No visible change. Renaming tokens can break developers' code."
- Unchecked by default (decision below); one "Rename all" button for the group.
- After step 1 renamed the component or layers, the step-1 result says "N tokens still use the old names; step 2 will offer to rename them."

### Apply
- Renames run first (before creating tokens), so new tokens never collide with old names.
- Renamed variables keep their position in the collection (the API cannot reorder variables).
- Result: a "Renamed tokens" block formatted for the release note (`- old -> new` lines) with a Copy button.

### Decisions (2026-10-16, user wants automatic fixes)
1. Rename rows checked by default (the review's "No visible change" note + the Renamed list are the safety net).
2. Copy button only for now; writing into the vault draft release note is a later Claude-side step.

### Property splits are renames too (from Figma test 2026-10-16 08.44)
Padding was 12 on all sides -> `card-markooo/spacing/padding` (padding/s) bound to all four sides. User set left/right to 24 (raw). Step 2 created `paddingX` (padding/xl) for left/right but left top/bottom on `padding`.
- Spacing/shape property names are computed from ALL sides of the layer (raw and bound): 24/12/24/12 -> `paddingX` + `paddingY`. Same for radius (`cornerRadius` vs per-corner) and stroke (`stroke` vs per-side).
- A bound token whose property no longer fits (top/bottom on `padding`) -> rename row `padding` -> `paddingY` when all its uses agree (no visible change, checked); if `padding` is still right for other layers -> new `paddingY` token aliasing the same step + rebind only those sides.
- Real case test: after apply, `card-markooo/spacing/paddingX` -> `padding/xl` on left/right, `card-markooo/spacing/paddingY` -> `padding/s` on top/bottom, no `padding` token bound anywhere in the component, re-scan proposes nothing.

## Files (expected)
- `mcp/server.ts`, `mcp/package.json` (or root `package.json` scripts), `.mcp.json`
- `src/bridge.ts` (UI-side WebSocket + relay), `src/studioTools.ts` (sandbox handlers, reuse scan/match/proposal)
- `src/ui.ts`, `src/ui.html`, `src/code.ts`, `src/types.ts`, `manifest.json`
- `.claude/skills/component-studio-naming/SKILL.md` (update), `.claude/skills/component-studio-tokens/SKILL.md` (new)
- tests under `tests/mcp/` for message framing and tool argument validation

## Status
- [x] Plan approved, decisions 1-3
- [x] MCP server + `.mcp.json` (origin check, 1 plugin connection, port-in-use error, 30 s timeout)
- [x] Plugin relay + status indicator + manifest
- [x] Tools wired to scan / catalog / proposal
- [x] Token review: dropdown for unmatched + Claude suggestions, intended look changes
- [x] Skills updated / added
- [x] typecheck + 332 tests + build
- [x] Live run 2026-10-15: MCP client -> server -> Component Studio open in real Figma (Core file): `studio_status` and `studio_get_component` (tree + PNG) answered, bad args rejected. No bridge.
- [x] Surface pairing + role-default suggestions + "Use all suggestions"; fixed `surface/feedback/error` being read as state `error`; active step button highlighted on scan; 354 tests
- [x] Re-check bound values (wrap, alias change, rebind), bindings to deleted variables count as raw, creation order root -> deeper with color/spacing/shape; 372 tests
- [x] Fix automatically: split by surface, pairing restores checked, re-pair on background choices (UI asks the sandbox again), reuse safety, typography binding; "pick by hand" removed; E2E on a fake Figma (surface 1 + brand cases); 382 tests
- [x] Role families + state pairing: raw and bound values outside their family/pair become checked fix rows (same value -> exact, else intended look change), text defaults to the same-state on-surface color, intents only on exact value in enabled/hover/pressed, dropdowns and Claude picks limited to the role family (pair first); real card-marko e2e (bound + raw); 388 tests
- [x] Token picker (swatches, search, ordering) replaces every token select; browser-checked on a mock proposal; 401 tests
- [x] Token renames in place: rename rows (checked) when all uses agree, ownership via `componentId` plugin data or no other component's prefix, collisions -> rebind / alias change, property split -> own paddingY token when `padding` stays right elsewhere; renames applied first; "Renamed tokens" block with Copy; step-1 stale count; e2e padding split + component rename; 410 tests
- [ ] Real Figma run of token renames (card-markooo padding split, Copy button inside the plugin iframe)
- [ ] Real Figma run of the token picker
- [ ] Real Figma run of role families on card-marko (12453:19)
- [ ] Real Figma run of the typography binding (line height auto stays unbound: no variable can hold auto)
- [x] Split by surface, pairing on post-proposal state, reuse safety, typography binding, "by hand" path removed; alias change with no visible change comes checked; 382 tests incl. card-marko e2e (surface 1 and brand)
- [ ] Real Figma run of the re-check on card-marko (deleted tokens state) and of the creation order
- [ ] Open question: alias changes are allowed on any token in the component's own namespace (always unchecked), not only plugin-created ones
- [ ] User run from a real `claude` session in this folder: naming skill -> Load it -> Apply; tokens skill -> Load it -> Apply
