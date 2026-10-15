import type { LayerNode, LayerRename } from "./types";
import { vocabularyEntry } from "./vocabulary";

interface Ctx {
  parent: LayerNode;
  siblings: LayerNode[]; // visible children of parent, including the node
  index: number;
  isRootChild: boolean;
  rootName: string;
  parentName: string;
}

interface Pick {
  name: string;
  reason: string;
}

const DEFAULT_NAME =
  /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Arrow|Component|Instance|Text|Image|Section|Slice|Union|Subtract|Intersect|Exclude|Boolean|Auto layout|Container)( \d+)?$/;
const SLOT_NAME = /^[a-z][A-Za-z0-9]*Slot$/;
const ALL_CAPS_COMPONENTS = new Set(["HEADER", "MAIN", "FOOTER", "DIALOG"]);
const RAW_SHAPES = new Set(["VECTOR", "RECTANGLE", "ELLIPSE", "LINE", "OTHER", "GROUP"]);
const CONTAINERS = new Set(["FRAME", "GROUP", "COMPONENT"]);
const ICON_MAX = 32;

export function isDefaultFigmaName(name: string): boolean {
  return DEFAULT_NAME.test(name.trim());
}

export function normalizeComponentName(name: string): string | null {
  const trimmed = name.trim();
  if (ALL_CAPS_COMPONENTS.has(trimmed)) return trimmed === name ? null : trimmed;
  let next: string;
  if (/^icon[_ ]/i.test(trimmed)) {
    next = kebab(trimmed).replace(/-/g, "_");
  } else {
    next = trimmed
      .split("/")
      .map((part) => {
        const p = part.trim();
        const priv = p.startsWith("_");
        return (priv ? "_" : "") + kebab(priv ? p.slice(1) : p);
      })
      .join("/");
  }
  return next === name ? null : next;
}

