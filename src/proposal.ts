import type {
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerNode,
  LayerRename,
  Mode,
  Proposal,
  RawValueUse,
  RowChoice,
  TokenProposal,
  UnmatchedValue,
  VariantScan,
} from "./types";
import {
  buildTokenName,
  isValidComponentTokenName,
  normalizeState,
  paddingProperties,
  toSegment,
  TOKEN_STATES,
} from "./tokenNames";
import {
  colorFamily,
  findMode,
  inRoleFamily,
  matchColor,
  matchNumber,
  modeWarnings,
  normalizeHex,
  preferEnabled,
  resolveValue,
  type Candidate,
  type NumberGroup,
} from "./match";
import { normalizeComponentName } from "./naming";
import { proposeTypography } from "./typography";

const MODES: Mode[] = ["desktop", "mobile"];
const LAYOUT = "layout";
const SIZE = "size";
const STATE = "state";
const NUMBER_TOLERANCE_ABS = 2;
const NUMBER_TOLERANCE_REL = 0.25;
const COLOR_TOLERANCE = 32;
const MAX_NEAREST_CANDIDATES = 3;
const PILL_RADIUS = 999;

type Category = "color" | "spacing" | "shape";

interface Item {
  use: RawValueUse;
  variant: VariantScan;
  layerName: string;
  category: Category;
  part?: string;
  element?: string;
  property?: string;
  group?: NumberGroup;
  valueKey: string;
  display: string;
  slotNote?: string;
  bound?: CatalogVariable;
  surface?: { pair: SurfacePair; ownerPath: number[] }; // text/icon only
}

interface SurfaceOverrides {
  layers: Map<string, string>; // `${variantId}|${indexPath}` of a filled layer -> surface variable id after this proposal
  tokens: Map<string, string>; // components token id -> surface variable id after an alias change
}

const NO_OVERRIDES: SurfaceOverrides = { layers: new Map(), tokens: new Map() };

const fillKey = (variantId: string, path: number[]) => `${variantId}|${pathKey(path)}`;

interface Resolution {
  alias: string | null;
  match: Exclude<TokenProposal["match"], "manual">;
  candidates: string[];
  note: string | null;
  reason: string | null;
  target: CatalogVariable | null;
  suggestion?: Suggestion;
  pairFix?: string; // value outside its role family or surface pair: alias is the fix, row comes checked
  fixLook?: boolean; // the fix changes the look
}

