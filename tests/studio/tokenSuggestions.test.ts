import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import { applyTokenSuggestions, parseStoredTokenSuggestions } from "../../src/storedProposal";
import type { ComponentScan, StoredTokenSuggestions } from "../../src/types";
import { componentVar, layer, makeCatalog, numUse } from "../tokens/fixtures";

function chipScan(): ComponentScan {
  const root = layer("chip", "COMPONENT", [], [layer("label", "TEXT", [0])]);
  return {
    id: "c:chip",
    name: "chip",
    kind: "COMPONENT",
    variantProperties: {},
    variants: [
      {
        id: "v:chip",
        props: {},
        root,
        uses: [numUse("v:chip", [], "chip", "itemSpacing", 100), numUse("v:chip", [], "chip", "paddingLeft", 16)],
      },
    ],
  };
}

const catalog = makeCatalog();
const base = () => buildProposal(chipScan(), catalog, [], "chip");
const GAP_KEY = "chip/spacing/gap|100";

function stored(over: Partial<StoredTokenSuggestions> = {}): string {
  const s: StoredTokenSuggestions = {
    version: 1,
    source: "claude",
    createdAt: "2026-10-15T10:00:00Z",
    rootId: "1:0",
    structureHash: "abc",
    suggestions: [{ key: GAP_KEY, variableId: "d:gap/m", variableName: "gap/m", reason: "largest gap step" }],
    ...over,
  };
  return JSON.stringify(s);
}

describe("parseStoredTokenSuggestions", () => {
  const ctx = { rootId: "1:0", hash: "abc" };

  it("parses a valid payload without warnings", () => {
    const r = parseStoredTokenSuggestions(stored(), ctx);
    expect(r).toEqual({
      suggestions: [{ key: GAP_KEY, variableId: "d:gap/m", variableName: "gap/m", reason: "largest gap step" }],
      warnings: [],
    });
  });

  it("ignores bad JSON, wrong version and another root", () => {
    expect(parseStoredTokenSuggestions("{", ctx)).toHaveProperty("ignored");
    expect(parseStoredTokenSuggestions(stored({ version: 2 as 1 }), ctx)).toHaveProperty("ignored");
    expect(parseStoredTokenSuggestions(stored({ rootId: "9:9" }), ctx)).toHaveProperty("ignored");
  });

  it("only warns when the structure hash differs, and drops rows without key", () => {
    const raw = stored({
      structureHash: "zzz",
      suggestions: [
        { key: "", variableId: "d:gap/m", variableName: "", reason: "" },
        { key: GAP_KEY, variableId: "d:gap/m", variableName: "gap/m", reason: "" },
      ],
    });
    const r = parseStoredTokenSuggestions(raw, ctx);
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.suggestions).toHaveLength(1);
    expect(r.warnings).toHaveLength(2);
    expect(r.warnings[0]).toMatch(/Layers changed/);
  });
});

describe("applyTokenSuggestions", () => {
  it("moves an unmatched value into tokens as a manual Claude token", () => {
    const p = base();
    expect(p.unmatched.map((u) => u.key)).toEqual([GAP_KEY]);
    const out = applyTokenSuggestions(p, [{ key: GAP_KEY, variableId: "d:gap/m", variableName: "gap/m", reason: "largest gap step" }], catalog);
    expect(out.unmatched).toEqual([]);
    const t = out.tokens.find((x) => x.key === GAP_KEY)!;
    expect(t).toMatchObject({
      name: "chip/spacing/gap",
      status: "new",
      type: "FLOAT",
      alias: { desktop: "d:gap/m", mobile: "d:gap/m" },
      match: "manual",
      source: "claude",
      replaces: "100",
      note: "largest gap step",
      skip: false,
    });
    expect(t.uses).toEqual(p.unmatched[0].uses);
    expect(out.tokens.map((x) => x.name)).toEqual([...out.tokens.map((x) => x.name)].sort());
  });

  it("lets a Claude suggestion win over the rule suggestion for the same key", () => {
    const p = base();
    expect(p.unmatched[0].suggestion?.variableId).toBe("d:gap/m");
    const out = applyTokenSuggestions(p, [{ key: GAP_KEY, variableId: "d:gap/xs", variableName: "gap/xs", reason: "tight" }], catalog);
    expect(out.unmatched).toEqual([]);
    expect(out.tokens.find((x) => x.key === GAP_KEY)!.alias).toEqual({ desktop: "d:gap/xs", mobile: "d:gap/xs" });
  });

  it("marks the new token existing when the components collection has it", () => {
    const withExisting = makeCatalog([componentVar("chip/spacing/gap", "FLOAT", { number: 100 })]);
    const p = buildProposal(chipScan(), withExisting, [], "chip");
    const out = applyTokenSuggestions(p, [{ key: GAP_KEY, variableId: "d:gap/m", variableName: "", reason: "" }], withExisting);
    expect(out.tokens.find((x) => x.key === GAP_KEY)!.status).toBe("existing");
  });

  it("swaps the alias of an existing token: same value stays exact, another value is manual", () => {
    const p = base();
    const padding = p.tokens.find((t) => t.replaces === "16")!;
    expect(padding.match).toBe("exact");

    const same = applyTokenSuggestions(p, [{ key: padding.key, variableId: "d:gap/m", variableName: "", reason: "gap scale" }], catalog);
    const s = same.tokens.find((t) => t.key === padding.key)!;
    expect(s).toMatchObject({ alias: { desktop: "d:gap/m", mobile: "d:gap/m" }, match: "exact", source: "claude", note: "gap scale" });
    expect(s.candidates).toContain(padding.alias.desktop);

    const other = applyTokenSuggestions(p, [{ key: padding.key, variableId: "d:padding/l", variableName: "", reason: "" }], catalog);
    expect(other.tokens.find((t) => t.key === padding.key)!.match).toBe("manual");
  });

  it("warns about unknown keys, wrong types and non-semantic variables, changing nothing", () => {
    const p = base();
    const out = applyTokenSuggestions(
      p,
      [
        { key: "chip/spacing/gap|999", variableId: "d:gap/m", variableName: "", reason: "" },
        { key: GAP_KEY, variableId: "c:color/border/brand", variableName: "", reason: "" },
      ],
      catalog,
    );
    expect(out.tokens).toEqual(p.tokens);
    expect(out.unmatched).toEqual(p.unmatched);
    expect(out.warnings.slice(p.warnings.length)).toEqual([
      expect.stringMatching(/chip\/spacing\/gap\|999.*no longer a value/),
      expect.stringMatching(/is COLOR, the value needs FLOAT/),
    ]);
  });
});
