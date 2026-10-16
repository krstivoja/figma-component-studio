import { describe, expect, it } from "vitest";
import {
  adoptAllSuggestions,
  adoptUnmatched,
  auditView,
  buildReviewModel,
  collectProposal,
  findProblems,
  formatLocalTime,
  lookChangeView,
  namingBanner,
  stepTitle,
  summarizeResult,
  rawRow,
  suggestedKeys,
  undoAdopt,
  unmatchedOptions,
  validateTokenName,
} from "../../src/review";
import type { ApplyResult, Proposal, RawValueUse, TokenProposal, UnmatchedValue } from "../../src/types";

function token(over: Partial<TokenProposal> = {}): TokenProposal {
  return {
    key: "t1",
    name: "button/color/primary/background",
    status: "new",
    type: "COLOR",
    alias: { desktop: "v1", mobile: "v1" },
    candidates: ["v2"],
    match: "exact",
    source: "match",
    replaces: "#0059FF",
    uses: [],
    note: null,
    skip: false,
    ...over,
  };
}

function use(role: RawValueUse["role"]): RawValueUse {
  return {
    variantId: "2:1",
    indexPath: [0],
    layerName: "label",
    field: "fills",
    paintIndex: 0,
    kind: "color",
    number: null,
    hex: "#123456",
    opacity: 1,
    role,
  };
}

function unmatched(over: Partial<UnmatchedValue> = {}): UnmatchedValue {
  return {
    key: "button/color/label/text|#123456",
    tokenName: "button/color/label/text",
    type: "COLOR",
    display: "button/color/label/text (#123456)",
    uses: [use("text")],
    reason: "No close semantic color",
    suggestion: null,
    ...over,
  };
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    componentId: "1:1",
    componentName: "Button",
    newComponentName: "button",
    renames: [
      { indexPath: [0], oldName: "Frame 1", newName: "container", reason: "auto-layout frame", skip: false, source: "claude", outsideVocabulary: true },
      { indexPath: [0, 1], oldName: "Text", newName: "label", reason: "text layer", skip: false, source: "rules", outsideVocabulary: false },
    ],
    tokens: [token(), token({ key: "t2", name: "button/spacing/padding", type: "FLOAT", alias: { desktop: "d1", mobile: "d2" } })],
    unmatched: [],
    warnings: [],
    ...over,
  };
}

describe("validateTokenName", () => {
  it.each([
    "button/color/primary/background/hover",
    "button/shape/cornerRadius",
    "button/spacing/paddingX",
    "button/icon-wrapper/spacing/gap",
    "_private-thing/color/background",
  ])("accepts %s", (name) => {
    expect(validateTokenName(name)).toBeNull();
  });

  it.each([
    "Button/Color/x",
    "button/size/height",
    "button/color",
    "button//color/x",
    "button/color/primary/shape/x",
    "button/part/sub/color/x",
    "button/color/Background",
    "button/color/back ground",
    "",
  ])("rejects %s", (name) => {
    expect(validateTokenName(name)).not.toBeNull();
  });
});

