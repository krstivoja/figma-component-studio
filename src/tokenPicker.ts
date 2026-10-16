import type { SemanticToken } from "./types";

export interface PickerOption {
  id: string;
  label: string;
}

export interface PickerGroup {
  label: string;
  options: PickerOption[];
}

const FAMILIES = ["surface", "on-surface", "border"];
const FAMILY_ALIAS: Record<string, string> = { background: "surface", "on-background": "on-surface" };
const SURFACES = ["primary", "1", "2", "3", "subtle", "accent", "brand", "feedback"];
const FEEDBACK = ["info", "promo", "success", "warning", "error", "neutral", "loading"];
const STATES = ["enabled", "hover", "pressed", "disabled", "loading"];
const INTENTS = ["dimmed", "brand", "dark-brand", "dark brand", "darkBrand", "success", "warning", "error"];
const STEPS = [...STATES, ...INTENTS];
const TSHIRT = ["none", "4xs", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "full"];
const NUMERIC = /^-?\d+(\.\d+)?$/;

function segments(name: string): string[] {
  const parts = name.split("/");
  if (parts[0] === "color") parts.shift();
  if (parts.length) parts[0] = FAMILY_ALIAS[parts[0]] ?? parts[0];
  return parts;
}

function orderAt(parts: string[], i: number): string[] {
  if (i === 0) return FAMILIES;
  if (parts[0] !== "surface" && parts[0] !== "on-surface") return TSHIRT;
  if (i === 1) return SURFACES;
  if (i === 2 && parts[1] === "feedback") return FEEDBACK;
  return STEPS;
}

function compareSegment(a: string, b: string, order: string[]): number {
  for (const list of [order, TSHIRT]) {
    const ra = list.indexOf(a);
    const rb = list.indexOf(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    if (ra >= 0 || rb >= 0) return ra >= 0 ? -1 : 1;
  }
  if (NUMERIC.test(a) && NUMERIC.test(b)) return Number(a) - Number(b);
  return a.localeCompare(b);
}

// Ranks each segment by its meaning (surface, feedback kind, state, t-shirt size), never by catalog order.
export function compareTokenNames(a: string, b: string): number {
  const pa = segments(a);
  const pb = segments(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    return compareSegment(pa[i], pb[i], orderAt(pa, i));
  }
  return pa.length - pb.length || a.localeCompare(b);
}

export function sortByTokenName<T extends { name: string }>(list: T[]): T[] {
  return list.slice().sort((x, y) => compareTokenNames(x.name, y.name));
}

export function shortName(name: string): string {
  return name.startsWith("color/") ? name.slice("color/".length) : name;
}

export function matchesQuery(name: string, query: string): boolean {
  const hay = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function filterGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  return groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => matchesQuery(o.label, query)) }))
    .filter((g) => g.options.length > 0);
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatValue(entry: Pick<SemanticToken, "light" | "value"> | undefined): string {
  if (entry?.light) {
    const hex = entry.light.hex.toUpperCase();
    return entry.light.opacity < 1 ? `${hex} @${Math.round(entry.light.opacity * 100)}%` : hex;
  }
  return typeof entry?.value === "number" ? formatNumber(entry.value) : "";
}

export function triggerText(name: string, entry: Pick<SemanticToken, "type" | "value"> | undefined): string {
  const short = shortName(name);
  return entry?.type === "FLOAT" && typeof entry.value === "number" ? `${short} · ${formatNumber(entry.value)}` : short;
}

const HEX = /^#[0-9a-f]{6}$/i;

function rgba(hex: string, opacity: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, opacity))})`;
}

export type SwatchFill = { kind: "unknown" } | { kind: "solid"; color: string } | { kind: "checker"; color: string };

// How a color token's swatch is painted: solid, over a checkerboard when translucent, or "unknown" without a usable hex.
export function swatchFill(entry: Pick<SemanticToken, "light"> | undefined): SwatchFill {
  const light = entry?.light;
  if (!light || !HEX.test(light.hex)) return { kind: "unknown" };
  return light.opacity < 1 ? { kind: "checker", color: rgba(light.hex, light.opacity) } : { kind: "solid", color: light.hex };
}
