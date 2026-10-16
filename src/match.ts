import type { Catalog, CatalogVariable, RawValueUse } from "./types";

export type NumberGroup = "padding" | "gap" | "corner-radius" | "stroke" | "size" | "shadow-size";

export interface Candidate {
  variable: CatalogVariable;
  exact: boolean;
  distance: number;
}

type ResolvedValue = CatalogVariable["values"][string];

const GLOBAL = "_global";
const TRANSPARENT = "color/transparent";

const modeKey = (s: string): string => s.trim().toLowerCase();

export function findMode(keys: string[], mode: string | undefined): string | undefined {
  if (!mode) return undefined;
  const want = modeKey(mode);
  return keys.find((k) => modeKey(k) === want);
}

// Keys keep the catalog's mode order; the first one is the collection's default mode.
export function pickMode(keys: string[], mode: string | undefined, fallbacks: string[]): string | undefined {
  for (const m of [mode, ...fallbacks]) {
    const hit = findMode(keys, m);
    if (hit !== undefined) return hit;
  }
  return keys[0];
}

export function resolveValue(
  v: CatalogVariable,
  mode: string | undefined,
  fallbacks: string[],
): ResolvedValue | undefined {
  const key = pickMode(Object.keys(v.values), mode, fallbacks);
  return key === undefined ? undefined : v.values[key];
}

const PREFERRED_MODES: Array<{ collection: string; modes: string[]; fallbacks: string[]; noun: string }> = [
  { collection: "color", modes: ["light"], fallbacks: [], noun: "colors" },
  { collection: "dimensions", modes: ["desktop", "mobile"], fallbacks: ["desktop"], noun: "values" },
  { collection: GLOBAL, modes: ["global"], fallbacks: [], noun: "values" },
];

export function modeWarnings(catalog: Catalog): string[] {
  const warnings: string[] = [];
  for (const { collection, modes, fallbacks, noun } of PREFERRED_MODES) {
    const keys: string[] = [];
    for (const v of catalog.variables) {
      if (v.collection !== collection) continue;
      for (const k of Object.keys(v.values)) if (!keys.includes(k)) keys.push(k);
    }
    if (keys.length === 0) continue;
    const missing = modes.filter((m) => findMode(keys, m) === undefined);
    if (missing.length === 0) continue;
    const used = [...new Set(missing.map((m) => pickMode(keys, m, fallbacks)!))];
    warnings.push(
      `Collection "${collection}" has no ${missing.map((m) => `"${m}"`).join(" or ")} mode (modes: ${keys.join(", ")}); ${noun} were compared against ${used.map((u) => `"${u}"`).join(", ")}.`,
    );
  }
  return warnings;
}

function byDistanceThenName(a: Candidate, b: Candidate): number {
  if (a.exact !== b.exact) return a.exact ? -1 : 1;
  if (a.distance !== b.distance) return a.distance - b.distance;
  return a.variable.name < b.variable.name ? -1 : a.variable.name > b.variable.name ? 1 : 0;
}

function numberCandidates(
  value: number,
  vars: CatalogVariable[],
  mode: string | undefined,
  fallbacks: string[],
): Candidate[] {
  const out: Candidate[] = [];
  for (const variable of vars) {
    const n = resolveValue(variable, mode, fallbacks)?.number;
    if (typeof n !== "number") continue;
    const distance = Math.abs(n - value);
    out.push({ variable, exact: distance === 0, distance });
  }
  return out.sort(byDistanceThenName);
}

function inGroup(v: CatalogVariable, group: string): boolean {
  return v.name.startsWith(`${group}/`) || v.name.startsWith(`dimensions/${group}/`);
}

export function matchNumber(value: number, group: NumberGroup, catalog: Catalog, mode?: string): Candidate[] {
  const dims = catalog.variables.filter(
    (v) => v.collection === "dimensions" && v.type === "FLOAT" && inGroup(v, group),
  );
  const primary = numberCandidates(value, dims, mode, ["desktop"]);
  if (group !== "size" || primary.some((c) => c.exact)) return primary;
  const metrics = catalog.variables.filter(
    (v) => v.collection === GLOBAL && v.type === "FLOAT" && v.name.startsWith("metrics/"),
  );
  const fallback = numberCandidates(value, metrics, mode, ["global"]);
  // Exact metrics/* beats a non-exact size step; ties keep dimensions first.
  return [...primary, ...fallback].sort((a, b) => {
    const d = byDistanceThenName(a, b);
    if (a.exact === b.exact && a.distance === b.distance) {
      const ac = a.variable.collection === "dimensions" ? 0 : 1;
      const bc = b.variable.collection === "dimensions" ? 0 : 1;
      if (ac !== bc) return ac - bc;
    }
    return d;
  });
}