describe("collectProposal", () => {
  it("maps checkboxes to skip and applies edits without mutating the original", () => {
    const original = proposal();
    const snapshot = JSON.parse(JSON.stringify(original));
    const out = collectProposal(original, {
      newComponentName: "primary-button",
      renames: [
        { index: 0, newName: "wrapper", apply: true },
        { index: 1, newName: "label", apply: false },
      ],
      tokens: [
        { key: "t1", name: "button/color/primary/surface", apply: false, aliasDesktop: "v2", aliasMobile: "v2" },
        { key: "t2", name: "button/spacing/paddingX", apply: true, aliasDesktop: "d3", aliasMobile: "d2" },
      ],
    });

    expect(original).toEqual(snapshot);
    expect(out.newComponentName).toBe("primary-button");
    expect(out.renames.map((r) => [r.newName, r.skip])).toEqual([
      ["wrapper", false],
      ["label", true],
    ]);
    expect(out.tokens[0]).toMatchObject({ name: "button/color/primary/surface", skip: true, alias: { desktop: "v2", mobile: "v2" } });
    expect(out.tokens[1]).toMatchObject({ name: "button/spacing/paddingX", skip: false, alias: { desktop: "d3", mobile: "d2" } });
    expect(out.tokens[1].alias).not.toBe(original.tokens[1].alias);
  });

  it("carries source and outsideVocabulary through, keeping claude on an edited row", () => {
    const original = proposal();
    original.renames.push({
      indexPath: [1],
      oldName: "Icon",
      newName: "icon",
      reason: "Stale: layer moved since Claude named it",
      skip: true,
      source: "claude",
      outsideVocabulary: false,
    });
    const out = collectProposal(original, {
      renames: [
        { index: 0, newName: "shell", apply: true },
        { index: 1, newName: "label", apply: true },
        { index: 2, newName: "icon", apply: true },
      ],
      tokens: [],
    });
    expect(out.renames.map((r) => [r.newName, r.source, r.outsideVocabulary, r.skip])).toEqual([
      ["shell", "claude", true, false],
      ["label", "rules", false, false],
      ["icon", "claude", false, false],
    ]);
  });

  it("keeps a null component name and forces match none rows to skip", () => {
    const original = proposal({ newComponentName: null, tokens: [token({ match: "none" })] });
    const out = collectProposal(original, {
      newComponentName: "ignored",
      renames: [],
      tokens: [{ key: "t1", name: "button/color/x", apply: true, aliasDesktop: "v1", aliasMobile: "v1" }],
    });
    expect(out.newComponentName).toBeNull();
    expect(out.tokens[0].skip).toBe(true);
  });
});

describe("findProblems", () => {
  it("is empty for a clean proposal", () => {
    expect(findProblems(proposal())).toEqual([]);
  });

  it("flags duplicate names with different aliases on checked rows", () => {
    const p = proposal({ tokens: [token(), token({ key: "t2", alias: { desktop: "v2", mobile: "v2" } })] });
    expect(findProblems(p)).toHaveLength(2);
  });

  it("allows duplicate names with the same alias and ignores skipped rows", () => {
    expect(findProblems(proposal({ tokens: [token(), token({ key: "t2" })] }))).toEqual([]);
    const skipped = proposal({ tokens: [token(), token({ key: "t2", alias: { desktop: "v2", mobile: "v2" }, skip: true })] });
    expect(findProblems(skipped)).toEqual([]);
  });

  it("flags invalid names only on non-skipped rows", () => {
    expect(findProblems(proposal({ tokens: [token({ name: "Button/Color/x" })] }))).toHaveLength(1);
    expect(findProblems(proposal({ tokens: [token({ name: "Button/Color/x", skip: true })] }))).toEqual([]);
  });

  it("flags empty rename targets on non-skipped rows", () => {
    const p = proposal();
    p.renames[0].newName = "  ";
    expect(findProblems(p)).toHaveLength(1);
    p.renames[0].skip = true;
    expect(findProblems(p)).toEqual([]);
  });
});

describe("buildReviewModel", () => {
  it("splits match none rows into raw, detects split modes and lists suggestions first", () => {
    const semantic = [
      { id: "v1", name: "color/surface/brand", collection: "color", type: "COLOR" as const },
      { id: "v2", name: "color/surface/accent", collection: "color", type: "COLOR" as const },
      { id: "v3", name: "color/surface/1", collection: "color", type: "COLOR" as const },
      { id: "d1", name: "padding/m", collection: "dimensions", type: "FLOAT" as const },
    ];
    const p = proposal({
      tokens: [token(), token({ key: "t2", match: "none", note: "too far" })],
      unmatched: [unmatched({ display: "#123456", reason: "image fill" })],
    });
    const model = buildReviewModel(p, semantic);
    expect(model.tokens).toHaveLength(1);
    expect(model.tokens[0].splitModes).toBe(false);
    expect(model.tokens[0].options[0]).toEqual({
      label: "Suggested",
      options: [
        { id: "v1", label: "color/surface/brand" },
        { id: "v2", label: "color/surface/accent" },
      ],
    });
    expect(model.tokens[0].options[1]).toEqual({ label: "color", options: [{ id: "v3", label: "color/surface/1" }] });
    expect(model.raw.map((r) => r.reason)).toEqual(["too far", "image fill"]);
    expect(model.renames.map((r) => r.depth)).toEqual([1, 2]);
  });

  it("exposes rename source, vocabulary flag, and leaves stale rows unchecked", () => {
    const p = proposal();
    p.renames[1] = { ...p.renames[1], skip: true, reason: "Stale: layer changed" };
    const model = buildReviewModel(p, []);
    expect(model.renames.map((r) => [r.source, r.outsideVocabulary, r.apply])).toEqual([
      ["claude", true, true],
      ["rules", false, false],
    ]);
  });
});

