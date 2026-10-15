import { describe, expect, it } from "vitest";
import { buildTokenName, isValidComponentTokenName, paddingProperties } from "../../src/tokenNames";

describe("paddingProperties", () => {
  it("collapses all equal sides to padding", () => {
    expect(paddingProperties(16, 16, 16, 16)).toEqual([
      { property: "padding", value: 16, sides: ["left", "right", "top", "bottom"] },
    ]);
  });

  it("collapses L=R and T=B to paddingX + paddingY", () => {
    expect(paddingProperties(24, 24, 12, 12)).toEqual([
      { property: "paddingX", value: 24, sides: ["left", "right"] },
      { property: "paddingY", value: 12, sides: ["top", "bottom"] },
    ]);
  });

  it("keeps each side otherwise, Left/Right not Start/End", () => {
    expect(paddingProperties(8, 16, 8, 8).map((p) => p.property)).toEqual([
      "paddingLeft",
      "paddingRight",
      "paddingTop",
      "paddingBottom",
    ]);
  });

  it("does not collapse when only L=R", () => {
    expect(paddingProperties(16, 16, 8, 12)).toHaveLength(4);
  });
});

describe("buildTokenName", () => {
  it("builds the Naming Conventions color examples", () => {
    expect(buildTokenName({ component: "button", category: "color", variant: "primary", element: "background", state: "hover" })).toBe(
      "button/color/primary/background/hover",
    );
    expect(buildTokenName({ component: "button", category: "color", variant: "primary", element: "icon", state: "enabled" })).toBe(
      "button/color/primary/icon/enabled",
    );
    expect(buildTokenName({ component: "notification", category: "color", variant: "success", element: "border" })).toBe(
      "notification/color/success/border",
    );
  });

  it("maps the variant value focused to token state focus", () => {
    expect(buildTokenName({ component: "input", category: "shape", property: "stroke", state: "focused" })).toBe(
      "input/shape/stroke/focus",
    );
    expect(buildTokenName({ component: "input", category: "color", element: "border", state: "focused" })).toBe(
      "input/color/border/focus",
    );
  });

  it("puts the size variant before the property", () => {
    expect(buildTokenName({ component: "button", category: "spacing", sizeVariant: "large", property: "paddingX" })).toBe(
      "button/spacing/large/paddingX",
    );
    expect(buildTokenName({ component: "section", category: "spacing", property: "padding" })).toBe("section/spacing/padding");
  });

  it("adds a part and lowercases names", () => {
    expect(buildTokenName({ component: "Navbar", part: "Item", category: "shape", property: "height" })).toBe(
      "navbar/item/shape/height",
    );
    expect(buildTokenName({ component: "HEADER", category: "color", element: "supporting text" })).toBe(
      "header/color/supporting-text",
    );
  });

  it("drops state on spacing tokens and requires element / property", () => {
    expect(buildTokenName({ component: "chip", category: "spacing", property: "gap", state: "hover" })).toBe("chip/spacing/gap");
    expect(() => buildTokenName({ component: "chip", category: "color" })).toThrow();
    expect(() => buildTokenName({ component: "chip", category: "shape" })).toThrow();
  });

  it("produces valid names", () => {
    const names = [
      buildTokenName({ component: "button", category: "color", variant: "primary", element: "background", state: "hover" }),
      buildTokenName({ component: "button", category: "spacing", sizeVariant: "large", property: "paddingX" }),
      buildTokenName({ component: "button", category: "shape", sizeVariant: "medium", property: "cornerRadius", state: "pressed" }),
      buildTokenName({ component: "checkbox", category: "color", variant: "checked", element: "icon", state: "disabled" }),
    ];
    for (const n of names) expect(isValidComponentTokenName(n)).toBe(true);
  });
});

describe("isValidComponentTokenName", () => {
  it.each([
    "button/color/primary/background/hover",
    "button/color/primary/text/hover",
    "notification/color/success/border",
    "input/color/border/focus",
    "input/shape/stroke/focus",
    "section/spacing/padding",
    "button/spacing/large/paddingX",
    "button/shape/cornerRadius",
    "button/shape/large/height/hover",
    "dialog/sheet/shape/cornerRadiusBottom",
    "list/item/spacing/paddingLeft",
    "card/spacing/labelGap",
    "navbar/item/shape/minWidth",
    "button/shape/strokeBottom",
    "link/color/on-surface-1/text/visited",
    "_toggle-item/color/background",
  ])("accepts %s", (name) => {
    expect(isValidComponentTokenName(name)).toBe(true);
  });

  it.each([
    ["size category", "divider/size/s"],
    ["size category with property", "score-gauge/size/diameter"],
    ["no category", "table/border/width"],
    ["gap under shape", "link/shape/gap"],
    ["state default", "button/shape/stroke/default"],
    ["size after property", "wrapper/spacing/gap/small"],
    ["part inside property", "navbar/spacing/groupPadding"],
    ["Start/End", "list/item/spacing/paddingEnd"],
    ["uppercase", "Button/color/primary/background"],
    ["not camelCase", "button/spacing/padding-x"],
    ["lowercase multiword", "button/shape/cornerradius"],
    ["space in segment", "button/color/primary/supporting text"],
    ["unknown state", "button/color/primary/background/wobble"],
    ["empty segment", "button//color/text"],
    ["too long color tail", "button/color/a/b/c/d"],
    ["category only", "button/color"],
  ])("rejects %s (%s)", (_why, name) => {
    expect(isValidComponentTokenName(name)).toBe(false);
  });
});
