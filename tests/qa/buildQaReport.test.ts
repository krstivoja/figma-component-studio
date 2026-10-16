import { describe, expect, it } from "vitest";
import { proposeLayerNames } from "../../src/naming";
import { buildQaReport, qaCounts, qaReportMarkdown, qaSeverityText, qaSummaryText, type QaInput } from "../../src/qa";
import type { ComponentScan, LayerNode, Proposal, QaKind, RawValueUse, SemanticToken, TokenProposal } from "../../src/types";
import { frame, hstack, instance, text, tree, vector } from "../naming/build";
import { colorUse, numUse } from "../tokens/fixtures";

const V = "v:card";

function scanOf(root: LayerNode, missingUses: ComponentScan["variants"][number]["missingUses"] = undefined): ComponentScan {
  return { id: root.id, name: root.name, kind: "COMPONENT", variantProperties: {}, variants: [{ id: V, props: {}, root, uses: [], ...(missingUses ? { missingUses } : {}) }] };
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  return { componentId: "1:0", componentName: "card", newComponentName: null, renames: [], tokens: [], unmatched: [], typography: [], warnings: [], ...over };
}

function token(over: Partial<TokenProposal>): TokenProposal {
  return {
    key: over.name ?? "k",
    name: "card/color/background",
    status: "new",
    type: "COLOR",
    alias: { desktop: "c:surface", mobile: "c:surface" },
    candidates: [],
    match: "exact",
    source: "match",
    replaces: "#FFFFFF",
    uses: [],
    note: null,
    skip: false,
    ...over,
  };
}

const semantic: SemanticToken[] = [
  { id: "c:surface", name: "color/surface/1/enabled", collection: "color", type: "COLOR", light: { hex: "#FFFFFF", opacity: 1 } },
  { id: "c:on", name: "color/on-surface/1/enabled", collection: "color", type: "COLOR", light: { hex: "#1A1A1A", opacity: 1 } },
  { id: "c:on3", name: "color/on-surface/3/enabled", collection: "color", type: "COLOR", light: { hex: "#0B1F5C", opacity: 1 } },
  { id: "d:pad", name: "padding/m", collection: "dimensions", type: "FLOAT", value: 16 },
];

// A clean card: vocabulary names only, nothing proposed.
const cleanRoot = () => tree(hstack("card", [text("title", "Hello"), frame("actions", [instance("button", "_button/primary")])]));

function input(over: Partial<QaInput> & { root?: LayerNode } = {}): QaInput {
  const root = over.root ?? cleanRoot();
  const scan = over.scan ?? scanOf(root);
  return {
    scan,
    naming: over.naming ?? proposal({ renames: proposeLayerNames(scan.variants[0].root) }),
    namingSource: over.namingSource ?? { source: "rules", claudeRequested: false },
    tokens: over.tokens ?? proposal(),
    semantic,
  };
}

const kinds = (i: QaInput) => buildQaReport(i).findings.map((f) => f.kind);
const one = (i: QaInput, kind: QaKind) => {
  const found = buildQaReport(i).findings.filter((f) => f.kind === kind);
  expect(found).toHaveLength(1);
  return found[0];
};

describe("buildQaReport: empty component", () => {
  it("has no findings and says so", () => {
    const report = buildQaReport(input());
    expect(report.findings).toEqual([]);
    expect(qaSummaryText(report)).toBe("No issues found");
    expect(qaReportMarkdown(report)).toBe("# QA report: card\n\nNo issues found.\n");
  });
});

