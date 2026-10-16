# Component naming + component tokens

## Goal
For a selected component (or component set) the plugin
1. names the component and its inner layers by convention (header, content, footer, ...),
2. creates component tokens in the `components` variable collection, named after the component,
3. aliases each token to the matching semantic token (colors from `color`, padding/gap/radius/stroke from `dimensions`),
4. binds the tokens onto the layers in every variant.

Logic sources, all under `~/Downloads/`:
- `component-cleanup.md` (naming skill), `component-tokens.md` (token skill)
- `second-brain/Design System/Naming Conventions.md` (source of truth for names and token pattern)
- `second-brain/Design System/Token Creation Logic.md` (rules, property mapping, AI snapshot/audit checks)

Not in `~/Obsidian/vault`; the rules live in the second-brain folder. Plugin will read the rules once at build time into constants (no runtime file access in a Figma plugin).

## Runs where
All in the plugin sandbox (`src/code.ts`): `figma.variables` API can read the `color` / `dimensions` collections, create tokens in `components`, and bind them. No network needed for this feature. Laya is optional (see decisions).

## Flow (propose, then apply)
1. **Scan** selected component set: every variant, every layer (5 levels). Collect raw (unbound) values: fills, strokes, padding, gap, corner radius, stroke weight, width/height, shadows, text styles.
2. **Name** layers: map each layer to a part name (`header`, `content`, `footer`, `label`, `icon`, `background`, `divider`, ...), rename identically in every variant.
3. **Match** each raw value to a semantic token by value:
   - padding -> `dimensions/padding/*`, gap -> `gap/*`, radius -> `corner-radius/*`, stroke -> `stroke/*`
   - fill colors -> `color/surface/<surface>/<state>`; text/icon -> paired `color/on-surface/...`; stroke color -> `color/border/*`
   - no exact match: show nearest step and ask, never round silently.
4. **Propose**: plugin UI shows one table: token name (new / existing), alias, raw value replaced, where used, unmatched values listed separately. Nothing is written until the user clicks Apply.
5. **Create**: tokens in `components` only (modes desktop / mobile), alias every mode, set scopes per property type.
6. **Bind**: colors via `setBoundVariableForPaint`, numbers via `setBoundVariable`, in every variant including hover/pressed/disabled.
7. **Verify**: re-scan, report remaining raw values.

## Token naming (from component-tokens.md)
```
<component>/[<part>/]color/[<variant>/]<element>[/<state>]
<component>/[<part>/]spacing/[<size-variant>/]<property>
<component>/[<part>/]shape/[<size-variant>/]<property>[/<state>]
```
- variant / size / state segment only when the value actually changes across that axis.
- padding: all equal -> `padding`; L=R and T=B -> `paddingX` + `paddingY`; else per side.
- multi-word names camelCase; existing token with same name + alias is reused.

## Hard rules
- Only the `components` collection is written. `_global`, `color`, `dimensions`, `typography` are read-only; missing semantic token -> report and stop.
- Never delete or overwrite tokens not created by this plugin.
- Existing `components` tokens are renamed only on explicit request.
- Small, per-component calls; no whole-file scans.
- Never change how a component looks. Snapshot before, snapshot after, any diff outside the approved plan is reverted (Token Creation Logic, rule 8 + AI checks 1-2).
- Every value binds to a `components` token, never straight to `color`/`dimensions`/`_global`. Text binds `typography` directly, no component typography tokens (rules 7, 9).
- Exceptions allowed to alias outside semantic: `color/transparent`, `metrics/*` for one-off sizes with no `dimensions` step.
- Renaming components, variant props, layers is safe (overrides kept) but only in place, same name in every variant. Never delete and recreate.
- Interactive states (hover shadow etc., rule 11) only when the user asks for it.

