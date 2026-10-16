import { getLiveVariable } from "./variables";
import { textStyleOf, toHex } from "./scan";

export type Snapshot = Record<string, Record<string, unknown>>;

type Bag = Record<string, unknown>;

const KEYS = [
  "width",
  "height",
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "itemSpacing",
  "topLeftRadius",
  "topRightRadius",
  "bottomLeftRadius",
  "bottomRightRadius",
  "strokeWeight",
  "fontSize",
];
const PAD = ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];
const RAD = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
const TXT = ["fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing"];

const round = (x: number) => Math.round(x * 100) / 100;

function paints(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return (value as readonly Paint[])
    .filter((p): p is SolidPaint => p.visible !== false && p.type === "SOLID")
    .map((p) => toHex(p.color) + (p.opacity !== undefined && p.opacity < 1 ? "@" + round(p.opacity) : ""));
}

async function rootNode(rootId: string): Promise<SceneNode> {
  const node = await figma.getNodeByIdAsync(rootId);
  if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw new Error(`Node ${rootId} not found`);
  return node as SceneNode;
}

export async function takeSnapshot(rootId: string): Promise<Snapshot> {
  const root = await rootNode(rootId);
  const out: Snapshot = {};
  const walk = (n: SceneNode, path: string) => {
    const p = path ? path + " > " + n.name : n.name;
    const bag = n as unknown as Bag;
    const s: Record<string, unknown> = {};
    for (const k of KEYS) {
      const v = bag[k];
      if (typeof v === "number") s[k] = round(v);
    }
    s.fills = paints(bag.fills);
    s.strokes = paints(bag.strokes);
    if (n.type === "TEXT") {
      const style = textStyleOf(n);
      s.font = style ? `${style.fontFamily} ${style.fontStyle}` : "mixed";
      if (style) {
        const px = (m: { unit: string; value: number }) => round(m.unit === "PERCENT" ? (m.value * style.fontSize) / 100 : m.value);
        s.lineHeight = style.lineHeight.unit === "AUTO" ? "auto" : px(style.lineHeight);
        s.letterSpacing = px(style.letterSpacing);
      }
    }
    out[n.id + " " + p] = s;
    if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) walk(c, p);
  };
  walk(root, "");
  return out;
}

function byId(snap: Snapshot): Map<string, { path: string; fields: Record<string, unknown> }> {
  const map = new Map<string, { path: string; fields: Record<string, unknown> }>();
  for (const [key, fields] of Object.entries(snap)) {
    const sp = key.indexOf(" ");
    const id = sp < 0 ? key : key.slice(0, sp);
    map.set(id, { path: sp < 0 ? "" : key.slice(sp + 1), fields });
  }
  return map;
}

const show = (v: unknown) => (v === undefined ? "none" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v));

export function diffSnapshots(before: Snapshot, after: Snapshot): string[] {
  const a = byId(before);
  const b = byId(after);
  const lines: string[] = [];
  for (const [id, prev] of a) {
    const next = b.get(id);
    if (!next) {
      lines.push(`${prev.path}: layer removed`);
      continue;
    }
    const fields = new Set([...Object.keys(prev.fields), ...Object.keys(next.fields)]);
    for (const f of fields) {
      const x = prev.fields[f];
      const y = next.fields[f];
      if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${next.path} › ${f}: ${show(x)} -> ${show(y)}`);
    }
  }
  for (const [id, next] of b) if (!a.has(id)) lines.push(`${next.path}: layer added`);
  return lines;
}

export async function auditComponent(rootId: string): Promise<"PASS" | string[]> {
  const root = await rootNode(rootId);
  const cols = await figma.variables.getLocalVariableCollectionsAsync();
  const colName = new Map(cols.map((c) => [c.id, c.name]));
  const varCache = new Map<string, Promise<Variable | null>>();
  const getVar = (id: string) => {
    let p = varCache.get(id);
    if (!p) {
      p = getLiveVariable(id);
      varCache.set(id, p);
    }
    return p;
  };
  const issues: string[] = [];

  const check = async (n: SceneNode, field: string, alias: unknown, want: string) => {
    const id = alias && typeof alias === "object" ? (alias as Bag).id : undefined;
    if (typeof id !== "string") {
      issues.push(`${n.name} › ${field}: raw value`);
      return;
    }
    const v = await getVar(id);
    if (!v) {
      issues.push(`${n.name} › ${field}: bound to a deleted variable (raw value)`);
      return;
    }
    const col = colName.get(v.variableCollectionId) ?? "library";
    if (col !== want) issues.push(`${n.name} › ${field}: bound to ${col}/${v.name}, should be ${want}`);
  };

  const walk = async (n: SceneNode) => {
    if (n.type !== "COMPONENT_SET") {
      const bag = n as unknown as Bag;
      const b = (("boundVariables" in n && n.boundVariables) || {}) as Bag;
      const auto = typeof bag.layoutMode === "string" && bag.layoutMode !== "NONE";
      const pos = (k: string) => typeof bag[k] === "number" && (bag[k] as number) > 0;
      if (auto) for (const k of PAD) if (pos(k)) await check(n, k, b[k], "components");
      if (auto && pos("itemSpacing") && bag.primaryAxisAlignItems !== "SPACE_BETWEEN")
        await check(n, "itemSpacing", b.itemSpacing, "components");
      for (const k of RAD) if (pos(k)) await check(n, k, b[k], "components");
      const strokes = bag.strokes;
      const hasStroke = Array.isArray(strokes) && (strokes as readonly Paint[]).some((s) => s.visible !== false);
      if (hasStroke && pos("strokeWeight")) await check(n, "strokeWeight", b.strokeWeight, "components");
      for (const key of ["fills", "strokes"]) {
        const list = bag[key];
        if (!Array.isArray(list)) continue;
        for (const p of list as readonly Paint[]) {
          if (p.visible !== false && p.type === "SOLID") await check(n, key, p.boundVariables?.color, "components");
        }
      }
      if (n.type === "TEXT") {
        for (const k of TXT) {
          const a = b[k];
          // Auto line height is not a number; no variable can hold it.
          if (k === "lineHeight" && !(Array.isArray(a) ? a[0] : a) && (bag.lineHeight as LineHeight | undefined)?.unit === "AUTO") continue;
          await check(n, k, Array.isArray(a) ? a[0] : a, "typography");
        }
      }
    }
    if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) await walk(c);
  };

  await walk(root);
  return issues.length ? issues : "PASS";
}