describe("buildQaReport: naming", () => {
  it("default Figma name, with the rules' name as suggestion", () => {
    const f = one(input({ root: tree(hstack("card", [text("title", "Hi"), frame("Frame 12", [text("label", "x")])])) }), "default-name");
    expect(f).toMatchObject({ area: "naming", severity: "warning", issue: "Default Figma name", layer: "card › Frame 12", nodeIds: ["1:1"], current: "Frame 12", suggestion: "text-content", source: "rules" });
  });

  it("content-named text", () => {
    const f = one(input({ root: tree(hstack("card", [text("Buy now", "Buy now please")])) }), "content-name");
    expect(f).toMatchObject({ severity: "warning", current: "Buy now", suggestion: "label" });
  });

  it("keyboard mash", () => {
    expect(one(input({ root: tree(hstack("card", [frame("xkcdq", [text("label", "x")])])) }), "keyboard-mash").severity).toBe("warning");
  });

  it("synonym, as info", () => {
    const f = one(input({ root: tree(hstack("card", [text("heading", "Hi"), text("label", "x", 12)])) }), "synonym");
    expect(f).toMatchObject({ severity: "info", current: "heading", suggestion: "title" });
  });

  it("not in vocabulary, no suggestion; slot names are deliberate and not reported", () => {
    const f = one(input({ root: tree(hstack("card", [frame("promo-strip", [text("label", "x")]), frame("contentSlot")])) }), "not-in-vocabulary");
    expect(f).toMatchObject({ severity: "info", current: "promo-strip", suggestion: null, source: null });
  });

  it("vocabulary name off convention (casing)", () => {
    expect(one(input({ root: tree(hstack("card", [text("Title", "Hi", 20), text("label", "x", 12)])) }), "naming-convention")).toMatchObject({
      current: "Title",
      suggestion: "title",
    });
  });

  it("does not look inside instances or icon glyphs", () => {
    const root = tree(hstack("card", [frame("icon", [vector("Vector", 16)], { width: 16, height: 16 }), text("label", "x")]));
    expect(kinds(input({ root }))).toEqual([]);
  });

  it("component name off convention; Claude's names carry the Claude source", () => {
    const root = cleanRoot();
    const scan = { ...scanOf(root), name: "Card Marko" };
    const naming = proposal({
      newComponentName: "card-marko",
      renames: [{ indexPath: [0], oldName: "title", newName: "headline", reason: "Claude: hero text", skip: false, source: "claude", outsideVocabulary: true }],
    });
    const report = buildQaReport(input({ scan, naming, namingSource: { source: "claude", createdAt: "2026-10-16T10:00:00Z" } }));
    expect(report.findings.map((f) => [f.kind, f.current, f.suggestion, f.source])).toEqual([
      ["component-name", "Card Marko", "card-marko", "claude"],
      ["naming-convention", "title", "headline", "claude"],
    ]);
    expect(report.findings[1].detail).toBe("Claude: hero text (outside the vocabulary)");
  });
});

describe("buildQaReport: tokens", () => {
  const root = () => tree(hstack("card", [text("label", "x"), frame("actions", [instance("button", "_button/primary")])]));
  const fill = (path: number[], hex: string, bound?: string): RawValueUse => ({ ...colorUse(V, path, "x", "fills", hex, "background"), ...(bound ? { boundVariableId: bound } : {}) });

  it("raw value with an existing token: warning, with swatches for value and alias", () => {
    const tokens = proposal({ tokens: [token({ uses: [fill([], "#FFFFFF")] })] });
    const f = one(input({ root: root(), tokens }), "raw-value");
    expect(f).toMatchObject({
      severity: "warning",
      issue: "Raw value, token exists",
      layer: "card",
      current: "#FFFFFF",
      currentColor: { hex: "#FFFFFF", opacity: 1 },
      suggestion: "card/color/background → color/surface/1/enabled",
      suggestionColor: { hex: "#FFFFFF", opacity: 1 },
    });
  });

  it("raw value with no matching token: error, the rules' suggestion when there is one", () => {
    const tokens = proposal({
      unmatched: [
        {
          key: "card/spacing/gap|100",
          tokenName: "card/spacing/gap",
          type: "FLOAT",
          display: "card/spacing/gap (100)",
          uses: [numUse(V, [], "card", "itemSpacing", 100), numUse(V, [1], "actions", "itemSpacing", 100)],
          reason: "No gap variable near 100.",
          suggestion: { variableId: "d:pad", variableName: "padding/m", reason: "Nearest." },
        },
      ],
    });
    const f = one(input({ root: root(), tokens }), "raw-value");
    expect(f).toMatchObject({ severity: "error", issue: "Raw value, no token", current: "100", nodeIds: ["1:0", "1:1"], suggestion: "card/spacing/gap → padding/m", detail: "No gap variable near 100." });
  });

  it("deleted binding: error, with the token step 2 would bind instead; not double-reported as raw", () => {
    const scan = scanOf(root(), [{ indexPath: [0], field: "fills" }]);
    const tokens = proposal({ tokens: [token({ name: "card/color/text", alias: { desktop: "c:on", mobile: "c:on" }, uses: [colorUse(V, [0], "label", "fills", "#1A1A1A", "text")] })] });
    const report = buildQaReport(input({ scan, tokens }));
    expect(report.findings.map((f) => f.kind)).toEqual(["deleted-binding"]);
    expect(report.findings[0]).toMatchObject({ layer: "card › label", current: "fills: deleted variable", suggestion: "card/color/text → color/on-surface/1/enabled" });
  });

  it("bound to a semantic token directly (wrap)", () => {
    const tokens = proposal({ tokens: [token({ kind: "wrap", uses: [fill([], "#FFFFFF", "c:surface")] })] });
    expect(one(input({ root: root(), tokens }), "semantic-binding")).toMatchObject({ severity: "warning", current: "color/surface/1/enabled", currentColor: { hex: "#FFFFFF", opacity: 1 } });
  });

  it("wrong surface pairing: error, old alias as current", () => {
    const tokens = proposal({
      tokens: [
        token({
          name: "card/color/text",
          kind: "alias-change",
          issue: "surface-pairing",
          alias: { desktop: "c:on", mobile: "c:on" },
          previousAlias: { desktop: "c:on3", mobile: "c:on3" },
          uses: [colorUse(V, [0], "label", "fills", "#0B1F5C", "text")],
          note: "Text now sits on surface 1; restores the surface pairing.",
        }),
      ],
    });
    expect(one(input({ root: root(), tokens }), "surface-pairing")).toMatchObject({
      severity: "error",
      current: "card/color/text → color/on-surface/3/enabled",
      suggestion: "card/color/text → color/on-surface/1/enabled",
      detail: "Text now sits on surface 1; restores the surface pairing.",
    });
  });

  it("token name no longer matches the layer names", () => {
    const tokens = proposal({ tokens: [token({ kind: "rename", name: "card/navbar/spacing/gap", previousName: "card/nav/spacing/gap", type: "FLOAT", uses: [numUse(V, [1], "actions", "itemSpacing", 12)] })] });
    expect(one(input({ root: root(), tokens }), "stale-token-name")).toMatchObject({ severity: "info", current: "card/nav/spacing/gap", suggestion: "card/navbar/spacing/gap" });
  });

  it("padding that should be split", () => {
    const tokens = proposal({
      tokens: [token({ kind: "rebind", issue: "property-split", name: "card/spacing/paddingY", replaces: "card/spacing/padding", type: "FLOAT", uses: [numUse(V, [], "card", "paddingTop", 8)] })],
    });
    expect(one(input({ root: root(), tokens }), "property-split")).toMatchObject({ severity: "info", current: "card/spacing/padding", suggestion: "card/spacing/paddingY" });
  });

  it("token named for another layer", () => {
    const tokens = proposal({ tokens: [token({ kind: "rebind", name: "card/actions/color/background", replaces: "card/color/background", uses: [fill([1], "#FFFFFF", "k:card/color/background")] })] });
    expect(one(input({ root: root(), tokens }), "token-mismatch").severity).toBe("warning");
  });

  it("unbound typography fields", () => {
    const tokens = proposal({
      typography: [
        {
          key: "typography|label/s|exact",
          role: "label/s",
          match: "exact",
          bindings: {},
          uses: [{ variantId: V, indexPath: [0], layerName: "label", fields: ["fontSize", "lineHeight"], expect: { fontFamily: "Inter", fontStyle: "Regular", fontSize: 12, lineHeight: { unit: "AUTO" }, letterSpacing: { unit: "PIXELS", value: 0 } } }],
          note: "Matches label/s.",
          skip: false,
        },
      ],
    });
    expect(one(input({ root: root(), tokens }), "unbound-typography")).toMatchObject({ severity: "warning", current: "fontSize, lineHeight unbound", suggestion: "label/s" });
  });
});

