import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import {
  hexWithAlpha,
  imageScale,
  nameClass,
  summarizeLayers,
  tokensPayload,
  validateRenames,
  validateTokenSuggestions,
} from "../../src/studioTools";
import type { ComponentScan } from "../../src/types";
import { frame, hstack, instance, paint, text, tree } from "../naming/build";
import { layer, makeCatalog, numUse } from "../tokens/fixtures";

const deep = (depth: number) => {
  let n = frame("leaf");
  for (let i = 0; i < depth; i++) n = frame(`level ${i}`, [n]);
  return n;
};

const reference = tree(
  hstack("card", [
    text("Text", "Hello world"),
    frame("nav", [instance("btn", "_button/primary")], { fills: [paint("#0059FF"), paint("#000000", 0.5)] }),
    frame("actions"),
  ]),
);

describe("nameClass", () => {
  it("separates unnamed, vocabulary and deliberate names", () => {
    expect(nameClass(reference.children[0], "card")).toBe("unnamed");
    expect(nameClass(reference.children[1], "card")).toBe("deliberate");
    expect(nameClass(reference.children[2], "card")).toBe("vocabulary");
  });
});

describe("summarizeLayers", () => {
  it("lists the tree with paths, raw types, text, fills and name classes", () => {
    const rows = summarizeLayers(reference, (id) => (id === "1:1-0" ? "INSTANCE" : undefined));
    expect(rows.map((r) => r.path)).toEqual(["", "0", "1", "1.0", "2"]);
    expect(rows[0].nameClass).toBeUndefined();
    expect(rows[0].layout).toMatch(/^HORIZONTAL gap 0 pad 0\/0\/0\/0/);
    expect(rows[1]).toMatchObject({ type: "TEXT", text: "Hello world", fontSize: 16, nameClass: "unnamed" });
    expect(rows[2].fills).toEqual(["#0059FF", "#00000080"]);
    expect(rows[3]).toMatchObject({ indexPath: [1, 0], id: "1:1-0", type: "INSTANCE", mainComponent: "_button/primary" });
  });

  it("stops at depth 6 and cuts long text", () => {
    const rows = summarizeLayers(tree(frame("root", [deep(8), text("Text", "x".repeat(200))])), () => undefined);
    expect(Math.max(...rows.map((r) => r.indexPath.length))).toBe(6);
    expect(rows.find((r) => r.type === "TEXT")!.text).toHaveLength(80);
  });
});

describe("validateRenames", () => {
  it("keeps valid rows with node ids and reports stale or empty ones", () => {
    const { renames, staleRows } = validateRenames(reference, [
      { indexPath: [0], oldName: "Text", newName: " title ", reason: "heading", outsideVocabulary: false },
      { indexPath: [1], oldName: "navigation", newName: "navbar", reason: "", outsideVocabulary: false },
      { indexPath: [5], oldName: "x", newName: "y", reason: "" },
      { indexPath: [2], oldName: "actions", newName: "  " },
      { indexPath: "0", oldName: "Text", newName: "title" },
    ]);
    expect(renames).toEqual([
      { indexPath: [0], nodeId: "1:0", oldName: "Text", newName: "title", reason: "heading", outsideVocabulary: false },
    ]);
    expect(staleRows.map((r) => r.problem)).toEqual([
      'Layer at [1] is named "nav", not "navigation".',
      "No layer at [5] in the reference variant.",
      "newName is empty.",
      "indexPath is not a list of child indexes.",
    ]);
  });
});

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
        uses: [
          numUse("v:chip", [], "chip", "itemSpacing", 100),
          numUse("v:chip", [], "chip", "counterAxisSpacing", 100),
          numUse("v:chip", [], "chip", "paddingLeft", 16),
        ],
      },
    ],
  };
}

describe("validateTokenSuggestions", () => {
  const catalog = makeCatalog();
  const proposal = buildProposal(chipScan(), catalog, [], "chip");
  const tokenKey = proposal.tokens[0].key;

  it("accepts known keys with a fitting semantic variable and rejects the rest", () => {
    const { suggestions, rejected } = validateTokenSuggestions(proposal, catalog, [
      { key: "chip/spacing/gap|100", variableId: "d:gap/m", reason: "largest" },
      { key: tokenKey, variableId: "c:color/border/brand", reason: "" },
      { key: tokenKey, variableId: "g:color/brand blue/60", reason: "" },
      { key: tokenKey, variableId: "missing", reason: "" },
      { key: tokenKey, variableId: "g:metrics/400", reason: "" },
      { key: "chip/spacing/gap|100", variableId: "d:gap/s", reason: "" },
      { key: "nope", variableId: "d:gap/m", reason: "" },
      { key: 1, variableId: "d:gap/m" },
    ]);
    expect(suggestions).toEqual([
      { key: "chip/spacing/gap|100", variableId: "d:gap/m", variableName: "gap/m", reason: "largest" },
      { key: tokenKey, variableId: "g:metrics/400", variableName: "metrics/400", reason: "" },
    ]);
    expect(rejected.map((r) => r.reason)).toEqual([
      "color/border/brand is COLOR, the value needs FLOAT.",
      "color/brand blue/60 (_global) is not a semantic variable a token may alias.",
      "Variable missing is not in this file.",
      "Duplicate key; only the first suggestion is kept.",
      "Unknown key; use a key from studio_get_tokens (tokens or unmatched).",
      "key and variableId must be strings.",
    ]);
  });
});

describe("tokensPayload", () => {
  it("is compact: alias names, deduped uses, only aliasable semantic variables", () => {
    const catalog = makeCatalog();
    const out = tokensPayload(buildProposal(chipScan(), catalog, [], "chip"), catalog);
    expect(out.tokens[0]).toEqual({
      key: out.tokens[0].key,
      name: out.tokens[0].name,
      match: "exact",
      source: "match",
      replaces: "16",
      aliasDesktop: "padding/m",
      aliasMobile: "padding/m",
      note: expect.any(String),
    });
    expect(out.unmatched).toEqual([
      expect.objectContaining({
        key: "chip/spacing/gap|100",
        suggestion: { variableId: "d:gap/m", variableName: "gap/m", reason: "Nearest is gap/m (16)." },
        uses: [
          { layerName: "chip", field: "counterAxisSpacing" },
          { layerName: "chip", field: "itemSpacing" },
        ],
      }),
    ]);
    const names = out.semantic.map((s) => s.name);
    expect(names).toContain("color/transparent");
    expect(names).toContain("metrics/400");
    expect(names).not.toContain("color/brand blue/60");
    expect(out.semantic.find((s) => s.name === "color/transparent")).toMatchObject({ light: "#00000000", dark: "#00000000" });
    expect(out.semantic.find((s) => s.name === "color/surface/1/enabled")).toMatchObject({ light: "#FFFFFF", dark: "#1A1A1A" });
    expect(out.semantic.find((s) => s.name === "gap/m")).toMatchObject({ desktop: 16, mobile: 16 });
  });
});

describe("helpers", () => {
  it("hexWithAlpha appends alpha only below 1", () => {
    expect(hexWithAlpha("#FFFFFF", 1)).toBe("#FFFFFF");
    expect(hexWithAlpha("#FFFFFF", 0)).toBe("#FFFFFF00");
  });

  it("imageScale keeps the longest side at most 1600 px", () => {
    expect(imageScale(400, 300)).toBe(1);
    expect(imageScale(3200, 800)).toBe(0.5);
    expect(imageScale(800, 6400)).toBe(0.25);
  });
});
