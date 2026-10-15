import type { LayerKind, LayerNode, SolidPaint } from "../../src/types";

type Layout = LayerNode["layout"];
export interface Opts {
  visible?: boolean;
  width?: number;
  height?: number;
  layout?: Partial<Layout>;
  fills?: SolidPaint[];
  strokes?: SolidPaint[];
  strokeWeight?: number;
  hasImageFill?: boolean;
  isMask?: boolean;
  mainComponentName?: string;
  corners?: number;
}

export const paint = (hex = "#FFFFFF", opacity = 1): SolidPaint => ({ hex, opacity, boundVariableId: null });

export function node(kind: LayerKind, name: string, children: LayerNode[] = [], o: Opts = {}): LayerNode {
  const r = o.corners ?? 0;
  return {
    id: "",
    name,
    kind,
    indexPath: [],
    visible: o.visible ?? true,
    width: o.width ?? 100,
    height: o.height ?? 40,
    layout: {
      mode: "NONE",
      wrap: false,
      spaceBetween: false,
      widthSizing: "FIXED",
      heightSizing: "FIXED",
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      itemSpacing: 0,
      counterAxisSpacing: 0,
      ...o.layout,
    },
    fills: o.fills ?? [],
    strokes: o.strokes ?? [],
    strokeWeight: o.strokeWeight ?? (o.strokes?.length ? 1 : 0),
    corners: { tl: r, tr: r, bl: r, br: r },
    hasImageFill: o.hasImageFill ?? false,
    isMask: o.isMask ?? false,
    text: null,
    mainComponentName: o.mainComponentName ?? null,
    bound: {},
    children,
  };
}

export const frame = (name: string, children: LayerNode[] = [], o: Opts = {}) => node("FRAME", name, children, o);

export const vstack = (name: string, children: LayerNode[] = [], o: Opts = {}) =>
  frame(name, children, { ...o, layout: { mode: "VERTICAL", widthSizing: "FILL", heightSizing: "HUG", ...o.layout } });

export const hstack = (name: string, children: LayerNode[] = [], o: Opts = {}) =>
  frame(name, children, { ...o, layout: { mode: "HORIZONTAL", widthSizing: "HUG", heightSizing: "HUG", ...o.layout } });

export function text(name: string, characters: string, fontSize = 16, o: Opts = {}): LayerNode {
  const n = node("TEXT", name, [], { ...o, layout: { widthSizing: "HUG", heightSizing: "HUG", ...o.layout } });
  n.text = { characters, fontSize };
  return n;
}

export const vector = (name = "Vector", size = 24, o: Opts = {}) => node("VECTOR", name, [], { width: size, height: size, ...o });

export const instance = (name: string, main: string, o: Opts = {}) => node("INSTANCE", name, [], { ...o, mainComponentName: main });

// Fills in ids and indexPaths so fixtures stay readable.
export function tree(root: LayerNode): LayerNode {
  const walk = (n: LayerNode, path: number[]): void => {
    n.indexPath = path;
    n.id = path.length ? `1:${path.join("-")}` : "1:0";
    n.children.forEach((c, i) => walk(c, [...path, i]));
  };
  walk(root, []);
  return root;
}

export function applyRenames(root: LayerNode, renames: { indexPath: number[]; newName: string }[]): LayerNode {
  const copy: LayerNode = JSON.parse(JSON.stringify(root));
  for (const r of renames) {
    let n = copy;
    for (const i of r.indexPath) n = n.children[i];
    n.name = r.newName;
  }
  return copy;
}
