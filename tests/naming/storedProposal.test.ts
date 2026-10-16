import { describe, expect, it } from "vitest";
import { mergeRenames, parseStoredProposal } from "../../src/storedProposal";
import type { LayerRename, StoredNamingProposal } from "../../src/types";
import { proposeLayerNames } from "../../src/naming";
import { frame, text, tree, vstack } from "./build";

const reference = tree(frame("Card", [text("Text", "Hello"), frame("Frame 1", [text("Text", "Sub")])]));
const ctx = { rootId: "1:0", hash: "abc", reference };

function stored(over: Partial<StoredNamingProposal> = {}): string {
  const p: StoredNamingProposal = {
    version: 1,
    source: "claude",
    createdAt: "2026-10-15T10:00:00Z",
    rootId: "1:0",
    rootName: "Card",
    structureHash: "abc",
    componentName: "card",
    renames: [
      { indexPath: [0], nodeId: "1:0", oldName: "Text", newName: "title", reason: "heading", outsideVocabulary: false },
      { indexPath: [1], nodeId: "1:1", oldName: "Frame 1", newName: "card-body", reason: "body", outsideVocabulary: true },
    ],
    ...over,
  };
  return JSON.stringify(p);
}

const row = (indexPath: number[], newName: string, source: "claude" | "rules"): LayerRename => ({
  indexPath,
  oldName: "x",
  newName,
  reason: "",
  skip: false,
  source,
  outsideVocabulary: false,
});

describe("parseStoredProposal", () => {
  it("ignores invalid JSON", () => {
    expect(parseStoredProposal("{nope", ctx)).toHaveProperty("ignored");
  });

  it("ignores a wrong version", () => {
    expect(parseStoredProposal(stored({ version: 2 as 1 }), ctx)).toHaveProperty("ignored");
  });

  it("ignores a proposal for another root", () => {
    expect(parseStoredProposal(stored({ rootId: "9:9" }), ctx)).toHaveProperty("ignored");
  });

  it("parses a valid proposal", () => {
    const r = parseStoredProposal(stored(), ctx);
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.componentName).toBe("card");
    expect(r.naming).toEqual({ source: "claude", createdAt: "2026-10-15T10:00:00Z" });
    expect(r.warnings).toEqual([]);
    expect(r.renames).toEqual([
      { indexPath: [0], oldName: "Text", newName: "title", reason: "heading", skip: false, source: "claude", outsideVocabulary: false },
      { indexPath: [1], oldName: "Frame 1", newName: "card-body", reason: "body", skip: false, source: "claude", outsideVocabulary: true },
    ]);
  });

  it("unchecks a stale row whose oldName no longer matches", () => {
    const r = parseStoredProposal(
      stored({ renames: [{ indexPath: [0], nodeId: "", oldName: "Heading", newName: "title", reason: "r", outsideVocabulary: false }] }),
      ctx,
    );
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.renames[0].skip).toBe(true);
    expect(r.renames[0].reason).toMatch(/^Stale: /);
  });

  it("unchecks a row whose indexPath is missing", () => {
    const r = parseStoredProposal(
      stored({ renames: [{ indexPath: [5, 2], nodeId: "", oldName: "Text", newName: "title", reason: "r", outsideVocabulary: false }] }),
      ctx,
    );
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.renames[0].skip).toBe(true);
    expect(r.renames[0].reason).toMatch(/^Stale: no layer/);
  });

  it("warns when the structure hash differs", () => {
    const r = parseStoredProposal(stored({ structureHash: "other" }), ctx);
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.warnings).toContain("Layers changed since Claude proposed these names; changed rows are unchecked.");
  });

  it("drops empty names with a warning and drops no-op renames", () => {
    const r = parseStoredProposal(
      stored({
        componentName: null,
        renames: [
          { indexPath: [0], nodeId: "", oldName: "Text", newName: "  ", reason: "", outsideVocabulary: false },
          { indexPath: [1], nodeId: "", oldName: "Frame 1", newName: "Frame 1", reason: "", outsideVocabulary: false },
        ],
      }),
      ctx,
    );
    if ("ignored" in r) throw new Error(r.ignored);
    expect(r.renames).toEqual([]);
    expect(r.componentName).toBeNull();
    expect(r.warnings).toHaveLength(1);
  });
});

describe("mergeRenames", () => {
  it("lets Claude win, fills gaps with rules, sorts by indexPath", () => {
    const claude = [row([1, 0], "c-10", "claude"), row([0], "c-0", "claude")];
    const rules = [row([0], "r-0", "rules"), row([2], "r-2", "rules"), row([1], "r-1", "rules"), row([10], "r-10", "rules")];
    expect(mergeRenames(claude, rules).map((r) => [r.indexPath.join("."), r.newName])).toEqual([
      ["0", "c-0"],
      ["1", "r-1"],
      ["1.0", "c-10"],
      ["2", "r-2"],
      ["10", "r-10"],
    ]);
  });

  it("with a reference, rules fill only layers whose current name is Unnamed", () => {
    const ref = tree(
      vstack("card", [
        vstack("nav", [vstack("table-row", [text("label", "Home")]), vstack("Frame 2", [text("Text", "About")]), vstack("x", [text("y", "y")])]),
        vstack("Frame 9", [text("Hi", "Hi")]),
      ]),
    );
    const rules = proposeLayerNames(ref);
    expect(rules.map((r) => r.indexPath.join("."))).toEqual(["0", "0.0", "0.1", "0.1.0", "0.2.0", "1", "1.0"]);
    const claude = [row([0, 1], "c-01", "claude")];
    expect(mergeRenames(claude, rules, ref).map((r) => [r.indexPath.join("."), r.newName, r.source])).toEqual([
      ["0.1", "c-01", "claude"],
      ["0.1.0", "label", "rules"],
      ["0.2.0", "label", "rules"],
      ["1", "text-content", "rules"],
      ["1.0", "label", "rules"],
    ]);
  });
});