## Vocabulary (from Naming Conventions)
- Component names: `lowercase-kebab`; `ALL CAPS` only for once-per-page (`HEADER` `MAIN` `FOOTER` `DIALOG`); `_prefix` private; `icon_snake_case` icons.
- Layer names: `label` (text layer = its text property), `icon-wrapper` > `left icon` / `right icon`, `icon-static`, `container`, `text-content`, `knob`, `actions`, `button`, `wrapper` (layout element), slots `camelCase` + `Slot`.
- Property names with spaces (`left icon`); structural layers with hyphens (`icon-wrapper`). Everything lowercase, Title Case is a mistake.
- States: `enabled hover pressed focus disabled loading selected visited error active inactive` (variants say `focused`, tokens say `focus`, keep both).
- Surfaces: `1 2 3 brand accent subtle feedback`; pairs `surface/<n>` <-> `on-surface/<n>`; borders `color/border/*`.
- Dimension scale: `none 4xs 3xs 2xs xs s m l xl 2xl..5xl full` under `size/ padding/ gap/ corner-radius/ stroke/ shadow-size/`.
- Token categories only `color` `spacing` `shape`; sizes go under `shape`.

## Collections (confirmed in docs)
`_global` (mode global, hidden), `color` (light/dark), `dimensions` + `typography` (desktop/mobile), `components` (desktop/mobile, never light/dark).

## Verify (port of the doc's AI checks)
- Snapshot: walk node tree, record width/height/padding/gap/radius/stroke/font size + solid fills/strokes hex. Before and after, diff must be empty.
- Audit: every padding>0, gap>0 (not space-between), radius>0, stroke weight, solid fill/stroke is bound to a `components` variable; text style fields bound to `typography`. Skip 0 values, the set frame itself, nested instance internals. Must return PASS, max 3 fix rounds then report.

## Decisions still open
1. ~~Part naming~~ DECIDED: fixed rules (layer type, position, auto-layout order, text vs vector). No Laya.
2. ~~Scope~~ DECIDED: one selected component (set) at a time. Human verifies token names before anything is written.
   - Proposal table is editable: each token name is a text field, each alias a dropdown (matching semantic tokens), each row has a checkbox to skip it.
   - Layer renames shown as old -> new, also editable, same Apply gate.
   - Nothing is renamed, created or bound until the user clicks Apply. Cancel leaves the file untouched.
   - After Apply the audit + before/after snapshot run and the result is shown (PASS or list of issues).

## Layer name vocabulary (the list the plugin picks from)

Casing rules (from Naming Conventions):
- Always lowercase. Structural layers use hyphens: `text-content`, `icon-wrapper`.
- A layer controlled by a component property uses the property's name with spaces: `left icon`, `sub headline`, `input text`.
- Slots: `camelCase` + `Slot`. Private building blocks (components, not layers): `_prefix`.
- `left` / `right`, never start / end.
- ALL CAPS (`HEADER` `MAIN` `FOOTER` `DIALOG`) is for whole components used once per page. Inside a component the same layer is lowercase `header`, `footer`, `main`.

"Signal" = what the plugin looks at to choose the name.

### 1. Page and region structure
| Name | Use for | Signal |
|---|---|---|
| `header` | top region of a component | first child, above `content`, holds title/actions |
| `main` | primary content region | largest child, between header and footer |
| `content` | body of a card, dialog, section | middle child of header / content / footer |
| `footer` | bottom region | last child, below `content`, holds actions/links |
| `aside` | secondary side region | narrow sibling beside `main`/`content` |
| `section` | self-contained block with its own heading | child of main, has heading + body |
| `container` | box that holds other layers, no layout role | frame with children, fixed/max width |
| `wrapper` | layout element that sets orientation + gap | auto-layout frame, only layout, no fill |
| `inner` | padding shell inside a container | single child frame, padding set |
| `body` | main text/content area of a card or dialog | frame below title, above actions |
| `group` | loose set of related layers | non-auto-layout group of 2+ |

### 2. Rows, columns, grids, lists
| Name | Use for | Signal |
|---|---|---|
| `row` | horizontal line of layers | auto-layout horizontal, 2+ children |
| `column` | vertical stack inside a row layout | auto-layout vertical, sibling of other columns |
| `stack` | vertical stack of same-kind items | auto-layout vertical, repeated children |
| `grid` | 2D wrap layout | auto-layout wrap or grid mode |
| `list` | repeated items | parent of 3+ same-shaped children |
| `item` | one entry in a list | child of `list`, repeated |
| `row-group` | set of rows sharing a label | rows nested under a heading row |
| `spacer` | empty flexible space | empty frame, fill-container, no fill |
| `divider` | line separating siblings | 1px frame/line between siblings |

