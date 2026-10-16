import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import { isValidComponentTokenName } from "../../src/tokenNames";
import type { CatalogVariable, ComponentScan, Proposal, TokenProposal } from "../../src/types";
import { buttonScan, buttonVariant, colorUse, componentVar, layer, makeCatalog, numUse } from "./fixtures";

const byName = (p: Proposal, name: string): TokenProposal => {
  const t = p.tokens.find((x) => x.name === name);
  if (!t) throw new Error(`missing ${name}; have ${p.tokens.map((x) => x.name).join(", ")}`);
  return t;
};
const aliasName = (id: string | null) => (id ? id.replace(/^[a-z]:/, "") : null);

describe("buildProposal: button set end to end", () => {
  const scan = buttonScan();
  const proposal = buildProposal(scan, makeCatalog(), [], "button");

  it("produces exactly the expected token names, all valid and sorted", () => {
    const names = proposal.tokens.map((t) => t.name);
    expect(names).toEqual([
      "button/color/border",
      "button/color/primary/background/enabled",
      "button/color/primary/background/hover",
      "button/color/primary/icon",
      "button/color/primary/text",
      "button/color/secondary/background/enabled",
      "button/color/secondary/background/hover",
      "button/color/secondary/icon",
      "button/color/secondary/text",
      "button/shape/cornerRadius",
      "button/shape/large/height",
      "button/shape/medium/height",
      "button/shape/stroke",
      "button/spacing/gap",
      "button/spacing/large/paddingX",
      "button/spacing/large/paddingY",
      "button/spacing/medium/paddingX",
      "button/spacing/medium/paddingY",
    ]);
    expect(names.every(isValidComponentTokenName)).toBe(true);
    expect(proposal.unmatched).toEqual([]);
    expect(proposal.warnings).toEqual([]);
    expect(proposal.newComponentName).toBeNull();
  });

  it("aliases colors by role and state", () => {
    expect(aliasName(byName(proposal, "button/color/primary/background/hover").alias.desktop)).toBe("color/surface/brand/hover");
    expect(aliasName(byName(proposal, "button/color/secondary/background/enabled").alias.desktop)).toBe("color/surface/1/enabled");
    expect(aliasName(byName(proposal, "button/color/border").alias.desktop)).toBe("color/border/medium");
  });

  it("pairs text with the on-surface of its background", () => {
    const secondary = byName(proposal, "button/color/secondary/text");
    expect(aliasName(secondary.alias.desktop)).toBe("color/on-surface/1/enabled");
    expect(secondary.candidates.map(aliasName)).not.toContain("color/on-background/primary");
    expect(aliasName(byName(proposal, "button/color/primary/icon").alias.desktop)).toBe("color/on-surface/brand/enabled");
  });

  it("groups all uses of one token across variants and layers", () => {
    const gap = byName(proposal, "button/spacing/gap");
    expect(gap.uses).toHaveLength(9);
    expect(gap.match).toBe("exact");
    expect(aliasName(gap.alias.desktop)).toBe("gap/xs");
    const radius = byName(proposal, "button/shape/cornerRadius");
    expect(radius.uses).toHaveLength(36);
    expect(radius.replaces).toBe("8");
  });

  it("aliases desktop and mobile to different steps when the mobile variant differs", () => {
    const px = byName(proposal, "button/spacing/large/paddingX");
    expect(aliasName(px.alias.desktop)).toBe("padding/xl");
    expect(aliasName(px.alias.mobile)).toBe("padding/m");
    expect(px.replaces).toBe("24 (desktop) / 16 (mobile)");
    expect(px.uses.filter((u) => u.variantId.endsWith("-mobile"))).toHaveLength(2);
  });

  it("uses the same step in both modes and says so when there is one value", () => {
    const py = byName(proposal, "button/spacing/large/paddingY");
    expect(py.alias.desktop).toBe(py.alias.mobile);
    expect(aliasName(py.alias.desktop)).toBe("padding/s");
    expect(py.note).toMatch(/Same value in desktop and mobile variants/);
    const medium = byName(proposal, "button/spacing/medium/paddingX");
    expect(medium.alias.desktop).toBe(medium.alias.mobile);
    expect(medium.note).toMatch(/both alias padding\/m/);
  });

  it("never aliases into components and marks every token new", () => {
    for (const t of proposal.tokens) {
      expect(t.status).toBe("new");
      for (const id of [t.alias.desktop, t.alias.mobile, ...t.candidates]) expect(id?.startsWith("k:")).not.toBe(true);
    }
  });

  it("is deterministic", () => {
    const again = buildProposal(buttonScan(), makeCatalog(), [], "button");
    expect(again).toEqual(proposal);
    expect(JSON.stringify(again)).toBe(JSON.stringify(proposal));
  });
});

