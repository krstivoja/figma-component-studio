import { describe, expect, it } from "vitest";
import { matchColor } from "../../src/match";
import { buildProposal } from "../../src/proposal";
import { buildReviewModel } from "../../src/review";
import type { Catalog, CatalogVariable, ComponentScan, RawValueUse } from "../../src/types";
import { colorUse, layer, makeCatalog, numUse } from "./fixtures";

function modeColor(name: string, values: Record<string, string>): CatalogVariable {
  const v: CatalogVariable["values"] = {};
  for (const [mode, hex] of Object.entries(values)) v[mode] = { hex, opacity: 1 };
  return { id: `c:${name}`, name, collection: "color", type: "COLOR", values: v };
}

function catalogOf(variables: CatalogVariable[]): Catalog {
  return { variables, componentsCollectionId: null, componentsModes: { desktop: null, mobile: null } };
}

function scanOf(uses: RawValueUse[], width = 100, height = 40): ComponentScan {
  const root = layer("card", "COMPONENT", [], [layer("label", "TEXT", [0])]);
  root.width = width;
  root.height = height;
  return {
    id: "c:card",
    name: "card",
    kind: "COMPONENT",
    variantProperties: {},
    variants: [{ id: "v:card", props: {}, root, uses }],
  };
}

const textBlack = (): RawValueUse => colorUse("v:card", [0], "label", "fills", "#000000", "text");

describe("mode names are matched case-insensitively", () => {
  const catalog = catalogOf([
    modeColor("color/on-background/primary", { Light: "#000000", Dark: "#FFFFFF" }),
    modeColor("color/on-background/inverse", { Light: "#FFFFFF", Dark: "#000000" }),
  ]);

  it("compares against the Light value, never the Dark one", () => {
    const [first] = matchColor("#000000", 1, "text", catalog);
    expect(first.variable.name).toBe("color/on-background/primary");
    expect(first.exact).toBe(true);
    const inverse = matchColor("#000000", 1, "text", catalog).find((c) => c.variable.name === "color/on-background/inverse")!;
    expect(inverse.exact).toBe(false);
  });

  it("aliases #000000 page text to the light on-background token without warnings", () => {
    const p = buildProposal(scanOf([textBlack()]), catalog, [], "card");
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0].match).toBe("exact");
    expect(p.tokens[0].alias.desktop).toBe("c:color/on-background/primary");
    expect(p.unmatched).toEqual([]);
    expect(p.warnings).toEqual([]);
  });

  it("resolves Desktop / Mobile dimension modes the same way", () => {
    const gap: CatalogVariable = {
      id: "d:gap/m",
      name: "gap/m",
      collection: "dimensions",
      type: "FLOAT",
      values: { " Mobile": { number: 8 }, Desktop: { number: 16 } },
    };
    const variants = (["desktop", "mobile"] as const).map((l) => ({
      id: `v:${l}`,
      props: { layout: l },
      root: layer("card", "COMPONENT", []),
      uses: [numUse(`v:${l}`, [], "card", "itemSpacing", l === "desktop" ? 16 : 8)],
    }));
    const scan: ComponentScan = {
      id: "c:card",
      name: "card",
      kind: "COMPONENT_SET",
      variantProperties: { layout: ["desktop", "mobile"] },
      variants,
    };
    const p = buildProposal(scan, catalogOf([gap]), [], "card");
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0].match).toBe("exact");
    expect(p.tokens[0].alias).toEqual({ desktop: "d:gap/m", mobile: "d:gap/m" });
    expect(p.warnings).toEqual([]);
  });

  it("warns once per collection with no light mode and compares against its first mode", () => {
    const dayNight = catalogOf([
      modeColor("color/on-background/primary", { Day: "#000000", Night: "#FFFFFF" }),
      modeColor("color/on-background/secondary", { Day: "#FFFFFF", Night: "#000000" }),
    ]);
    const p = buildProposal(scanOf([textBlack()]), dayNight, [], "card");
    expect(p.warnings).toEqual([
      'Collection "color" has no "light" mode (modes: Day, Night); colors were compared against "Day".',
    ]);
    expect(p.tokens[0].alias.desktop).toBe("c:color/on-background/primary");
  });
});

describe("pill radius", () => {
  const radius = (n: number): RawValueUse[] =>
    (["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"] as const).map((f) =>
      numUse("v:card", [], "card", f, n),
    );

  it("maps 999 on a 293x24 layer to corner-radius/full exactly", () => {
    const p = buildProposal(scanOf(radius(999), 293, 24), makeCatalog(), [], "card");
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0].match).toBe("exact");
    expect(p.tokens[0].alias).toEqual({ desktop: "d:corner-radius/full", mobile: "d:corner-radius/full" });
    expect(p.tokens[0].note).toContain("pill radius -> corner-radius/full");
    expect(p.unmatched).toEqual([]);
  });

  it("maps 12 on a 24px-high layer to corner-radius/full", () => {
    const p = buildProposal(scanOf(radius(12), 100, 24), makeCatalog(), [], "card");
    expect(p.tokens[0].alias.desktop).toBe("d:corner-radius/full");
    expect(p.tokens[0].match).toBe("exact");
  });

  it("keeps normal step matching for 8 on a 40px-high layer", () => {
    const p = buildProposal(scanOf(radius(8), 100, 40), makeCatalog(), [], "card");
    expect(p.tokens[0].alias.desktop).toBe("d:corner-radius/xs");
    expect(p.tokens[0].note ?? "").not.toContain("pill");
  });

  it("falls back to nearest logic when there is no full step", () => {
    const catalog = makeCatalog();
    catalog.variables = catalog.variables.filter((v) => v.name !== "corner-radius/full");
    const p = buildProposal(scanOf(radius(999), 293, 24), catalog, [], "card");
    expect(p.tokens).toEqual([]);
    expect(p.unmatched).toHaveLength(1);
    expect(p.unmatched[0].reason).toBe("No corner-radius/* step close to 999.");
    expect(p.unmatched[0].suggestion).toMatchObject({ variableName: "corner-radius/s", reason: "Nearest is corner-radius/s (12)." });
  });
});

describe("unmatched values", () => {
  it("lists each value once with the real reason and no duplicate token row", () => {
    const uses = [
      colorUse("v:card", [], "card", "fills", "#FFF07E", "background"),
      textBlack(),
      numUse("v:card", [], "card", "itemSpacing", 100),
    ];
    const p = buildProposal(scanOf(uses), makeCatalog(), [], "card");
    expect(p.tokens).toEqual([]);
    expect(p.unmatched.map((u) => u.display)).toEqual([
      "card/color/background (#FFF07E)",
      "card/color/text (#000000)",
      "card/spacing/gap (100)",
    ]);
    for (const u of p.unmatched) {
      expect(u.reason).not.toMatch(/nearest is|layout variant/);
      expect(u.suggestion).not.toBeNull();
      expect(u.uses).toHaveLength(1);
    }
    const raw = buildReviewModel(p, []).raw;
    expect(raw).toHaveLength(3);
    expect(new Set(raw.map((r) => r.display)).size).toBe(3);
  });
});