function kebab(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function proposeLayerNames(root: LayerNode): LayerRename[] {
  const out: LayerRename[] = [];
  const visit = (parent: LayerNode, parentName: string): void => {
    const siblings = visible(parent);
    siblings.forEach((node, index) => {
      const ctx: Ctx = { parent, siblings, index, isRootChild: parent === root, rootName: root.name, parentName };
      const rename = evaluate(node, ctx);
      if (rename) out.push(rename);
      if (node.kind !== "INSTANCE" && !isIconGlyph(node)) visit(node, rename ? rename.newName : node.name);
    });
  };
  visit(root, root.name);
  return out;
}

function evaluate(node: LayerNode, ctx: Ctx): LayerRename | null {
  const current = node.name;
  if (SLOT_NAME.test(current)) return null;
  const byParent = parentRule(node, ctx);
  if (byParent) return byParent.name === current ? null : rename(node, byParent);
  if (fitsVocabulary(node, current) && !isUnnamed(node, ctx)) return null;

  let pick: Pick | null = null;
  if (!isUnnamed(node, ctx)) {
    const fixed = current.trim().toLowerCase().replace(/\bstart\b/g, "left").replace(/\bend\b/g, "right");
    if (fixed !== current && fitsVocabulary(node, fixed)) {
      pick = { name: fixed, reason: `name is a vocabulary name with wrong casing or side -> ${fixed}` };
    }
  }
  pick = pick ?? propose(node, ctx);
  if (!pick || pick.name === current) return null;
  return rename(node, pick);
}

function rename(node: LayerNode, pick: Pick): LayerRename {
  return { indexPath: node.indexPath, oldName: node.name, newName: pick.name, reason: pick.reason, skip: false };
}

const CHILD_NAME: Record<string, string> = {
  table: "table-row",
  "table-body": "table-row",
  "table-row": "table-cell",
  "table-header": "header-cell",
  list: "list-item",
  stack: "item",
  grid: "item",
  tabs: "tab",
  navbar: "nav-item",
  menu: "menu-item",
  stepper: "step",
  actions: "button",
};

function parentRule(node: LayerNode, ctx: Ctx): Pick | null {
  const parent = ctx.parentName.trim().toLowerCase();
  const target = CHILD_NAME[parent];
  if (!target) return null;
  const why = `child of ${parent} -> `;
  if (node.kind === "TEXT") {
    return parent === "table-row" || parent === "table-header" ? { name: "label", reason: `${why}label` } : null;
  }
  // Empty frames in a list are spacers/dividers/backgrounds, not entries.
  const entry = node.kind === "INSTANCE" || (CONTAINERS.has(node.kind) && visible(node).length > 0);
  if (!entry) return null;
  if (target === "table-row" && ctx.index === 0 && isHeaderRow(ctx.siblings)) {
    return { name: "table-header", reason: `first child of ${parent} has its own fill -> table-header` };
  }
  return { name: target, reason: `${why}${target}` };
}

function isHeaderRow(rows: LayerNode[]): boolean {
  const own = (n: LayerNode) => n.fills.filter((f) => f.opacity > 0).map((f) => f.hex);
  const first = own(rows[0]);
  if (rows.length < 2 || first.length === 0) return false;
  return rows.slice(1).every((r) => !own(r).some((hex) => first.includes(hex)));
}

function fitsVocabulary(node: LayerNode, name: string): boolean {
  const entry = vocabularyEntry(name);
  if (!entry) return false;
  if (entry.layer === "any") return true;
  return (entry.layer === "text") === (node.kind === "TEXT");
}

function isUnnamed(node: LayerNode, ctx: Ctx): boolean {
  const name = node.name.trim();
  if (name === "" || isDefaultFigmaName(name) || name === ctx.rootName) return true;
  return node.text !== null && node.text.characters.trim().startsWith(name);
}

function propose(node: LayerNode, ctx: Ctx): Pick | null {
  if (node.kind === "TEXT") return proposeText(node, ctx);
  if (node.kind === "INSTANCE") return proposeInstance(node, ctx);
  return proposeShapeOrFrame(node, ctx);
}

function proposeText(node: LayerNode, ctx: Ctx): Pick {
  if (ctx.siblings.length === 1) return { name: "label", reason: "only child of its wrapper is this TEXT -> label" };
  if (isButtonLike(ctx.parent)) return { name: "label", reason: "TEXT inside a button-like frame -> label" };
  const size = node.text?.fontSize ?? 0;
  const peers = ctx.siblings.filter((s) => s !== node).map(peerFontSize).filter((n): n is number => n !== null);
  if (peers.length === 0) return { name: "label", reason: "only TEXT at this level -> label" };
  const all = [size, ...peers];
  const max = Math.max(...all);
  const min = Math.min(...all);
  if (max > min && size === max) return { name: "title", reason: `largest font (${size}) among sibling texts -> title` };
  if (max > min && size === min) {
    return { name: "supporting text", reason: `loose TEXT smaller (${size}) than the other texts (${max}) -> supporting text` };
  }
  return { name: "label", reason: "TEXT neither largest nor smallest among siblings -> label" };
}

function peerFontSize(s: LayerNode): number | null {
  if (s.kind === "TEXT") return s.text?.fontSize ?? null;
  const only = singleTextChild(s);
  return only ? only.text?.fontSize ?? null : null;
}

function proposeInstance(node: LayerNode, ctx: Ctx): Pick | null {
  const main = node.mainComponentName ?? "";
  if (/^icon/i.test(main) && !vocabularyEntry(main)) return iconPick(node, ctx, `instance of ${main}`);
  const base = kebab(main.split("/")[0].replace(/^_/, ""));
  const entry = vocabularyEntry(base);
  if (entry && entry.layer !== "text") return { name: base, reason: `instance of ${main} -> ${base}` };
  if (isIconish(node)) return iconPick(node, ctx, `small square instance (${node.width}px)`);
  return null;
}

function proposeShapeOrFrame(node: LayerNode, ctx: Ctx): Pick | null {
  const kids = visible(node);
  const thin = Math.min(node.width, node.height) <= 1 && Math.max(node.width, node.height) > 1;

  if (node.isMask) return { name: "mask", reason: "layer is used as a mask -> mask" };
  if (node.kind === "LINE" || (thin && kids.length === 0)) return { name: "divider", reason: "1px line between siblings -> divider" };
  if (node.hasImageFill) {
    const circle = node.kind === "ELLIPSE" || (node.width === node.height && node.corners.tl >= node.width / 2);
    return circle
      ? { name: "avatar", reason: "circle with image fill -> avatar" }
      : { name: "image", reason: "image fill -> image" };
  }
  if (isIconGlyph(node)) return iconPick(node, ctx, `small square ${node.kind.toLowerCase()} (${node.width}px)`);
  if (CONTAINERS.has(node.kind) && kids.length > 0 && kids.length <= 2 && kids.every(isIconish)) {
    return { name: "icon-wrapper", reason: `frame holding ${kids.length} icon(s) -> icon-wrapper` };
  }
  if (kids.length === 0) return proposeDecoration(node, ctx);
  if (!CONTAINERS.has(node.kind)) return null;

  const region = regionPick(ctx);
  if (region) return region;

  const group = sameShapedGroup(node, ctx);
  if (singleTextChild(node)) {
    if (group.length >= 3) {
      return { name: "item", reason: `only child is one TEXT, ${group.length} same-shaped siblings -> item${listHint(node, ctx, group)}` };
    }
    return { name: "text-content", reason: "only child is one TEXT, no repeated siblings -> text-content" };
  }
  if (kids.every(isButtonish)) return { name: "actions", reason: `holds only buttons (${kids.length}) -> actions` };
  if (isButtonLike(node)) return { name: "button", reason: "padded frame with fill, one TEXT and icons -> button" };
  if (kids.length >= 2 && kids.every((k) => k.kind === "TEXT") && node.layout.mode !== "HORIZONTAL") {
    return { name: "text-content", reason: `stacks ${kids.length} TEXT layers -> text-content` };
  }
  if (kids.length >= 3 && kids.every((k) => signature(k) === signature(kids[0]))) {
    return { name: "list", reason: `parent of ${kids.length} same-shaped children -> list` };
  }
  if (node.layout.wrap) return { name: "grid", reason: "auto-layout with wrap -> grid" };
  if (kids.length === 1 && CONTAINERS.has(kids[0].kind) && hasPadding(node)) {
    return { name: "inner", reason: "single child frame with padding -> inner" };
  }
  if (group.length >= 3) {
    return { name: "item", reason: `${group.length} same-shaped siblings -> item${listHint(node, ctx, group)}` };
  }
  return genericPick(node, ctx, kids);
}

function genericPick(node: LayerNode, ctx: Ctx, kids: LayerNode[]): Pick {
  const mode = node.layout.mode;
  if (node.kind === "GROUP" && kids.length >= 2) return { name: "group", reason: "non-auto-layout group of 2+ layers -> group" };
  if (mode === "HORIZONTAL" && kids.length >= 2) return { name: "row", reason: `horizontal auto-layout with ${kids.length} children -> row` };
  if (mode === "VERTICAL" && ctx.parent.layout.mode === "HORIZONTAL") {
    const columns = ctx.siblings.filter((s) => CONTAINERS.has(s.kind) && s.layout.mode === "VERTICAL");
    if (columns.length >= 2) return { name: "column", reason: "vertical frame beside other vertical frames in a row -> column" };
  }
  if (mode !== "NONE" && !hasPaint(node)) return { name: "wrapper", reason: "auto-layout frame with no fill or stroke -> wrapper" };
  return { name: "container", reason: "frame with children and a fill or no layout -> container" };
}

function proposeDecoration(node: LayerNode, ctx: Ctx): Pick | null {
  const fills = node.fills.length > 0;
  const strokes = node.strokes.length > 0 && node.strokeWeight > 0;
  const last = ctx.index === ctx.siblings.length - 1;
  const coversParent = node.width === ctx.parent.width && node.height === ctx.parent.height;
  if (node.kind === "FRAME" && !fills && !strokes) {
    const fill = node.layout.widthSizing === "FILL" || node.layout.heightSizing === "FILL";
    return fill ? { name: "spacer", reason: "empty fill-container frame with no fill -> spacer" } : null;
  }
  if (strokes && !fills) return { name: "border", reason: "stroke-only layer -> border" };
  if (!fills || strokes || ctx.siblings.length < 2) return null;
  const translucent = node.fills.every((f) => f.opacity > 0 && f.opacity < 1);
  if (translucent && last && (coversParent || ctx.parent.layout.mode === "NONE")) {
    return { name: "overlay", reason: "semi-transparent fill on top of siblings -> overlay" };
  }
  if (ctx.index === 0 && (coversParent || ctx.parent.layout.mode === "NONE")) {
    return { name: "background", reason: "fill-only layer under its siblings -> background" };
  }
  return null;
}

function regionPick(ctx: Ctx): Pick | null {
  const s = ctx.siblings;
  if (ctx.parent.layout.mode !== "VERTICAL" || s.length !== 3) return null;
  if (!s.every((n) => CONTAINERS.has(n.kind) && visible(n).length > 0)) return null;
  if (new Set(s.map(signature)).size !== 3) return null;
  const [first, middle, last] = s;
  if (middle.height < Math.max(first.height, last.height)) return null;
  if (!hasDescendant(first, (n) => n.kind === "TEXT")) return null;
  const names = ["header", "content", "footer"];
  const why = ["first", "middle and tallest", "last"];
  return {
    name: names[ctx.index],
    reason: `${why[ctx.index]} of 3 stacked regions -> ${names[ctx.index]}`,
  };
}

function iconPick(node: LayerNode, ctx: Ctx, signal: string): Pick {
  if (ctx.parentName === "icon-wrapper") {
    const icons = ctx.siblings.filter(isIconish);
    const label = ctx.siblings.findIndex((s) => s.kind === "TEXT");
    let side: "left" | "right" | null = null;
    if (label >= 0) side = ctx.index < label ? "left" : "right";
    else if (icons.length === 2) side = icons[0] === node ? "left" : "right";
    if (side) return { name: `${side} icon`, reason: `${signal}, ${side} of the label inside icon-wrapper -> ${side} icon` };
  }
  return { name: "icon", reason: `${signal} -> icon` };
}

function listHint(node: LayerNode, ctx: Ctx, group: LayerNode[]): string {
  const parentIsList = !ctx.isRootChild && group.length === ctx.siblings.length;
  if (parentIsList || group[0] !== node) return "";
  return " (hint: these could be wrapped in a list; not done, regrouping changes the tree)";
}

function sameShapedGroup(node: LayerNode, ctx: Ctx): LayerNode[] {
  const sig = signature(node);
  return ctx.siblings.filter((s) => signature(s) === sig);
}

function signature(n: LayerNode): string {
  const l = n.layout;
  const w = l.widthSizing === "FIXED" ? `${l.widthSizing}:${n.width}` : l.widthSizing;
  const h = l.heightSizing === "FIXED" ? `${l.heightSizing}:${n.height}` : l.heightSizing;
  const own = [n.kind, l.mode, l.wrap, w, h, n.text?.fontSize ?? "", n.mainComponentName ?? ""].join("|");
  if (n.kind === "INSTANCE") return own;
  return `${own}[${visible(n).map(signature).join(",")}]`;
}

function visible(n: LayerNode): LayerNode[] {
  return n.children.filter((c) => c.visible);
}

function singleTextChild(n: LayerNode): LayerNode | null {
  if (!CONTAINERS.has(n.kind)) return null;
  const kids = visible(n);
  return kids.length === 1 && kids[0].kind === "TEXT" ? kids[0] : null;
}

function isIconish(n: LayerNode): boolean {
  if (n.kind === "INSTANCE" && /^icon/i.test(n.mainComponentName ?? "")) return true;
  if (!["VECTOR", "INSTANCE", "FRAME", "GROUP", "COMPONENT"].includes(n.kind)) return false;
  const square = n.width > 0 && n.width <= ICON_MAX && n.height <= ICON_MAX && Math.abs(n.width - n.height) <= 1;
  return square && !hasDescendant(n, (d) => d.kind === "TEXT");
}

// A glyph: icon-sized and made only of raw shapes, so its insides are not separate parts.
function isIconGlyph(n: LayerNode): boolean {
  return n.kind !== "INSTANCE" && isIconish(n) && visible(n).every((c) => RAW_SHAPES.has(c.kind));
}

function isButtonish(n: LayerNode): boolean {
  if (n.kind === "INSTANCE") return /^_?button/i.test(n.mainComponentName ?? "");
  return isButtonLike(n);
}

function isButtonLike(n: LayerNode): boolean {
  if (!CONTAINERS.has(n.kind) || !hasPaint(n) || !hasPadding(n) || n.layout.mode !== "HORIZONTAL") return false;
  const kids = visible(n);
  const texts = kids.filter((k) => k.kind === "TEXT");
  return texts.length === 1 && kids.every((k) => k.kind === "TEXT" || isIconish(k));
}

function hasPaint(n: LayerNode): boolean {
  return n.fills.length > 0 || (n.strokes.length > 0 && n.strokeWeight > 0);
}

function hasPadding(n: LayerNode): boolean {
  const l = n.layout;
  return l.paddingLeft + l.paddingRight + l.paddingTop + l.paddingBottom > 0;
}

function hasDescendant(n: LayerNode, test: (d: LayerNode) => boolean): boolean {
  return visible(n).some((c) => test(c) || (c.kind !== "INSTANCE" && hasDescendant(c, test)));
}
