import type {
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerNode,
  LayerRename,
  Mode,
  Proposal,
  RawValueUse,
  TokenProposal,
  VariantScan,
} from "./types";
import { buildTokenName, normalizeState, paddingProperties, toSegment, TOKEN_STATES } from "./tokenNames";
import { colorFamily, matchColor, matchNumber, normalizeHex, resolveValue, type Candidate, type NumberGroup } from "./match";

const MODES: Mode[] = ["desktop", "mobile"];
const LAYOUT = "layout";
const SIZE = "size";
const STATE = "state";
const NUMBER_TOLERANCE_ABS = 2;
const NUMBER_TOLERANCE_REL = 0.25;
const COLOR_TOLERANCE = 32;
const MAX_NEAREST_CANDIDATES = 3;

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
}

interface Resolution {
  alias: string | null;
  match: TokenProposal["match"];
  candidates: string[];
  note: string | null;
  reason: string | null;
  target: CatalogVariable | null;
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

function surfaceRest(name: string): string | null {
  const prefix = "color/surface/";
  if (!name.startsWith(prefix)) return null;
  const segs = name.slice(prefix.length).split("/");
  if (segs.length > 1 && (TOKEN_STATES as readonly string[]).includes(segs[segs.length - 1])) segs.pop();
  return segs.join("/");
}

export function buildProposal(
  scan: ComponentScan,
  catalog: Catalog,
  renames: LayerRename[],
  componentName: string,
): Proposal {
  const warnings: string[] = [];
  const renameMap = new Map<string, string>();
  for (const r of renames) if (!r.skip) renameMap.set(pathKey(r.indexPath), r.newName);

  const items = collectItems(scan, renameMap);
  splitColorConflicts(items);

  const axes = orderedAxes(scan);
  const hasLayout = LAYOUT in scan.variantProperties || scan.variants.some((v) => LAYOUT in v.props);
  const names = nameItems(items, axes, componentName);

  const byName = new Map<string, Item[]>();
  for (const i of items) {
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

  // Background aliases are resolved first so text/icon can prefer the paired on-surface token.
  const surfaceByVariant = new Map<string, string>();
  const ordered = [
    ...groups.filter((g) => g.items[0].use.role === "background" && g.items[0].category === "color"),
    ...groups.filter((g) => !(g.items[0].use.role === "background" && g.items[0].category === "color")),
  ];

  const results = new Map<{ name: string; items: Item[] }, TokenProposal>();
  const unmatched: Proposal["unmatched"] = [];

  for (const g of ordered) {
    const desktopItems = g.items.filter((i) => !isMobile(i));
    const mobileItems = g.items.filter(isMobile);
    const dSample = (desktopItems[0] ?? mobileItems[0])!;
    const mSample = (mobileItems[0] ?? dSample)!;
    const ctx = tieContext(g.items, surfaceByVariant);

    const dRes = resolve(dSample, "desktop", catalog, ctx);
    const mRes = mSample === dSample ? resolve(dSample, "mobile", catalog, ctx) : resolve(mSample, "mobile", catalog, ctx);

    if (dSample.category === "color" && dSample.use.role === "background" && dRes.alias) {
      const aliasName = dRes.target?.name ?? "";
      const rest = surfaceRest(aliasName);
      if (rest) {
        for (const i of g.items) {
          const existing = surfaceByVariant.get(i.variant.id);
          if (!existing || i.use.indexPath.length === 0) surfaceByVariant.set(i.variant.id, rest);
        }
      }
    }

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

    const existing = catalog.variables.find((v) => v.collection === "components" && v.name === g.name);
    const type: TokenProposal["type"] = dSample.category === "color" ? "COLOR" : "FLOAT";
    if (existing) checkExisting(existing, g.name, type, { desktop: dRes, mobile: mRes }, { desktop: dSample, mobile: mSample }, warnings);

    if (match === "none") {
      const reason = [dRes.reason, mSample !== dSample && mRes.reason !== dRes.reason ? mRes.reason : null]
        .filter((r): r is string => !!r)
        .join(" ");
      unmatched.push({ display: replaces, uses, reason: reason || "No matching semantic token." });
    }

    results.set(g, {
      key: `${g.name}|${replaces}`,
      name: g.name,
      status: existing ? "existing" : "new",
      type,
      alias,
      candidates,
      match,
      replaces,
      uses,
      note: notes.length ? notes.join(" ") : null,
      skip: false,
    });
  }

  const tokens = groups.map((g) => results.get(g)!).sort((a, b) => cmp(a.name, b.name) || cmp(a.key, b.key));
  unmatched.sort((a, b) => cmp(a.display, b.display) || cmp(a.reason, b.reason));

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

function isMobile(i: Item): boolean {
  return (i.variant.props[LAYOUT] ?? "").toLowerCase() === "mobile";
}

function collectItems(scan: ComponentScan, renameMap: Map<string, string>): Item[] {
  const items: Item[] = [];
  const layerNameOf = (u: RawValueUse): string => renameMap.get(pathKey(u.indexPath)) ?? u.layerName;
  const partOf = (u: RawValueUse): string | undefined =>
    u.indexPath.length === 0 ? undefined : toSegment(layerNameOf(u)) || undefined;

  const paddingForms = new Map<string, number>();
  const cornerForms = new Map<string, Set<CornerForm>>();
  const visible: Array<{ use: RawValueUse; variant: VariantScan; node: LayerNode | null }> = [];

  for (const variant of scan.variants) {
    for (const use of variant.uses) {
      const { node, hidden } = locate(variant.root, use.indexPath);
      if (hidden) continue;
      if (use.kind === "number" && (use.number === null || use.number === 0)) continue;
      if (use.kind === "color" && !use.hex) continue;
      visible.push({ use, variant, node });
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

  for (const { use, variant } of visible) {
    const layerName = layerNameOf(use);
    const part = partOf(use);
    const pk = part ?? "";
    if (use.kind === "color") {
      const opacity = use.opacity ?? 1;
      items.push({
        use,
        variant,
        layerName,
        category: "color",
        element: use.role === "other" ? toSegment(layerName) || "fill" : use.role,
        valueKey: `${normalizeHex(use.hex!)}@${opacity}`,
        display: displayColor(use.hex!, opacity),
      });
      continue;
    }
    const n = use.number!;
    const base = { use, variant, layerName, part, valueKey: String(n), display: displayNumber(n) };
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
    if (i.category !== "color" || !conflicted.has(slotKey(i))) continue;
    const named = toSegment(i.layerName);
    if (named && named !== i.element) {
      i.slotNote = `Several ${i.element} colors in one variant; element named after layer "${i.layerName}".`;
      i.element = named;
    }
  }
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
  surface: string | null;
}

function tieContext(items: Item[], surfaceByVariant: Map<string, string>): TieContext {
  const states = new Set(items.map((i) => normalizeState(i.variant.props[STATE] ?? "")));
  const surfaces = new Set<string>();
  for (const i of items) {
    if (i.use.role !== "text" && i.use.role !== "icon") continue;
    const s = surfaceByVariant.get(i.variant.id);
    if (s) surfaces.add(s);
  }
  const state = states.size === 1 ? [...states][0] || null : null;
  return { state, surface: surfaces.size === 1 ? [...surfaces][0] : null };
}

function tieScore(v: CatalogVariable, ctx: TieContext): number {
  let score = 0;
  if (ctx.surface) {
    const p = `color/on-surface/${ctx.surface}`;
    if (v.name === p || v.name.startsWith(`${p}/`)) score += 2;
  }
  if (ctx.state && v.name.split("/").pop() === ctx.state) score += 1;
  return score;
}

function resolve(item: Item, mode: Mode, catalog: Catalog, ctx: TieContext): Resolution {
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
    const ranked = exact
      .map((c, idx) => ({ c, idx, score: tieScore(c.variable, ctx) }))
      .sort((a, b) => {
        const fa = item.category === "color" ? preferredFit(a.c.variable, item.use.role) : 0;
        const fb = item.category === "color" ? preferredFit(b.c.variable, item.use.role) : 0;
        return fa - fb || b.score - a.score || a.idx - b.idx;
      })
      .map((r) => r.c);
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
      reason: `No ${family} step close to ${item.display}; nearest is ${best.variable.name} (${target}).`,
      target: null,
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
