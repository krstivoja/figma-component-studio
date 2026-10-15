import type {
  BindableField,
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerKind,
  LayerNode,
  RawValueUse,
  SolidPaint as PlainPaint,
  Sizing,
  VariantScan,
} from "./types";

type Bag = Record<string, unknown>;

const KINDS: LayerKind[] = [
  "FRAME",
  "TEXT",
  "VECTOR",
  "RECTANGLE",
  "ELLIPSE",
  "LINE",
  "INSTANCE",
  "COMPONENT",
  "COMPONENT_SET",
  "GROUP",
];
const VECTOR_KINDS: LayerKind[] = ["VECTOR", "ELLIPSE", "LINE"];
const BOX_KINDS: LayerKind[] = ["FRAME", "RECTANGLE", "COMPONENT", "COMPONENT_SET", "INSTANCE"];
const ICON_MAX = 32;
const CONTROL_MAX_HEIGHT = 64;
const ALIAS_DEPTH_CAP = 16;

const NUMBER_FIELDS: BindableField[] = [
  "paddingLeft",
  "paddingRight",
  "paddingTop",
  "paddingBottom",
  "itemSpacing",
  "counterAxisSpacing",
  "topLeftRadius",
  "topRightRadius",
  "bottomLeftRadius",
  "bottomRightRadius",
  "strokeWeight",
  "width",
  "height",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
];
const STROKE_SIDES = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];

export function toHex(c: { r: number; g: number; b: number }): string {
  const ch = (x: number) =>
    Math.max(0, Math.min(255, Math.round(x * 255)))
      .toString(16)
      .padStart(2, "0");
  return ("#" + ch(c.r) + ch(c.g) + ch(c.b)).toUpperCase();
}

export function detectColorRole(
  kind: LayerKind,
  ctx: { isIconLike: boolean; isInsideControl: boolean },
): RawValueUse["role"] {
  if (kind === "TEXT") return "text";
  if (ctx.isIconLike) return "icon";
  if (VECTOR_KINDS.includes(kind)) return ctx.isInsideControl ? "icon" : "other";
  if (BOX_KINDS.includes(kind)) return "background";
  return "other";
}

export function parseVariantName(name: string): Record<string, string> {
  const props: Record<string, string> = {};
  for (const part of name.split(",")) {
    const eq = part.indexOf("=");
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    if (key) props[key] = part.slice(eq + 1).trim();
  }
  return props;
}

export function aggregateVariantProperties(list: Array<Record<string, string>>): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const props of list) {
    for (const [k, v] of Object.entries(props)) {
      const values = out[k] || (out[k] = []);
      if (!values.includes(v)) values.push(v);
    }
  }
  return out;
}

export function isIconLike(layer: LayerNode): boolean {
  if (/icon/i.test(layer.name)) return true;
  if (layer.width > ICON_MAX || layer.height > ICON_MAX) return false;
  if (VECTOR_KINDS.includes(layer.kind)) return true;
  if (layer.kind === "INSTANCE") return true;
  return (
    (layer.kind === "FRAME" || layer.kind === "GROUP") &&
    layer.children.length > 0 &&
    layer.children.every((c) => VECTOR_KINDS.includes(c.kind) || c.kind === "GROUP")
  );
}

