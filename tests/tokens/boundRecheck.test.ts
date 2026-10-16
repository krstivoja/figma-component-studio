import { describe, expect, it } from "vitest";
import { creationOrder, mayChangeAlias, withoutBinding } from "../../src/apply";
import { buildProposal } from "../../src/proposal";
import { buildReviewModel, collectProposal, type SemanticOption } from "../../src/review";
import { classifyBinding, collectBoundUses, collectUses, stripMissingBindings } from "../../src/scan";
import type { Catalog, CatalogVariable, ComponentScan, LayerNode, RawValueUse, TokenProposal } from "../../src/types";
import { layer } from "./fixtures";

function color(name: string, light: string): CatalogVariable {
  return { id: `c:${name}`, name, collection: "color", type: "COLOR", values: { light: { hex: light, opacity: 1 }, dark: { hex: "#777777", opacity: 1 } } };
}

function component(name: string, target: CatalogVariable): CatalogVariable {
  const v = target.values.light;
  return { id: `k:${name}`, name, collection: "components", type: "COLOR", values: { desktop: v, mobile: v }, aliasOf: { desktop: target.id, mobile: target.id } };
}

const SURFACE_1 = color("color/surface/1/enabled", "#FFFFFF");
const SURFACE_3 = color("color/surface/3/enabled", "#E5E6F2");
const WARNING = color("color/surface/feedback/warning", "#FFF89D");
const ON_1 = color("color/on-surface/1/enabled", "#001B4D");
const ON_3 = color("color/on-surface/3/enabled", "#0B1F5C");

function coreCatalog(components: CatalogVariable[]): Catalog {
  return {
    variables: [
      color("color/background/primary", "#F7F7F7"),
      color("color/on-background/primary", "#0A0A0A"),
      SURFACE_1,
      color("color/surface/2/enabled", "#EEF2FA"),
      SURFACE_3,
      color("color/surface/3/hover", "#D9DAEA"),
      WARNING,
      ON_1,
      color("color/on-surface/1/disabled", "#8A94A6"),
      ON_3,
      color("color/on-surface/3/disabled", "#9AA0B5"),
      color("color/on-surface/3/dimmed", "#4A5578"),
      color("color/on-surface/feedback/warning/enabled", "#3D3200"),
      color("color/border/medium", "#B0B8C4"),
      ...components,
    ],
    componentsCollectionId: "col:components",
    componentsModes: { desktop: "m:desktop", mobile: "m:mobile" },
  };
}

const TEXT = component("card-marko/color/text", ON_1);
const BACKGROUND = component("card-marko/color/background", WARNING);
const MISNAMED = component("card-marko/color/card-marko", SURFACE_1);

function bound(hex: string, id: string) {
  return { hex, opacity: 1, boundVariableId: id };
}

// Core file after a first apply: root re-bound straight to surface 3, texts and text-content still on their tokens.
function cardMarko(rootVar: string = SURFACE_3.id, rootHex = "#E5E6F2"): ComponentScan {
  const texts = Array.from({ length: 4 }, (_, i) => {
    const t = layer(`text ${i + 1}`, "TEXT", [i]);
    t.fills = [bound("#001B4D", TEXT.id)];
    return t;
  });
  const content = layer("text-content", "FRAME", [4]);
  content.fills = [bound("#FFF89D", BACKGROUND.id)];
  content.height = 120;
  for (const c of [...texts, content]) c.layout.heightSizing = "HUG";
  const root = layer("card-marko", "COMPONENT", [], [...texts, content]);
  root.height = 200;
  root.fills = [bound(rootHex, rootVar)];
  return {
    id: "c:card",
    name: "card-marko",
    kind: "COMPONENT",
    variantProperties: {},
    variants: [{ id: "v:card", props: {}, root, uses: collectUses("v:card", root), boundUses: collectBoundUses("v:card", root) }],
  };
}

