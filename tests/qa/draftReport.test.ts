import { describe, expect, it } from "vitest";
import { proposeLayerNames } from "../../src/naming";
import { buildProposal, checkValues } from "../../src/proposal";
import { buildDraftQaReport, buildQaReport, qaReportMarkdown, type DraftQaInput } from "../../src/qa";
import type { ComponentScan, LayerNode, Proposal, QaFinding, RawValueUse } from "../../src/types";
import { colorUse, componentVar, layer, makeCatalog, numUse } from "../tokens/fixtures";

const V = "f:seg";
const id = (name: string) => `c:${name}`;
const bound = (use: RawValueUse, name: string): RawValueUse => ({ ...use, boundVariableId: id(name) });

// A segmented control drawn in a page design, not a component yet: white frame, one brand segment (bound),
// texts in every pairing state, raw spacing, a raw border with no token and a fractional width.
function segmented(): ComponentScan {
  const brand = layer("segment", "FRAME", [0], [layer("Day", "TEXT", [0, 0])]);
  brand.fills = [{ hex: "#0059FF", opacity: 1, boundVariableId: id("color/surface/brand/enabled") }];
  const week = layer("Frame 3", "FRAME", [1], [layer("Week", "TEXT", [1, 0])]);
  const month = layer("segment", "FRAME", [2], [layer("Month", "TEXT", [2, 0])]);
  const year = layer("Year", "TEXT", [3]);
  const root = layer("Segmented control", "FRAME", [], [brand, week, month, year]);
  root.fills = [{ hex: "#FFFFFF", opacity: 1, boundVariableId: null }];
  const uses: RawValueUse[] = [
    colorUse(V, [], "Segmented control", "fills", "#FFFFFF", "background"),
    ...(["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"] as const).map((f) => numUse(V, [], "Segmented control", f, 4)),
    numUse(V, [], "Segmented control", "itemSpacing", 4),
    numUse(V, [], "Segmented control", "width", 16.666015625),
    colorUse(V, [1, 0], "Week", "fills", "#1A1A1A", "text"),
    colorUse(V, [1], "Frame 3", "strokes", "#123456", "border"),
    colorUse(V, [3], "Year", "fills", "#FFFFFF", "text"),
  ];
  const boundUses: RawValueUse[] = [
    bound(colorUse(V, [0], "segment", "fills", "#0059FF", "background"), "color/surface/brand/enabled"),
    bound(colorUse(V, [0, 0], "Day", "fills", "#1A1A1A", "text"), "color/on-surface/1/enabled"), // dark text on brand
    bound(colorUse(V, [2, 0], "Month", "fills", "#1A1A1A", "text"), "color/on-surface/1/enabled"), // pairs with the white frame
  ];
  return { id: "1:0", name: "Segmented control", kind: "FRAME", variantProperties: {}, variants: [{ id: V, props: {}, root, uses, boundUses }] };
}

function naming(root: LayerNode): Proposal {
  return {
    componentId: "1:0",
    componentName: "Segmented control",
    newComponentName: "segmented-control",
    renames: proposeLayerNames(root),
    tokens: [],
    unmatched: [],
    warnings: [],
  };
}

function input(scan = segmented(), catalog = makeCatalog()): DraftQaInput {
  return { scan, naming: naming(scan.variants[0].root), namingSource: { source: "rules", claudeRequested: false }, catalog };
}

