import { describe, expect, it } from "vitest";
import { isDefaultFigmaName, isUnnamed, looksLikeRandomTyping, normalizeComponentName, proposeLayerNames } from "../../src/naming";
import { SYNONYMS, synonymOf, vocabularyEntry, VOCABULARY } from "../../src/vocabulary";
import type { LayerNode } from "../../src/types";
import { applyRenames, frame, hstack, instance, paint, text, tree, vector, vstack } from "./build";

const brief = (root: LayerNode) => proposeLayerNames(root).map((r) => [r.indexPath.join("."), r.oldName, r.newName]);

const workedExample = (names = ["aaa", "dasasdd", "adadwwed"]) =>
  tree(
    vstack("card-marko", [
      ...names.map((n) => vstack(n, [text("Headline", "Headline", 16)])),
      text("asdadadsasd", "asdadadsasd lorem ipsum", 12),
    ]),
  );

const regionCard = () =>
  tree(
    vstack("card", [
      hstack("Frame 1", [text("Card title", "Card title", 20), vector()]),
      vstack("Frame 2", [text("Body", "Body copy here", 14), text("More", "More copy", 14)], { height: 200 }),
      hstack("Frame 3", [instance("Button", "button")]),
    ]),
  );

const iconButton = () =>
  tree(
    hstack("button", [vector("Vector", 20), text("Click me", "Click me", 14)], {
      fills: [paint("#0059FF")],
      layout: { paddingLeft: 16, paddingRight: 16 },
    }),
  );

const iconWrapperButton = () =>
  tree(
    hstack("button", [
      hstack("icon-wrapper", [
        frame("Frame 1", [vector()], { width: 24, height: 24 }),
        text("Go", "Go", 14),
        frame("Frame 2", [vector()], { width: 24, height: 24 }),
      ]),
    ]),
  );

const tableCase = () =>
  tree(
    vstack("card-marko", [
      vstack("table", [
        vstack("item", [text("label", "Row 1")]),
        vstack("item", [text("label", "Row 2")]),
        vstack("item", [text("label", "Row 3")]),
      ]),
      text("label", "Loose text", 12),
    ]),
  );

const listCascade = () =>
  tree(
    vstack("card", [
      vstack("Frame 12", [
        hstack("row", [text("label", "a"), text("label", "b")]),
        hstack("row", [text("label", "c"), text("label", "d")]),
        hstack("row", [text("label", "e"), text("label", "f")]),
      ]),
    ]),
  );

const cell = (t: string) => frame("Frame", [text(t, t)]);
const tableWithHeader = () =>
  tree(
    vstack("card", [
      vstack("table", [
        hstack("Frame 1", [cell("Name"), cell("Role")], { fills: [paint("#EEEEEE")] }),
        hstack("Frame 2", [cell("Ann"), cell("Dev"), text("Note", "Note")]),
        hstack("Frame 3", [cell("Bob"), cell("Ops"), text("Note", "Note")]),
      ]),
    ]),
  );

const btn = (name: string, label: string) =>
  hstack(name, [text(label, label, 14)], { fills: [paint("#0059FF")], layout: { paddingLeft: 16, paddingRight: 16 } });
const actionsCase = () =>
  tree(vstack("card", [hstack("actions", [btn("Frame 1", "Cancel"), btn("primary", "Save"), text("hint", "hint", 12)])]));

const rootTable = () =>
  tree(vstack("table", [hstack("Frame 1", [cell("A"), cell("B")]), hstack("Frame 2", [cell("C"), cell("D")])]));

const fixtures = {
  workedExample,
  regionCard,
  iconButton,
  iconWrapperButton,
  tableCase,
  listCascade,
  tableWithHeader,
  actionsCase,
  rootTable,
};