// paintIndex in the result is the index into the Figma node's real paint array, so the binder can address it.
export function collectUses(
  variantId: string,
  root: LayerNode,
  paintIndexes: Map<string, { fills: number[]; strokes: number[] }> = new Map(),
): RawValueUse[] {
  const uses: RawValueUse[] = [];
  const insideControl = root.height <= CONTROL_MAX_HEIGHT;

  const walk = (layer: LayerNode, isRoot: boolean) => {
    if (!layer.visible) return;
    const base = { variantId, indexPath: layer.indexPath, layerName: layer.name };
    const pushNumber = (field: BindableField, value: number) => {
      if (!(value > 0) || layer.bound[field]) return;
      uses.push({ ...base, field, paintIndex: null, kind: "number", number: value, hex: null, opacity: null, role: "other" });
    };
    const l = layer.layout;
    if (l.mode !== "NONE") {
      pushNumber("paddingLeft", l.paddingLeft);
      pushNumber("paddingRight", l.paddingRight);
      pushNumber("paddingTop", l.paddingTop);
      pushNumber("paddingBottom", l.paddingBottom);
      if (!l.spaceBetween) pushNumber("itemSpacing", l.itemSpacing);
      if (l.wrap) pushNumber("counterAxisSpacing", l.counterAxisSpacing);
    }
    pushNumber("topLeftRadius", layer.corners.tl);
    pushNumber("topRightRadius", layer.corners.tr);
    pushNumber("bottomLeftRadius", layer.corners.bl);
    pushNumber("bottomRightRadius", layer.corners.br);
    if (layer.strokes.length > 0) pushNumber("strokeWeight", layer.strokeWeight);
    if (!isRoot) {
      if (l.widthSizing === "FIXED") pushNumber("width", layer.width);
      if (l.heightSizing === "FIXED") pushNumber("height", layer.height);
    }
    const idx = paintIndexes.get(layer.id);
    const fillRole = detectColorRole(layer.kind, { isIconLike: isIconLike(layer), isInsideControl: insideControl });
    const pushPaints = (field: "fills" | "strokes", paints: PlainPaint[], real: number[] | undefined) => {
      paints.forEach((p, i) => {
        if (p.boundVariableId) return;
        uses.push({
          ...base,
          field,
          paintIndex: real ? real[i] : i,
          kind: "color",
          number: null,
          hex: p.hex,
          opacity: p.opacity,
          role: field === "strokes" ? "border" : fillRole,
        });
      });
    };
    pushPaints("fills", layer.fills, idx?.fills);
    pushPaints("strokes", layer.strokes, idx?.strokes);
    for (const c of layer.children) walk(c, false);
  };

  walk(root, true);
  return uses;
}

function kindOf(type: string): LayerKind {
  return (KINDS as string[]).includes(type) ? (type as LayerKind) : "OTHER";
}

function num(node: SceneNode, key: string): number {
  const v = (node as unknown as Bag)[key];
  return typeof v === "number" ? v : 0;
}

function sizing(node: SceneNode, key: "layoutSizingHorizontal" | "layoutSizingVertical"): Sizing {
  try {
    const v = (node as unknown as Bag)[key];
    return v === "HUG" || v === "FILL" ? v : "FIXED";
  } catch {
    return "FIXED";
  }
}

function solidPaints(value: unknown): { paints: PlainPaint[]; indexes: number[]; hasImage: boolean } {
  const paints: PlainPaint[] = [];
  const indexes: number[] = [];
  let hasImage = false;
  if (!Array.isArray(value)) return { paints, indexes, hasImage };
  (value as readonly Paint[]).forEach((p, i) => {
    if (p.visible === false) return;
    if (p.type === "IMAGE") hasImage = true;
    if (p.type !== "SOLID") return;
    paints.push({
      hex: toHex(p.color),
      opacity: p.opacity ?? 1,
      boundVariableId: p.boundVariables?.color?.id ?? null,
    });
    indexes.push(i);
  });
  return { paints, indexes, hasImage };
}

function strokeWeightOf(node: SceneNode): number {
  const w = (node as unknown as Bag).strokeWeight;
  if (typeof w === "number") return w;
  return Math.max(0, ...STROKE_SIDES.map((k) => num(node, k)));
}

