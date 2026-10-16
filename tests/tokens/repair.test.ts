import { describe, expect, it } from "vitest";
import { buildProposal } from "../../src/proposal";
import { adoptUnmatched, collectProposal, mergeRepaired, surfaceChoices } from "../../src/review";
import { collectBoundUses, collectUses } from "../../src/scan";
import type { Catalog, CatalogVariable, ComponentScan } from "../../src/types";
import { layer } from "./fixtures";

const color = (name: string, light: string): CatalogVariable => ({
  id: `c:${name}`,
  name,
  collection: "color",
  type: "COLOR",
  values: { light: { hex: light, opacity: 1 } },
});
const S1 = color("color/surface/1/enabled", "#FFFFFF");
const WARNING = color("color/surface/feedback/warning", "#FFF89D");
const ON_1 = color("color/on-surface/1/enabled", "#001B4D");
const ON_WARNING = color("color/on-surface/feedback/warning", "#3D3200");
const catalog: Catalog = { variables: [S1, WARNING, ON_1, ON_WARNING], componentsCollectionId: "col", componentsModes: { desktop: "d", mobile: "m" } };

// Yellow card: the root fill matches no surface, the text is the navy of on-surface/1.
function card(): ComponentScan {
  const text = layer("label", "TEXT", [0]);
  text.fills = [{ hex: "#001B4D", opacity: 1, boundVariableId: null }];
  const root = layer("card", "COMPONENT", [], [text]);
  root.height = 200;
  root.fills = [{ hex: "#FFF07E", opacity: 1, boundVariableId: null }];
  return { id: "c", name: "card", kind: "COMPONENT", variantProperties: {}, variants: [{ id: "v", props: {}, root, uses: collectUses("v", root), boundUses: collectBoundUses("v", root) }] };
}

describe("re-pairing text after a background choice in the review", () => {
  it("pairs text with the closest surface first, then with the background the user picked", () => {
    const p = buildProposal(card(), catalog, [], "card");
    const text = p.unmatched.find((u) => u.tokenName === "card/color/text")!;
    expect(text.suggestion?.variableId).toBe(ON_WARNING.id);

    const bgKey = p.unmatched.find((u) => u.tokenName === "card/color/background")!.key;
    const adopted = adoptUnmatched(p, bgKey, S1.id, S1.name);
    const assume = surfaceChoices(collectProposal(adopted, { renames: [], tokens: [] }));
    expect(assume).toEqual([{ key: bgKey, apply: true, alias: { desktop: S1.id, mobile: S1.id } }]);

    const repaired = buildProposal(card(), catalog, [], "card", assume);
    expect(repaired.tokens.map((t) => [t.name, t.match, t.alias.desktop])).toEqual([["card/color/text", "exact", ON_1.id]]);

    const merged = mergeRepaired({ original: adopted, edits: { renames: [], tokens: [] } }, repaired);
    expect(merged.original.tokens.map((t) => [t.name, t.source])).toEqual([
      ["card/color/text", "match"],
      ["card/color/background", "user"],
    ]);
    expect(merged.edits.tokens.map((e) => [e.key, e.apply])).toEqual(merged.original.tokens.map((t) => [t.key, !t.skip]));
  });
});
