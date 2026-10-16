import { describe, expect, it } from "vitest";
import {
  adoptUnmatched,
  buildReviewModel,
  canApply,
  collectProposal,
  countsText,
  editedModel,
  emptyReviewText,
  initialEdits,
  splitRawDisplay,
  storedBannerText,
  trackAdopted,
} from "../../src/review";
import type { Proposal, TokenProposal, UnmatchedValue } from "../../src/types";

function token(over: Partial<TokenProposal> = {}): TokenProposal {
  return {
    key: "t1",
    name: "button/color/primary/background",
    status: "new",
    type: "COLOR",
    alias: { desktop: "v1", mobile: "v1" },
    candidates: [],
    match: "exact",
    source: "match",
    replaces: "#0059FF",
    uses: [],
    note: null,
    skip: false,
    ...over,
  };
}

const unmatched: UnmatchedValue = {
  key: "button/color/label/text|#123456",
  tokenName: "button/color/label/text",
  type: "COLOR",
  display: "button/color/label/text (#123456)",
  uses: [],
  reason: "No close semantic color",
  suggestion: null,
};

function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    componentId: "1:1",
    componentName: "Button",
    newComponentName: "button",
    renames: [
      { indexPath: [0], oldName: "Frame 1", newName: "container", reason: "frame", skip: false, source: "rules", outsideVocabulary: false },
    ],
    tokens: [token()],
    unmatched: [],
    typography: [{ key: "ty1", role: "label/s", match: "exact", bindings: {}, uses: [], note: null, skip: false }],
    warnings: [],
    ...over,
  };
}

describe("initialEdits + editedModel", () => {
  it("starts with every row as proposed and round-trips unchanged", () => {
    const p = proposal();
    const edits = initialEdits(buildReviewModel(p, []));
    expect(edits).toEqual({
      newComponentName: "button",
      renames: [{ index: 0, newName: "container", apply: true }],
      tokens: [{ key: "t1", name: "button/color/primary/background", apply: true, aliasDesktop: "v1", aliasMobile: "v1" }],
      typography: [{ key: "ty1", apply: true }],
    });
    expect(editedModel(p, [], edits)).toEqual(buildReviewModel(p, []));
  });

  it("lays edits over the model and splits modes once the aliases differ", () => {
    const p = proposal();
    const edits = initialEdits(buildReviewModel(p, []));
    edits.newComponentName = "primary-button";
    edits.renames[0] = { index: 0, newName: "wrapper", apply: false };
    edits.tokens[0] = { ...edits.tokens[0], aliasMobile: "v2" };
    edits.typography = [{ key: "ty1", apply: false }];
    const model = editedModel(p, [], edits);
    expect(model.newComponentName).toBe("primary-button");
    expect(model.renames[0]).toMatchObject({ newName: "wrapper", apply: false });
    expect(model.tokens[0]).toMatchObject({ aliasDesktop: "v1", aliasMobile: "v2", splitModes: true });
    expect(model.typography[0].apply).toBe(false);
  });

  it("keeps the component name null when the proposal keeps it", () => {
    const p = proposal({ newComponentName: null });
    expect(editedModel(p, [], { newComponentName: "x", renames: [], tokens: [] }).newComponentName).toBeNull();
  });
});

describe("trackAdopted", () => {
  it("adds an edit for an adopted row once", () => {
    const p = adoptUnmatched(proposal({ unmatched: [unmatched] }), unmatched.key, "v9", "surface/1");
    const edits = trackAdopted({ renames: [], tokens: [] }, p, unmatched.key);
    expect(edits.tokens).toEqual([
      { key: unmatched.key, name: "button/color/label/text", apply: true, aliasDesktop: "v9", aliasMobile: "v9" },
    ]);
    expect(trackAdopted(edits, p, unmatched.key)).toBe(edits);
    expect(trackAdopted(edits, p, "missing")).toBe(edits);
  });
});

describe("countsText", () => {
  it("counts renames in step 1", () => {
    expect(countsText("rename", { renames: 1, tokens: 0, typography: 0 }, 0)).toBe("1 rename");
    expect(countsText("rename", { renames: 3, tokens: 0, typography: 0 }, 2)).toBe("3 renames · 2 problems to fix");
  });

  it("counts tokens and text styles in step 2", () => {
    expect(countsText("tokens", { renames: 0, tokens: 0, typography: 0 }, 0)).toBe("0 tokens");
    expect(countsText("tokens", { renames: 0, tokens: 1, typography: 1 }, 1)).toBe("1 token · 1 text style · 1 problem to fix");
    expect(countsText("tokens", { renames: 0, tokens: 4, typography: 2 }, 0)).toBe("4 tokens · 2 text styles");
  });
});

describe("canApply", () => {
  it("needs at least one change", () => {
    const off = proposal({
      newComponentName: "Button",
      renames: [],
      tokens: [token({ skip: true })],
      typography: [],
    });
    expect(canApply(off)).toBe(false);
    expect(canApply({ ...off, newComponentName: "button" })).toBe(true);
    expect(canApply(proposal())).toBe(true);
  });

  it("is blocked by validation problems", () => {
    const p = proposal();
    const bad = collectProposal(p, {
      renames: [{ index: 0, newName: " ", apply: true }],
      tokens: [{ key: "t1", name: "Bad Name", apply: true, aliasDesktop: "v1", aliasMobile: null }],
    });
    expect(canApply(bad)).toBe(false);
  });
});

describe("texts", () => {
  it("describes a stored Claude proposal per step", () => {
    expect(storedBannerText({ phase: "rename", count: 4 })).toBe("Claude updated the layer names (4)");
    expect(storedBannerText({ phase: "tokens", count: 2 })).toBe("Claude suggested tokens (2)");
  });

  it("explains an empty review", () => {
    expect(emptyReviewText("rename", true)).toBe("No rows to apply; check the warnings above.");
    expect(emptyReviewText("rename", false)).toBe("Nothing to rename, all layer names follow the convention.");
    expect(emptyReviewText("tokens", false)).toBe("Nothing to tokenize, every value is already bound to a token.");
  });

  it("splits a raw display into value and token", () => {
    expect(splitRawDisplay("button/color/bg (#0059FF)")).toEqual({ value: "#0059FF", token: "button/color/bg" });
    expect(splitRawDisplay("#0059FF @50%")).toBeNull();
  });
});