describe("namingBanner", () => {
  it("formats the Claude timestamp as local date and time", () => {
    const local = new Date(2026, 9, 15, 22, 41).toISOString();
    expect(formatLocalTime(local)).toBe("15 Oct 2026, 22:41");
    expect(namingBanner({ source: "claude", createdAt: local })).toEqual({
      tone: "claude",
      text: "Names proposed by Claude, 15 Oct 2026, 22:41. Rows marked Rules were filled in for layers Claude did not cover.",
    });
  });

  it("warns only when Claude was requested but no proposal was found", () => {
    expect(namingBanner({ source: "rules", claudeRequested: true })).toEqual({
      tone: "warning",
      text: "No Claude proposal found on this component. Ask Claude Code to name it, then scan again. Showing rule-based names meanwhile.",
    });
    expect(namingBanner({ source: "rules", claudeRequested: false })).toBeNull();
    expect(namingBanner(null)).toBeNull();
  });

  it("falls back to the raw string for an unparseable timestamp", () => {
    expect(formatLocalTime("not a date")).toBe("not a date");
  });
});

describe("result summary", () => {
  const result: ApplyResult = {
    renamed: 3,
    tokensCreated: 2,
    tokensReused: 1,
    bound: 5,
    skipped: [],
    snapshotDiff: [],
    audit: "skipped",
  };

  it("names the step and shows only the counts that matter for it", () => {
    expect(stepTitle("rename")).toBe("Rename layers");
    expect(stepTitle("tokens")).toBe("Create tokens");
    expect(summarizeResult(result, "rename")).toBe("Rename layers applied. 3 renamed");
    expect(summarizeResult(result, "tokens")).toBe("Create tokens applied. 2 tokens created, 1 reused, 5 bound");
  });

  it("treats a skipped audit as neither PASS nor issues", () => {
    expect(auditView("skipped")).toEqual({ kind: "skipped", text: "Audit: not run in the rename step" });
    expect(auditView("PASS")).toEqual({ kind: "pass", text: "Audit: PASS" });
    expect(auditView(["raw fill on icon"])).toEqual({ kind: "issues", text: "Audit issues", lines: ["raw fill on icon"] });
  });
});