const byName = (tokens: TokenProposal[], name: string) => tokens.find((t) => t.name === name)!;

describe("re-check bound values (card-marko, Core file after a first apply)", () => {
  const catalog = coreCatalog([TEXT, BACKGROUND, MISNAMED]);
  const p = buildProposal(cardMarko(), catalog, [], "card-marko");

  it("proposes exactly the three rows", () => {
    expect(p.unmatched).toEqual([]);
    expect(p.tokens.map((t) => [t.name, t.kind, t.status, t.match, t.skip])).toEqual([
      ["card-marko/color/background", "alias-change", "existing", "exact", false],
      ["card-marko/color/text", "alias-change", "existing", "manual", false],
      ["card-marko/text-content/color/background", "rebind", "new", "exact", false],
    ]);
  });

  it("root fill: alias change of card-marko/color/background to surface 3, rebinding the root", () => {
    const row = byName(p.tokens, "card-marko/color/background");
    expect(row.alias).toEqual({ desktop: SURFACE_3.id, mobile: SURFACE_3.id });
    expect(row.previousAlias).toEqual({ desktop: WARNING.id, mobile: WARNING.id });
    expect(row.uses.map((u) => [u.indexPath, u.boundVariableId])).toEqual([[[], SURFACE_3.id]]);
    expect(row.note).toContain("currently used by text-content; it would turn surface 3");
    expect(row.note).toContain("text-content moves to card-marko/text-content/color/background in its own row");
  });

  it("text-content moves to its own token with the same alias, look unchanged", () => {
    const row = byName(p.tokens, "card-marko/text-content/color/background");
    expect(row.alias).toEqual({ desktop: WARNING.id, mobile: WARNING.id });
    expect(row.uses.map((u) => [u.indexPath, u.boundVariableId])).toEqual([[[4], BACKGROUND.id]]);
    expect(row.note).toBe(
      "text-content uses card-marko/color/background, the name for the component frame fill; moves to its own token with the same alias, look unchanged.",
    );
  });

  it("text: alias change on-surface/1/enabled -> on-surface/3/enabled", () => {
    const row = byName(p.tokens, "card-marko/color/text");
    expect(row.alias).toEqual({ desktop: ON_3.id, mobile: ON_3.id });
    expect(row.previousAlias).toEqual({ desktop: ON_1.id, mobile: ON_1.id });
    expect(row.uses).toHaveLength(4);
    expect(row.note).toBe("Text now sits on surface 3; restores the surface pairing and changes every use of this token.");
  });

  it("lists the misnamed frame fill token without renaming it", () => {
    expect(p.warnings).toContain(
      '"card-marko/color/card-marko": Token name does not follow the pattern (component frame fill should be card-marko/color/background); not renamed automatically.',
    );
    expect(p.tokens.some((t) => t.name === "card-marko/color/card-marko")).toBe(false);
  });

  it("review shows kinds, old -> new alias and creation order", () => {
    const semantic: SemanticOption[] = catalog.variables
      .filter((v) => v.collection !== "components")
      .map((v) => ({ id: v.id, name: v.name, collection: v.collection, type: v.type }));
    const model = buildReviewModel(p, semantic);
    expect(model.tokens.map((t) => [t.name, t.kind, t.apply, t.previousAlias])).toEqual([
      ["card-marko/color/background", "alias-change", true, "color/surface/feedback/warning"],
      ["card-marko/color/text", "alias-change", true, "color/on-surface/1/enabled"],
      ["card-marko/text-content/color/background", "rebind", true, null],
    ]);
    const kept = collectProposal(p, { renames: [], tokens: [] });
    expect(kept.tokens.find((t) => t.kind === "alias-change")?.previousAlias).toBeDefined();
  });

  it("is deterministic", () => {
    expect(buildProposal(cardMarko(), catalog, [], "card-marko")).toEqual(p);
  });
});