describe("proposeLayerNames", () => {
  it("worked example 1 produces item / label / supporting text", () => {
    const renames = proposeLayerNames(workedExample());
    expect(renames.map((r) => [r.indexPath.join("."), r.oldName, r.newName])).toEqual([
      ["0", "aaa", "item"],
      ["0.0", "Headline", "label"],
      ["1", "dasasdd", "item"],
      ["1.0", "Headline", "label"],
      ["2", "adadwwed", "item"],
      ["2.0", "Headline", "label"],
      ["3", "asdadadsasd", "supporting text"],
    ]);
    expect(renames.every((r) => r.skip === false)).toBe(true);
    expect(renames[0].reason).toContain("only child is one TEXT, 3 same-shaped siblings -> item");
    expect(renames[0].reason).toContain("list");
    expect(renames[2].reason).not.toContain("list");
  });

  it("worked example 1 with real typed frame names keeps them as deliberate", () => {
    expect(brief(workedExample(["pricing", "profile", "settings"]))).toEqual([
      ["0.0", "Headline", "label"],
      ["1.0", "Headline", "label"],
      ["2.0", "Headline", "label"],
      ["3", "asdadadsasd", "supporting text"],
    ]);
  });

  it("never renames the root", () => {
    const root = tree(vstack("Frame 1", [vstack("Frame 2", [text("Hi", "Hi")])]));
    const renames = proposeLayerNames(root);
    expect(renames.some((r) => r.indexPath.length === 0)).toBe(false);
    expect(brief(root)).toEqual([
      ["0", "Frame 2", "text-content"],
      ["0.0", "Hi", "label"],
    ]);
  });

  it("treats default Figma names and content-named text as unnamed", () => {
    const root = tree(
      vstack("card", [
        text("Title", "Title of card", 24),
        text("label", "label", 14),
        text("Some words", "Some words here", 14),
        text("label", "Real copy", 12),
      ]),
    );
    expect(brief(root)).toEqual([
      ["0", "Title", "title"],
      ["2", "Some words", "label"],
    ]);
  });

  it("keeps vocabulary names, fixes casing and start/end", () => {
    const root = tree(
      vstack("card", [
        vstack("Content", [text("A", "A"), text("B", "B")]),
        hstack("icon-wrapper", [vector("Start Icon"), text("x", "x"), vector("right icon")]),
        vstack("wrapper", [text("x", "x")]),
      ]),
    );
    const renames = brief(root);
    expect(renames).toContainEqual(["0", "Content", "content"]);
    expect(renames).toContainEqual(["1.0", "Start Icon", "left icon"]);
    expect(renames.find((r) => r[0] === "2")).toBeUndefined();
    expect(renames.find((r) => r[0] === "1.2")).toBeUndefined();
  });

  it("leaves instance children and hidden layers untouched", () => {
    const btn = instance("Button", "button");
    btn.children = [frame("Frame 9", [text("Click", "Click")])];
    const root = tree(vstack("card", [btn, vstack("Frame 4", [text("Hidden", "Hidden")], { visible: false })]));
    expect(brief(root)).toEqual([["0", "Button", "button"]]);
  });

  it("does not rename a layer named after the component", () => {
    const root = tree(vstack("link", [hstack("link", [text("Go", "Go"), vector()])]));
    expect(brief(root)).toEqual([
      ["0", "link", "row"],
      ["0.0", "Go", "label"],
      ["0.1", "Vector", "icon"],
    ]);
  });

  it("gives same-shaped siblings the same name and hints a list only once", () => {
    const row = () => hstack("Frame", [vector(), vstack("Frame", [text("a", "a"), text("b", "b", 12)])]);
    const root = tree(vstack("card", [row(), row(), row()]));
    const top = proposeLayerNames(root).filter((r) => r.indexPath.length === 1);
    expect(top.map((r) => r.newName)).toEqual(["item", "item", "item"]);
    expect(top.filter((r) => r.reason.includes("list"))).toHaveLength(1);
  });

  it("names a non-root parent of 3+ same-shaped children list, without a hint", () => {
    const item = () => vstack("Frame", [text("x", "x")]);
    const root = tree(vstack("card", [vstack("Frame 7", [item(), item(), item()]), text("Footer note", "Footer note", 12)]));
    const renames = proposeLayerNames(root);
    expect(renames[0].newName).toBe("list");
    expect(renames.filter((r) => r.newName === "list-item")).toHaveLength(3);
    expect(renames.some((r) => r.reason.includes("hint"))).toBe(false);
  });

  it("detects header / content / footer in a clear 3-region card", () => {
    expect(brief(regionCard())).toEqual([
      ["0", "Frame 1", "header"],
      ["0.0", "Card title", "label"],
      ["0.1", "Vector", "icon"],
      ["1", "Frame 2", "content"],
      ["1.0", "Body", "label"],
      ["1.1", "More", "label"],
      ["2", "Frame 3", "footer"],
      ["2.0", "Button", "button"],
    ]);
  });

  it("falls back to generic names when regions are not clear", () => {
    const root = tree(
      vstack("card", [
        hstack("Frame 1", [text("A", "A"), vector()]),
        vstack("Frame 2", [text("B", "B"), text("C", "C")], { height: 20 }),
      ]),
    );
    expect(brief(root).filter((r) => r[0].length === 1)).toEqual([
      ["0", "Frame 1", "row"],
      ["1", "Frame 2", "text-content"],
    ]);
  });

  it("names icon + label inside a button", () => {
    expect(brief(iconButton())).toEqual([
      ["0", "Vector", "icon"],
      ["1", "Click me", "label"],
    ]);
  });

  it("uses left icon / right icon only inside an existing icon-wrapper", () => {
    expect(brief(iconWrapperButton())).toEqual([
      ["0.0", "Frame 1", "left icon"],
      ["0.1", "Go", "label"],
      ["0.2", "Frame 2", "right icon"],
    ]);
  });

  it("names decoration and media layers", () => {
    const root = tree(
      frame("card", [
        frame("Rectangle 1", [], { fills: [paint()], width: 300, height: 200 }),
        frame("Frame 5", [], { hasImageFill: true }),
        frame("Line 1", [], { width: 300, height: 1, fills: [paint("#000000")] }),
        frame("Frame 6", [], { layout: { widthSizing: "FILL" } }),
        frame("Frame 7", [], { strokes: [paint("#000000")] }),
        frame("Frame 8", [], { fills: [paint("#000000", 0.5)], width: 300, height: 200 }),
      ], { width: 300, height: 200 }),
    );
    expect(brief(root).map((r) => r[2])).toEqual(["background", "image", "divider", "spacer", "border", "overlay"]);
  });

  it("only proposes vocabulary names that fit the layer kind", () => {
    for (const make of Object.values(fixtures)) {
      const root = make();
      for (const r of proposeLayerNames(root)) {
        const entry = vocabularyEntry(r.newName);
        expect(entry, r.newName).toBeDefined();
        let n = root;
        for (const i of r.indexPath) n = n.children[i];
        if (entry!.layer !== "any") expect(entry!.layer === "text").toBe(n.kind === "TEXT");
        expect(r.newName).toBe(r.newName.toLowerCase());
        expect(entry!.group).not.toBe("slots");
      }
    }
  });

  it("is idempotent", () => {
    for (const make of Object.values(fixtures)) {
      const root = make();
      expect(proposeLayerNames(applyRenames(root, proposeLayerNames(root)))).toEqual([]);
    }
  });
});