describe("buildProposal: existing tokens", () => {
  it("reuses an existing components token with the same name", () => {
    const catalog = makeCatalog([componentVar("button/shape/cornerRadius", "FLOAT", { number: 8 })]);
    const p = buildProposal(buttonScan(), catalog, [], "button");
    const t = p.tokens.find((x) => x.name === "button/shape/cornerRadius")!;
    expect(t.status).toBe("existing");
    expect(p.tokens.filter((x) => x.name === "button/shape/cornerRadius")).toHaveLength(1);
    expect(p.warnings).toEqual([]);
  });

  it("warns instead of overwriting when the existing value differs", () => {
    const catalog = makeCatalog([componentVar("button/spacing/gap", "FLOAT", { number: 12 })]);
    const p = buildProposal(buttonScan(), catalog, [], "button");
    expect(p.tokens.find((x) => x.name === "button/spacing/gap")!.status).toBe("existing");
    expect(p.warnings).toHaveLength(2);
    expect(p.warnings[0]).toMatch(/button\/spacing\/gap.*12.*8.*not overwritten/);
  });
});

function singleScan(uses: Parameters<typeof numUse>[] = []): ComponentScan {
  const root = layer("chip", "COMPONENT", [], [layer("Frame 12", "FRAME", [0]), layer("hidden", "FRAME", [1], [], false)]);
  return {
    id: "c:chip",
    name: "Chip",
    kind: "COMPONENT",
    variantProperties: {},
    variants: [{ id: "v:chip", props: {}, root, uses: uses.map((u) => numUse(...u)) }],
  };
}

