import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import type { Catalog, CatalogVariable, ComponentScan, RawValueUse } from "../../src/types";
import { colorUse, layer, numUse } from "./fixtures";

function color(name: string, light: string): CatalogVariable {
  return { id: `c:${name}`, name, collection: "color", type: "COLOR", values: { light: { hex: light, opacity: 1 }, dark: { hex: "#777777", opacity: 1 } } };
}

function coreCatalog(extra: CatalogVariable[] = [], drop: string[] = []): Catalog {
  const variables = [
    color("color/background/primary", "#F7F7F7"),
    color("color/on-background/primary", "#0A0A0A"),
    color("color/surface/1/enabled", "#FFFFFF"),
    color("color/surface/2/enabled", "#EEF2FA"),
    color("color/surface/feedback/warning", "#FFF89D"),
    color("color/surface/feedback/success", "#D9F5E6"),
    color("color/on-surface/1/enabled", "#001B4D"),
    color("color/on-surface/1/disabled", "#8A94A6"),
    color("color/on-surface/2/enabled", "#002266"),
    color("color/on-surface/feedback/success", "#012E1C"),
    color("color/on-surface/feedback/warning/enabled", "#3D3200"),
    color("color/on-surface/feedback/warning/subtle", "#6B5A00"),
    color("color/border/medium", "#B0B8C4"),
    color("color/border/strong", "#5A6475"),
    ...extra,
  ].filter((v) => !drop.includes(v.name));
  return { variables, componentsCollectionId: null, componentsModes: { desktop: null, mobile: null } };
}

function card(rootFill: string, textHex = "#000000", texts = 4): ComponentScan {
  const children = Array.from({ length: texts }, (_, i) => layer(`text ${i + 1}`, "TEXT", [i]));
  const root = layer("card-marko", "COMPONENT", [], children);
  root.fills = [{ hex: rootFill, opacity: 1, boundVariableId: null }];
  const uses: RawValueUse[] = [colorUse("v:card", [], "card-marko", "fills", rootFill, "background")];
  for (let i = 0; i < texts; i++) uses.push(colorUse("v:card", [i], `text ${i + 1}`, "fills", textHex, "text"));
  return { id: "c:card", name: "card-marko", kind: "COMPONENT", variantProperties: {}, variants: [{ id: "v:card", props: {}, root, uses }] };
}

const unmatchedOf = (scan: ComponentScan, catalog = coreCatalog()) => {
  const p = buildProposal(scan, catalog, [], "card-marko");
  return { p, bg: p.unmatched.find((u) => u.uses[0].role === "background"), text: p.unmatched.find((u) => u.uses[0].role === "text") };
};