describe("proposeLayerNames parent context", () => {
  it("renames items inside a table to table-row and nothing else", () => {
    const renames = proposeLayerNames(tableCase());
    expect(renames.map((r) => [r.indexPath.join("."), r.oldName, r.newName])).toEqual([
      ["0.0", "item", "table-row"],
      ["0.1", "item", "table-row"],
      ["0.2", "item", "table-row"],
    ]);
    expect(renames[0].reason).toBe("child of table -> table-row");
  });

  it("cascades: a frame renamed to list turns its row children into list-item", () => {
    const renames = brief(listCascade());
    expect(renames).toContainEqual(["0", "Frame 12", "list"]);
    expect(renames.filter((r) => r[0].split(".").length === 2)).toEqual([
      ["0.0", "row", "list-item"],
      ["0.1", "row", "list-item"],
      ["0.2", "row", "list-item"],
    ]);
  });

  it("names a filled first row table-header with header-cell children, the rest table-row / table-cell", () => {
    const renames = brief(tableWithHeader());
    expect(renames).toEqual([
      ["0.0", "Frame 1", "table-header"],
      ["0.0.0", "Frame", "header-cell"],
      ["0.0.0.0", "Name", "label"],
      ["0.0.1", "Frame", "header-cell"],
      ["0.0.1.0", "Role", "label"],
      ["0.1", "Frame 2", "table-row"],
      ["0.1.0", "Frame", "table-cell"],
      ["0.1.0.0", "Ann", "label"],
      ["0.1.1", "Frame", "table-cell"],
      ["0.1.1.0", "Dev", "label"],
      ["0.1.2", "Note", "label"],
      ["0.2", "Frame 3", "table-row"],
      ["0.2.0", "Frame", "table-cell"],
      ["0.2.0.0", "Bob", "label"],
      ["0.2.1", "Frame", "table-cell"],
      ["0.2.1.0", "Ops", "label"],
      ["0.2.2", "Note", "label"],
    ]);
  });

  it("gives every row table-row when the first row has no fill of its own", () => {
    const root = tableWithHeader();
    root.children[0].children.forEach((r) => (r.fills = [paint("#EEEEEE")]));
    expect(brief(root).filter((r) => r[0].split(".").length === 2).map((r) => r[2])).toEqual([
      "table-row",
      "table-row",
      "table-row",
    ]);
  });

  it("names unnamed frames inside actions button, but not TEXT or a deliberate name", () => {
    const renames = proposeLayerNames(actionsCase());
    expect(renames.filter((r) => r.reason.includes("actions")).map((r) => [r.indexPath.join("."), r.newName, r.reason])).toEqual([
      ["0.0", "button", "child of actions -> button"],
    ]);
    expect(renames.find((r) => r.indexPath.join(".") === "0.1")).toBeUndefined();
    expect(renames.find((r) => r.indexPath.join(".") === "0.2")?.newName).not.toBe("button");
  });

  it("uses the root's name as parent context without renaming the root", () => {
    const renames = brief(rootTable());
    expect(renames.filter((r) => r[0].length <= 1)).toEqual([
      ["0", "Frame 1", "table-row"],
      ["1", "Frame 2", "table-row"],
    ]);
  });

  it("is idempotent with parent context", () => {
    for (const make of [tableCase, listCascade, tableWithHeader, actionsCase, rootTable]) {
      const root = make();
      expect(proposeLayerNames(applyRenames(root, proposeLayerNames(root)))).toEqual([]);
    }
  });
});

