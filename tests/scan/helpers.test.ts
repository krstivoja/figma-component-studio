import { describe, expect, it } from "vitest";
import { aggregateVariantProperties, collectUses, detectColorRole, parseVariantName, toHex } from "../../src/scan";
import { diffSnapshots, type Snapshot } from "../../src/snapshot";
import type { LayerNode } from "../../src/types";

describe("toHex", () => {
  it("formats uppercase with padding", () => {
    expect(toHex({ r: 0, g: 0.349, b: 1 })).toBe("#0059FF");
    expect(toHex({ r: 0, g: 0, b: 0 })).toBe("#000000");
  });
  it("rounds to nearest channel value", () => {
    expect(toHex({ r: 0.5, g: 0.501, b: 0.998 })).toBe("#8080FE");
  });
  it("clamps out-of-range channels", () => {
    expect(toHex({ r: 1.2, g: -0.1, b: 1 })).toBe("#FF00FF");
  });
});

describe("detectColorRole", () => {
  const ctx = { isIconLike: false, isInsideControl: false };
  it("text layers are text", () => {
    expect(detectColorRole("TEXT", { isIconLike: true, isInsideControl: true })).toBe("text");
  });
  it("icon-like layers are icons", () => {
    expect(detectColorRole("FRAME", { ...ctx, isIconLike: true })).toBe("icon");
  });
  it("vectors are icons inside controls, other elsewhere", () => {
    expect(detectColorRole("VECTOR", { ...ctx, isInsideControl: true })).toBe("icon");
    expect(detectColorRole("VECTOR", ctx)).toBe("other");
  });
  it("boxes are backgrounds", () => {
    expect(detectColorRole("FRAME", ctx)).toBe("background");
    expect(detectColorRole("RECTANGLE", ctx)).toBe("background");
    expect(detectColorRole("COMPONENT", ctx)).toBe("background");
  });
  it("groups and others are other", () => {
    expect(detectColorRole("GROUP", ctx)).toBe("other");
    expect(detectColorRole("OTHER", ctx)).toBe("other");
  });
});

describe("variant props", () => {
  it("parses a variant name", () => {
    expect(parseVariantName("style=primary, state=hover")).toEqual({ style: "primary", state: "hover" });
  });
  it("aggregates unique values per property", () => {
    expect(
      aggregateVariantProperties([
        { size: "s", state: "enabled" },
        { size: "m", state: "enabled" },
      ]),
    ).toEqual({ size: ["s", "m"], state: ["enabled"] });
  });
});

function layer(over: Partial<LayerNode> = {}): LayerNode {
  return {
    id: "1:1",
    name: "root",
    kind: "COMPONENT",
    indexPath: [],
    visible: true,
    width: 120,
    height: 40,
    layout: {
      mode: "HORIZONTAL",
      wrap: false,
      spaceBetween: false,
      widthSizing: "FIXED",
      heightSizing: "FIXED",
      paddingLeft: 16,
      paddingRight: 16,
      paddingTop: 0,
      paddingBottom: 0,
      itemSpacing: 8,
      counterAxisSpacing: 4,
    },
    fills: [{ hex: "#0059FF", opacity: 1, boundVariableId: null }],
    strokes: [],
    strokeWeight: 1,
    corners: { tl: 4, tr: 4, bl: 0, br: 0 },
    hasImageFill: false,
    isMask: false,
    text: null,
    mainComponentName: null,
    bound: { paddingRight: "VariableID:1" },
    children: [],
    ...over,
  };
}

describe("collectUses", () => {
  it("collects unbound positive values, skipping root size, zeros, bound, and no-stroke weight", () => {
    const label = layer({
      id: "1:2",
      name: "label",
      kind: "TEXT",
      indexPath: [0],
      layout: { ...layer().layout, mode: "NONE", widthSizing: "HUG" },
      corners: { tl: 0, tr: 0, bl: 0, br: 0 },
      fills: [{ hex: "#FFFFFF", opacity: 1, boundVariableId: null }],
      bound: {},
    });
    const hidden = layer({ id: "1:3", name: "hidden", visible: false, indexPath: [1] });
    const uses = collectUses("1:1", layer({ children: [label, hidden] }));
    const keys = uses.map((u) => `${u.layerName}.${u.field}${u.role !== "other" ? ":" + u.role : ""}`);
    expect(keys).toEqual([
      "root.paddingLeft",
      "root.itemSpacing",
      "root.topLeftRadius",
      "root.topRightRadius",
      "root.fills:background",
      "label.height",
      "label.fills:text",
    ]);
  });
  it("skips gap when space-between and uses real paint indexes", () => {
    const root = layer({ layout: { ...layer().layout, spaceBetween: true } });
    const uses = collectUses("1:1", root, new Map([["1:1", { fills: [2], strokes: [] }]]));
    expect(uses.find((u) => u.field === "itemSpacing")).toBeUndefined();
    expect(uses.find((u) => u.field === "fills")?.paintIndex).toBe(2);
  });
});

describe("diffSnapshots", () => {
  const before: Snapshot = {
    "1:1 button": { width: 120, fills: ["#0059FF"] },
    "1:2 button > label": { fontSize: 14, fills: ["#FFFFFF"] },
  };
  it("returns [] when identical", () => {
    expect(diffSnapshots(before, structuredClone(before))).toEqual([]);
  });
  it("reports changed fields", () => {
    const after = { ...before, "1:1 button": { width: 121, fills: ["#0059FF@0.5"] } };
    expect(diffSnapshots(before, after)).toEqual([
      "button › width: 120 -> 121",
      "button › fills: [#0059FF] -> [#0059FF@0.5]",
    ]);
  });
  it("reports added and removed layers", () => {
    const after: Snapshot = { "1:1 button": before["1:1 button"], "1:3 button > icon": { width: 16 } };
    expect(diffSnapshots(before, after)).toEqual(["button > label: layer removed", "button > icon: layer added"]);
  });
  it("ignores renames", () => {
    const after: Snapshot = {
      "1:1 cta": before["1:1 button"],
      "1:2 cta > text": before["1:2 button > label"],
    };
    expect(diffSnapshots(before, after)).toEqual([]);
  });
});