describe("role-default suggestions (card-marko, Core file)", () => {
  it("pairs black text on #FFF07E with the closest surface, feedback/warning", () => {
    const { p, bg, text } = unmatchedOf(card("#FFF07E"));
    expect(p.tokens).toEqual([]);
    expect(text!.uses).toHaveLength(4);
    expect(text!.reason).toBe("No color token is #000000.");
    expect(text!.suggestion).toEqual({
      variableId: "c:color/on-surface/feedback/warning/enabled",
      variableName: "color/on-surface/feedback/warning/enabled",
      reason: "Text on surface feedback/warning (closest to #FFF07E) uses on-surface/feedback/warning/enabled (#3D3200).",
    });
    expect(bg!.reason).toBe("No color token is #FFF07E.");
    expect(bg!.suggestion).toEqual({
      variableId: "c:color/surface/feedback/warning",
      variableName: "color/surface/feedback/warning",
      reason: "Closest background is surface/feedback/warning (#FFF89D).",
    });
    const all = JSON.stringify(p.unmatched);
    expect(all).not.toContain("feedback/success");
    expect(all).not.toContain("nearest is");
  });

  it("pairs text on a white root with surface 1", () => {
    const { p, text } = unmatchedOf(card("#FFFFFF"));
    expect(p.tokens.map((t) => t.alias.desktop)).toEqual(["c:color/surface/1/enabled"]);
    expect(text!.suggestion).toEqual({
      variableId: "c:color/on-surface/1/enabled",
      variableName: "color/on-surface/1/enabled",
      reason: "Text on surface 1 uses on-surface/1/enabled (#001B4D).",
    });
  });

  it("pairs text on an exact surface/2 fill with on-surface/2/enabled", () => {
    const { text } = unmatchedOf(card("#EEF2FA"));
    expect(text!.suggestion?.variableName).toBe("color/on-surface/2/enabled");
    expect(text!.suggestion?.reason).toBe("Text on surface 2 uses on-surface/2/enabled (#002266).");
  });

  it("does not match the green feedback text on surface 1, even with the exact value; fixes it to the pair, checked", () => {
    const { p, text } = unmatchedOf(card("#FFFFFF", "#012E1C"));
    expect(text).toBeUndefined();
    const row = p.tokens.find((t) => t.uses[0].role === "text")!;
    expect([row.alias.desktop, row.match, row.skip]).toEqual(["c:color/on-surface/1/enabled", "manual", false]);
    expect(row.note).toContain("Same value as on-surface/feedback/success, which does not pair with surface 1. Text on surface 1 uses on-surface/1/enabled; changes the look.");
  });

  it("matches the green feedback text exactly on its own surface", () => {
    const { p, text } = unmatchedOf(card("#D9F5E6", "#012E1C"));
    expect(text).toBeUndefined();
    expect(p.tokens.map((t) => t.alias.desktop)).toContain("c:color/on-surface/feedback/success");
  });

  it("pairs text with no filled ancestor with the page (on-background/primary)", () => {
    const scan = card("#FFFFFF");
    scan.variants[0].root.fills = [];
    scan.variants[0].uses = scan.variants[0].uses.filter((u) => u.role === "text");
    const { text } = unmatchedOf(scan);
    expect(text!.suggestion?.variableName).toBe("color/on-background/primary");
    expect(text!.suggestion?.reason).toBe("Text on the page uses on-background/primary (#0A0A0A).");
  });

  it("gives no text suggestion when the pair has no variables", () => {
    const { text } = unmatchedOf(card("#FFFFFF"), coreCatalog([], ["color/on-surface/1/enabled", "color/on-surface/1/disabled"]));
    expect(text!.suggestion).toBeNull();
  });

  it("suggests border/medium for an unmatched border, and nothing when it is missing", () => {
    const scan = card("#FFFFFF", "#001B4D", 0);
    scan.variants[0].uses.push(colorUse("v:card", [], "card-marko", "strokes", "#123456", "border"));
    expect(unmatchedOf(scan).p.unmatched[0].suggestion).toEqual({
      variableId: "c:color/border/medium",
      variableName: "color/border/medium",
      reason: "Borders default to border/medium (#B0B8C4).",
    });
    expect(unmatchedOf(scan, coreCatalog([], ["color/border/medium"])).p.unmatched[0].suggestion).toBeNull();
  });

  it("gives no suggestion for role other colors", () => {
    const scan = card("#FFFFFF", "#001B4D", 0);
    scan.variants[0].uses.push(colorUse("v:card", [], "card-marko", "fills", "#FF00FF", "other"));
    const other = unmatchedOf(scan).p.unmatched.find((u) => u.uses[0].role === "other");
    expect(other!.suggestion).toBeNull();
  });

  it("suggests the nearest number step of the right group, none without a group", () => {
    const scan = card("#FFFFFF", "#001B4D", 0);
    scan.variants[0].uses.push(numUse("v:card", [], "card-marko", "itemSpacing", 100));
    const gap: CatalogVariable = { id: "d:gap/m", name: "gap/m", collection: "dimensions", type: "FLOAT", values: { desktop: { number: 16 } } };
    const withGap = unmatchedOf(scan, coreCatalog([gap])).p.unmatched[0];
    expect(withGap.suggestion).toEqual({ variableId: "d:gap/m", variableName: "gap/m", reason: "Nearest is gap/m (16)." });
    expect(unmatchedOf(scan).p.unmatched[0].suggestion).toBeNull();
  });

  it("is deterministic", () => {
    expect(buildProposal(card("#FFF07E"), coreCatalog(), [], "c")).toEqual(buildProposal(card("#FFF07E"), coreCatalog(), [], "c"));
  });
});