### 3. Table
| Name | Use for | Signal |
|---|---|---|
| `table` | whole table | frame with header row + 2+ rows |
| `table-header` | header row | first row, text-only cells, emphasis fill |
| `table-body` | rows container | frame holding the data rows |
| `table-row` | one data row | horizontal, cells aligned to columns |
| `table-cell` | one cell | child of a row, one text/icon/control |
| `header-cell` | one header cell | child of `table-header` |
| `table-footer` | summary / pagination row | last row, totals or pagination |

### 4. Text
| Name | Use for | Signal |
|---|---|---|
| `label` | main text of a control (named after its text property) | TEXT layer, short, in button/input/checkbox |
| `title` | primary heading of a card/dialog/section | TEXT, largest font in the component |
| `sub headline` | secondary heading | TEXT, second largest font |
| `headline` | prominent heading above a title | TEXT, large, above `title` |
| `description` | explanatory paragraph | TEXT, multi-line, body size |
| `supporting text` | helper line under a label/input | TEXT, small, below `label` |
| `helper text` | hint under a form field | TEXT, small, below `input` |
| `error message` | validation message | TEXT, error color, below `input` |
| `input text` | the typed or placeholder value of a field | TEXT inside `input` |
| `placeholder` | empty-state text of a field | TEXT, subtle color, inside `input` |
| `number` | numeric value (pagination, counters) | TEXT, digits only |
| `caption` | small text under media | TEXT, smallest, below `image` |
| `text-content` | wrapper holding stacked text layers | vertical wrapper with 2+ TEXT children |
| `value` | value shown next to a label | TEXT, right of `label` |

### 5. Icons and media
| Name | Use for | Signal |
|---|---|---|
| `icon` | single glyph (not wrapped) | small vector/instance, <= 32px square |
| `icon-static` | the icon instance that exposes the swap | nested icon component instance |
| `icon-wrapper` | holds left/right icons | frame with 1-2 icon children |
| `left icon` | icon before the label | icon left of `label` |
| `right icon` | icon after the label | icon right of `label` |
| `image` | raster picture | IMAGE fill rectangle/frame |
| `illustration` | decorative artwork | large vector group |
| `avatar` | user picture or initials | circle, image or 1-2 letters |
| `logo` | brand mark | vector, in header/footer |
| `thumbnail` | small preview image | small image in list/table row |
| `media` | image/video area of a card | top region with image fill |

### 6. Controls
| Name | Use for | Signal |
|---|---|---|
| `button` | clickable action | instance of button, or frame with `label` + fill |
| `link` | inline navigation text | TEXT, underlined or brand color |
| `input` | text field | frame with stroke + `input text` |
| `field` | label + input + helper as one unit | vertical wrapper: label, input, helper |
| `checkbox` | box with check | square, stroke, check icon |
| `radio` | circle with dot | circle, stroke, inner dot |
| `toggle` | switch | pill `track` + `knob` |
| `track` | rail of a toggle/slider/progress | long pill, behind a knob/fill |
| `knob` | movable handle of a toggle | circle on `track` |
| `fill` | filled part of a track or progress | pill on top of `track` |
| `thumb` | draggable handle of a slider | circle on `track` |
| `slider` | range control | `track` + `fill` + `thumb` |
| `select` | dropdown field | `input` + chevron `icon` |
| `menu` | list of choices | vertical `list` of `menu-item` |
| `menu-item` | one choice | row with `label`, optional icon |
| `tab` | one tab label | child of `tabs` |
| `tabs` | row of switchable tabs | horizontal row of `tab` |
| `chip` | compact selectable/removable tag | pill with `label` (+ dismiss) |
| `dismiss` | close/remove control | small icon button, right side |
| `actions` | group of buttons | wrapper of 1+ `button`, usually in `footer` |

### 7. Status and feedback
| Name | Use for | Signal |
|---|---|---|
| `badge` | small status or count | pill/circle with short text |
| `status` | state indicator dot or label | small circle or short text with status color |
| `indicator` | position marker (steps, pager) | small dot/bar in a repeated set |
| `progress` | progress bar | `track` + `fill` |
| `spinner` | loading animation | circle arc vector |
| `skeleton` | loading placeholder | gray block replacing content |
| `notification` | message banner | frame with icon + text + dismiss |
| `tooltip` | small hover label | small frame, arrow, short text |

