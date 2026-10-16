import type {
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerKind,
  LayerNode,
  RawValueUse,
  VariantScan,
} from "../../src/types";

function colorVar(name: string, light: string, dark: string, opacity = 1): CatalogVariable {
  return {
    id: `c:${name}`,
    name,
    collection: "color",
    type: "COLOR",
    values: { light: { hex: light, opacity }, dark: { hex: dark, opacity } },
  };
}

function dimVar(name: string, desktop: number, mobile = desktop): CatalogVariable {
  return {
    id: `d:${name}`,
    name,
    collection: "dimensions",
    type: "FLOAT",
    values: { desktop: { number: desktop }, mobile: { number: mobile } },
  };
}

function globalVar(name: string, value: { number?: number; hex?: string; opacity?: number }, type: "COLOR" | "FLOAT"): CatalogVariable {
  return { id: `g:${name}`, name, collection: "_global", type, values: { global: value } };
}

export function componentVar(name: string, type: "COLOR" | "FLOAT", desktop: CatalogVariable["values"][string], mobile = desktop): CatalogVariable {
  return { id: `k:${name}`, name, collection: "components", type, values: { desktop, mobile } };
}

export function makeCatalog(extra: CatalogVariable[] = []): Catalog {
  return {
    variables: [
      colorVar("color/background/primary", "#F5F5F5", "#111111"),
      colorVar("color/on-background/primary", "#1A1A1A", "#FFFFFF"),
      colorVar("color/surface/1/enabled", "#FFFFFF", "#1A1A1A"),
      colorVar("color/surface/1/hover", "#F2F2F2", "#222222"),
      colorVar("color/surface/2/enabled", "#F5F5F5", "#2A2A2A"),
      colorVar("color/surface/brand/enabled", "#0059FF", "#4D8BFF"),
      colorVar("color/surface/brand/hover", "#0047CC", "#6699FF"),
      colorVar("color/on-surface/1/enabled", "#1A1A1A", "#FFFFFF"),
      colorVar("color/on-surface/1/hover", "#1A1A1A", "#FFFFFF"),
      colorVar("color/on-surface/brand/enabled", "#FFFFFF", "#000000"),
      colorVar("color/on-surface/brand/hover", "#FFFFFF", "#000000"),
      colorVar("color/border/brand", "#0059FF", "#4D8BFF"),
      colorVar("color/border/medium", "#CCCCCC", "#444444"),
      dimVar("padding/2xs", 4),
      dimVar("padding/xs", 8),
      dimVar("padding/s", 12),
      dimVar("padding/m", 16),
      dimVar("padding/l", 20),
      dimVar("padding/xl", 24),
      dimVar("gap/2xs", 4),
      dimVar("gap/xs", 8),
      dimVar("gap/s", 12),
      dimVar("gap/m", 16),
      dimVar("corner-radius/xs", 8),
      dimVar("corner-radius/s", 12),
      dimVar("corner-radius/full", 9999),
      dimVar("stroke/s", 1),
      dimVar("stroke/m", 2),
      dimVar("size/m", 40),
      dimVar("size/l", 48),
      globalVar("color/transparent", { hex: "#000000", opacity: 0 }, "COLOR"),
      globalVar("color/brand blue/60", { hex: "#0059FF", opacity: 1 }, "COLOR"),
      globalVar("metrics/400", { number: 32 }, "FLOAT"),
      globalVar("metrics/700", { number: 56 }, "FLOAT"),
      ...extra,
    ],
    componentsCollectionId: "col:components",
    componentsModes: { desktop: "m:desktop", mobile: "m:mobile" },
  };
}

export function layer(name: string, kind: LayerKind, indexPath: number[], children: LayerNode[] = [], visible = true): LayerNode {
  return {
    id: `n:${name}:${indexPath.join(".")}`,
    name,
    kind,
    indexPath,
    visible,
    width: 100,
    height: 40,
    layout: {
      mode: "HORIZONTAL",
      wrap: false,
      spaceBetween: false,
      widthSizing: "HUG",
      heightSizing: "FIXED",
      paddingLeft: 0,
      paddingRight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      itemSpacing: 0,
      counterAxisSpacing: 0,
    },
    fills: [],
    strokes: [],
    strokeWeight: 0,
    corners: { tl: 0, tr: 0, bl: 0, br: 0 },
    hasImageFill: false,
    isMask: false,
    text: kind === "TEXT" ? { characters: name, fontSize: 14 } : null,
    mainComponentName: null,
    bound: {},
    children,
  };
}

