# QA mode (read-only lint)

## Goal
A "QA mode" checkbox turns the plugin into a linting tool.
It reports what is wrong with the selected component and never changes anything.
No Apply, no editable fields, no token pickers, no writes to the file.

## UI
- Checkbox "QA mode (read-only)" next to "Help with Claude Code", reusing the existing `Checkbox`; saved in localStorage (try/catch) like the Claude checkbox.
- When on, the two step buttons are replaced by one "Check component" button (`Button`, primary).
- The result is a report, built from the existing components (`Section`, `ReviewTable`, `Badge`, `Swatch`, `Banner`):
  - Summary line: "3 naming issues, 5 token issues" or "No issues found" (success `Banner`).
  - Naming: layers with a default name, content-named text, keyboard mash, synonym, not in vocabulary, and the name the rules (or Claude) would give.
  - Tokens: raw values with no token, bindings to deleted variables, bound to a semantic token directly (wrap needed), wrong surface pairing, token names that no longer match layer names, padding that should be split, unbound typography fields.
  - Each row: layer path, issue, current value (with swatch), suggestion. Severity badge: error / warning / info.
- Footer: issue count and a "Copy report" button (Markdown list), no Apply or Cancel.
- Turning QA mode off returns to the normal two-step flow; the report is cleared.

## Plugin side
- New message `component/check` (UI to plugin) and `component/report` (plugin to UI) in `src/types.ts`.
- `code.ts` runs the existing rename scan and token scan on the same root and turns them into findings with a new pure function `buildQaReport` in `src/review.ts` (or `src/qa.ts` if review.ts gets too big — that would be the one new source file).
- `pending` is set to null on a check, so an Apply can never follow a QA scan; `component/apply` is refused while the last scan was a check.
- No `setPluginData`, `setSharedPluginData`, rename, variable or binding call is reachable from the check path. A test asserts the check path performs no writes on a mocked figma API.
- The stored Claude proposal is read (if "Help with Claude Code" is on) but never cleared.

## Tests (tests/qa/)
- `buildQaReport`: one case per issue kind, empty component gives "No issues found", severity mapping, Markdown output.
- Write-guard test on the check path.
- UI parity: QA on hides step buttons, Apply, inputs and pickers.

## Verification
- `npx tsc --noEmit`, `npx vitest run`, `npm run build`.
- Browser screenshots light and dark: QA report with issues, clean component, Copy report.
- Real Figma run on card-markooo: report matches what step 1 and step 2 would propose; file unchanged afterwards (undo history empty).

## Decisions (2026-10-16)
1. One combined check: naming + tokens in one report.
2. Clicking a report row selects that layer on the canvas and scrolls it into view (selection only, file unchanged). New message `qa/select` with the node id.

## Check before it is a component (added 2026-10-16)
- Root rule changed (done): outside a component the selected frame itself is the root (or the nearest frame around a selected text/shape), not the top-level screen. Inside a component it still resolves to the component or set. Tests in `tests/studio/selectedRoot.test.ts`.
- When the root is a plain frame (draft), QA reports only what is valid before a component exists:
  - Colors: raw color with a semantic token available (suggest it), raw color with no token, binding to a deleted variable.
  - Pairing: text/icon colors checked against the surface they sit on, with the same role families and state-aware pairing as step 2 (`on-surface/*` on `surface/*`, `on-background/*` on `background/*`, border family). Bound semantic colors count as correct when paired; no "wrap needed" finding.
  - Wrong role family (draft and component QA): a `surface/*` or `background/*` token on a text/icon fill, `on-surface/*` / `on-background/*` as a frame background, `border/*` outside strokes. Error, suggestion = the right family token. On text/icons it also counts as a pairing error, e.g. text bound to `surface/primary/enabled` inside a frame on `surface/accent/enabled` gives "Wrong color family" and "Wrong surface pairing", both suggesting `on-surface/accent/enabled` (state-aware: `on-surface/accent/hover` on a hover surface).
  - Spacing, radius, stroke width: raw values with a matching semantic dimensions token, values with no token.
  - Typography: text not bound to a typography role.
  - Naming: default Figma names, content-named text, keyboard mash, synonyms (layer-name rules only; no component name finding).
- Draft mode leaves out everything that needs the component token layer: "No components collection", component token names, "maps to different values", wrap needed, token renames, padding splits, Claude token proposals.
- Report header says "Draft (not a component yet)". The scan-level warning flood (long "maps to different values" lists) never appears in a draft report.
- For components, the "maps to different values" warnings are grouped into one Notes line with a count and a show-more list, not one bullet each.

## Library tokens (from inspection of Core 12466:364, 2026-10-16)
Facts: every variable bound in the copied "Segmented control" is REMOTE (library copy), collection names "color"/"typography", variable names carry the collection prefix themselves (`color/surface/accent/primary/enabled`, `color/on-surface/primary/enabled`, `font/weight/label/m`), and differ from the file's local scheme (`color` collection, `surface/1/enabled`). `teamLibrary` lists no collections (a file cannot list its own library). The text `label-text` in Action 1 is bound to `color/surface/primary/enabled` on a frame bound to `color/surface/accent/primary/enabled` — must be an error.
- Checking catalog = local variables + every variable bound in the selection (remote included), resolved with the shared resolver. Remote ones are marked `remote` with their collection name.
- Name normalisation: a variable whose name already starts with its collection name is not prefixed again (`color/surface/...` stays, local `surface/1/enabled` in `color` becomes `color/surface/1/enabled`). Role family and pairing use the normalised name, so both schemes work: `surface/<x>[/<y>]/<state>` pairs with `on-surface/<x>[/<y>]/<state>`.
- Pairing suggestion: look for the partner name first among local + bound variables; if not found, still report the error and give the expected name pattern as text ("use color/on-surface/accent/primary/enabled from the library"), no swatch. Never import.
- New info finding "From a library": bound remote variables whose name has no local equivalent, so the user sees the design uses another token set. One row per variable, listing layers.
- Raw values: suggestions only from local + bound variables (unchanged rule otherwise).
- Applies to QA (draft and component). Step 2 token creation keeps using local variables only for now.
- Tests with the exact fixture from the inspection (names, values, layer paths).