### 8. Decoration
| Name | Use for | Signal |
|---|---|---|
| `background` | fill behind content | rectangle/frame under siblings, fill only |
| `border` | outline only | stroke-only frame |
| `overlay` | dimming layer | semi-transparent fill over content |
| `shadow` | drop shadow carrier | frame with effects only |
| `mask` | clipping shape | layer used as mask |

### 9. Navigation
| Name | Use for | Signal |
|---|---|---|
| `navbar` | navigation region | horizontal row of `nav-item` |
| `nav-item` | one navigation entry | child of `navbar`, icon + label |
| `breadcrumb` | path trail | row of links with separators |
| `pagination` | page switcher | row of `number` items + arrows |
| `page-indicator` | dots/bar showing page | repeated `indicator` |
| `stepper` | progress through steps | repeated `step` |
| `step` | one step | child of `stepper` |

### 10. Dialogs and overlays
| Name | Use for | Signal |
|---|---|---|
| `dialog` | modal box | centered frame over `overlay` |
| `sheet` | surface of a dialog/drawer | frame holding header/content/footer |
| `drawer` | side or bottom panel | frame attached to an edge |
| `popover` | floating panel | small frame near a trigger |

### 11. Slots (always `camelCase` + `Slot`)
`contentSlot` · `contentWrapperSlot` · `containerSlot` · `headerSlot` · `footerSlot` · `actionsSlot` · `iconSlot` · `mediaSlot` · `asideSlot`

### 12. Never use as final names (flag + rename)
- Figma defaults: `Frame 123`, `Group 4`, `Rectangle 12`, `Ellipse`, `Vector`, `Line`, `Component 1`.
- Title Case or content-as-name: `Content`, `Button Label`, `FOOTER` (as a text layer).
- `start` / `end` side names (use `left` / `right`).
- Names containing the component name twice (`link > link`).

## Worked example 1 (screenshot 2026-10-15, becomes a test fixture under `tests/`)

Input tree, vertical auto-layout, all frames fill width / hug height, text layers auto-named after their content:
```
card-marko                (root)
├ aaa        frame > TEXT "Headline"
├ dasasdd    frame > TEXT "Headline"
├ adadwwed   frame > TEXT "Headline"
└ asdadadsasd  TEXT (loose, smaller)
```
Expected result by the rules:
```
card-marko                (root, never renamed)
├ item       frame, single-text wrapper, 3 same-shaped siblings
│  └ label   TEXT
├ item
│  └ label
├ item
│  └ label
└ supporting text   TEXT, loose, smaller than the others
```
Rules this case needs (not yet in the list above):
- A frame whose only child is one TEXT is a wrapper for that text. If it has 2+ same-shaped siblings it is an `item`; alone it is `text-content`.
- Same-shaped siblings keep the same name (duplicates allowed under one parent).
- A TEXT layer named after its own content (`adsasasdasd`, `asdadadsasd`) counts as unnamed, content is never used as the name.
- Plugin never regroups: it can't wrap the three items into a `list` because that changes the layer tree. It may suggest it.
- Loose TEXT with a smaller font than siblings -> `supporting text`; largest -> `title`; otherwise `label`.

## Parent-context naming (from Figma test 2026-10-15)
Items wrapped in a frame named `table` stayed `item`; wrong. The parent's name decides the child's name and overrides an already-valid name.

| Parent | Children become |
|---|---|
| `table`, `table-body` | `table-row`; first row -> `table-header` only when it differs from the others (own fill) |
| `table-row`, `table-header` | frame children -> `table-cell` / `header-cell`; TEXT children stay `label` |
| `list` | `list-item` (user decision 2026-10-15) |
| `stack`, `grid` | `item` |
| `tabs` | `tab` |
| `navbar` | `nav-item` |
| `menu` | `menu-item` |
| `stepper` | `step` |
| `actions` | `button` (frames/instances only) |

- Uses the parent's NEW name when the parent is renamed in the same run (cascade top-down).
- Root's own name counts as a parent name too (a component named `table` gets `table-row` children).
- Review with 0 renames shows "Nothing to rename, all layer names follow the convention."