function boundOf(node: SceneNode): Partial<Record<BindableField, string>> {
  const raw = ("boundVariables" in node ? node.boundVariables : undefined) as Bag | undefined;
  const bound: Partial<Record<BindableField, string>> = {};
  if (!raw) return bound;
  const idOf = (a: unknown): string | undefined => {
    const alias = Array.isArray(a) ? a[0] : a;
    return alias && typeof alias === "object" && typeof (alias as Bag).id === "string" ? ((alias as Bag).id as string) : undefined;
  };
  for (const f of NUMBER_FIELDS) {
    const id = idOf(raw[f]);
    if (id) bound[f] = id;
  }
  if (!bound.strokeWeight) {
    const side = STROKE_SIDES.map((k) => idOf(raw[k])).find(Boolean);
    if (side) bound.strokeWeight = side;
  }
  for (const f of ["fills", "strokes"] as const) {
    const id = idOf(raw[f]);
    if (id) bound[f] = id;
  }
  return bound;
}

async function mainComponentName(node: InstanceNode): Promise<string | null> {
  const main = await node.getMainComponentAsync();
  if (!main) return null;
  return main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name;
}

function textOf(node: TextNode): { characters: string; fontSize: number } {
  let fontSize = 0;
  if (typeof node.fontSize === "number") fontSize = node.fontSize;
  else {
    const seg = node.getStyledTextSegments(["fontSize"])[0];
    if (seg) fontSize = seg.fontSize;
  }
  return { characters: node.characters, fontSize };
}

async function buildLayer(
  node: SceneNode,
  indexPath: number[],
  paintIndexes: Map<string, { fills: number[]; strokes: number[] }>,
): Promise<LayerNode> {
  const kind = kindOf(node.type);
  const bag = node as unknown as Bag;
  const fills = solidPaints(bag.fills);
  const strokes = solidPaints(bag.strokes);
  paintIndexes.set(node.id, { fills: fills.indexes, strokes: strokes.indexes });
  const layoutMode = bag.layoutMode;
  const counter = bag.counterAxisSpacing;

  const children: LayerNode[] = [];
  if (node.type !== "INSTANCE" && "children" in node) {
    for (let i = 0; i < node.children.length; i++) {
      children.push(await buildLayer(node.children[i], [...indexPath, i], paintIndexes));
    }
  }

  return {
    id: node.id,
    name: node.name,
    kind,
    indexPath,
    visible: node.visible,
    width: node.width,
    height: node.height,
    layout: {
      mode: layoutMode === "HORIZONTAL" || layoutMode === "VERTICAL" ? layoutMode : "NONE",
      wrap: bag.layoutWrap === "WRAP",
      spaceBetween: bag.primaryAxisAlignItems === "SPACE_BETWEEN",
      widthSizing: sizing(node, "layoutSizingHorizontal"),
      heightSizing: sizing(node, "layoutSizingVertical"),
      paddingLeft: num(node, "paddingLeft"),
      paddingRight: num(node, "paddingRight"),
      paddingTop: num(node, "paddingTop"),
      paddingBottom: num(node, "paddingBottom"),
      itemSpacing: num(node, "itemSpacing"),
      counterAxisSpacing: typeof counter === "number" ? counter : 0,
    },
    fills: fills.paints,
    strokes: strokes.paints,
    strokeWeight: strokeWeightOf(node),
    corners: {
      tl: num(node, "topLeftRadius"),
      tr: num(node, "topRightRadius"),
      bl: num(node, "bottomLeftRadius"),
      br: num(node, "bottomRightRadius"),
    },
    hasImageFill: fills.hasImage,
    isMask: bag.isMask === true,
    text: node.type === "TEXT" ? textOf(node) : null,
    mainComponentName: node.type === "INSTANCE" ? await mainComponentName(node) : null,
    bound: boundOf(node),
    children,
  };
}

function variantPropsOf(node: ComponentNode, inSet: boolean): Record<string, string> {
  if (!inSet) return {};
  try {
    if (node.variantProperties) return { ...node.variantProperties };
  } catch {
    // variantProperties throws when the set has conflicting variants; the name still holds the props
  }
  return parseVariantName(node.name);
}

export type ScanRoot = ComponentNode | ComponentSetNode | FrameNode;