export function normalizeHex(hex: string): string {
  const h = hex.trim().replace(/^#/, "").toUpperCase();
  return `#${h}`;
}

function rgb(hex: string): [number, number, number] | null {
  const h = normalizeHex(hex).slice(1);
  if (!/^[0-9A-F]{6}$/.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function colorDistance(hexA: string, opA: number, hexB: string, opB: number): number {
  if (opA === 0 && opB === 0) return 0;
  const a = rgb(hexA);
  const b = rgb(hexB);
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
  return d + Math.abs(opA - opB) * 255;
}

const FAMILIES: Record<RawValueUse["role"], { prefixes: string[]; preferred: string | null }> = {
  background: { prefixes: ["color/surface/", "color/background/primary"], preferred: "color/surface/" },
  text: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
  icon: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
  border: { prefixes: ["color/border/"], preferred: "color/border/" },
  other: { prefixes: ["color/"], preferred: null },
};

const withTransparent = (role: RawValueUse["role"]): boolean => role === "border" || role === "other";

export function inRoleFamily(v: Pick<CatalogVariable, "name" | "collection">, role: RawValueUse["role"]): boolean {
  if (v.collection === GLOBAL) return v.name === TRANSPARENT && withTransparent(role);
  return v.collection === "color" && inFamily(v.name, FAMILIES[role].prefixes);
}

// A prefix ending in "/" is a group; anything else names one variable.
function inFamily(name: string, prefixes: string[]): boolean {
  return prefixes.some((p) => (p.endsWith("/") ? name.startsWith(p) : name === p));
}

// Equal distance: the `preferred` name, then an `enabled` step, then the existing order.
export function preferEnabled(cands: Candidate[], preferred?: string): Candidate[] {
  const rank = (c: Candidate) => (c.variable.name === preferred ? 0 : c.variable.name.split("/").pop() === "enabled" ? 1 : 2);
  return cands
    .map((c, i) => ({ c, i }))
    .sort((a, b) => Number(b.c.exact) - Number(a.c.exact) || a.c.distance - b.c.distance || rank(a.c) - rank(b.c) || a.i - b.i)
    .map((x) => x.c);
}

export function colorFamily(role: RawValueUse["role"]): string[] {
  return FAMILIES[role].prefixes;
}

export function matchColor(
  hex: string,
  opacity: number,
  role: RawValueUse["role"],
  catalog: Catalog,
  mode?: string,
): Candidate[] {
  const family = FAMILIES[role];
  const vars = catalog.variables.filter(
    (v) =>
      v.type === "COLOR" &&
      ((v.collection === "color" && inFamily(v.name, family.prefixes)) ||
        (v.collection === GLOBAL && v.name === TRANSPARENT && withTransparent(role))),
  );
  const fit = (v: CatalogVariable): number => {
    if (v.collection === GLOBAL) return role === "border" ? 0 : 1;
    if (family.preferred && v.name.startsWith(family.preferred)) return 0;
    return 1;
  };
  const out: Candidate[] = [];
  for (const variable of vars) {
    const value = resolveValue(variable, mode ?? "light", variable.collection === GLOBAL ? ["global"] : ["light"]);
    if (!value?.hex) continue;
    const distance = colorDistance(hex, opacity, value.hex, value.opacity ?? 1);
    if (!Number.isFinite(distance)) continue;
    if (variable.collection === GLOBAL && opacity !== 0 && (value.opacity ?? 1) === 0) continue;
    out.push({ variable, exact: distance === 0, distance });
  }
  return out.sort((a, b) => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    const f = fit(a.variable) - fit(b.variable);
    if (f !== 0) return f;
    return a.variable.name < b.variable.name ? -1 : a.variable.name > b.variable.name ? 1 : 0;
  });
}

// Alias target names compared across schemes: the library's "color/brand blue/40" (collection "color") and the file's
// "brand blue/40" (collection "_global") are the same primitive. Drops the own-collection and "color/" prefixes.
export function primitiveKey(name: string, collection: string): string {
  let n = name.trim().toLowerCase();
  const own = `${collection.trim().toLowerCase()}/`;
  if (n.startsWith(own)) n = n.slice(own.length);
  if (n.startsWith("color/")) n = n.slice("color/".length);
  return n.replace(/\s+/g, " ");
}