describe("severity, counts and Markdown", () => {
  const root = tree(hstack("card", [frame("Frame 3", [text("label", "x")]), text("heading", "Hi"), text("label", "y", 12)]));
  const tokens = proposal({
    tokens: [token({ issue: "surface-pairing", kind: "alias-change", uses: [colorUse(V, [], "card", "fills", "#FFFFFF", "background")] })],
    warnings: ['"card/x": Token name does not follow the pattern; not renamed automatically.'],
  });
  const report = buildQaReport(input({ root, tokens }));

  it("sorts errors first within each area and counts by area and severity", () => {
    expect(report.findings.map((f) => [f.area, f.severity, f.kind])).toEqual([
      ["naming", "warning", "default-name"],
      ["naming", "info", "synonym"],
      ["tokens", "error", "surface-pairing"],
    ]);
    expect(qaCounts(report)).toEqual({ naming: 2, tokens: 1, error: 1, warning: 1, info: 1 });
    expect(qaSummaryText(report)).toBe("2 naming issues, 1 token issue");
    expect(qaSeverityText(report)).toBe("1 error · 1 warning · 1 info");
    expect(new Set(report.findings.map((f) => f.id)).size).toBe(3);
  });

  it("writes a Markdown list per area plus notes", () => {
    const md = qaReportMarkdown(report);
    expect(md).toContain("# QA report: card\n\n2 naming issues, 1 token issue (1 error · 1 warning · 1 info)\n\n## Naming\n\n- **warning** Default Figma name: `card › Frame 3`");
    expect(md).toContain("suggested `text-content` (rules)");
    expect(md).toContain("## Tokens\n\n- **error** Wrong surface pairing: `card` · current `#FFFFFF`");
    expect(md).toContain('## Notes\n\n- "card/x": Token name does not follow the pattern; not renamed automatically.\n');
  });
});
