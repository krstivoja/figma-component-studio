import { resolveValue } from "./match";
import { toSegment } from "./tokenNames";
import type {
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerNode,
  Mode,
  TextStyleValues,
  TypographyField,
  TypographyProposal,
  TypographyUse,
} from "./types";
import { TYPOGRAPHY_FIELDS } from "./types";

const TOLERANCE = 0.01;
const SIZE_NAME = /^font\/size\/([^/]+)\/([^/]+)$/;

interface Role {
  role: string;
  vars: Partial<Record<TypographyField, CatalogVariable>>;
  weights: CatalogVariable[]; // font/weight/<Family>/<role>, picked by the layer's family
}

interface Fit {
  role: Role;
  vars: Partial<Record<TypographyField, CatalogVariable>>;
  exact: boolean;
  score: number;
  distance: number; // font size difference, breaks ties between equally close roles
  diffs: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function rolesOf(catalog: Catalog): Role[] {
  const typo = catalog.variables.filter((v) => v.collection.trim().toLowerCase() === "typography");
  const byName = new Map(typo.map((v) => [v.name, v]));
  const roles: Role[] = [];
  for (const v of typo) {
    const m = SIZE_NAME.exec(v.name);
    if (!m || v.type !== "FLOAT") continue;
    const [, role, size] = m;
    roles.push({
      role: `${role}/${size}`,
      vars: {
        fontFamily: byName.get(`font/family/${role}`),
        fontSize: v,
        lineHeight: byName.get(`line-height/${role}/${size}`),
        letterSpacing: byName.get(`letter-spacing/${role}/${size}`),
      },
      weights: typo.filter((w) => w.type === "STRING" && w.name.startsWith("font/weight/") && w.name.endsWith(`/${role}`) && w.name.split("/").length === 4),
    });
  }
  return roles.sort((a, b) => (a.role < b.role ? -1 : a.role > b.role ? 1 : 0));
}

const str = (v: CatalogVariable | undefined, mode: Mode) => (v ? resolveValue(v, mode, ["desktop"])?.string : undefined);
const num = (v: CatalogVariable | undefined, mode: Mode) => (v ? resolveValue(v, mode, ["desktop"])?.number : undefined);

function px(m: { unit: string; value?: number }, fontSize: number): number | null {
  if (m.unit === "AUTO" || m.value === undefined) return null;
  return m.unit === "PERCENT" ? (m.value * fontSize) / 100 : m.value;
}

function show(field: TypographyField, s: TextStyleValues): string {
  if (field === "fontFamily") return s.fontFamily;
  if (field === "fontStyle") return s.fontStyle;
  if (field === "fontSize") return String(s.fontSize);
  const n = px(field === "lineHeight" ? s.lineHeight : s.letterSpacing, s.fontSize);
  return n === null ? "auto" : String(Math.round(n * 100) / 100);
}

function fit(role: Role, style: TextStyleValues, mode: Mode): Fit {
  const family = str(role.vars.fontFamily, mode);
  const weight =
    role.weights.find((w) => norm(w.name.split("/")[2]) === norm(style.fontFamily)) ??
    role.weights.find((w) => family !== undefined && norm(w.name.split("/")[2]) === norm(family));
  const vars: Fit["vars"] = { ...role.vars, fontStyle: weight };
  const diffs: string[] = [];
  let score = 0;
  let exact = true;
  for (const field of TYPOGRAPHY_FIELDS) {
    if (field === "lineHeight" && style.lineHeight.unit === "AUTO") continue;
    const v = vars[field];
    let have: string | number | undefined;
    let same: boolean;
    if (field === "fontFamily" || field === "fontStyle") {
      have = str(v, mode);
      same = have === (field === "fontFamily" ? style.fontFamily : style.fontStyle);
    } else {
      have = num(v, mode);
      const want = field === "fontSize" ? style.fontSize : px(field === "lineHeight" ? style.lineHeight : style.letterSpacing, style.fontSize);
      same = typeof have === "number" && want !== null && Math.abs(have - want) < TOLERANCE;
    }
    if (same) score++;
    else {
      exact = false;
      diffs.push(v ? `${field} ${show(field, style)} -> ${have ?? "?"}` : `no ${field} variable`);
    }
  }
  const size = num(role.vars.fontSize, mode);
  return { role, vars, exact, score, diffs, distance: typeof size === "number" ? Math.abs(size - style.fontSize) : Infinity };
}

function pick(fits: Fit[], layerName: string): Fit | null {
  const named = toSegment(layerName);
  const prefers = (f: Fit) => (f.role.role.split("/")[0] === named ? 0 : 1);
  const exact = fits.filter((f) => f.exact).sort((a, b) => prefers(a) - prefers(b));
  if (exact.length) return exact[0];
  return [...fits].sort((a, b) => b.score - a.score || prefers(a) - prefers(b) || a.distance - b.distance)[0] ?? null;
}

interface Found {
  fit: Fit;
  use: TypographyUse;
  twins: string[];
}

export function proposeTypography(scan: ComponentScan, catalog: Catalog, warnings: string[]): TypographyProposal[] {
  const roles = rolesOf(catalog);
  if (!roles.length) return [];
  const found: Found[] = [];
  const mixed = new Set<string>();
  let autoLine = false;

  for (const variant of scan.variants) {
    const mode: Mode = (variant.props.layout ?? "").toLowerCase() === "mobile" ? "mobile" : "desktop";
    const walk = (layer: LayerNode) => {
      if (!layer.visible) return;
      layer.children.forEach(walk);
      if (layer.kind !== "TEXT" || !layer.text) return;
      const style = layer.text.style;
      if (style === undefined) return;
      if (style === null) {
        mixed.add(layer.name);
        return;
      }
      const fits = roles.map((r) => fit(r, style, mode));
      const best = pick(fits, layer.name);
      if (!best) return;
      const bound = layer.text.bound ?? {};
      const fields = TYPOGRAPHY_FIELDS.filter(
        (f) => !bound[f] && !!best.vars[f] && !(f === "lineHeight" && style.lineHeight.unit === "AUTO"),
      );
      if (!fields.length) return;
      if (style.lineHeight.unit === "AUTO" && !bound.lineHeight) autoLine = true;
      const twins = best.exact ? fits.filter((f) => f.exact && f !== best).map((f) => f.role.role) : [];
      found.push({ fit: best, twins, use: { variantId: variant.id, indexPath: layer.indexPath, layerName: layer.name, fields, expect: style } });
    };
    walk(variant.root);
  }

  for (const name of [...mixed].sort()) warnings.push(`"${name}": mixed text styles in one layer; typography not bound.`);

  const groups = new Map<string, Found[]>();
  for (const f of found) {
    const key = `typography|${f.fit.role.role}|${f.fit.exact ? "exact" : "manual"}`;
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }
  const rows: TypographyProposal[] = [];
  for (const [key, list] of groups) {
    const { fit: best } = list[0];
    const bindings: TypographyProposal["bindings"] = {};
    for (const field of TYPOGRAPHY_FIELDS) if (list.some((f) => f.use.fields.includes(field))) bindings[field] = best.vars[field]!.id;
    const notes: string[] = [];
    if (best.exact) {
      notes.push(`Matches ${best.role.role}.`);
      const twins = [...new Set(list.flatMap((f) => f.twins))];
      if (twins.length) notes.push(`Same values as ${twins.join(", ")}.`);
    } else {
      const diffs = [...new Set(list.flatMap((f) => f.fit.diffs))];
      notes.push(`No role matches all values; closest is ${best.role.role} (${diffs.join(", ")}); changes the look.`);
    }
    const auto = list.some((f) => f.use.expect.lineHeight.unit === "AUTO");
    if (auto && autoLine) notes.push("Line height is auto and no typography variable represents auto; left unbound.");
    rows.push({
      key,
      role: best.role.role,
      match: best.exact ? "exact" : "manual",
      bindings,
      uses: list.map((f) => f.use),
      note: notes.join(" "),
      skip: !best.exact,
    });
  }
  return rows.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}
