export interface TokenNameParts {
  component: string;
  part?: string;
  category: "color" | "spacing" | "shape";
  variant?: string;
  sizeVariant?: string;
  element?: string;
  property?: string;
  state?: string;
}

export const TOKEN_STATES = [
  "enabled",
  "hover",
  "pressed",
  "focus",
  "disabled",
  "loading",
  "selected",
  "visited",
  "error",
  "active",
  "inactive",
] as const;

const CATEGORIES = ["color", "spacing", "shape"];

const SPACING_PROPERTIES = [
  "padding",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingBottom",
  "paddingLeft",
  "paddingRight",
  "gap",
];

const SHAPE_PROPERTIES = [
  "cornerRadius",
  "stroke",
  "shadowY",
  "elevation",
  "height",
  "width",
  "minWidth",
  "maxWidth",
  "minHeight",
  "maxHeight",
  "diameter",
  "size",
  "sizeX",
  "sizeY",
];

const SIDES = ["Top", "Bottom", "Left", "Right", "TopLeft", "TopRight", "BottomLeft", "BottomRight"];

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PREFIX_SEGMENT = /^_?[a-z0-9]+(-[a-z0-9]+)*$/;

export function toSegment(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function componentSegments(component: string): string[] {
  return component
    .split("/")
    .map((s) => {
      const lead = s.trim().startsWith("_") ? "_" : "";
      return lead + toSegment(s);
    })
    .filter((s) => s.length > 0 && s !== "_");
}

export function normalizeState(state: string): string {
  const s = toSegment(state);
  if (s === "focused") return "focus";
  if (s === "default") return "enabled";
  return s;
}

export function buildTokenName(p: TokenNameParts): string {
  const segs = componentSegments(p.component);
  if (segs.length === 0) throw new Error("Token name needs a component");
  if (p.part) segs.push(toSegment(p.part));
  segs.push(p.category);
  if (p.category === "color") {
    if (!p.element) throw new Error("Color token needs an element");
    if (p.variant) segs.push(toSegment(p.variant));
    segs.push(toSegment(p.element));
    if (p.state) segs.push(normalizeState(p.state));
  } else {
    if (!p.property) throw new Error(`${p.category} token needs a property`);
    if (p.sizeVariant) segs.push(toSegment(p.sizeVariant));
    segs.push(p.property);
    if (p.category === "shape" && p.state) segs.push(normalizeState(p.state));
  }
  return segs.filter((s) => s.length > 0).join("/");
}

function isState(s: string): boolean {
  return (TOKEN_STATES as readonly string[]).includes(s);
}

function isSpacingProperty(s: string): boolean {
  return SPACING_PROPERTIES.includes(s) || /^[a-z][a-zA-Z0-9]*Gap$/.test(s);
}

function isShapeProperty(s: string): boolean {
  if (SHAPE_PROPERTIES.includes(s)) return true;
  return ["cornerRadius", "stroke"].some((base) => SIDES.some((side) => s === base + side));
}

function validTail(category: string, tail: string[]): boolean {
  if (category === "color") {
    if (tail.length < 1 || tail.length > 3) return false;
    if (!tail.every((s) => KEBAB.test(s))) return false;
    return tail.length < 3 || isState(tail[2]);
  }
  if (category === "spacing") {
    if (tail.length === 1) return isSpacingProperty(tail[0]);
    if (tail.length === 2) return KEBAB.test(tail[0]) && isSpacingProperty(tail[1]);
    return false;
  }
  if (tail.length === 1) return isShapeProperty(tail[0]);
  if (tail.length === 2) {
    if (isShapeProperty(tail[0]) && isState(tail[1])) return true;
    return KEBAB.test(tail[0]) && isShapeProperty(tail[1]);
  }
  if (tail.length === 3) return KEBAB.test(tail[0]) && isShapeProperty(tail[1]) && isState(tail[2]);
  return false;
}

export function isValidComponentTokenName(name: string): boolean {
  if (typeof name !== "string" || name.length === 0 || /\s/.test(name)) return false;
  const segs = name.split("/");
  if (segs.some((s) => s.length === 0)) return false;
  for (let i = 1; i <= 3 && i < segs.length; i++) {
    if (!CATEGORIES.includes(segs[i])) continue;
    const prefix = segs.slice(0, i);
    if (!prefix.every((s) => PREFIX_SEGMENT.test(s))) return false;
    return validTail(segs[i], segs.slice(i + 1));
  }
  return false;
}

export function paddingProperties(
  l: number,
  r: number,
  t: number,
  b: number,
): Array<{ property: string; value: number; sides: Array<"left" | "right" | "top" | "bottom"> }> {
  if (l === r && r === t && t === b) {
    return [{ property: "padding", value: l, sides: ["left", "right", "top", "bottom"] }];
  }
  if (l === r && t === b) {
    return [
      { property: "paddingX", value: l, sides: ["left", "right"] },
      { property: "paddingY", value: t, sides: ["top", "bottom"] },
    ];
  }
  return [
    { property: "paddingLeft", value: l, sides: ["left"] },
    { property: "paddingRight", value: r, sides: ["right"] },
    { property: "paddingTop", value: t, sides: ["top"] },
    { property: "paddingBottom", value: b, sides: ["bottom"] },
  ];
}