## Map library surfaces to local ones (user, 2026-10-16)
- Rule confirmed: text/icon never uses a surface token; it uses the on-surface token matching its background, strictly per surface (Action 2 pairing error stays).
- A library surface with no same-name local variable is matched to a local surface by value: same alias target per mode (e.g. both alias `brand blue/40` light, `brand blue/30` dark), else same resolved light and dark values. Library `color/surface/accent/primary/enabled` (#0059FF) maps to local `color/surface/brand/enabled`.
- The pairing suggestion is then the local partner (`color/on-surface/brand/enabled`, with swatch), state-aware. Only when no local match exists, fall back to the library partner name as text.
- "From a library" rows show the local equivalent when found ("local equivalent: color/surface/brand/enabled") with severity info; rows without an equivalent keep today's text.

## Status
- [x] Library surfaces mapped to local by value: `localEquivalent` (proposal.ts) + `boundSurfacePair` in `locateSurface`, local partner with swatch (draft and component QA), library partner as text only without a local match, "From a library" rows with the local equivalent, component wrap rows alias the local equivalent (tests/qa/libraryTokens.test.ts, screenshot light)
- [x] Library tokens in QA: `withBoundVariables` (studioTools.ts) builds the QA catalog, `pairExpected` for partners not in the file, "From a library" info rows, component and draft QA (tests/qa/libraryTokens.test.ts, write guard with remote variables, screenshots light/dark)
- [x] Raw value titles: "Raw value, nearest token" for a nearest match, "Raw value, token exists" only for an exact one (draft and component QA)
- [x] Draft (pre-component) check: `checkValues` (proposal.ts) + `buildDraftQaReport` (qa.ts), frame roots routed in `handleCheck`
- [x] Wrong role family finding (`role-family`), draft and component QA
- [x] "maps to different values" rounded to 2 decimals and grouped (one line + show all) in QA notes and step 2 warnings
- [x] Tests (tests/qa/draftReport.test.ts, tests/ui/warningGroups.test.ts, write guard on a draft frame, UI), checks, browser screenshots light/dark
- [x] Plan approved, decisions 1 and 2
- [x] Messages + `buildQaReport` + tests
- [x] Plugin check path + write-guard test
- [x] UI: checkbox, report view, Copy report
- [x] Checks + browser screenshots light/dark
- [ ] Real Figma run

## Implementation notes
- `buildQaReport` lives in `src/qa.ts`; tests in `tests/qa/` (report kinds, write guard on a proxied figma API, UI parity).
- Checkboxes are stacked, each with its own help text under it.
- Proposal rows carry an optional `issue` (`surface-pairing` / `property-split`) so the report does not parse notes.
- Scans record where deleted-variable bindings were (`VariantScan.missingUses`).
- Draft check: `checkValues(scan, catalog)` runs step 2's `collectItems` + `resolve` per value (no token names, no grouping, no surface overrides), so pairing is against the surface the text sits on now. Sizes (width/height) are left out, values bound to component tokens too.
- Draft notes are the catalog mode warnings only; component setup, step hints, token-name and "maps to different values" warnings never appear.
- `TokenProposal.wrongFamily` / `ValueCheck.wrongFamily` mark a bound color outside its role family; the report turns it into a `role-family` row (plus a pairing row on text/icons).
- A wrong family with no fix in the catalog is still reported in drafts (no suggestion); component QA only reports it when step 2 has a fix row.
- QA catalog = `loadCatalog()` + `withBoundVariables(catalog, root)`: reuses `collectBoundVariables` (bound ids) and the shared resolver, and `catalogVariable` (scan.ts), the entry builder `loadCatalog` uses too. Library variables are added after the local ones (`remote: true`), never imported. Step 2 still calls `loadCatalog()` alone.
- Name normalisation (`normalizeVariableName`) is applied to the catalog for the `color` collection only, because role families and pairing read colors as `color/…`; typography (`font/…`), dimensions and components keep their names. The "From a library" equivalence check (`equivalenceKey`) normalises every collection.
- A bound text/icon off its pair with no partner in the catalog gets `ValueCheck.pairExpected` (the partner name): reported as "Wrong color family" or "Wrong surface pairing", suggestion as text with `suggestionNote` "From the library, not in this file", no swatch. Component QA swaps the step 2 wrap row for this finding (`QaInput.catalog`).
- Test fixture of the inspection: tests/qa/coreLibraryFixture.ts (real ids, names, values and aliases; local scheme without the `color/` prefix).
- Library to local mapping: `withBoundVariables` stores each library variable's alias targets as `aliasKeys` (`primitiveKey` in match.ts: own-collection and `color/` prefixes dropped, so library `color/brand blue/40` equals local `_global` `brand blue/40`).
- `localEquivalent(v, catalog)`: same-name local first; else local colors of the same role root (`color/surface`, `color/on-surface`, …) with the same alias targets in every mode, else the same resolved values in every mode. Ties: alias match, then most shared name segments, then catalog order.
- A mapped surface keeps `SurfacePair.mappedFrom`; the pairing sentence reads "Text on surface brand (mapped from library surface/accent/primary/enabled) uses on-surface/brand/enabled".
- Step 2 is unaffected: its catalog has no library variables, so nothing is mapped there.