describe("checkValues: step 2 rules per value, before a component exists", () => {
  const checks = checkValues(segmented(), makeCatalog());
  const at = (path: number[], field: string) => checks.find((c) => c.use.indexPath.join(".") === path.join(".") && c.use.field === field)!;

  it("bound semantic text on the wrong surface: pairing fix with the right token", () => {
    const c = at([0, 0], "fills");
    expect(c.bound?.name).toBe("color/on-surface/1/enabled");
    expect(c.target?.name).toBe("color/on-surface/brand/enabled");
    expect(c.pairFix).toMatch(/does not pair with surface brand/);
  });

  it("bound semantic text on the right surface: no fix", () => {
    const c = at([2, 0], "fills");
    expect(c.pairFix).toBeNull();
    expect(c.target?.name).toBe("color/on-surface/1/enabled");
  });

  it("pairs text with the surface it sits on now, not with a later proposal", () => {
    expect(at([1, 0], "fills")).toMatchObject({ match: "exact", pairFix: null, bound: null });
    expect(at([1, 0], "fills").target?.name).toBe("color/on-surface/1/enabled");
  });

  it("raw text with the value of a token outside its pair", () => {
    const c = at([3], "fills");
    expect(c.target?.name).toBe("color/on-surface/1/enabled");
    expect(c.pairFix).toMatch(/Same value as on-surface\/brand\/enabled, which does not pair with surface 1/);
  });

  it("raw values with no token keep the rules' suggestion; numbers carry their group", () => {
    expect(at([1], "strokes")).toMatchObject({ match: "none", target: null });
    expect(at([1], "strokes").suggestion?.variableName).toBe("color/border/medium");
    expect(at([], "itemSpacing")).toMatchObject({ group: "gap", match: "exact" });
    expect(at([], "width").group).toBe("size");
  });

  it("leaves out values bound to component tokens", () => {
    const token = componentVar("segmented/color/text", "COLOR", { hex: "#1A1A1A", opacity: 1 });
    const catalog = makeCatalog([token]);
    const scan = segmented();
    scan.variants[0].boundUses = [{ ...colorUse(V, [3], "Year", "fills", "#1A1A1A", "text"), boundVariableId: token.id }];
    scan.variants[0].uses = [];
    expect(checkValues(scan, catalog)).toEqual([]);
  });
});

