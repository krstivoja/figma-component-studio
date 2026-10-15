import { describe, expect, it } from "vitest";
import { matchColor, matchNumber } from "../../src/match";
import type { CatalogVariable } from "../../src/types";
import { makeCatalog } from "./fixtures";

const names = (cs: Array<{ variable: CatalogVariable }>) => cs.map((c) => c.variable.name);

describe("matchNumber", () => {
  const catalog = makeCatalog();

  it("matches padding 16 to padding/m exactly", () => {
    const [first] = matchNumber(16, "padding", catalog);
    expect(first.variable.name).toBe("padding/m");
    expect(first.exact).toBe(true);
    expect(first.distance).toBe(0);
  });

  it("uses the group to pick the prefix, never another group", () => {
    const all = names(matchNumber(16, "gap", catalog));
    expect(all[0]).toBe("gap/m");
    expect(all.every((n) => n.startsWith("gap/"))).toBe(true);
  });

  it("orders nearest steps by distance when nothing is exact", () => {
    const cs = matchNumber(14, "padding", catalog);
    expect(cs.some((c) => c.exact)).toBe(false);
    expect(cs[0].distance).toBe(2);
    expect(names(cs).slice(0, 2)).toEqual(["padding/m", "padding/s"]);
  });

  it("returns nothing for a missing family", () => {
    expect(matchNumber(4, "shadow-size", catalog)).toEqual([]);
  });

  it("falls back to metrics/* for sizes with no dimensions step", () => {
    const [first] = matchNumber(56, "size", catalog);
    expect(first.variable.name).toBe("metrics/700");
    expect(first.exact).toBe(true);
  });

  it("prefers a dimensions size step over metrics", () => {
    const cs = matchNumber(40, "size", catalog);
    expect(cs[0].variable.name).toBe("size/m");
    expect(names(cs)).not.toContain("metrics/400");
  });

  it("reads the requested mode", () => {
    const cat = makeCatalog([
      { id: "d:padding/section", name: "padding/section", collection: "dimensions", type: "FLOAT", values: { desktop: { number: 40 }, mobile: { number: 16 } } },
    ]);
    expect(names(matchNumber(40, "padding", cat, "desktop").filter((c) => c.exact))).toEqual(["padding/section"]);
    expect(names(matchNumber(16, "padding", cat, "mobile").filter((c) => c.exact))).toEqual(["padding/m", "padding/section"]);
  });

  it("never offers components or non-metrics _global variables", () => {
    const cat = makeCatalog([
      { id: "k:x", name: "padding/m", collection: "components", type: "FLOAT", values: { desktop: { number: 16 } } },
    ]);
    const cs = matchNumber(16, "padding", cat);
    expect(cs.every((c) => c.variable.collection === "dimensions")).toBe(true);
  });
});

describe("matchColor", () => {
  const catalog = makeCatalog();

  it("matches a background to a surface, never to on-surface or _global raw colors", () => {
    const cs = matchColor("#0059FF", 1, "background", catalog);
    expect(cs[0].variable.name).toBe("color/surface/brand/enabled");
    expect(cs[0].exact).toBe(true);
    expect(names(cs)).not.toContain("color/border/brand");
    expect(names(cs)).not.toContain("color/brand blue/60");
  });

  it("matches text and icon to on-surface first", () => {
    const text = matchColor("#1A1A1A", 1, "text", catalog).filter((c) => c.exact);
    expect(names(text)).toEqual(["color/on-surface/1/enabled", "color/on-surface/1/hover", "color/on-background/primary"]);
    const icon = matchColor("#FFFFFF", 1, "icon", catalog).filter((c) => c.exact);
    expect(names(icon)).toEqual(["color/on-surface/brand/enabled", "color/on-surface/brand/hover"]);
  });

  it("matches borders to color/border/*", () => {
    const cs = matchColor("#0059FF", 1, "border", catalog);
    expect(cs[0].variable.name).toBe("color/border/brand");
  });

  it("maps a fully transparent border to color/transparent in _global", () => {
    const [first] = matchColor("#FFFFFF", 0, "border", catalog);
    expect(first.variable.name).toBe("color/transparent");
    expect(first.variable.collection).toBe("_global");
    expect(first.exact).toBe(true);
  });

  it("compares the light value by default and another mode on request", () => {
    expect(matchColor("#4D8BFF", 1, "background", catalog).some((c) => c.exact)).toBe(false);
    expect(matchColor("#4D8BFF", 1, "background", catalog, "dark")[0].variable.name).toBe("color/surface/brand/enabled");
  });

  it("returns nearest with a distance when nothing is exact", () => {
    const [first] = matchColor("#0058FE", 1, "background", catalog);
    expect(first.exact).toBe(false);
    expect(first.variable.name).toBe("color/surface/brand/enabled");
    expect(first.distance).toBeCloseTo(Math.SQRT2, 5);
  });

  it("treats opacity as part of the value", () => {
    const cs = matchColor("#0059FF", 0.5, "background", catalog);
    expect(cs.some((c) => c.exact)).toBe(false);
  });
});