export async function scanComponent(node: ScanRoot): Promise<ComponentScan> {
  const isSet = node.type === "COMPONENT_SET";
  const components: Array<ComponentNode | FrameNode> = isSet
    ? node.children.filter((c): c is ComponentNode => c.type === "COMPONENT")
    : [node];

  const variants: VariantScan[] = [];
  for (const comp of components) {
    const paintIndexes = new Map<string, { fills: number[]; strokes: number[] }>();
    const root = await buildLayer(comp, [], paintIndexes);
    variants.push({
      id: comp.id,
      props: comp.type === "COMPONENT" ? variantPropsOf(comp, isSet) : {},
      root,
      uses: collectUses(comp.id, root, paintIndexes),
    });
  }

  return {
    id: node.id,
    name: node.name,
    kind: node.type,
    variantProperties: aggregateVariantProperties(variants.map((v) => v.props)),
    variants,
  };
}

function isAlias(v: unknown): v is VariableAlias {
  return !!v && typeof v === "object" && (v as Bag).type === "VARIABLE_ALIAS";
}

function isRgb(v: unknown): v is RGB | RGBA {
  return !!v && typeof v === "object" && typeof (v as Bag).r === "number";
}

function isCatalogType(t: string): t is CatalogVariable["type"] {
  return t === "COLOR" || t === "FLOAT" || t === "STRING" || t === "BOOLEAN";
}

export async function loadCatalog(): Promise<Catalog> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const collectionCache = new Map<string, VariableCollection | null>(collections.map((c) => [c.id, c]));
  const variableCache = new Map<string, Promise<Variable | null>>();

  const getVariable = (id: string) => {
    let p = variableCache.get(id);
    if (!p) {
      p = figma.variables.getVariableByIdAsync(id).catch(() => null);
      variableCache.set(id, p);
    }
    return p;
  };
  const getCollection = async (id: string) => {
    if (!collectionCache.has(id)) {
      collectionCache.set(id, await figma.variables.getVariableCollectionByIdAsync(id).catch(() => null));
    }
    return collectionCache.get(id) ?? null;
  };

  // An alias targets another collection; pick its mode with the same name, else its default mode.
  const resolve = async (variable: Variable, modeName: string, modeId: string): Promise<VariableValue | null> => {
    const seen = new Set<string>();
    let current: Variable | null = variable;
    let currentModeId = modeId;
    for (let depth = 0; current && depth < ALIAS_DEPTH_CAP; depth++) {
      if (seen.has(current.id)) return null;
      seen.add(current.id);
      const value: VariableValue | undefined = current.valuesByMode[currentModeId];
      if (value === undefined) return null;
      if (!isAlias(value)) return value;
      const next: Variable | null = await getVariable(value.id);
      if (!next) return null;
      const col = await getCollection(next.variableCollectionId);
      if (!col) return null;
      const same = col.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
      currentModeId = same ? same.modeId : col.defaultModeId;
      current = next;
    }
    return null;
  };

  const variables: CatalogVariable[] = [];
  for (const col of collections) {
    const vars = await Promise.all(col.variableIds.map(getVariable));
    for (const v of vars) {
      if (!v || !isCatalogType(v.resolvedType)) continue;
      const values: CatalogVariable["values"] = {};
      for (const mode of col.modes) {
        const value = await resolve(v, mode.name, mode.modeId);
        if (typeof value === "number") values[mode.name] = { number: value };
        else if (isRgb(value)) values[mode.name] = { hex: toHex(value), opacity: "a" in value ? value.a : 1 };
        else values[mode.name] = {};
      }
      variables.push({ id: v.id, name: v.name, collection: col.name, type: v.resolvedType, values });
    }
  }

  const components = collections.find((c) => c.name.trim().toLowerCase() === "components") ?? null;
  const modeId = (name: string) =>
    components?.modes.find((m) => m.name.trim().toLowerCase() === name)?.modeId ?? null;

  return {
    variables,
    componentsCollectionId: components ? components.id : null,
    componentsModes: { desktop: modeId("desktop"), mobile: modeId("mobile") },
  };
}