const navCase = () =>
  tree(
    vstack("card-marko", [
      vstack("nav", [
        hstack("table-row", [text("label", "Home")]),
        hstack("table-row", [text("label", "About")]),
        hstack("table-row", [text("label", "Contact")]),
      ]),
      text("label", "Loose text", 12),
    ]),
  );

// Idempotent: applying the checked rows leaves only the same unchecked suggestions.
function expectStable(root: LayerNode): void {
  const first = proposeLayerNames(root);
  const suggestions = first.filter((r) => r.skip);
  expect(suggestions.every((r) => r.reason.startsWith("synonym of "))).toBe(true);
  expect(proposeLayerNames(applyRenames(root, first.filter((r) => !r.skip)))).toEqual(suggestions);
  expect(proposeLayerNames(applyRenames(root, first))).toEqual([]);
}

describe("proposeLayerNames deliberate names and synonyms", () => {
  it("real case: nav is suggested as navbar (unchecked), its rows become nav-item, nothing else", () => {
    const renames = proposeLayerNames(navCase());
    expect(renames.map((r) => [r.indexPath.join("."), r.oldName, r.newName, r.skip])).toEqual([
      ["0", "nav", "navbar", true],
      ["0.0", "table-row", "nav-item", false],
      ["0.1", "table-row", "nav-item", false],
      ["0.2", "table-row", "nav-item", false],
    ]);
    expect(renames[0].reason).toBe("synonym of navbar, vocabulary name suggested");
    expect(renames[1].reason).toBe("child of navbar -> nav-item");
  });

  it("never renames a deliberate name, not even through parent context", () => {
    const root = tree(
      vstack("card", [
        vstack("menu-links", [vstack("x1", [text("label", "A")]), vstack("x2", [text("label", "B")]), vstack("x3", [text("label", "C")])]),
        vstack("table", [hstack("my-row", [text("label", "A")]), hstack("Frame 2", [text("label", "B")])]),
      ]),
    );
    expect(brief(root)).toEqual([["1.1", "Frame 2", "table-row"]]);
  });

  it("keeps casing / start-end fixes for vocabulary names and leaves other typed names alone", () => {
    const root = tree(
      vstack("card", [vstack("Body Copy", [text("label", "A"), text("value", "B")]), vstack("Footer", [text("label", "C")])]),
    );
    expect(brief(root)).toEqual([["1", "Footer", "footer"]]);
  });

  it("drives children from a synonym parent and suggests each synonym once", () => {
    const entry = () => vstack("Frame", [text("x", "x"), vector()]);
    const root = tree(
      vstack("card", [
        vstack("UL", [entry(), entry(), entry()]),
        hstack("Btn", [text("Go", "Go")], { fills: [paint("#0059FF")], layout: { paddingLeft: 8 } }),
        frame("img", [], { hasImageFill: true }),
        text("heading", "Welcome", 24),
        frame("heading", [text("x", "x")]),
      ]),
    );
    const renames = proposeLayerNames(root);
    expect(renames.map((r) => [r.indexPath.join("."), r.newName, r.skip])).toEqual([
      ["0", "list", true],
      ["0.0", "list-item", false],
      ["0.0.0", "label", false],
      ["0.0.1", "icon", false],
      ["0.1", "list-item", false],
      ["0.1.0", "label", false],
      ["0.1.1", "icon", false],
      ["0.2", "list-item", false],
      ["0.2.0", "label", false],
      ["0.2.1", "icon", false],
      ["1", "button", true],
      ["1.0", "label", false],
      ["2", "image", true],
      ["3", "title", true],
      ["4.0", "label", false],
    ]);
    expectStable(root);
  });

  it("is idempotent: only the same unchecked suggestion rows come back, never checked churn", () => {
    for (const make of [navCase, ...Object.values(fixtures)]) expectStable(make());
  });
});