describe("buildDraftQaReport", () => {
  const report = buildDraftQaReport(input());
  const tokens = report.findings.filter((f) => f.area === "tokens");

  it("is marked as a draft and carries no scan warnings", () => {
    expect(report.draft).toBe(true);
    expect(report.notes).toEqual([]);
  });

  it("reports wrong pairing of a bound semantic color, with the right token", () => {
    expect(tokens.filter((f) => f.kind === "surface-pairing" && f.current === "color/on-surface/1/enabled")).toEqual([
      expect.objectContaining({
        severity: "error",
        layer: "Segmented control › segment › Day",
        nodeIds: ["n:Day:0.0"],
        suggestion: "color/on-surface/brand/enabled",
        suggestionColor: { hex: "#FFFFFF", opacity: 1 },
        currentColor: { hex: "#1A1A1A", opacity: 1 },
      }),
    ]);
  });

  it("does not report bound semantic colors that pair correctly, or wrap needed", () => {
    expect(tokens.some((f) => f.nodeIds.includes("n:Month:2.0"))).toBe(false);
    expect(tokens.some((f) => f.nodeIds.includes("n:segment:0"))).toBe(false);
    expect(tokens.some((f) => f.kind === "semantic-binding")).toBe(false);
  });

  it("raw colors: token available, wrong pairing, no token", () => {
    expect(tokens.find((f) => f.layer === "Segmented control › Frame 3 › Week")).toMatchObject({
      kind: "raw-value",
      issue: "Raw value, token exists",
      severity: "warning",
      current: "#1A1A1A",
      suggestion: "color/on-surface/1/enabled",
    });
    expect(tokens.find((f) => f.layer === "Segmented control › Year")).toMatchObject({ kind: "surface-pairing", current: "#FFFFFF", suggestion: "color/on-surface/1/enabled" });
    expect(tokens.find((f) => f.current === "#123456")).toMatchObject({ kind: "raw-value", severity: "error", issue: "Raw value, no token", suggestion: "color/border/medium" });
  });

  it("spacing: one row per value and suggestion, sizes left out", () => {
    const numbers = tokens.filter((f) => f.current === "4");
    expect(numbers.map((f) => f.suggestion).sort()).toEqual(["gap/2xs", "padding/2xs"]);
    expect(tokens.some((f) => f.current.startsWith("16.6"))).toBe(false);
  });

  it("names only by the layer-name rules: no component name, no vocabulary findings", () => {
    const kinds = new Set(report.findings.filter((f) => f.area === "naming").map((f) => f.kind));
    expect(kinds.has("default-name")).toBe(true);
    for (const k of kinds) expect(["default-name", "content-name", "keyboard-mash", "synonym"]).toContain(k);
  });

  it("only kinds that hold before a component exists", () => {
    const allowed = ["default-name", "content-name", "keyboard-mash", "synonym", "raw-value", "deleted-binding", "surface-pairing", "unbound-typography"];
    for (const f of report.findings) expect(allowed).toContain(f.kind);
  });

  it("deleted bindings keep their own row with the rules' fix", () => {
    const scan = segmented();
    scan.variants[0].missingUses = [{ indexPath: [1, 0], field: "fills" }];
    const r = buildDraftQaReport(input(scan));
    expect(r.findings.find((f) => f.kind === "deleted-binding")).toMatchObject({ layer: "Segmented control › Frame 3 › Week", suggestion: "color/on-surface/1/enabled" });
    expect(r.findings.some((f) => f.kind === "raw-value" && f.current === "#1A1A1A")).toBe(false);
  });

  it("a clean draft has no findings", () => {
    const root = layer("card", "FRAME", [], [layer("title", "TEXT", [0])]);
    root.fills = [{ hex: "#FFFFFF", opacity: 1, boundVariableId: id("color/surface/1/enabled") }];
    root.children[0].text = { characters: "Hello", fontSize: 14 };
    const boundUses = [
      bound(colorUse(V, [], "card", "fills", "#FFFFFF", "background"), "color/surface/1/enabled"),
      bound(colorUse(V, [0], "title", "fills", "#1A1A1A", "text"), "color/on-surface/1/enabled"),
    ];
    const scan: ComponentScan = { id: "1:0", name: "card", kind: "FRAME", variantProperties: {}, variants: [{ id: V, props: {}, root, uses: [], boundUses }] };
    const r = buildDraftQaReport(input(scan));
    expect(r.findings).toEqual([]);
    expect(qaReportMarkdown(r)).toBe("# QA report: card\n\nDraft (not a component yet): colors, spacing, typography and layer names only.\n\nNo issues found.\n");
  });
});