describe("re-check bound values, simpler cases", () => {
  it("wraps a fill bound straight to a semantic variable: new token, exact, checked", () => {
    const scan = cardMarko();
    const root = scan.variants[0].root;
    root.children.forEach((c) => (c.fills = []));
    scan.variants[0].boundUses = collectBoundUses("v:card", root);
    const p = buildProposal(scan, coreCatalog([]), [], "card-marko");
    expect(p.tokens).toHaveLength(1);
    expect(p.tokens[0]).toMatchObject({
      name: "card-marko/color/background",
      kind: "wrap",
      status: "new",
      match: "exact",
      skip: false,
      alias: { desktop: SURFACE_3.id, mobile: SURFACE_3.id },
    });
  });

  it("reuses an existing own token that already has the wanted alias", () => {
    const scan = cardMarko();
    const root = scan.variants[0].root;
    root.children.forEach((c) => (c.fills = []));
    scan.variants[0].boundUses = collectBoundUses("v:card", root);
    const p = buildProposal(scan, coreCatalog([component("card-marko/color/background", SURFACE_3)]), [], "card-marko");
    expect(p.tokens[0]).toMatchObject({ kind: "wrap", status: "existing", match: "exact", skip: false });
  });

  it("proposes nothing when bound tokens pair correctly and follow the pattern", () => {
    const bg = component("card-marko/color/background", SURFACE_1);
    const scan = cardMarko(bg.id, "#FFFFFF");
    const root = scan.variants[0].root;
    root.children = root.children.slice(0, 4);
    scan.variants[0].boundUses = collectBoundUses("v:card", root);
    const p = buildProposal(scan, coreCatalog([TEXT, bg]), [], "card-marko");
    expect(p.tokens).toEqual([]);
    expect(p.unmatched).toEqual([]);
    expect(p.warnings.filter((w) => w.includes("pattern"))).toEqual([]);
  });

  it("text bound to another component's token on the wrong surface gets a new own token, checked", () => {
    const foreign = component("chip/color/text", ON_1);
    const scan = cardMarko();
    const root = scan.variants[0].root;
    root.children = root.children.slice(0, 1);
    root.children[0].fills = [bound("#001B4D", foreign.id)];
    root.fills = [bound("#E5E6F2", component("card-marko/color/background", SURFACE_3).id)];
    scan.variants[0].boundUses = collectBoundUses("v:card", root);
    const p = buildProposal(scan, coreCatalog([foreign, component("card-marko/color/background", SURFACE_3)]), [], "card-marko", [], ["chip"]);
    expect(p.tokens.map((t) => [t.name, t.kind, t.skip, t.alias.desktop])).toEqual([
      ["card-marko/color/text", "rebind", false, ON_3.id],
    ]);
  });

  it("treats bindings to deleted variables as raw values, silently, and fixes the raw text to the surface pair", () => {
    const scan = cardMarko("deleted:1");
    const root = scan.variants[0].root;
    root.children = root.children.slice(0, 1);
    root.children[0].fills = [bound("#001B4D", "deleted:2")];
    const live = new Set<string>();
    const missing = stripMissingBindings(root, (id) => live.has(id));
    expect(missing).toBe(2);
    scan.variants[0] = { ...scan.variants[0], uses: collectUses("v:card", root), boundUses: collectBoundUses("v:card", root), missingBindings: missing };
    const p = buildProposal(scan, coreCatalog([]), [], "card-marko");
    expect(p.warnings.some((w) => w.includes("deleted"))).toBe(false);
    expect(p.tokens.map((t) => [t.name, t.alias.desktop, t.match, t.skip])).toEqual([
      ["card-marko/color/background", SURFACE_3.id, "exact", false],
      ["card-marko/color/text", ON_3.id, "manual", false],
    ]);
    expect(p.unmatched).toEqual([]);
  });
});