describe("buildProposal: unmatched, skipped and renamed values", () => {
  it("surfaces a value with no step once in unmatched and not as a token row", () => {
    const p = buildProposal(singleScan([["v:chip", [], "chip", "itemSpacing", 100]]), makeCatalog(), [], "chip");
    expect(p.tokens).toEqual([]);
    expect(p.unmatched).toHaveLength(1);
    expect(p.unmatched[0].display).toBe("chip/spacing/gap (100)");
    expect(p.unmatched[0].reason).toBe("No gap/* step close to 100.");
    expect(p.unmatched[0].suggestion).toEqual({ variableId: "d:gap/m", variableName: "gap/m", reason: "Nearest is gap/m (16)." });
    expect(p.unmatched[0]).toMatchObject({ key: "chip/spacing/gap|100", tokenName: "chip/spacing/gap", type: "FLOAT" });
  });

  it("gives unmatched values and tokens the same keys on every scan", () => {
    const uses: Parameters<typeof numUse>[] = [
      ["v:chip", [], "chip", "itemSpacing", 100],
      ["v:chip", [], "chip", "paddingLeft", 16],
    ];
    const a = buildProposal(singleScan(uses), makeCatalog(), [], "chip");
    const b = buildProposal(singleScan([...uses].reverse()), makeCatalog(), [], "chip");
    expect(a.unmatched.map((u) => u.key)).toEqual(["chip/spacing/gap|100"]);
    expect(b.unmatched.map((u) => u.key)).toEqual(a.unmatched.map((u) => u.key));
    expect(b.tokens.map((t) => t.key)).toEqual(a.tokens.map((t) => t.key));
    expect(a.tokens.every((t) => t.source === "match")).toBe(true);
  });

  it("reports a nearest step without rounding silently", () => {
    const p = buildProposal(singleScan([["v:chip", [], "chip", "itemSpacing", 10]]), makeCatalog(), [], "chip");
    expect(p.tokens[0].match).toBe("nearest");
    expect(p.tokens[0].replaces).toBe("10");
    expect(p.tokens[0].note).toMatch(/nearest is gap\/s.*off by 2/);
    expect(p.unmatched).toEqual([]);
  });

  it("skips zero values and hidden layers", () => {
    const p = buildProposal(
      singleScan([
        ["v:chip", [], "chip", "itemSpacing", 0],
        ["v:chip", [1], "hidden", "itemSpacing", 8],
      ]),
      makeCatalog(),
      [],
      "chip",
    );
    expect(p.tokens).toEqual([]);
  });

  it("uses the renamed layer name for parts and elements", () => {
    const scan = singleScan([["v:chip", [0], "Frame 12", "itemSpacing", 8]]);
    scan.variants[0].uses.push(colorUse("v:chip", [0], "Frame 12", "fills", "#CCCCCC", "other"));
    const renames = [{ indexPath: [0], oldName: "Frame 12", newName: "track", reason: "", skip: false, source: "rules" as const, outsideVocabulary: false }];
    const p = buildProposal(scan, makeCatalog(), renames, "chip");
    expect(p.tokens.map((t) => t.name)).toEqual(["chip/color/track", "chip/track/spacing/gap"]);
    expect(p.newComponentName).toBe("chip");
    expect(p.componentName).toBe("Chip");
  });

  it("maps boolean value to checked / unchecked", () => {
    const variants = ["false", "true"].map((value) => ({
      id: `v:${value}`,
      props: { value },
      root: layer("checkbox", "COMPONENT", []),
      uses: [colorUse(`v:${value}`, [], "checkbox", "fills", value === "true" ? "#0059FF" : "#FFFFFF", "background")],
    }));
    const p = buildProposal(
      { id: "c:cb", name: "checkbox", kind: "COMPONENT_SET", variantProperties: { value: ["false", "true"] }, variants },
      makeCatalog(),
      [],
      "checkbox",
    );
    expect(p.tokens.map((t) => t.name)).toEqual(["checkbox/color/checked/background", "checkbox/color/unchecked/background"]);
  });

  it("names the state focus when the variant says focused", () => {
    const variants = ["enabled", "focused"].map((state) => ({
      id: `v:${state}`,
      props: { state },
      root: layer("input", "COMPONENT", []),
      uses: [numUse(`v:${state}`, [], "input", "strokeWeight", state === "focused" ? 2 : 1)],
    }));
    const p = buildProposal(
      { id: "c:in", name: "input", kind: "COMPONENT_SET", variantProperties: { state: ["enabled", "focused"] }, variants },
      makeCatalog(),
      [],
      "input",
    );
    expect(p.tokens.map((t) => t.name)).toEqual(["input/shape/stroke/enabled", "input/shape/stroke/focus"]);
    expect(aliasName(p.tokens[1].alias.desktop)).toBe("stroke/m");
  });

  it("splits same-role colors that differ inside one variant by layer name", () => {
    const v = buttonVariant({ style: "primary", state: "enabled", size: "large", layout: "desktop" });
    v.root.children.push(layer("supporting text", "TEXT", [2]));
    v.uses.push(colorUse(v.id, [2], "supporting text", "fills", "#CCE0FF", "text"));
    const muted: CatalogVariable = {
      id: "c:color/on-surface/brand/muted",
      name: "color/on-surface/brand/muted",
      collection: "color",
      type: "COLOR",
      values: { light: { hex: "#CCE0FF", opacity: 1 } },
    };
    const p = buildProposal(
      { id: "c:b", name: "button", kind: "COMPONENT", variantProperties: {}, variants: [v] },
      makeCatalog([muted]),
      [],
      "button",
    );
    const names = p.tokens.map((t) => t.name);
    expect(names).toContain("button/color/label");
    expect(names).toContain("button/color/supporting-text");
    expect(p.warnings).toEqual([]);
  });
});