describe("adoptUnmatched / undoAdopt", () => {
  const u1 = unmatched();
  const u2 = unmatched({ key: "button/color/background|#EEEEEE", tokenName: "button/color/background", display: "button/color/background (#EEEEEE)", uses: [use("background")] });

  it("moves the row into tokens as a manual user token without mutating the input", () => {
    const p = proposal({ unmatched: [u1, u2] });
    const snapshot = JSON.parse(JSON.stringify(p));
    const out = adoptUnmatched(p, u1.key, "v9", "color/on-surface/1/enabled");
    expect(p).toEqual(snapshot);
    expect(out.unmatched.map((u) => u.key)).toEqual([u2.key]);
    expect(out.tokens).toHaveLength(3);
    expect(out.tokens[2]).toEqual({
      key: u1.key,
      name: "button/color/label/text",
      status: "new",
      type: "COLOR",
      alias: { desktop: "v9", mobile: "v9" },
      candidates: [],
      match: "manual",
      source: "user",
      replaces: "#123456",
      uses: u1.uses,
      note: "Changes the look: #123456 -> color/on-surface/1/enabled",
      skip: false,
    });
  });

  it("ignores an unknown key", () => {
    const p = proposal({ unmatched: [u1] });
    expect(adoptUnmatched(p, "nope", "v9", "x")).toBe(p);
  });

  it("undo restores the row at its original position and drops the token", () => {
    const p = proposal({ unmatched: [u1, u2] });
    const both = adoptUnmatched(adoptUnmatched(p, u1.key, "v9", "a"), u2.key, "v8", "b");
    const back = undoAdopt(both, u1.key, p);
    expect(back.unmatched.map((u) => u.key)).toEqual([u1.key]);
    expect(back.tokens.map((t) => t.key)).toEqual(["t1", "t2", u2.key]);
    expect(undoAdopt(back, u2.key, p)).toEqual(p);
  });

  it("does not undo tokens that did not come from an unmatched row", () => {
    const p = proposal({ unmatched: [u1] });
    expect(undoAdopt(p, "t1", p)).toBe(p);
  });

  it("collectProposal keeps adopted rows editable and valid", () => {
    const p = adoptUnmatched(proposal({ unmatched: [u1] }), u1.key, "v9", "a");
    const edits = {
      renames: [],
      tokens: [{ key: u1.key, name: "button/color/label/text", apply: true, aliasDesktop: "v9", aliasMobile: "v9" }],
    };
    const out = collectProposal(p, edits);
    expect(out.tokens[2]).toMatchObject({ match: "manual", source: "user", skip: false, alias: { desktop: "v9", mobile: "v9" } });
    expect(out.unmatched).toEqual([]);
    expect(findProblems(out)).toEqual([]);

    const unchecked = collectProposal(p, { renames: [], tokens: [{ ...edits.tokens[0], apply: false, name: "Bad Name" }] });
    expect(unchecked.tokens[2].skip).toBe(true);
    expect(findProblems(unchecked)).toEqual([]);

    const invalid = collectProposal(p, { renames: [], tokens: [{ ...edits.tokens[0], aliasMobile: null }] });
    expect(findProblems(invalid)).toHaveLength(1);
  });
});

describe("unmatchedOptions", () => {
  const semantic = [
    { id: "g1", name: "color/neutral/100", collection: "_global", type: "COLOR" as const },
    { id: "s1", name: "color/surface/1", collection: "color", type: "COLOR" as const },
    { id: "b1", name: "color/on-background/1", collection: "color", type: "COLOR" as const },
    { id: "o1", name: "color/on-surface/1/enabled", collection: "color", type: "COLOR" as const },
    { id: "r1", name: "color/border/subtle", collection: "color", type: "COLOR" as const },
    { id: "d1", name: "padding/m", collection: "dimensions", type: "FLOAT" as const },
  ];
  const ids = (groups: ReturnType<typeof unmatchedOptions>) => groups.map((g) => [g.label, g.options.map((o) => o.id)]);

  it("lists only the text family for text and icon, in surface order", () => {
    expect(ids(unmatchedOptions(unmatched(), semantic))).toEqual([["Fits text", ["b1", "o1"]]]);
    expect(ids(unmatchedOptions(unmatched({ uses: [use("icon")] }), semantic))[0]).toEqual(["Fits icon", ["b1", "o1"]]);
  });

  it("lists only surfaces for backgrounds and borders for borders", () => {
    const withPage = [...semantic, { id: "p1", name: "color/background/primary", collection: "color", type: "COLOR" as const }, { id: "t1", name: "color/transparent", collection: "_global", type: "COLOR" as const }];
    expect(ids(unmatchedOptions(unmatched({ uses: [use("background")] }), withPage))).toEqual([["Fits background", ["p1", "s1"]]]);
    expect(ids(unmatchedOptions(unmatched({ uses: [use("border")] }), withPage))).toEqual([["Fits border", ["r1", "t1"]]]);
  });

  it("lists the surface pair first for text, then the rest of the family", () => {
    const pairOptions = ["o1"];
    expect(ids(unmatchedOptions(unmatched({ pairOptions }), semantic))).toEqual([
      ["Pairs with the surface", ["o1"]],
      ["Fits text", ["b1"]],
    ]);
  });

  it("groups only by collection for other roles and numbers", () => {
    expect(ids(unmatchedOptions(unmatched({ uses: [use("other")] }), semantic))).toEqual([
      ["_global", ["g1"]],
      ["color", ["s1", "b1", "o1", "r1"]],
    ]);
    expect(ids(unmatchedOptions(unmatched({ type: "FLOAT", uses: [] }), semantic))).toEqual([["dimensions", ["d1"]]]);
  });
});