## Claude naming via Figma console MCP (decided 2026-10-15)
Why: naming needs understanding of what the component is (placement, whole structure, visual). Rules can't, Laya base model scored 1-2/10 on a 10-case check. Tokens stay rule-based (math).
No API key: Claude Code (user's subscription) reads Figma through the figma-console MCP and hands a proposal to the plugin through the file itself.

### Flow
1. In Claude Code: "name the selected component" (or a node link).
2. Claude (skill, see below): `figma_get_status` -> `figma_get_selection` -> resolve root (component set / component / top-level frame, same rule as the plugin) -> `figma_execute` reads the tree summary of the reference variant (names, types, sizes, layout, text, parent chain, 5 levels, no instance internals) -> `figma_take_screenshot` of the root -> reads where the root sits on the page (page name, parent section/frame, neighbours).
3. Claude picks names: vocabulary first (`src/vocabulary.ts`), Naming Conventions rules, parent-context table. A name outside the vocabulary is allowed only with `outsideVocabulary: true` and a reason.
4. Claude writes the proposal with `figma_execute`: `root.setSharedPluginData("component_studio", "naming_proposal", json)`. Claude never renames layers itself; the human gate stays in the plugin.
5. In Figma: Component Studio -> "1. Rename layers" finds the stored proposal and shows it in the review table; Apply works as today (every variant, snapshot diff).
6. After Apply the stored proposal is deleted, so it is never applied twice.

### Stored proposal (shared plugin data, JSON, version 1)
```
{ version: 1, source: "claude", createdAt: ISO, rootId, rootName,
  structureHash,            // hash of the reference variant tree (indexPath + type + name)
  componentName: string|null,  // proposed component name, null = keep
  renames: [{ indexPath, nodeId, oldName, newName, reason, outsideVocabulary }] }
```
- Shared plugin data because the bridge plugin and Component Studio are different plugins; normal plugin data is private per plugin.

### Plugin changes
- `LayerRename` gets `source: "claude" | "rules"` and `outsideVocabulary: boolean`.
- Rename scan: read + validate the stored proposal (pure `parseStoredProposal(json, scan)`): wrong version/root -> ignored with a warning; `structureHash` differs -> warning "layers changed since Claude looked", rows whose `oldName` no longer matches at `indexPath` are unchecked with the reason.
- Merge (pure `mergeRenames(claude, rules)`): Claude rows win; rules fill only layers Claude did not cover, marked `rules`.
- Review UI: banner "Names proposed by Claude, <time>" (or "No Claude proposal, using rules"); source badge per row; badge "not in vocabulary" for `outsideVocabulary` rows.
- Apply: delete the stored key on success.
- Tests in `tests/naming/` for parse, stale detection, merge.

### Skill (Claude side)
- New skill file `component-studio-naming` (SKILL.md): the flow above, the JSON contract, "never rename directly", and to read `src/vocabulary.ts` + the second-brain Naming Conventions sections each run.
- Builds on `component-cleanup` (naming part only); variant/property fixes stay in that skill.

### Decisions (user, 2026-10-15)
1. Skill lives in this repo: `.claude/skills/component-studio-naming/SKILL.md`; run Claude Code from this folder.
2. Rules fill layers Claude did not cover, marked `rules`.
3. Recording approved renames for a Laya fine-tune: later, separate plan.

### "Help with Claude Code" checkbox (user, 2026-10-15)
- Next to "1. Rename layers", unchecked by default, remembered per browser (localStorage, try/catch).
- Off: rules only; a stored Claude proposal is ignored and kept. No banner.
- On: stored Claude proposal is used (merged with rules for uncovered layers). None stored -> warning banner "Ask Claude Code to name it, then scan again", rule names shown meanwhile.
- The plugin cannot start Claude Code; the checkbox only decides whether the stored proposal is used.
- Stored proposal is deleted after apply only when that review actually used it.
- Idea, not planned: rules could flag layers they only named generically (`container`, `wrapper`, `item` fallback) and hint "try Help with Claude Code" for unsure components.

### structureHash (identical in plugin and skill)
Reference variant = the root itself for COMPONENT / FRAME; for COMPONENT_SET the first child of type COMPONENT.
```js
function structureHash(root) {
  const lines = [];
  (function walk(n, path) {
    lines.push(path.join(".") + "|" + n.type + "|" + (path.length ? n.name : ""));
    if ("children" in n && n.type !== "INSTANCE") n.children.forEach((c, i) => walk(c, [...path, i]));
  })(root, []);
  const s = lines.join("\n");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(16);
}
```
Uses raw Figma `type` strings (not `LayerKind`) and includes hidden layers, so both sides hash the same tree.

## Deliberate names and synonyms (from Figma test 2026-10-15, screenshot 22.33)
Bug: user renamed a wrapper to `nav`; rules proposed `nav` -> `list` (shape rule) and children -> `list-item`, because `nav` is not in the vocabulary.

Classes of current names:
- **Unnamed**: Figma default names, TEXT named after its own content, layer named like the component, keyboard mash (`aaa`, `dasasdd`: every 3+ letter token has no vowel, a triple letter, or a repeated bigram). Rules may rename freely.
- **Vocabulary**: a name in `src/vocabulary.ts`. Rules may change it only via parent-context (e.g. `item` under `table` -> `table-row`).
- **Deliberate**: any other name a person typed. Rules never rename it (casing / Title Case / start-end fixes only). Not overridden by parent-context either.

Synonyms (deliberate name -> vocabulary meaning, used for parent-context and as a suggestion):
| Typed | Means |
|---|---|
| `nav`, `navigation`, `nav-bar` | `navbar` |
| `navigation-item`, `nav item` | `nav-item` |
| `ul`, `items` | `list` |
| `li` | `list-item` |
| `btn` | `button` |
| `img`, `picture` | `image` |
| `heading` | `title` |
| `desc` | `description` |
- A synonym parent drives its children like the vocabulary name (`nav` children -> `nav-item`).
- The layer itself gets an UNCHECKED suggestion row (`skip: true`, reason "synonym of navbar, vocabulary name suggested").
- With a Claude proposal, rules fill only Unnamed layers (resolves the earlier open item).

## Files (expected)
- `src/scan.ts` raw value collection
- `src/naming.ts` part/layer naming
- `src/match.ts` raw value -> semantic token
- `src/tokens.ts` create/alias/bind in `components`
- `src/code.ts` + `src/ui.ts` + `src/ui.html` wiring and the proposal table
- tests under `tests/` for naming + matching (pure functions)

## Two-step UI (decided after build started)
- Button 1 "Rename layers": scan, review renames (and component name), Apply. No tokens in this step.
- Button 2 "Create tokens": fresh scan after the rename, so token names use the new layer names. Review token table, Apply, then snapshot diff + audit.
- If layers still have default or content names when step 2 runs, show a warning "rename first" (soft gate, not blocking).
- Laya "Classify selection" button is removed from the window (feature superseded by the rule-based renamer). Laya server stays outside this repo.
- Protocol: `component/scan` gets `phase: "rename" | "tokens"`; `Proposal` keeps both arrays, the unused one is empty for the phase.

## Status
- [x] Plan approved
- [x] Rule docs found (second-brain), collections/modes/surfaces/part names confirmed
- [x] Open decisions 1-2 answered
- [x] scan + naming
- [x] match
- [x] create + bind
- [x] UI proposal table, two-step flow, Laya removed (also from manifest)
- [x] Roots: component, component set, or top-level frame; any inner selected layer climbs to its root
- [x] typecheck + 185 tests + build pass; UI checked in a browser with mock data (both steps)
- [x] Parent-context naming (`table` -> `table-row`, `list` -> `list-item`, ...)
- [x] Claude naming: skill `.claude/skills/component-studio-naming/SKILL.md`, stored proposal, parse/stale/merge, "Help with Claude Code" checkbox, source badges; skill hash == plugin hash (vector `dea2e91f`); 211 tests; UI checked in browser
- [x] Deliberate names + synonyms + keyboard-mash detection; rules fill only Unnamed layers when a Claude proposal is used; 266 tests
- [ ] Known mash false positives (proposed for rename, user can untick): `statistics`, `remember`, `intention`, `entertainment`, `banana`, `coconut`. Revisit if it bites in practice.
- [ ] Real run in Figma: step 1 on card-marko frame (rules, then with Claude), then step 2 on a file with `color`/`dimensions`/`components` collections
- [ ] No ESLint configured in this repo (only tsc); decide whether to add one
