# UI rewrite: React Aria Components + Tailwind, Figma look

## Goal
The plugin window looks and behaves like part of Figma: Figma's own colors (light and dark), compact type, consistent controls.
Accessible and keyboard-complete by default.
Only the UI layer changes; plugin logic, message protocol, tests of pure logic and the Claude connection stay as they are.

## Stack
- React 19 + `react-aria-components` (Adobe) for behaviour and accessibility.
- Tailwind CSS v4 for styling, built and inlined into `dist/ui.html` by the existing esbuild script.
- `lucide-react` for icons (chevron, search, check, undo, copy, link status). No hand-drawn SVG icons.
- Figma theme: `figma.showUI(__html__, { themeColors: true })`. Figma then sets `figma-light` / `figma-dark` on `<html>` and provides `--figma-color-*` CSS variables. Tailwind `@theme` maps semantic names to them (`bg`, `bg-secondary`, `text`, `text-secondary`, `border`, `brand`, `danger`, `warning`, `success`). No hardcoded colors in components; the only literal colors are token swatches, which show the user's data.

## Components (new, reused everywhere)
| Component | Built on | Used for |
|---|---|---|
| `Button` (primary, secondary, ghost, small) | RAC `Button` | step buttons, Apply, Cancel, Use token, Load it, Copy, Undo |
| `Checkbox` | RAC `Checkbox` | Help with Claude Code, row apply ticks, Rename all |
| `TokenPicker` | RAC `Select` + `Autocomplete` + `SearchField` + `ListBox` sections | every token choice: swatch trigger, search, grouped list, value column |
| `Swatch` | plain element | 14px rounded square, checkerboard for transparency |
| `Badge` (neutral, info, success, warning, danger, claude) | plain element | new/existing, exact/nearest/manual, wrap/rename/alias change, Claude/Rules, Suggested |
| `Banner` (info, warning, claude) | plain element | Claude proposal banner, warnings, "Load it" |
| `StatusPill` | plain element + `Tooltip` | Claude connected / not connected / conflict |
| `ReviewTable` | RAC `Table` (or a styled native table if RAC Table's row selection fights the per-row checkbox) | renames, tokens, unmatched, typography |
| `TextField` | RAC `TextField` | editable new names (component, layers, tokens) with inline error |
| `Section` | plain element | headed blocks inside the review |

## Structure
- `src/ui/main.tsx` (mount + message bridge), `src/ui/App.tsx`, `src/ui/components/*`, `src/ui/views/{Review,Result}.tsx`, `src/ui/styles.css` (Tailwind + theme mapping).
- Pure logic stays where it is and keeps its tests: `src/review.ts`, `src/tokenPicker.ts` (ordering, search, value formatting), `src/bridge.ts`.
- `src/ui.ts` and the hand-built DOM code are removed after parity.
- esbuild: `.tsx` with automatic JSX; Tailwind compiled via `@tailwindcss/cli` (or its esbuild plugin) and inlined next to the script.

## Parity checklist (everything the current UI does)
- Two step buttons (active highlighted), Help with Claude Code checkbox (persisted), status pill, step heading.
- Step 1: component name field, renames table (indent by depth, source badges, not-in-vocabulary badge, stale rows unchecked), empty state.
- Step 2: tokens table (kinds wrap / rebind / rename / alias change, old -> new, desktop/mobile pickers when they differ), typography block, unmatched block with suggestions, Use token, Use all suggestions, Undo, Rename all, warnings, empty state.
- Claude banner with Load it; validation (token name pattern, duplicates, missing aliases) disabling Apply; counts in the footer.
- Result view: counts, intended vs unexpected look changes, audit, skipped, Renamed tokens with Copy.
- Keyboard and focus behaviour at least as good as today.

## Look
- Figma UI3 density: 11-12px text, 24-28px controls, 8px radius on popovers, 6px on controls, 1px borders from the theme.
- Window stays 720x640, review area scrolls, footer pinned.
- Both themes checked: Figma light and dark.

## Verification
- `npm run typecheck`, `npm test`, `npm run build`, and `dist/code.js` still loads without a DOM.
- Browser check of `dist/ui.html` at 720x640 in light and dark (toggle the `figma-dark` class and set the theme variables to Figma's values), with mock messages for: empty start, step 1 review, step 2 review (all row kinds, picker open + search), result (intended and unexpected changes), Claude banner, all three pill states. Screenshot each; fix anything off before reporting.
- Real Figma run by the user.

## Decision
1. Look: match Figma's own UI (chosen 2026-10-16).

## Layout revision (2026-10-16, user feedback)
- Top: React Aria `Tabs` (new reusable component `src/ui/components/Tabs.tsx`, Figma UI3 underline style): "Rename layers" · "Create tokens" · "QA check". Replaces the two step buttons and the "QA mode" checkbox. Last tab is remembered in localStorage (try/catch); launching via the sidebar "Check" relaunch button opens the QA tab for that session.
- "Help with Claude Code" stays a checkbox, shown under the tabs on Rename and Tokens only, help text under it. Each tab has its own one-line intro text.
- Bottom footer: counts left, actions right. Primary CTA in Figma Share-button style (brand blue, semibold, larger: 32px high, 12px horizontal padding), right-aligned: "Scan" before a review, "Apply" during review, "Check selection" on QA. Secondary actions (Cancel, Copy report) sit left of the CTA as secondary buttons.
- The scan no longer starts on tab click; the tab switches the view, the CTA starts the scan. Switching tab during a review keeps nothing pending (cancels like today).

## Status (layout revision)
- [x] Tabs component + layout + footer CTA
- [x] Tests updated, screenshots light/dark
- [ ] Real Figma run of the tabs layout

Notes from the layout revision:
- `Tabs` renders one `TabPanel` that follows the selected key; tab content lives in `App`.
- Keyboard: arrows move focus, Enter or Space switches (`keyboardActivation="manual"`), because a switch drops an open review.
- Tabs are disabled while a scan, check or apply runs, like the old step buttons.
- Saved in `component-studio.tab`; without it, the old `component-studio.qaMode` = 1 opens the QA tab. The sidebar "Check" launch opens QA without saving it.
- A proposal that arrives for a tab no longer shown is cancelled in the sandbox; "Load it" for the other step switches to that tab first.
- After a rename Apply the result footer offers "Next: create tokens" (secondary, switches tab only) and "Scan again".
- `Button size="lg"` (32px, 12px padding, semibold) for all footer actions, so secondary and primary line up.
- `stepTitle` now returns the tab labels ("Rename layers" / "Create tokens"); the sandbox's QA apply guard and the Claude skill hints name the tabs.

## Status
- [x] Plan approved, decision 1
- [x] Build setup (React, Tailwind, theme mapping, inline CSS)
- [x] Components
- [x] Views at parity
- [x] Old DOM UI removed
- [x] Checks + browser screenshots light/dark
- [ ] Real Figma run

Notes from implementation:
- `ReviewTable` is a styled native table: rows carry their own checkbox, inputs and pickers, which RAC Table's grid navigation would fight.
- Typing on a closed token picker opens its search seeded with that letter (as before); Escape and Tab close it back to the trigger.
- The DOM-only picker helpers `moveActive` / `initialActive` went with the old picker; `swatchFill` replaced the inline swatch logic.