describe("isUnnamed", () => {
  it("is true for default names, content-named TEXT and the component name only", () => {
    expect(isUnnamed(frame("Frame 3"))).toBe(true);
    expect(isUnnamed(frame(" "))).toBe(true);
    expect(isUnnamed(text("Hello", "Hello world"))).toBe(true);
    expect(isUnnamed(frame("card-marko"), "card-marko")).toBe(true);
    expect(isUnnamed(frame("card-marko"))).toBe(false);
    expect(isUnnamed(frame("nav"))).toBe(false);
    expect(isUnnamed(frame("item"))).toBe(false);
    expect(isUnnamed(text("label", "Home"))).toBe(false);
  });
});

const REAL_WORDS = [
  "card", "address", "pricing", "profile", "settings", "navigation", "headline", "sidebar", "container", "wrapper",
  "background", "checkbox", "dropdown", "tooltip", "avatar", "thumbnail", "footer", "header", "content", "primary",
  "secondary", "label", "title", "icon", "card-marko", "Main Nav 2", "btn", "img", "ul", "x1",
];

describe("looksLikeRandomTyping", () => {
  it.each(["aaa", "dasasdd", "adadwwed", "adsasasdasd", "asdadadsasd", "qwrt", "sdfg-hjk", "aaa 12"])("%s is mash", (n) =>
    expect(looksLikeRandomTyping(n)).toBe(true),
  );
  it.each(REAL_WORDS)("%s is not mash", (n) => expect(looksLikeRandomTyping(n)).toBe(false));
  it("keeps a name with any real-word token, and every vocabulary / synonym name", () => {
    expect(looksLikeRandomTyping("aaa card")).toBe(false);
    for (const n of [...VOCABULARY.map((e) => e.name), ...SYNONYMS.keys()]) expect(looksLikeRandomTyping(n), n).toBe(false);
  });
  it("counts mash names as Unnamed", () => {
    expect(isUnnamed(frame("dasasdd"))).toBe(true);
    expect(isUnnamed(frame("pricing"))).toBe(false);
  });
  it.each(["banana", "coconut", "remember", "intention", "statistics", "entertainment"])(
    "known false positive (repeated bigram): %s",
    (n) => expect(looksLikeRandomTyping(n)).toBe(true),
  );
});

describe("isDefaultFigmaName", () => {
  it.each(["Frame 123", "Group 4", "Rectangle 12", "Vector", "Ellipse 2", "Line 1", "Component 1", "Ellipse"])(
    "%s is default",
    (n) => expect(isDefaultFigmaName(n)).toBe(true),
  );
  it.each(["frame", "item", "Frame A", "Card", "icon-wrapper"])("%s is not default", (n) =>
    expect(isDefaultFigmaName(n)).toBe(false),
  );
});

describe("normalizeComponentName", () => {
  it.each([
    ["Card Marko", "card-marko"],
    ["Card/Settings", "card/settings"],
    ["Card/Settings/Feature category", "card/settings/feature-category"],
    ["Button SSO", "button-sso"],
    ["TextBlock", "text-block"],
    ["Header", "header"],
    ["_Toggle Item", "_toggle-item"],
    ["Icon Arrow Right", "icon_arrow_right"],
    ["icon_Close", "icon_close"],
    [" HEADER ", "HEADER"],
  ])("%s -> %s", (input, out) => expect(normalizeComponentName(input)).toBe(out));

  it.each(["card-marko", "button-sso", "HEADER", "MAIN", "FOOTER", "DIALOG", "_tab-item", "icon_arrow_right", "image/hero"])(
    "%s is conformant",
    (n) => expect(normalizeComponentName(n)).toBeNull(),
  );
});

describe("vocabulary", () => {
  it("has unique lowercase names, slots excepted", () => {
    const names = VOCABULARY.map((e) => e.name);
    expect(new Set(names).size).toBe(names.length);
    for (const e of VOCABULARY) if (e.group !== "slots") expect(e.name).toBe(e.name.toLowerCase());
  });

  it("maps synonyms to vocabulary names, and no synonym is itself a vocabulary name", () => {
    for (const [typed, meaning] of SYNONYMS) {
      expect(vocabularyEntry(meaning), meaning).toBeDefined();
      expect(vocabularyEntry(typed), typed).toBeUndefined();
      expect(typed).toBe(typed.toLowerCase());
    }
    expect(synonymOf(" Nav ")).toBe("navbar");
    expect(synonymOf("Nav Item")).toBe("nav-item");
    expect(synonymOf("constructor")).toBeUndefined();
  });
});