const PADDING_FIELDS = new Set(["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]);
const CORNER_FIELDS = new Set(["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]);
const SIZE_FIELDS = new Set(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]);

const pathKey = (p: number[]): string => p.join(".");

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function locate(root: LayerNode, path: number[]): { node: LayerNode | null; hidden: boolean } {
  let node: LayerNode = root;
  let hidden = !root.visible;
  for (const i of path) {
    const next: LayerNode | undefined = node.children[i];
    if (!next) return { node: null, hidden };
    node = next;
    if (!node.visible) hidden = true;
  }
  return { node, hidden };
}

function isConformantComponentName(name: string): boolean {
  return (
    /^[A-Z]+(-[A-Z]+)*$/.test(name) ||
    /^_?[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/.test(name) ||
    /^icon(_[a-z0-9]+)+$/.test(name)
  );
}

function axisSegment(axis: string, value: string): string {
  const v = value.trim().toLowerCase();
  if (axis === "value") return v === "false" ? "unchecked" : v === "true" || v === "mixed" ? "checked" : toSegment(v);
  if (axis === "active" && (v === "true" || v === "false")) return v === "true" ? "active" : "inactive";
  if (v === "true") return toSegment(axis);
  if (v === "false") return `not-${toSegment(axis)}`;
  return toSegment(v);
}

function sortUses(uses: RawValueUse[]): RawValueUse[] {
  return [...uses].sort(
    (a, b) =>
      cmp(a.variantId, b.variantId) ||
      cmp(pathKey(a.indexPath), pathKey(b.indexPath)) ||
      cmp(a.field, b.field) ||
      (a.paintIndex ?? -1) - (b.paintIndex ?? -1),
  );
}

function paddingForm(l: number, r: number, t: number, b: number): number {
  return paddingProperties(l, r, t, b).length;
}

type CornerForm = "all" | "tb" | "lr" | "corners";

function cornerForm(c: { tl: number; tr: number; bl: number; br: number }): CornerForm {
  if (c.tl === c.tr && c.tr === c.bl && c.bl === c.br) return "all";
  if (c.tl === c.tr && c.bl === c.br) return "tb";
  if (c.tl === c.bl && c.tr === c.br) return "lr";
  return "corners";
}

function mergeCornerForms(forms: Set<CornerForm>): CornerForm {
  if (forms.has("corners") || (forms.has("tb") && forms.has("lr"))) return "corners";
  if (forms.has("tb")) return "tb";
  if (forms.has("lr")) return "lr";
  return "all";
}

function paddingProperty(field: string, form: number): string {
  if (form === 1) return "padding";
  if (form === 2) return field === "paddingLeft" || field === "paddingRight" ? "paddingX" : "paddingY";
  return field;
}

function cornerProperty(field: string, form: CornerForm): string {
  const top = field.startsWith("top");
  const left = field.includes("Left");
  if (form === "all") return "cornerRadius";
  if (form === "tb") return top ? "cornerRadiusTop" : "cornerRadiusBottom";
  if (form === "lr") return left ? "cornerRadiusLeft" : "cornerRadiusRight";
  return `cornerRadius${top ? "Top" : "Bottom"}${left ? "Left" : "Right"}`;
}

function displayNumber(n: number): string {
  return String(n);
}

function displayColor(hex: string, opacity: number): string {
  const h = normalizeHex(hex);
  return opacity === 1 ? h : `${h} @ ${opacity}`;
}

function slotKey(i: Item): string {
  return `${i.part ?? ""}|${i.category}|${i.element ?? i.property ?? ""}`;
}

export function surfaceRest(name: string): string | null {
  const prefix = "color/surface/";
  if (!name.startsWith(prefix)) return null;
  const segs = name.slice(prefix.length).split("/");
  // feedback/<kind> has no state suffix, and "error" is both a feedback kind and a token state.
  if (segs[0] === "feedback") return segs.slice(0, 2).join("/");
  if (segs.length > 1 && (TOKEN_STATES as readonly string[]).includes(segs[segs.length - 1])) segs.pop();
  return segs.join("/");
}

// "card-marko" -> "card-marko/": tokens under it belong to this component and may get a new alias on request.
export function ownTokenPrefix(componentName: string): string {
  return buildTokenName({ component: componentName, category: "color", element: "x" }).slice(0, -"color/x".length);
}

// Text pairs with the surface it sits on after the proposal: a second pass re-pairs it when checked rows change surfaces.
export function buildProposal(
  scan: ComponentScan,
  catalog: Catalog,
  renames: LayerRename[],
  componentName: string,
  assume: RowChoice[] = [],
  otherComponents: string[] = [],
): Proposal {
  const owner: Owner = { rootId: scan.id, foreign: foreignPrefixes(otherComponents, componentName) };
  const first = buildOnce(scan, catalog, renames, componentName, NO_OVERRIDES, owner);
  const overrides = surfaceOverrides(first, catalog, assume);
  const result = overrides.layers.size || overrides.tokens.size ? buildOnce(scan, catalog, renames, componentName, overrides, owner) : first;
  const warnings = result.warnings.slice();
  const typography = proposeTypography(scan, catalog, warnings);
  return { ...result, typography, warnings };
}

export const TOKEN_RENAME_NOTE = "No visible change. Renaming tokens can break developers' code.";

export function countTokenRenames(scan: ComponentScan, catalog: Catalog, componentName: string, otherComponents: string[] = []): number {
  return buildProposal(scan, catalog, [], componentName, [], otherComponents).tokens.filter((t) => t.kind === "rename").length;
}

interface Owner {
  rootId: string;
  foreign: string[]; // token name prefixes of the file's other components
}

function foreignPrefixes(otherComponents: string[], componentName: string): string[] {
  const own = ownTokenPrefix(componentName);
  const out = new Set<string>();
  for (const n of otherComponents) {
    if (!/[a-z0-9]/i.test(n)) continue;
    const p = ownTokenPrefix(normalizeComponentName(n) ?? n);
    if (p !== own) out.add(p);
  }
  return [...out];
}

function belongsTo(token: CatalogVariable, owner: Owner): boolean {
  if (token.componentId) return token.componentId === owner.rootId;
  return !owner.foreign.some((p) => token.name.startsWith(p));
}

function isSurface(v: CatalogVariable): boolean {
  return v.collection === "color" && (v.name === PAGE || surfaceRest(v.name) !== null);
}

function surfaceOverrides(p: Proposal, catalog: Catalog, assume: RowChoice[]): SurfaceOverrides {
  const choices = new Map(assume.map((c) => [c.key, c]));
  const out: SurfaceOverrides = { layers: new Map(), tokens: new Map() };
  const consider = (uses: RawValueUse[], alias: Record<Mode, string | null>, apply: boolean, aliasChangeOf: string | null) => {
    const target = apply && alias.desktop ? catalog.variables.find((v) => v.id === alias.desktop) : undefined;
    if (!target || !isSurface(target)) return;
    for (const u of uses) if (u.kind === "color" && u.field === "fills" && u.role === "background") out.layers.set(fillKey(u.variantId, u.indexPath), target.id);
    const token = aliasChangeOf ? catalog.variables.find((v) => v.collection === "components" && v.name === aliasChangeOf) : undefined;
    if (token) out.tokens.set(token.id, target.id);
  };
  for (const t of p.tokens) {
    const c = choices.get(t.key);
    consider(t.uses, c?.alias ?? t.alias, c ? c.apply : !t.skip, t.kind === "alias-change" ? t.name : null);
  }
  for (const u of p.unmatched) {
    const c = choices.get(u.key);
    if (c) consider(u.uses, c.alias, c.apply, null);
  }
  return out;
}

function buildOnce(
  scan: ComponentScan,
  catalog: Catalog,
  renames: LayerRename[],
  componentName: string,
  overrides: SurfaceOverrides,
  owner: Owner,
): Proposal {
  const warnings: string[] = modeWarnings(catalog);
  const renameMap = new Map<string, string>();
  for (const r of renames) if (!r.skip) renameMap.set(pathKey(r.indexPath), r.newName);

  const items = collectItems(scan, renameMap, catalog, overrides);
  splitColorConflicts(items);

  const axes = orderedAxes(scan);
  const hasLayout = LAYOUT in scan.variantProperties || scan.variants.some((v) => LAYOUT in v.props);
  const names = nameItems(items, axes, componentName);
  const prefix = ownTokenPrefix(componentName);
  const viaComponents = items.filter((i) => i.bound?.collection === "components");
  const regular = items.filter((i) => i.bound?.collection !== "components");

  const byName = new Map<string, Item[]>();
  for (const i of regular) {
    const n = names.get(i)!;
    const list = byName.get(n) ?? [];
    list.push(i);
    byName.set(n, list);
  }

  const groups: Array<{ name: string; items: Item[] }> = [];
  for (const [name, list] of byName) {
    const desktop = new Set(list.filter((i) => !isMobile(i)).map((i) => i.valueKey));
    const mobile = new Set(list.filter(isMobile).map((i) => i.valueKey));
    if (desktop.size <= 1 && mobile.size <= 1) {
      groups.push({ name, items: list });
      continue;
    }
    const values = [...new Set(list.map((i) => i.display))].sort();
    warnings.push(
      `Token name "${name}" maps to different values (${values.join(", ")}); rename one row before applying.`,
    );
    const byValue = new Map<string, Item[]>();
    for (const i of list) byValue.set(i.valueKey, [...(byValue.get(i.valueKey) ?? []), i]);
    for (const sub of byValue.values()) groups.push({ name, items: sub });
  }
  groups.sort((a, b) => cmp(a.name, b.name) || cmp(a.items[0].valueKey, b.items[0].valueKey));

  const results = new Map<{ name: string; items: Item[] }, TokenProposal>();
  const unmatched: Proposal["unmatched"] = [];
  const retargets: Array<{ row: TokenProposal; existing: CatalogVariable; sample: Item }> = [];

  for (const g of groups) {
    const desktopItems = g.items.filter((i) => !isMobile(i));
    const mobileItems = g.items.filter(isMobile);
    const dSample = (desktopItems[0] ?? mobileItems[0])!;
    const mSample = (mobileItems[0] ?? dSample)!;
    const ctx = tieContext(g.items);

    const dRes = resolve(dSample, "desktop", catalog, ctx);
    const mRes = mSample === dSample ? resolve(dSample, "mobile", catalog, ctx) : resolve(mSample, "mobile", catalog, ctx);

    const notes: string[] = [];
    const slotNotes = [...new Set(g.items.map((i) => i.slotNote).filter((n): n is string => !!n))].sort();
    notes.push(...slotNotes);
    if (dRes.note) notes.push(dRes.note);
    if (mSample !== dSample && mRes.note && mRes.note !== dRes.note) notes.push(`Mobile: ${mRes.note}`);

    const replaces =
      mSample !== dSample && mSample.valueKey !== dSample.valueKey
        ? `${dSample.display} (desktop) / ${mSample.display} (mobile)`
        : dSample.display;

    if (mSample === dSample || mSample.valueKey === dSample.valueKey) {
      const step = dRes.target?.name ?? "the same value";
      if (!hasLayout) notes.push(`No layout variant: desktop and mobile both alias ${step}.`);
      else if (mobileItems.length === 0) notes.push(`No mobile variant with this value: desktop and mobile both alias ${step}.`);
      else if (desktopItems.length === 0) notes.push(`Only mobile variants use this value: desktop and mobile both alias ${step}.`);
      else notes.push(`Same value in desktop and mobile variants: both modes alias ${step}.`);
    }

    const matchRank = { exact: 0, nearest: 1, none: 2 } as const;
    const match = matchRank[dRes.match] >= matchRank[mRes.match] ? dRes.match : mRes.match;
    const alias: Record<Mode, string | null> = { desktop: dRes.alias, mobile: mRes.alias };
    const candidates = [...new Set([...dRes.candidates, ...mRes.candidates])].filter(
      (id) => id !== alias.desktop && id !== alias.mobile,
    );
    const uses = sortUses(g.items.map((i) => i.use));
    const wrap = g.items.some((i) => i.bound);
    const pairFix = dRes.pairFix ?? mRes.pairFix;
    const fixLook = !!(dRes.fixLook || mRes.fixLook);

    const existing = catalog.variables.find((v) => v.collection === "components" && v.name === g.name);
    const type: TokenProposal["type"] = dSample.category === "color" ? "COLOR" : "FLOAT";
    const retarget = !!existing && existing.type === type && !!existing.aliasOf && !sameAlias(currentAlias(existing), alias);
    if (existing && !retarget) checkExisting(existing, g.name, type, { desktop: dRes, mobile: mRes }, { desktop: dSample, mobile: mSample }, warnings);
    const key = `${g.name}|${replaces}`;

    if (match === "none") {
      const suggestion = dRes.suggestion ?? mRes.suggestion ?? null;
      const reason = [dRes.reason, mRes.reason !== dRes.reason ? mRes.reason : null]
        .filter((r): r is string => !!r)
        .join(" ");
      unmatched.push({
        key,
        tokenName: g.name,
        type,
        display: `${g.name} (${replaces})`,
        uses,
        reason: reason || "No matching semantic token.",
        suggestion,
      });
      continue;
    }

    if (pairFix) notes.unshift(pairFix);
    else if (wrap) notes.unshift(`Bound directly to ${shortName(dSample.bound?.name ?? replaces)}; wrapped in a component token, look unchanged.`);
    const row: TokenProposal = {
      key,
      name: g.name,
      status: existing ? "existing" : "new",
      type,
      alias,
      candidates,
      match: pairFix ? (fixLook ? "manual" : "exact") : match,
      source: "match",
      replaces,
      uses,
      note: notes.length ? notes.join(" ") : null,
      skip: false,
      ...(wrap ? { kind: "wrap" as const } : {}),
    };
    results.set(g, row);
    if (retarget) retargets.push({ row, existing: existing!, sample: dSample });
  }

  const claimed = new Map(groups.map((g) => [g.name, describeItem(g.items[0])] as const));
  const recheck = recheckComponentTokens(viaComponents, names, claimed, catalog, prefix, owner, warnings);
  for (const { row, existing, sample } of retargets) toAliasChange(row, existing, sample, viaComponents, recheck.moved, catalog);
  warnUnusedTokens(catalog, prefix, viaComponents, warnings);

  const tokens = [...results.values(), ...recheck.rows].sort((a, b) => cmp(a.name, b.name) || cmp(a.key, b.key));
  unmatched.sort((a, b) => cmp(a.display, b.display) || cmp(a.reason, b.reason));
  const itemOf = new Map(items.map((i) => [i.use, i]));
  for (const row of [...tokens, ...unmatched]) {
    const sample = row.uses.map((u) => itemOf.get(u)).find((i) => i && isTextOrIcon(i));
    if (sample) row.pairOptions = pairIds(surfacePair(sample), catalog);
  }

  return {
    componentId: scan.id,
    componentName: scan.name,
    newComponentName: componentName === scan.name && isConformantComponentName(scan.name) ? null : componentName,
    renames,
    tokens,
    unmatched,
    warnings,
  };
}

export function currentAlias(v: CatalogVariable): Record<Mode, string | null> {
  const keys = Object.keys(v.aliasOf ?? {});
  const at = (mode: Mode) => {
    const k = findMode(keys, mode) ?? keys[0];
    return k === undefined ? null : v.aliasOf![k];
  };
  return { desktop: at("desktop"), mobile: at("mobile") };
}

function sameAlias(a: Record<Mode, string | null>, b: Record<Mode, string | null>): boolean {
  return a.desktop === b.desktop && a.mobile === b.mobile;
}

// Follows components aliases down to the semantic variable they point at.
function semanticOf(v: CatalogVariable, catalog: Catalog, mode: Mode = "desktop"): CatalogVariable | null {
  let current: CatalogVariable | undefined = v;
  for (let depth = 0; current && depth < 16; depth++) {
    if (current.collection !== "components") return current;
    const next: string | null = currentAlias(current)[mode];
    current = next ? catalog.variables.find((x) => x.id === next) : undefined;
  }
  return null;
}

function surfaceLabel(v: CatalogVariable): string {
  const rest = surfaceRest(v.name);
  return rest ? `surface ${rest}` : shortName(v.name);
}

function describeItem(i: Item): string {
  if (isRootFill(i)) return "component frame fill";
  if (i.use.kind === "number") return `"${i.layerName}" ${i.use.field}`;
  return `"${i.layerName}" ${i.use.field === "strokes" ? "border" : i.use.role === "background" ? "fill" : i.use.role}`;
}

function layerList(list: Item[]): string {
  return [...new Set(list.map((i) => i.layerName))].join(", ");
}

interface FamilyCheck {
  role: RawValueUse["role"];
  pair?: SurfacePair; // text/icon only
  fix: CatalogVariable | null; // set when the semantic target is outside the role family or the surface pair
  same: boolean; // the fix has the layer's current value
}

function familyCheck(item: Item, semantic: CatalogVariable | null, catalog: Catalog): FamilyCheck | null {
  const role = item.use.role;
  if (item.use.kind !== "color" || role === "other" || !semantic) return null;
  if (semantic.collection !== "color" && !inRoleFamily(semantic, "border")) return null;
  const hex = item.use.hex!;
  const opacity = item.use.opacity ?? 1;
  if (role === "text" || role === "icon") {
    const pair = surfacePair(item);
    if (semantic.collection === "color" && allowedIn(semantic.name, pair)) return { role, pair, fix: null, same: true };
    const hit = pairedText(pair, hex, opacity, role, catalog);
    return { role, pair, fix: hit?.variable ?? null, same: !!hit?.exact };
  }
  if (inRoleFamily(semantic, role)) return { role, fix: null, same: true };
  const hit = familyMember(role, hex, opacity, catalog);
  return { role, fix: hit?.variable ?? null, same: !!hit?.exact };
}

function whyInvalid(v: CatalogVariable, role: RawValueUse["role"], pair: SurfacePair | undefined): string {
  return pair && inRoleFamily(v, role) ? `which does not pair with ${pair.label}` : `which is not a ${role} color`;
}

function fixSentence(role: RawValueUse["role"], fix: CatalogVariable, same: boolean, pair: SurfacePair | undefined): string {
  if (pair) {
    const where = pair.closestTo ? `${pair.label} (closest to ${pair.closestTo})` : pair.label;
    return `${role === "text" ? "Text" : "Icons"} on ${where} ${role === "text" ? "uses" : "use"} ${shortName(fix.name)}`;
  }
  return `${same ? "Same value as" : `Closest ${role} is`} ${shortName(fix.name)} (${lightText(fix)})`;
}

function fixGoal(c: FamilyCheck): string {
  return c.pair ? `to pair with ${c.pair.label}` : `to fit the ${c.role} colors`;
}

function lookText(same: boolean): string {
  return same ? "look unchanged" : "changes the look";
}

function resolveBound(item: Item, bound: CatalogVariable, catalog: Catalog): Resolution {
  const check = familyCheck(item, bound, catalog);
  const exact = { match: "exact" as const, candidates: [], note: null, reason: null };
  if (check?.fix) {
    return {
      ...exact,
      alias: check.fix.id,
      target: check.fix,
      pairFix: `Bound directly to ${shortName(bound.name)}, ${whyInvalid(bound, check.role, check.pair)}. ${fixSentence(check.role, check.fix, check.same, check.pair)}; ${lookText(check.same)}.`,
      fixLook: !check.same,
    };
  }
  return { ...exact, alias: bound.id, target: bound };
}

interface Recheck {
  rows: TokenProposal[];
  moved: Map<string, { items: Item[]; to: string }>; // components variable id -> uses moved off it
}

function recheckComponentTokens(
  via: Item[],
  names: Map<Item, string>,
  claimed: Map<string, string>, // token name -> the element it is named for
  catalog: Catalog,
  prefix: string,
  owner: Owner,
  warnings: string[],
): Recheck {
  const rows: TokenProposal[] = [];
  const moved: Recheck["moved"] = new Map();
  const byToken = new Map<string, Item[]>();
  for (const i of via) byToken.set(i.bound!.id, [...(byToken.get(i.bound!.id) ?? []), i]);
  const renameTargets = new Set<string>();

  for (const list of byToken.values()) {
    const token = list[0].bound!;
    const now = currentAlias(token);
    const semantic = semanticOf(token, catalog);
    const byExpected = new Map<string, Item[]>();
    for (const i of list) byExpected.set(names.get(i)!, [...(byExpected.get(names.get(i)!) ?? []), i]);

    let name = token.name;
    const agreed = byExpected.size === 1 ? [...byExpected.keys()][0] : null;
    if (agreed && agreed !== token.name && !claimed.has(token.name) && belongsTo(token, owner)) {
      const taken = catalog.variables.some((v) => v.collection === "components" && v.name === agreed);
      if (!taken && !claimed.has(agreed) && !renameTargets.has(agreed)) {
        renameTargets.add(agreed);
        rows.push(renameRow(token, agreed, list));
        name = agreed;
      } else if (taken) {
        rows.push(
          ownRow(agreed, token, list, now, catalog, {
            manual: false,
            checked: true,
            note: `${token.name} should be named ${agreed}, which already exists; ${layerList(list)} moves to it.`,
          }),
        );
        continue;
      }
    }
    const own = name.startsWith(prefix);

    const stay: Item[] = [];
    for (const [expected, sub] of byExpected) {
      const sample = sub[0];
      const check = familyCheck(sample, semantic, catalog);
      const fix = check?.fix ?? null;
      const fixAlias = fix ? { desktop: fix.id, mobile: fix.id } : now;
      const changes = !!fix && !check!.same;
      if (expected !== name && own && claimed.has(name)) {
        rows.push(
          ownRow(expected, token, sub, fixAlias, catalog, {
            manual: changes,
            checked: true,
            note: fix
              ? `${layerList(sub)} uses ${token.name}, the name for the ${claimed.get(name)}; moves to its own token aliasing ${shortName(fix.name)} ${fixGoal(check!)}; ${lookText(!changes)}.`
              : `${layerList(sub)} uses ${token.name}, the name for the ${claimed.get(name)}; moves to its own token with the same alias, look unchanged.`,
          }),
        );
        moved.set(token.id, { items: [...(moved.get(token.id)?.items ?? []), ...sub], to: expected });
        continue;
      }
      if (expected !== name && own && byExpected.size > 1 && isTextOrIcon(sample)) {
        rows.push(
          ownRow(expected, token, sub, fixAlias, catalog, {
            manual: changes,
            checked: true,
            note: fix
              ? `${layerList(sub)} sits on ${check!.pair!.label}, unlike the other layers on ${token.name}; moves to its own token aliasing ${shortName(fix.name)}; ${lookText(!changes)}.`
              : `${layerList(sub)} sits on another surface than the other layers on ${token.name}; moves to its own token with the same alias, look unchanged.`,
          }),
        );
        continue;
      }
      if (expected !== name && own && sample.category !== "color" && propertySplit(name, expected, [...byExpected.keys()])) {
        const fields = [...new Set(sub.map((i) => i.use.field))].join(", ");
        rows.push(
          ownRow(expected, token, sub, now, catalog, {
            manual: false,
            checked: true,
            note: `${layerList(sub)} ${fields} now ${lastSegment(expected)}; the other uses stay on ${token.name}. Own token with the same alias, look unchanged.`,
          }),
        );
        continue;
      }
      if (expected !== name && own) {
        warnings.push(
          `"${token.name}": Token name does not follow the pattern (${describeItem(sample)} should be ${expected}); not renamed automatically.`,
        );
      }
      if (!own && fix) {
        rows.push(
          ownRow(expected, token, sub, fixAlias, catalog, {
            manual: changes,
            checked: true,
            note: `${layerList(sub)} uses ${token.name} from another component, ${whyInvalid(semantic!, check!.role, check!.pair)}. New own token aliasing ${shortName(fix.name)} ${fixGoal(check!)}; ${lookText(!changes)}.`,
          }),
        );
        continue;
      }
      if (own) stay.push(...sub);
    }

    const checks = stay.flatMap((i) => {
      const c = familyCheck(i, semantic, catalog);
      return c ? [{ i, c }] : [];
    });
    const byPair = new Map<string, typeof checks>();
    for (const x of checks) {
      const k = x.c.pair?.key ?? x.c.role;
      byPair.set(k, [...(byPair.get(k) ?? []), x]);
    }
    const pairGroups = [...byPair.values()];
    const keep = pairGroups.find((g) => !g[0].c.fix) ?? pairGroups[0];
    const leaving = new Set<Item>();
    for (const g of pairGroups) {
      const { i, c } = g[0];
      if (g === keep || !c.pair) continue;
      const name = surfaceVariantName(names.get(i)!, c.pair);
      const alias = c.fix ? { desktop: c.fix.id, mobile: c.fix.id } : now;
      const changes = !!c.fix && !c.same;
      g.forEach((x) => leaving.add(x.i));
      rows.push(
        ownRow(name, token, g.map((x) => x.i), alias, catalog, {
          manual: changes,
          checked: true,
          note: `${layerList(g.map((x) => x.i))} sits on ${c.pair.label}, unlike the other layers on ${token.name}; moves to its own token${c.fix ? ` aliasing ${shortName(c.fix.name)}; ${lookText(!changes)}.` : " with the same alias, look unchanged."}`,
        }),
      );
    }
    const fixes = (keep ?? []).filter((x) => x.c.fix);
    if (!fixes.length) continue;
    const { i: sample, c } = fixes[0];
    const fix = c.fix!;
    const where = c.pair
      ? `${sample.use.role === "text" ? "Text now sits" : "Icons now sit"} on ${c.pair.label}; restores the surface pairing and`
      : `${shortName(semantic!.name)} is not a ${c.role} color; ${fixSentence(c.role, fix, c.same, undefined)};`;
    rows.push({
      key: `${name}|alias`,
      name,
      status: "existing",
      type: token.type === "FLOAT" ? "FLOAT" : "COLOR",
      alias: { desktop: fix.id, mobile: fix.id },
      candidates: [],
      match: c.same ? "exact" : "manual",
      source: "match",
      replaces: displayColor(sample.use.hex!, sample.use.opacity ?? 1),
      uses: sortUses(stay.filter((i) => !leaving.has(i)).map((i) => i.use)),
      note: `${where} ${c.same ? "keeps the look" : "changes every use of this token"}.`,
      skip: false,
      kind: "alias-change",
      previousAlias: now,
    });
  }
  return { rows, moved };
}

function lastSegment(name: string): string {
  return name.slice(name.lastIndexOf("/") + 1);
}

// paddingY split off a token still right as padding elsewhere: the property changed, not the token's place.
function propertySplit(name: string, expected: string, all: string[]): boolean {
  const kept = lastSegment(name);
  return lastSegment(expected) !== kept && all.some((k) => k !== expected && lastSegment(k) === kept);
}

function renameRow(token: CatalogVariable, name: string, items: Item[]): TokenProposal {
  return {
    key: `${token.name}|rename`,
    name,
    previousName: token.name,
    status: "existing",
    type: token.type === "FLOAT" ? "FLOAT" : "COLOR",
    alias: currentAlias(token),
    candidates: [],
    match: "exact",
    source: "match",
    replaces: token.name,
    uses: sortUses(items.map((i) => i.use)),
    note: TOKEN_RENAME_NOTE,
    skip: false,
    kind: "rename",
  };
}

function ownRow(
  name: string,
  from: CatalogVariable,
  items: Item[],
  alias: Record<Mode, string | null>,
  catalog: Catalog,
  opts: { manual: boolean; note: string; checked?: boolean },
): TokenProposal {
  const existing = catalog.variables.find((v) => v.collection === "components" && v.name === name);
  if (existing?.aliasOf && !sameAlias(currentAlias(existing), alias)) {
    const was = catalog.variables.find((v) => v.id === currentAlias(existing).desktop);
    return {
      key: `${name}|${from.name}`,
      name,
      status: "existing",
      type: from.type === "FLOAT" ? "FLOAT" : "COLOR",
      alias,
      candidates: [],
      match: "manual",
      source: "match",
      replaces: from.name,
      uses: sortUses(items.map((i) => i.use)),
      note: `${opts.note} ${name} already exists and aliases ${was ? shortName(was.name) : "another token"}; changes every use of this token.`,
      skip: true,
      kind: "alias-change",
      previousAlias: currentAlias(existing),
    };
  }
  return {
    key: `${name}|${from.name}`,
    name,
    status: existing ? "existing" : "new",
    type: from.type === "FLOAT" ? "FLOAT" : "COLOR",
    alias,
    candidates: [],
    match: opts.manual ? "manual" : "exact",
    source: "match",
    replaces: from.name,
    uses: sortUses(items.map((i) => i.use)),
    note: opts.note,
    skip: opts.checked ? false : opts.manual,
    kind: "rebind",
  };
}

function toAliasChange(
  row: TokenProposal,
  existing: CatalogVariable,
  sample: Item,
  via: Item[],
  moved: Recheck["moved"],
  catalog: Catalog,
): void {
  const nameOf = (id: string | null) => catalog.variables.find((v) => v.id === id) ?? null;
  const before = nameOf(currentAlias(existing).desktop);
  const after = nameOf(row.alias.desktop);
  const users = via.filter((i) => i.bound!.id === existing.id);
  const what = isRootFill(sample) ? "Root frame fill" : describeItem(sample);
  const parts = [
    `${what} ${sample.bound ? `is bound directly to ${shortName(sample.bound.name)}` : `is ${row.replaces}`}. ${row.name} already exists and aliases ${before ? shortName(before.name) : "another token"}`,
  ];
  parts[0] += users.length ? `; currently used by ${layerList(users)}; it would turn ${after ? surfaceLabel(after) : "the new alias"}.` : ".";
  const m = moved.get(existing.id);
  if (m) parts.push(`${layerList(m.items)} moves to ${m.to} in its own row; keep that row ticked, or ${layerList(m.items)} turns ${after ? surfaceLabel(after) : "the new alias"} too.`);
  const othersAffected = users.filter((u) => !m?.items.includes(u));
  const alreadyShown = row.uses.every((u) => u.boundVariableId === row.alias.desktop && u.boundVariableId === row.alias.mobile);
  // Nobody else uses the token and the layer already shows the new alias: no visible change, so no tick needed.
  const invisible = othersAffected.length === 0 && alreadyShown;
  parts.push(invisible ? "No visible change." : "Changes every use of this token.");
  Object.assign(row, {
    status: "existing",
    match: invisible ? "exact" : "manual",
    skip: !invisible,
    kind: "alias-change",
    previousAlias: currentAlias(existing),
    note: parts.join(" "),
  });
}

function warnUnusedTokens(catalog: Catalog, prefix: string, via: Item[], warnings: string[]): void {
  const used = new Set(via.map((i) => i.bound!.id));
  const component = prefix.slice(0, -1).split("/").pop();
  for (const v of catalog.variables) {
    if (v.collection !== "components" || !v.name.startsWith(prefix) || used.has(v.id)) continue;
    if (v.name === `${prefix}color/${component}`) {
      warnings.push(
        `"${v.name}": Token name does not follow the pattern (component frame fill should be ${prefix}color/background); not renamed automatically.`,
      );
    } else if (!isValidComponentTokenName(v.name)) {
      warnings.push(`"${v.name}": Token name does not follow the pattern; not renamed automatically.`);
    }
  }
}

function isMobile(i: Item): boolean {
  return (i.variant.props[LAYOUT] ?? "").toLowerCase() === "mobile";
}

function collectItems(scan: ComponentScan, renameMap: Map<string, string>, catalog: Catalog, overrides: SurfaceOverrides): Item[] {
  const items: Item[] = [];
  const layerNameOf = (u: RawValueUse): string => renameMap.get(pathKey(u.indexPath)) ?? u.layerName;
  const partOf = (u: RawValueUse): string | undefined =>
    u.indexPath.length === 0 ? undefined : toSegment(layerNameOf(u)) || undefined;

  const paddingForms = new Map<string, number>();
  const cornerForms = new Map<string, Set<CornerForm>>();
  const visible: Array<{ use: RawValueUse; variant: VariantScan; node: LayerNode | null; bound?: CatalogVariable }> = [];
  const byId = new Map(catalog.variables.map((v) => [v.id, v]));

  for (const variant of scan.variants) {
    for (const use of [...variant.uses, ...(variant.boundUses ?? [])]) {
      const { node, hidden } = locate(variant.root, use.indexPath);
      if (hidden) continue;
      const bound = use.boundVariableId ? byId.get(use.boundVariableId) : undefined;
      if (use.boundVariableId && !bound) continue;
      if (use.kind === "number" && (use.number === null || use.number === 0)) continue;
      if (use.kind === "color" && !use.hex) continue;
      visible.push({ use, variant, node, bound });
      const pk = partOf(use) ?? "";
      if (PADDING_FIELDS.has(use.field)) {
        const lay = node?.layout;
        const form = lay ? paddingForm(lay.paddingLeft, lay.paddingRight, lay.paddingTop, lay.paddingBottom) : 4;
        paddingForms.set(pk, Math.max(paddingForms.get(pk) ?? 1, form));
      }
      if (CORNER_FIELDS.has(use.field)) {
        const set = cornerForms.get(pk) ?? new Set<CornerForm>();
        set.add(node ? cornerForm(node.corners) : "corners");
        cornerForms.set(pk, set);
      }
    }
  }

  for (const { use, variant, bound } of visible) {
    const layerName = layerNameOf(use);
    const part = partOf(use);
    const pk = part ?? "";
    const boundKey = bound ? { valueKey: `var:${bound.id}`, display: bound.name, bound } : null;
    if (use.kind === "color") {
      const opacity = use.opacity ?? 1;
      const surface = use.role === "text" || use.role === "icon" ? locateSurface(variant, use.indexPath, catalog, overrides) : undefined;
      const owner = surface?.ownerPath.length ? surface.ownerPath : null;
      const ownerName = owner ? (renameMap.get(pathKey(owner)) ?? locate(variant.root, owner).node?.name ?? "") : "";
      items.push({
        use,
        variant,
        layerName,
        category: "color",
        part: use.role === "background" ? part : owner ? toSegment(ownerName) || undefined : undefined,
        surface,
        element: use.role === "other" ? toSegment(layerName) || "fill" : use.role,
        valueKey: `${normalizeHex(use.hex!)}@${opacity}`,
        display: displayColor(use.hex!, opacity),
        ...boundKey,
      });
      continue;
    }
    const n = use.number!;
    const base = { use, variant, layerName, part, valueKey: String(n), display: displayNumber(n), ...boundKey };
    if (PADDING_FIELDS.has(use.field)) {
      items.push({ ...base, category: "spacing", group: "padding", property: paddingProperty(use.field, paddingForms.get(pk) ?? 4) });
    } else if (use.field === "itemSpacing" || use.field === "counterAxisSpacing") {
      items.push({ ...base, category: "spacing", group: "gap", property: "gap" });
    } else if (CORNER_FIELDS.has(use.field)) {
      const form = mergeCornerForms(cornerForms.get(pk) ?? new Set<CornerForm>(["corners"]));
      items.push({ ...base, category: "shape", group: "corner-radius", property: cornerProperty(use.field, form) });
    } else if (use.field === "strokeWeight") {
      items.push({ ...base, category: "shape", group: "stroke", property: "stroke" });
    } else if (SIZE_FIELDS.has(use.field)) {
      items.push({ ...base, category: "shape", group: "size", property: use.field });
    }
  }
  return items;
}

function splitColorConflicts(items: Item[]): void {
  const perSlot = new Map<string, Map<string, Set<string>>>();
  for (const i of items) {
    if (i.category !== "color") continue;
    const s = slotKey(i);
    const byVariant = perSlot.get(s) ?? new Map<string, Set<string>>();
    const set = byVariant.get(i.variant.id) ?? new Set<string>();
    set.add(i.valueKey);
    byVariant.set(i.variant.id, set);
    perSlot.set(s, byVariant);
  }
  const conflicted = new Set<string>();
  for (const [s, byVariant] of perSlot) if ([...byVariant.values()].some((v) => v.size > 1)) conflicted.add(s);
  for (const i of items) {
    if (i.category !== "color" || !conflicted.has(slotKey(i)) || isRootFill(i)) continue;
    const named = toSegment(i.layerName);
    if (named && named !== i.element) {
      i.slotNote = `Several ${i.element} colors in one variant; element named after layer "${i.layerName}".`;
      i.element = named;
    }
  }
}

function isRootFill(i: Item): boolean {
  return i.use.indexPath.length === 0 && i.use.field === "fills";
}

function orderedAxes(scan: ComponentScan): string[] {
  const keys = new Set(Object.keys(scan.variantProperties));
  const extra = new Set<string>();
  for (const v of scan.variants) for (const k of Object.keys(v.props)) if (!keys.has(k)) extra.add(k);
  return [...Object.keys(scan.variantProperties), ...[...extra].sort()].filter((k) => k !== LAYOUT);
}

function axisVaries(items: Item[], axis: string): boolean {
  const groups = new Map<string, Map<string, Set<string>>>();
  for (const i of items) {
    const props = i.variant.props;
    const other = Object.keys(props)
      .filter((k) => k !== axis)
      .sort()
      .map((k) => `${k}=${props[k]}`)
      .join("&");
    const g = groups.get(other) ?? new Map<string, Set<string>>();
    const val = props[axis] ?? "";
    const set = g.get(val) ?? new Set<string>();
    set.add(i.valueKey);
    g.set(val, set);
    groups.set(other, g);
  }
  for (const g of groups.values()) {
    if (g.size < 2) continue;
    const sigs = new Set([...g.values()].map((s) => [...s].sort().join(",")));
    if (sigs.size > 1) return true;
  }
  return false;
}

function nameItems(items: Item[], axes: string[], componentName: string): Map<Item, string> {
  const bySlot = new Map<string, Item[]>();
  for (const i of items) bySlot.set(slotKey(i), [...(bySlot.get(slotKey(i)) ?? []), i]);

  const names = new Map<Item, string>();
  for (const slotItems of bySlot.values()) {
    const varying = axes.filter((a) => axisVaries(slotItems, a));
    const styleAxes = varying.filter((a) => a !== SIZE && a !== STATE);
    const sizeVaries = varying.includes(SIZE);
    const stateVaries = varying.includes(STATE);
    const category = slotItems[0].category;

    const misplaced: string[] = [];
    if (category === "color" && sizeVaries) misplaced.push(SIZE);
    if (category !== "color") misplaced.push(...styleAxes);
    if (category === "spacing" && stateVaries) misplaced.push(STATE);
    const slotNote = misplaced.length
      ? `Value changes by ${misplaced.join(", ")}, which has no own slot in the pattern; added to the ${
          category === "color" ? "variant" : "size-variant"
        } segment. Review the name.`
      : undefined;

    for (const i of slotItems) {
      const props = i.variant.props;
      const seg = (a: string): string => axisSegment(a, props[a] ?? "");
      const modifier = [...styleAxes.map(seg), ...(sizeVaries ? [seg(SIZE)] : [])];
      if (category === "spacing" && stateVaries) modifier.push(normalizeState(props[STATE] ?? ""));
      const joined = modifier.filter(Boolean).join("-") || undefined;
      const state = stateVaries && category !== "spacing" ? props[STATE] || undefined : undefined;
      if (slotNote) i.slotNote = i.slotNote ? `${i.slotNote} ${slotNote}` : slotNote;
      names.set(
        i,
        buildTokenName({
          component: componentName,
          part: i.part,
          category,
          variant: category === "color" ? joined : undefined,
          sizeVariant: category !== "color" ? joined : undefined,
          element: i.element,
          property: i.property,
          state,
        }),
      );
    }
  }
  return names;
}

interface TieContext {
  state: string | null;
}

function tieContext(items: Item[]): TieContext {
  const states = new Set(items.map((i) => normalizeState(i.variant.props[STATE] ?? "")));
  return { state: states.size === 1 ? [...states][0] || null : null };
}

function tieScore(v: CatalogVariable, ctx: TieContext): number {
  return ctx.state && v.name.split("/").pop() === ctx.state ? 1 : 0;
}

function rankExact(exact: Candidate[], item: Item, ctx: TieContext): Candidate[] {
  return exact
    .map((c, idx) => ({ c, idx, score: tieScore(c.variable, ctx) }))
    .sort((a, b) => {
      const fa = item.category === "color" ? preferredFit(a.c.variable, item.use.role) : 0;
      const fb = item.category === "color" ? preferredFit(b.c.variable, item.use.role) : 0;
      return fa - fb || b.score - a.score || enabledRank(a.c.variable) - enabledRank(b.c.variable) || a.idx - b.idx;
    })
    .map((r) => r.c);
}

function enabledRank(v: CatalogVariable): number {
  return v.name.split("/").pop() === "enabled" ? 0 : 1;
}

function isPill(item: Item): boolean {
  const r = item.use.number!;
  if (r >= PILL_RADIUS) return true;
  const node = locate(item.variant.root, item.use.indexPath).node;
  const side = node ? Math.min(node.width, node.height) : 0;
  return side > 0 && r >= side / 2;
}

function resolve(item: Item, mode: Mode, catalog: Catalog, ctx: TieContext): Resolution {
  if (item.bound) return resolveBound(item, item.bound, catalog);
  if (item.group === "corner-radius" && isPill(item)) {
    const cands = matchNumber(item.use.number!, "corner-radius", catalog, mode);
    const full = cands.find((c) => c.variable.name.split("/").pop() === "full");
    if (full) {
      return {
        alias: full.variable.id,
        match: "exact",
        candidates: cands.filter((c) => c !== full).slice(0, MAX_NEAREST_CANDIDATES).map((c) => c.variable.id),
        note: `pill radius -> ${full.variable.name}`,
        reason: null,
        target: full.variable,
      };
    }
  }
  if (item.category === "color" && item.use.role !== "other") return resolveRoleColor(item, catalog, ctx);
  let cands: Candidate[];
  let family: string;
  if (item.category === "color") {
    cands = matchColor(item.use.hex!, item.use.opacity ?? 1, item.use.role, catalog);
    family = colorFamily(item.use.role).map((p) => `${p}*`).join(" / ");
  } else {
    cands = matchNumber(item.use.number!, item.group!, catalog, mode);
    family = item.group === "size" ? "size/* or metrics/*" : `${item.group}/*`;
  }
  if (cands.length === 0) {
    return {
      alias: null,
      match: "none",
      candidates: [],
      note: null,
      reason: `No ${family} variables in the catalog for ${item.display}.`,
      target: null,
    };
  }
  const exact = cands.filter((c) => c.exact);
  const nearest = cands.filter((c) => !c.exact).slice(0, MAX_NEAREST_CANDIDATES);
  if (exact.length > 0) {
    const ranked = rankExact(exact, item, ctx);
    return {
      alias: ranked[0].variable.id,
      match: "exact",
      candidates: [...ranked.slice(1), ...nearest].map((c) => c.variable.id),
      note: null,
      reason: null,
      target: ranked[0].variable,
    };
  }
  const best = cands[0];
  const reasonable =
    item.category === "color"
      ? best.distance <= COLOR_TOLERANCE
      : best.distance <= Math.max(NUMBER_TOLERANCE_ABS, Math.abs(item.use.number!) * NUMBER_TOLERANCE_REL);
  const target = valueText(best.variable, item, mode);
  if (!reasonable) {
    return {
      alias: null,
      match: "none",
      candidates: nearest.map((c) => c.variable.id),
      note: null,
      reason:
        item.category === "color"
          ? `No ${family} step close to ${item.display}; nearest is ${best.variable.name} (${target}).`
          : `No ${family} step close to ${item.display}.`,
      target: null,
      suggestion:
        item.category === "color"
          ? null
          : { variableId: best.variable.id, variableName: best.variable.name, reason: `Nearest is ${best.variable.name} (${target}).` },
    };
  }
  return {
    alias: best.variable.id,
    match: "nearest",
    candidates: nearest.slice(1).map((c) => c.variable.id),
    note: `No exact match for ${item.display}; nearest is ${best.variable.name} (${target}, off by ${formatDistance(best.distance)}). Confirm or pick another.`,
    reason: null,
    target: best.variable,
  };
}

type Suggestion = UnmatchedValue["suggestion"];

const PAGE = "color/background/primary";

const PAGE_TEXT = "color/on-background/primary";
const INTENTS = ["dimmed", "brand", "dark brand", "success", "warning", "error"];
const PAGE_INTENTS = ["brand", "dark brand", "success", "warning", "error", "disabled"];
const INTENT_STATES = ["enabled", "hover", "pressed"];

interface SurfacePair {
  key: string; // surface variable name, "page" for the page and background/primary
  label: string; // "surface 1", "surface brand hover", "background/primary", "the page"
  defaultName: string; // same-state content color
  defaults: string[]; // defaultName, plus "<name>/enabled" for surfaces without a state
  intents: string[]; // allowed only when the value matches exactly
  closestTo: string | null; // ancestor fill when it matched no surface exactly
}

function allowedIn(name: string, pair: SurfacePair): boolean {
  return pair.defaults.includes(name) || pair.intents.includes(name);
}

function pairIds(pair: SurfacePair, catalog: Catalog): string[] {
  const names = [...pair.defaults, ...pair.intents];
  return names.flatMap((n) => catalog.variables.filter((v) => v.collection === "color" && v.type === "COLOR" && v.name === n).map((v) => v.id));
}

function pairedText(pair: SurfacePair, hex: string, opacity: number, role: RawValueUse["role"], catalog: Catalog): { variable: CatalogVariable; exact: boolean } | null {
  const exact = matchColor(hex, opacity, role, catalog).filter((c) => c.exact && c.variable.collection === "color" && allowedIn(c.variable.name, pair));
  const hit = preferEnabled(exact, pair.defaultName)[0];
  if (hit) return { variable: hit.variable, exact: true };
  const def = defaultVariable(pair, catalog);
  return def ? { variable: def, exact: false } : null;
}

function defaultVariable(pair: SurfacePair, catalog: Catalog): CatalogVariable | undefined {
  for (const name of pair.defaults) {
    const v = catalog.variables.find((x) => x.collection === "color" && x.type === "COLOR" && x.name === name);
    if (v) return v;
  }
  return undefined;
}

function familyMember(role: RawValueUse["role"], hex: string, opacity: number, catalog: Catalog): { variable: CatalogVariable; exact: boolean } | null {
  const best = preferEnabled(matchColor(hex, opacity, role, catalog).filter((c) => inRoleFamily(c.variable, role)))[0];
  return best ? { variable: best.variable, exact: best.exact } : null;
}

function shortName(name: string): string {
  return name.startsWith("color/") ? name.slice("color/".length) : name;
}

function lightText(v: CatalogVariable): string {
  const val = resolveValue(v, "light", v.collection === "_global" ? ["global"] : []);
  return val?.hex ? displayColor(val.hex, val.opacity ?? 1) : "?";
}

function suggestionOf(v: CatalogVariable, reason: string): NonNullable<Suggestion> {
  return { variableId: v.id, variableName: v.name, reason };
}

function pairFor(surface: CatalogVariable | null, closestTo: string | null): SurfacePair {
  if (!surface || surface.name === PAGE) {
    return {
      key: "page",
      label: surface ? "background/primary" : "the page",
      defaultName: PAGE_TEXT,
      defaults: [PAGE_TEXT],
      intents: PAGE_INTENTS.map((i) => `color/on-background/${i}`),
      closestTo: surface ? closestTo : null,
    };
  }
  const rest = surfaceRest(surface.name)!;
  const base = `color/on-surface/${rest}`;
  const state = surface.name.length > `color/surface/${rest}`.length ? surface.name.slice(`color/surface/${rest}/`.length) : null;
  const intents = rest.startsWith("feedback/") || (state && !INTENT_STATES.includes(state)) ? [] : INTENTS.map((i) => `${base}/${i}`);
  return {
    key: surface.name,
    label: `surface ${rest}${state && state !== "enabled" ? ` ${state}` : ""}`,
    defaultName: state ? `${base}/${state}` : base,
    defaults: state ? [`${base}/${state}`] : [base, `${base}/enabled`],
    intents,
    closestTo,
  };
}

function surfacePair(item: Item): SurfacePair {
  return item.surface?.pair ?? pairFor(null, null);
}

// Surface = nearest ancestor with a visible solid fill (topmost paint), mapped to the closest surface token.
function locateSurface(variant: VariantScan, path: number[], catalog: Catalog, overrides: SurfaceOverrides): { pair: SurfacePair; ownerPath: number[] } {
  const byId = (id: string | undefined) => (id ? catalog.variables.find((v) => v.id === id) : undefined);
  for (let depth = path.length - 1; depth >= 0; depth--) {
    const ownerPath = path.slice(0, depth);
    const node = locate(variant.root, ownerPath).node;
    const fill = node ? [...node.fills].reverse().find((f) => f.opacity > 0) : undefined;
    if (!fill) continue;
    const override = byId(overrides.layers.get(fillKey(variant.id, ownerPath)) ?? (fill.boundVariableId ? overrides.tokens.get(fill.boundVariableId) : undefined));
    if (override) return { pair: pairFor(override, null), ownerPath };
    const boundVar = byId(fill.boundVariableId ?? undefined);
    const bound = boundVar ? semanticOf(boundVar, catalog) : null;
    if (bound && (bound.name === PAGE || surfaceRest(bound.name))) return { pair: pairFor(bound, null), ownerPath };
    const best = preferEnabled(matchColor(fill.hex, fill.opacity, "background", catalog).filter((c) => c.variable.collection === "color"))[0];
    if (!best) return { pair: pairFor(null, null), ownerPath };
    return { pair: pairFor(best.variable, best.exact ? null : displayColor(fill.hex, fill.opacity)), ownerPath };
  }
  return { pair: pairFor(null, null), ownerPath: [] };
}

function isTextOrIcon(i: Item): boolean {
  return i.use.kind === "color" && (i.use.role === "text" || i.use.role === "icon");
}

function surfaceVariantName(name: string, pair: SurfacePair): string {
  const seg = (pair.key === "page" ? "on-background" : shortName(pair.defaultName).replace(/\/enabled$/, "")).split(/[/ ]/).join("-");
  return name.replace("/color/", `/color/${seg}/`);
}

function noExactReason(item: Item, catalog: Catalog): string {
  const anyExact = matchColor(item.use.hex!, item.use.opacity ?? 1, "other", catalog).some((c) => c.exact);
  return anyExact ? `No ${item.use.role} color token is ${item.display}.` : `No color token is ${item.display}.`;
}

function resolveRoleColor(item: Item, catalog: Catalog, ctx: TieContext): Resolution {
  const role = item.use.role;
  const hex = item.use.hex!;
  const opacity = item.use.opacity ?? 1;
  const all = matchColor(hex, opacity, role, catalog);
  const none = (reason: string, suggestion: Suggestion, candidates: Candidate[]): Resolution => ({
    alias: null,
    match: "none",
    candidates: candidates.slice(0, MAX_NEAREST_CANDIDATES).map((c) => c.variable.id),
    note: null,
    reason,
    target: null,
    suggestion,
  });
  const pair = role === "text" || role === "icon" ? surfacePair(item) : undefined;
  const valid = all.filter((c) => (pair ? c.variable.collection === "color" && allowedIn(c.variable.name, pair) : inRoleFamily(c.variable, role)));
  const exact = valid.filter((c) => c.exact);
  if (exact.length > 0) {
    const ranked = pair ? preferEnabled(exact, pair.defaultName) : rankExact(exact, item, ctx);
    return {
      alias: ranked[0].variable.id,
      match: "exact",
      candidates: [...ranked.slice(1), ...valid.filter((c) => !c.exact).slice(0, MAX_NEAREST_CANDIDATES)].map((c) => c.variable.id),
      note: null,
      reason: null,
      target: ranked[0].variable,
    };
  }
  const fix = pair ? pairedText(pair, hex, opacity, role, catalog) : familyMember(role, hex, opacity, catalog);
  const misused = matchColor(hex, opacity, "other", catalog).find((c) => c.exact && c.variable.collection === "color");
  // A guessed surface (no exact match) is not certain enough to change the text unasked.
  if (misused && fix && !pair?.closestTo) {
    return {
      alias: fix.variable.id,
      match: "exact",
      candidates: [],
      note: null,
      reason: null,
      target: fix.variable,
      pairFix: `Same value as ${shortName(misused.variable.name)}, ${whyInvalid(misused.variable, role, pair)}. ${fixSentence(role, fix.variable, false, pair)}; changes the look.`,
      fixLook: true,
    };
  }
  const reason = noExactReason(item, catalog);
  const familyCands = valid.filter((c) => c.variable.collection === "color");
  if (pair) {
    if (!fix) return none(`${reason} No ${shortName(pair.defaultName)} variable for text on ${pair.label}.`, null, []);
    return none(reason, suggestionOf(fix.variable, `${fixSentence(role, fix.variable, false, pair)} (${lightText(fix.variable)}).`), familyCands);
  }
  if (role === "border") {
    const medium = catalog.variables.find((v) => v.collection === "color" && v.type === "COLOR" && v.name === "color/border/medium");
    return none(reason, medium ? suggestionOf(medium, `Borders default to ${shortName(medium.name)} (${lightText(medium)}).`) : null, familyCands);
  }
  return none(
    reason,
    fix ? suggestionOf(fix.variable, `Closest background is ${shortName(fix.variable.name)} (${lightText(fix.variable)}).`) : null,
    familyCands,
  );
}

function preferredFit(v: CatalogVariable, role: RawValueUse["role"]): number {
  const preferred =
    role === "background"
      ? "color/surface/"
      : role === "text" || role === "icon"
        ? "color/on-surface/"
        : role === "border"
          ? "color/border/"
          : null;
  if (role === "border" && v.collection === "_global") return 0;
  if (!preferred) return 0;
  return v.name.startsWith(preferred) ? 0 : 1;
}

function formatDistance(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(2);
}

function valueText(v: CatalogVariable, item: Item, mode: Mode): string {
  if (item.category === "color") {
    const val = resolveValue(v, "light", v.collection === "_global" ? ["global"] : []);
    return val?.hex ? displayColor(val.hex, val.opacity ?? 1) : "?";
  }
  const val = resolveValue(v, mode, ["desktop", "global"]);
  return typeof val?.number === "number" ? displayNumber(val.number) : "?";
}

function checkExisting(
  existing: CatalogVariable,
  name: string,
  type: TokenProposal["type"],
  res: Record<Mode, Resolution>,
  samples: Record<Mode, Item>,
  warnings: string[],
): void {
  if (existing.type !== type) {
    warnings.push(`Existing token "${name}" is ${existing.type}, but this row needs ${type}; it is reused, not changed.`);
    return;
  }
  for (const mode of MODES) {
    const current = resolveValue(existing, mode, ["desktop"]);
    if (!current) continue;
    const target = res[mode].target;
    const sample = samples[mode];
    let wantText: string;
    let same: boolean;
    if (type === "COLOR") {
      const want = target
        ? resolveValue(target, "light", target.collection === "_global" ? ["global"] : [])
        : { hex: sample.use.hex!, opacity: sample.use.opacity ?? 1 };
      if (!want?.hex || !current.hex) continue;
      same =
        normalizeHex(want.hex) === normalizeHex(current.hex) && (want.opacity ?? 1) === (current.opacity ?? 1);
      wantText = displayColor(want.hex, want.opacity ?? 1);
    } else {
      const want = target ? resolveValue(target, mode, ["desktop", "global"])?.number : sample.use.number!;
      if (typeof want !== "number" || typeof current.number !== "number") continue;
      same = want === current.number;
      wantText = displayNumber(want);
    }
    if (!same) {
      const have = type === "COLOR" ? displayColor(current.hex!, current.opacity ?? 1) : displayNumber(current.number!);
      warnings.push(
        `Existing token "${name}" resolves to ${have} in ${mode}, but this component needs ${wantText}; it is reused as is, not overwritten.`,
      );
    }
  }
}