describe("lookChangeView", () => {
  const result: ApplyResult = { renamed: 0, tokensCreated: 1, tokensReused: 0, bound: 1, skipped: [], snapshotDiff: ["label fill #123456 -> #222222"], audit: "PASS" };

  it("is unchanged without a diff", () => {
    expect(lookChangeView({ ...result, snapshotDiff: [] }, proposal())).toEqual({ kind: "unchanged" });
  });

  it("is intended only when an applied manual row exists", () => {
    const manual = proposal({ tokens: [token({ match: "manual", source: "user" })] });
    expect(lookChangeView(result, manual)).toEqual({ kind: "intended", lines: result.snapshotDiff });
    expect(lookChangeView(result, proposal())).toEqual({ kind: "loud", lines: result.snapshotDiff });
    expect(lookChangeView(result, proposal({ tokens: [token({ match: "manual", skip: true })] })).kind).toBe("loud");
    expect(lookChangeView(result, null).kind).toBe("loud");
  });
});

describe("role-default suggestion in the review", () => {
  const semantic = [
    { id: "c:on1", name: "color/on-surface/1/enabled", collection: "color", type: "COLOR" as const },
    { id: "c:s1", name: "color/surface/1/enabled", collection: "color", type: "COLOR" as const },
  ];
  const suggested = unmatched({
    reason: "No color token is #123456.",
    suggestion: { variableId: "c:on1", variableName: "color/on-surface/1/enabled", reason: "Text on surface 1 uses on-surface/1/enabled (#001B4D)." },
  });

  it("pre-selects the suggestion and shows its reason after the no-exact line", () => {
    expect(rawRow(suggested, semantic)).toMatchObject({
      selected: "c:on1",
      suggested: true,
      reason: "No color token is #123456. Text on surface 1 uses on-surface/1/enabled (#001B4D).",
    });
  });

  it("selects nothing without a suggestion or when the suggested variable is not offered", () => {
    expect(rawRow(unmatched(), semantic)).toMatchObject({ selected: null, suggested: false, reason: "No close semantic color" });
    expect(rawRow(suggested, semantic.slice(1))).toMatchObject({ selected: null, suggested: false, reason: "No color token is #123456." });
  });

  it("adopts every suggested row with Use all, each one undoable, and leaves the rest raw", () => {
    const bg = unmatched({
      key: "button/color/background|#FFF07E",
      tokenName: "button/color/background",
      display: "button/color/background (#FFF07E)",
      uses: [use("background")],
      suggestion: { variableId: "c:s1", variableName: "color/surface/1/enabled", reason: "Closest." },
    });
    const plain = unmatched({ key: "button/color/x|#FF00FF", tokenName: "button/color/x", display: "x" });
    const base = proposal({ tokens: [], unmatched: [suggested, bg, plain] });
    expect(suggestedKeys(base)).toEqual([suggested.key, bg.key]);
    const all = adoptAllSuggestions(base);
    expect(all.unmatched.map((u) => u.key)).toEqual([plain.key]);
    expect(all.tokens.map((t) => [t.key, t.alias.desktop, t.match, t.source])).toEqual([
      [suggested.key, "c:on1", "manual", "user"],
      [bg.key, "c:s1", "manual", "user"],
    ]);
    const undone = undoAdopt(all, bg.key, base);
    expect(undone.unmatched.map((u) => u.key)).toEqual([bg.key, plain.key]);
    expect(undone.tokens.map((t) => t.key)).toEqual([suggested.key]);
  });
});