export function numUse(variantId: string, indexPath: number[], layerName: string, field: RawValueUse["field"], n: number): RawValueUse {
  return { variantId, indexPath, layerName, field, paintIndex: null, kind: "number", number: n, hex: null, opacity: null, role: "other" };
}

export function colorUse(
  variantId: string,
  indexPath: number[],
  layerName: string,
  field: "fills" | "strokes",
  hex: string,
  role: RawValueUse["role"],
  opacity = 1,
): RawValueUse {
  return { variantId, indexPath, layerName, field, paintIndex: 0, kind: "color", number: null, hex, opacity, role };
}

interface ButtonSpec {
  style: "primary" | "secondary";
  state: "enabled" | "hover";
  size: "large" | "medium";
  layout: "desktop" | "mobile";
}

const BG: Record<string, string> = {
  "primary/enabled": "#0059FF",
  "primary/hover": "#0047CC",
  "secondary/enabled": "#FFFFFF",
  "secondary/hover": "#F2F2F2",
};

export function buttonVariant(spec: ButtonSpec): VariantScan {
  const id = `v:${spec.style}-${spec.state}-${spec.size}-${spec.layout}`;
  const px = spec.layout === "mobile" ? 16 : spec.size === "large" ? 24 : 16;
  const py = spec.size === "large" ? 12 : 8;
  const fg = spec.style === "primary" ? "#FFFFFF" : "#1A1A1A";

  const root = layer("button", "COMPONENT", [], [layer("label", "TEXT", [0]), layer("icon", "VECTOR", [1])]);
  Object.assign(root.layout, { paddingLeft: px, paddingRight: px, paddingTop: py, paddingBottom: py, itemSpacing: 8 });
  root.corners = { tl: 8, tr: 8, bl: 8, br: 8 };
  root.fills = [{ hex: BG[`${spec.style}/${spec.state}`], opacity: 1, boundVariableId: null }];

  const uses: RawValueUse[] = [
    numUse(id, [], "button", "paddingLeft", px),
    numUse(id, [], "button", "paddingRight", px),
    numUse(id, [], "button", "paddingTop", py),
    numUse(id, [], "button", "paddingBottom", py),
    numUse(id, [], "button", "itemSpacing", 8),
    numUse(id, [], "button", "topLeftRadius", 8),
    numUse(id, [], "button", "topRightRadius", 8),
    numUse(id, [], "button", "bottomLeftRadius", 8),
    numUse(id, [], "button", "bottomRightRadius", 8),
    numUse(id, [], "button", "height", spec.size === "large" ? 48 : 40),
    colorUse(id, [], "button", "fills", BG[`${spec.style}/${spec.state}`], "background"),
    colorUse(id, [0], "label", "fills", fg, "text"),
    colorUse(id, [1], "icon", "fills", fg, "icon"),
  ];
  if (spec.style === "secondary") {
    root.strokeWeight = 1;
    uses.push(colorUse(id, [], "button", "strokes", "#CCCCCC", "border"));
    uses.push(numUse(id, [], "button", "strokeWeight", 1));
  }
  return { id, props: { ...spec }, root, uses };
}

export function buttonScan(name = "button"): ComponentScan {
  const variants: VariantScan[] = [];
  for (const style of ["primary", "secondary"] as const)
    for (const state of ["enabled", "hover"] as const)
      for (const size of ["large", "medium"] as const) variants.push(buttonVariant({ style, state, size, layout: "desktop" }));
  variants.push(buttonVariant({ style: "primary", state: "enabled", size: "large", layout: "mobile" }));
  return {
    id: "set:button",
    name,
    kind: "COMPONENT_SET",
    variantProperties: {
      style: ["primary", "secondary"],
      state: ["enabled", "hover"],
      size: ["large", "medium"],
      layout: ["desktop", "mobile"],
    },
    variants,
  };
}