// The real case: a text bound to surface/primary inside a frame bound to surface/accent.
describe("wrong role family and pairing, draft and component", () => {
  const color = (name: string, hex: string) => ({ id: id(name), name, collection: "color", type: "COLOR" as const, values: { light: { hex, opacity: 1 }, dark: { hex, opacity: 1 } } });
  const catalog = () =>
    makeCatalog([
      color("color/surface/primary/enabled", "#FAFAFA"),
      color("color/surface/accent/enabled", "#7A5AF8"),
      color("color/surface/accent/hover", "#6A4AE8"),
      color("color/on-surface/primary/enabled", "#101828"),
      color("color/on-surface/accent/enabled", "#FFFFFF"),
      color("color/on-surface/accent/hover", "#F4F0FF"),
    ]);

  function scan(kind: ComponentScan["kind"], accentState = "enabled"): ComponentScan {
    const accent = `color/surface/accent/${accentState}`;
    const pill = layer("pill", "FRAME", [0], [layer("label", "TEXT", [0, 0])]);
    pill.fills = [{ hex: "#7A5AF8", opacity: 1, boundVariableId: id(accent) }];
    const badge = layer("badge", "FRAME", [1]);
    badge.fills = [{ hex: "#101828", opacity: 1, boundVariableId: id("color/on-surface/primary/enabled") }];
    const root = layer("tabs", kind === "FRAME" ? "FRAME" : "COMPONENT", [], [pill, badge]);
    const boundUses = [
      bound(colorUse(V, [0], "pill", "fills", "#7A5AF8", "background"), accent),
      bound(colorUse(V, [0, 0], "label", "fills", "#FAFAFA", "text"), "color/surface/primary/enabled"),
      bound(colorUse(V, [1], "badge", "fills", "#101828", "background"), "color/on-surface/primary/enabled"),
    ];
    return { id: "1:0", name: "tabs", kind, variantProperties: {}, variants: [{ id: V, props: {}, root, uses: [], boundUses }] };
  }

  const at = (findings: QaFinding[], layerName: string) => findings.filter((f) => f.area === "tokens" && f.layer.endsWith(layerName)).map((f) => [f.kind, f.severity, f.current, f.suggestion]);

  it("draft: text bound to a surface token is one wrong-family error whose suggestion pairs with on-surface/accent", () => {
    const r = buildDraftQaReport(input(scan("FRAME"), catalog()));
    expect(at(r.findings, "pill › label")).toEqual([["role-family", "error", "color/surface/primary/enabled", "color/on-surface/accent/enabled"]]);
    expect(r.findings.find((f) => f.kind === "role-family" && f.layer.endsWith("label"))!.detail).toBe(
      "color/surface/primary/enabled is not a text color; text colors come from on-surface/*, on-background/*. " +
        "Text on surface accent uses on-surface/accent/enabled; changes the look.",
    );
  });

  it("draft: state-aware pairing on a hover surface", () => {
    const r = buildDraftQaReport(input(scan("FRAME", "hover"), catalog()));
    expect(at(r.findings, "pill › label").map((x) => x[3])).toEqual(["color/on-surface/accent/hover"]);
  });

  it("draft: an on-surface token as a frame background is a wrong family only", () => {
    const r = buildDraftQaReport(input(scan("FRAME"), catalog()));
    expect(at(r.findings, "badge")).toEqual([["role-family", "error", "color/on-surface/primary/enabled", expect.stringMatching(/^color\/(surface|background)\//)]]);
  });

  it("draft: a wrong family with no partner in the catalog is still an error, the partner named as text only", () => {
    const s = scan("FRAME");
    s.variants[0].boundUses = [bound(colorUse(V, [0, 0], "label", "fills", "#CCCCCC", "text"), "color/border/medium")];
    s.variants[0].root.children[0].fills = [];
    const cat = catalog();
    cat.variables = cat.variables.filter((v) => !v.name.startsWith("color/on-background/") && !v.name.startsWith("color/background/"));
    const r = buildDraftQaReport(input(s, cat));
    expect(at(r.findings, "pill › label")).toEqual([["role-family", "error", "color/border/medium", "color/on-background/primary"]]);
    expect(r.findings.find((f) => f.area === "tokens" && f.layer.endsWith("pill › label"))).toMatchObject({ suggestionColor: null, suggestionNote: "From the library, not in this file" });
  });

  it("component QA: the same single wrong-family error from the step 2 rows", () => {
    const s = scan("COMPONENT");
    const cat = catalog();
    const tokens = buildProposal(s, cat, [], "tabs");
    const semantic = cat.variables.map((v) => ({ id: v.id, name: v.name, collection: v.collection, type: v.type, ...(v.values.light?.hex ? { light: { hex: v.values.light.hex, opacity: 1 } } : {}) }));
    const r = buildQaReport({ scan: s, naming: naming(s.variants[0].root), namingSource: { source: "rules", claudeRequested: false }, tokens, semantic });
    const label = at(r.findings, "pill › label");
    expect(label.map((x) => [x[0], x[1]])).toEqual([["role-family", "error"]]);
    for (const x of label) expect(x[3]).toMatch(/→ color\/on-surface\/accent\/enabled$/);
    expect(at(r.findings, "badge").map((x) => x[0])).toEqual(["role-family"]);
  });
});
