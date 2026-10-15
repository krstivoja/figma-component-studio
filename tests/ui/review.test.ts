import { describe, expect, it } from "vitest";
import {
  auditView,
  buildReviewModel,
  collectProposal,
  findProblems,
  stepTitle,
  summarizeResult,
  validateTokenName,
} from "../../src/review";
import type { ApplyResult, Proposal, TokenProposal } from "../../src/types";

function token(over: Partial<TokenProposal> = {}): TokenProposal {
  return {
    key: "t1",
    name: "button/color/primary/background",
    status: "new",
    type: "COLOR",
    alias: { desktop: "v1", mobile: "v1" },
    candidates: ["v2"],
    match: "exact",
    replaces: "#0059FF",
    uses: [],
    note: null,
    skip: false,
    ...over,
  };
}

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    componentId: "1:1",
    componentName: "Button",
    newComponentName: "button",
    renames: [
      { indexPath: [0], oldName: "Frame 1", newName: "container", reason: "auto-layout frame", skip: false },
      { indexPath: [0, 1], oldName: "Text", newName: "label", reason: "text layer", skip: false },
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
      unmatched: [{ display: "#123456", uses: [], reason: "image fill" }],
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
    expect(stepTitle("rename")).toBe("Step 1: rename layers");
    expect(stepTitle("tokens")).toBe("Step 2: create tokens");
    expect(summarizeResult(result, "rename")).toBe("Step 1: rename layers applied. 3 renamed");
    expect(summarizeResult(result, "tokens")).toBe("Step 2: create tokens applied. 2 tokens created, 1 reused, 5 bound");
  });

  it("treats a skipped audit as neither PASS nor issues", () => {
    expect(auditView("skipped")).toEqual({ kind: "skipped", text: "Audit: not run in the rename step" });
    expect(auditView("PASS")).toEqual({ kind: "pass", text: "Audit: PASS" });
    expect(auditView(["raw fill on icon"])).toEqual({ kind: "issues", text: "Audit issues", lines: ["raw fill on icon"] });
  });
});
