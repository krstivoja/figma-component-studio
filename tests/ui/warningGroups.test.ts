import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import { conflictSummaryText, groupWarnings } from "../../src/review";
import { parseValueConflict, valueConflictWarning } from "../../src/tokenNames";
import type { ComponentScan, RawValueUse } from "../../src/types";
import { layer, makeCatalog, numUse } from "../tokens/fixtures";

const V = "v:seg";

// Three segments named alike with widths that differ by sub-pixels and by real amounts.
function scanWith(widths: number[]): ComponentScan {
  const root = layer("segmented", "COMPONENT", [], widths.map((_, i) => layer("segment", "FRAME", [i])));
  const uses: RawValueUse[] = widths.map((w, i) => numUse(V, [i], "segment", "itemSpacing", w));
  return { id: "1:0", name: "segmented", kind: "COMPONENT", variantProperties: {}, variants: [{ id: V, props: {}, root, uses }] };
}

const conflicts = (widths: number[]) => buildProposal(scanWith(widths), makeCatalog(), [], "segmented").warnings.filter((w) => parseValueConflict(w));

describe("maps to different values: rounded for reading", () => {
  it("rounds to 2 decimals, merges values that round alike and sorts numerically", () => {
    expect(conflicts([16.666015625, 16.66666603088379, 20, 24, 40, 8])).toEqual([
      'Token name "segmented/segment/spacing/gap" maps to different values (8, 16.67, 20, 24, 40); rename one row before applying.',
    ]);
  });

  it("says so when the values differ by sub-pixels only", () => {
    expect(conflicts([16.666015625, 16.66666603088379])[0]).toContain("(16.67 with sub-pixel differences)");
  });
});

describe("groupWarnings", () => {
  const a = valueConflictWarning("x/color/text", ["#000000", "#111111"]);
  const b = valueConflictWarning("x/spacing/gap", ["4", "8"]);

  it("parses its own message", () => {
    expect(parseValueConflict(b)).toEqual({ name: "x/spacing/gap", values: "4, 8" });
    expect(parseValueConflict("Something else.")).toBeNull();
  });

  it("collapses two or more conflicts and keeps the other warnings in order", () => {
    expect(groupWarnings(["first", a, "second", b])).toEqual({
      other: ["first", "second"],
      conflicts: [
        { name: "x/color/text", values: "#000000, #111111" },
        { name: "x/spacing/gap", values: "4, 8" },
      ],
    });
    expect(conflictSummaryText(2)).toBe("2 token names map to different values; rename one row of each before applying.");
  });

  it("a single conflict stays a plain line", () => {
    expect(groupWarnings(["first", a])).toEqual({ other: ["first", a], conflicts: [] });
  });
});
