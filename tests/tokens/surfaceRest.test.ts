import { describe, expect, it } from "vitest";
import { surfaceRest } from "../../src/proposal";

describe("surfaceRest", () => {
  it.each([
    ["color/surface/1/enabled", "1"],
    ["color/surface/brand/hover", "brand"],
    ["color/surface/feedback/warning", "feedback/warning"],
    ["color/surface/feedback/error", "feedback/error"],
    ["color/surface/feedback/success", "feedback/success"],
    ["color/surface/sso", "sso"],
    ["color/background/primary", null],
  ])("%s -> %s", (name, expected) => {
    expect(surfaceRest(name)).toBe(expected);
  });
});
