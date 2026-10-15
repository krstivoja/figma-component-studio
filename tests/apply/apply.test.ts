import { describe, expect, it } from "vitest";
import { aliasesMatch, hexFromRgb, numberMatches, paintMatches, radiusFieldsFor, scopesFor } from "../../src/apply";

describe("scopesFor", () => {
  const cases: Array<[string, "COLOR" | "FLOAT", string[]]> = [
    ["button/color/primary/background/hover", "COLOR", ["FRAME_FILL", "SHAPE_FILL"]],
    ["button/color/primary/text/enabled", "COLOR", ["TEXT_FILL", "SHAPE_FILL"]],
    ["button/color/icon", "COLOR", ["TEXT_FILL", "SHAPE_FILL"]],
    ["input/color/border/focus", "COLOR", ["STROKE_COLOR"]],
    ["button/spacing/paddingX", "FLOAT", ["GAP"]],
    ["button/spacing/padding", "FLOAT", ["GAP"]],
    ["button/spacing/large/gap", "FLOAT", ["GAP"]],
    ["button/shape/cornerRadius", "FLOAT", ["CORNER_RADIUS"]],
    ["button/shape/cornerRadiusBottom", "FLOAT", ["CORNER_RADIUS"]],
    ["input/shape/stroke/focus", "FLOAT", ["STROKE_FLOAT"]],
    ["input/shape/strokeBottom", "FLOAT", ["STROKE_FLOAT"]],
    ["x/shape/height", "FLOAT", ["WIDTH_HEIGHT"]],
    ["x/shape/minWidth", "FLOAT", ["WIDTH_HEIGHT"]],
    ["x/shape/diameter", "FLOAT", ["WIDTH_HEIGHT"]],
    ["x/shape/shadowY", "FLOAT", ["EFFECT_FLOAT"]],
  ];
  it.each(cases)("%s (%s)", (name, type, scopes) => {
    expect(scopesFor({ name, type })).toEqual(scopes);
  });

  it("uses the element after the category, not a part name before it", () => {
    expect(scopesFor({ name: "chip/icon/color/background", type: "COLOR" })).toEqual(["FRAME_FILL", "SHAPE_FILL"]);
  });

  it("falls back to all scopes for unknown properties", () => {
    expect(scopesFor({ name: "switch/color/track/on", type: "COLOR" })).toEqual(["ALL_SCOPES"]);
    expect(scopesFor({ name: "x/shape/opacity", type: "FLOAT" })).toEqual(["ALL_SCOPES"]);
  });
});

describe("radiusFieldsFor", () => {
  it("returns the four corners for any corner field", () => {
    expect(radiusFieldsFor("topLeftRadius")).toEqual(["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]);
    expect(radiusFieldsFor("bottomRightRadius")).toHaveLength(4);
  });
  it("returns nothing for non-radius fields", () => {
    expect(radiusFieldsFor("paddingLeft")).toEqual([]);
    expect(radiusFieldsFor("fills")).toEqual([]);
  });
});

describe("value matching", () => {
  it("hexFromRgb is uppercase #RRGGBB", () => {
    expect(hexFromRgb({ r: 0, g: 89 / 255, b: 1 })).toBe("#0059FF");
  });
  it("numberMatches tolerates float noise and rejects mixed", () => {
    expect(numberMatches(16, 16.001)).toBe(true);
    expect(numberMatches(16, 17)).toBe(false);
    expect(numberMatches(16, Symbol("mixed"))).toBe(false);
    expect(numberMatches(null, 0)).toBe(false);
  });
  it("paintMatches checks type, hex, opacity and existing binding", () => {
    const use = { hex: "#0059ff", opacity: 1 };
    const paint = { type: "SOLID", color: { r: 0, g: 89 / 255, b: 1 }, opacity: 1 };
    expect(paintMatches(use, paint)).toBe(true);
    expect(paintMatches(use, { ...paint, opacity: 0.5 })).toBe(false);
    expect(paintMatches(use, { ...paint, boundVariables: { color: { id: "v" } } })).toBe(false);
    expect(paintMatches(use, { type: "IMAGE" })).toBe(false);
    expect(paintMatches(use, undefined)).toBe(false);
  });
  it("aliasesMatch requires both modes to alias the proposed ids", () => {
    const modes = { desktop: "m1", mobile: "m2" };
    const values = { m1: { type: "VARIABLE_ALIAS", id: "a" }, m2: { type: "VARIABLE_ALIAS", id: "b" } };
    expect(aliasesMatch(values, modes, { desktop: "a", mobile: "b" })).toBe(true);
    expect(aliasesMatch(values, modes, { desktop: "a", mobile: "a" })).toBe(false);
    expect(aliasesMatch({ m1: 16, m2: 16 }, modes, { desktop: "a", mobile: "b" })).toBe(false);
    expect(aliasesMatch(values, { desktop: "m1", mobile: null }, { desktop: "a", mobile: "b" })).toBe(false);
  });
});