describe("binding helpers", () => {
  it("classifies a binding as none, live or missing", () => {
    const live = (id: string) => id === "v:1";
    expect(classifyBinding(null, live)).toBe("none");
    expect(classifyBinding(undefined, live)).toBe("none");
    expect(classifyBinding("v:1", live)).toBe("live");
    expect(classifyBinding("v:gone", live)).toBe("missing");
  });

  it("strips only missing bindings, numbers included", () => {
    const root: LayerNode = layer("card", "FRAME", []);
    root.fills = [bound("#FFFFFF", "v:live"), bound("#000000", "v:gone")];
    root.layout.paddingLeft = 16;
    root.bound = { paddingLeft: "v:gone", itemSpacing: "v:live" };
    expect(stripMissingBindings(root, (id) => id === "v:live")).toBe(2);
    expect(root.fills.map((f) => f.boundVariableId)).toEqual(["v:live", null]);
    expect(root.bound).toEqual({ itemSpacing: "v:live" });
    expect(collectUses("v", root).map((u) => u.field)).toEqual(["paddingLeft", "fills"]);
  });

  it("collectBoundUses reports bound paints with their variable id", () => {
    const root: LayerNode = layer("card", "FRAME", []);
    root.fills = [bound("#FFFFFF", "v:1"), { hex: "#000000", opacity: 1, boundVariableId: null }];
    const usesOf = (list: RawValueUse[]) => list.map((u) => [u.hex, u.boundVariableId ?? null]);
    expect(usesOf(collectBoundUses("v", root))).toEqual([["#FFFFFF", "v:1"]]);
    expect(usesOf(collectUses("v", root))).toEqual([["#000000", null]]);
  });

  it("withoutBinding drops the variable binding and keeps the paint", () => {
    const paint = { type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1, boundVariables: { color: { id: "gone" } } };
    expect(withoutBinding(paint)).toEqual({ type: "SOLID", color: { r: 1, g: 1, b: 1 }, opacity: 1 });
  });

  it("allows alias changes only inside the component's own namespace", () => {
    expect(mayChangeAlias("card-marko/color/text", "card-marko")).toBe(true);
    expect(mayChangeAlias("card-marko/color/text", "Card Marko")).toBe(true);
    expect(mayChangeAlias("card-marko-x/color/text", "card-marko")).toBe(false);
    expect(mayChangeAlias("chip/color/text", "card-marko")).toBe(false);
    expect(mayChangeAlias("color/on-surface/1/enabled", "card-marko")).toBe(false);
  });
});

describe("creationOrder", () => {
  const use = (indexPath: number[]): RawValueUse => ({
    variantId: "v",
    indexPath,
    layerName: "x",
    field: "fills",
    paintIndex: 0,
    kind: "color",
    number: null,
    hex: "#000000",
    opacity: 1,
    role: "background",
  });
  const t = (name: string, ...paths: number[][]) => ({ name, uses: paths.map(use) });

  it("root tokens by category, then parts by depth and layer order", () => {
    const tokens = [
      t("card-marko/navbar/nav-item/color/text", [0, 0]),
      t("card-marko/text-content/color/background", [2]),
      t("card-marko/shape/cornerRadius", []),
      t("card-marko/navbar/spacing/gap", [0]),
      t("card-marko/spacing/padding", []),
      t("card-marko/color/text", [3], [1]),
      t("card-marko/navbar/color/background", [0]),
      t("card-marko/color/background", []),
      t("other/color/text", [5]),
    ];
    expect(creationOrder(tokens, "card-marko").map((x) => x.name)).toEqual([
      "card-marko/color/background",
      "card-marko/color/text",
      "card-marko/spacing/padding",
      "card-marko/shape/cornerRadius",
      "card-marko/navbar/color/background",
      "card-marko/navbar/spacing/gap",
      "card-marko/text-content/color/background",
      "card-marko/navbar/nav-item/color/text",
      "other/color/text",
    ]);
  });
});

