import { describe, expect, it } from "vitest";
import {
  compareTokenNames,
  filterGroups,
  formatValue,
  initialActive,
  matchesQuery,
  moveActive,
  shortName,
  sortByTokenName,
  triggerText,
} from "../../src/tokenPicker";

const sorted = (names: string[]) => names.slice().sort(compareTokenNames);

describe("compareTokenNames", () => {
  it("never interleaves subtle and accent (the screenshot case)", () => {
    const names = [
      "color/surface/accent/hover",
      "color/surface/subtle/pressed",
      "color/surface/accent/enabled",
      "color/surface/subtle/enabled",
      "color/surface/accent/disabled",
      "color/surface/subtle/hover",
    ];
    expect(sorted(names)).toEqual([
      "color/surface/subtle/enabled",
      "color/surface/subtle/hover",
      "color/surface/subtle/pressed",
      "color/surface/accent/enabled",
      "color/surface/accent/hover",
      "color/surface/accent/disabled",
    ]);
  });

  it("orders surfaces, then feedback kinds, then states before intents", () => {
    const expected = [
      "color/background/primary",
      "color/surface/1/enabled",
      "color/surface/1/hover",
      "color/surface/2/enabled",
      "color/surface/3/enabled",
      "color/surface/subtle/enabled",
      "color/surface/accent/enabled",
      "color/surface/brand/enabled",
      "color/surface/brand/hover",
      "color/surface/brand/pressed",
      "color/surface/brand/disabled",
      "color/surface/brand/loading",
      "color/surface/feedback/info",
      "color/surface/feedback/promo",
      "color/surface/feedback/success",
      "color/surface/feedback/warning",
      "color/surface/feedback/error",
      "color/surface/feedback/neutral",
      "color/surface/feedback/loading",
    ];
    expect(sorted(expected.slice().reverse())).toEqual(expected);
  });

  it("puts states before intents on on-surface colors", () => {
    const expected = [
      "color/on-surface/brand/enabled",
      "color/on-surface/brand/hover",
      "color/on-surface/brand/disabled",
      "color/on-surface/brand/dimmed",
      "color/on-surface/brand/brand",
      "color/on-surface/brand/dark-brand",
      "color/on-surface/brand/success",
      "color/on-surface/brand/warning",
      "color/on-surface/brand/error",
    ];
    expect(sorted(expected.slice().reverse())).toEqual(expected);
  });

  it("sorts non-surface families by name with t-shirt sizes in size order", () => {
    expect(sorted(["padding/xl", "padding/s", "padding/none", "padding/2xl", "padding/m", "padding/full", "padding/4xs", "padding/xs", "padding/l"])).toEqual([
      "padding/none",
      "padding/4xs",
      "padding/xs",
      "padding/s",
      "padding/m",
      "padding/l",
      "padding/xl",
      "padding/2xl",
      "padding/full",
    ]);
    expect(sorted(["radius/m", "gap/l", "gap/s"])).toEqual(["gap/s", "gap/l", "radius/m"]);
    expect(sorted(["color/border/strong", "color/border/medium", "color/border/brand"])).toEqual([
      "color/border/brand",
      "color/border/medium",
      "color/border/strong",
    ]);
  });

  it("keeps surfaces, on-surface colors and borders apart", () => {
    expect(sorted(["color/border/subtle", "color/on-surface/1/enabled", "color/surface/2/enabled", "color/on-background/primary"])).toEqual([
      "color/surface/2/enabled",
      "color/on-background/primary",
      "color/on-surface/1/enabled",
      "color/border/subtle",
    ]);
  });

  it("sorts objects by name without mutating the input", () => {
    const list = [{ name: "color/surface/2" }, { name: "color/surface/1" }];
    expect(sortByTokenName(list).map((x) => x.name)).toEqual(["color/surface/1", "color/surface/2"]);
    expect(list[0].name).toBe("color/surface/2");
  });
});

describe("search", () => {
  it("matches every word in any order, case-insensitively", () => {
    expect(matchesQuery("color/surface/brand/hover", "brand hov")).toBe(true);
    expect(matchesQuery("color/surface/brand/hover", "HOV  Brand")).toBe(true);
    expect(matchesQuery("color/surface/brand/enabled", "brand hov")).toBe(false);
    expect(matchesQuery("color/surface/brand/enabled", "")).toBe(true);
  });

  it("filters groups and drops the empty ones", () => {
    const groups = [
      { label: "Suggested", options: [{ id: "a", label: "color/surface/1/enabled" }] },
      {
        label: "Fits background",
        options: [
          { id: "b", label: "color/surface/brand/hover" },
          { id: "c", label: "color/surface/brand/enabled" },
        ],
      },
    ];
    expect(filterGroups(groups, "brand hov")).toEqual([{ label: "Fits background", options: [{ id: "b", label: "color/surface/brand/hover" }] }]);
    expect(filterGroups(groups, "nothing")).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats colors as hex with opacity below 1", () => {
    expect(formatValue({ light: { hex: "#0059ff", opacity: 1 } })).toBe("#0059FF");
    expect(formatValue({ light: { hex: "#0059FF", opacity: 0.5 } })).toBe("#0059FF @50%");
    expect(formatValue({ light: { hex: "#000000", opacity: 0 } })).toBe("#000000 @0%");
  });

  it("formats numbers and missing values", () => {
    expect(formatValue({ value: 16 })).toBe("16");
    expect(formatValue({ value: 1.3333 })).toBe("1.33");
    expect(formatValue({})).toBe("");
    expect(formatValue(undefined)).toBe("");
  });

  it("shortens color names and shows number values on the trigger", () => {
    expect(shortName("color/surface/1/enabled")).toBe("surface/1/enabled");
    expect(shortName("padding/m")).toBe("padding/m");
    expect(triggerText("padding/m", { type: "FLOAT", value: 16 })).toBe("padding/m · 16");
    expect(triggerText("color/surface/1", { type: "COLOR" })).toBe("surface/1");
    expect(triggerText("padding/m", undefined)).toBe("padding/m");
  });
});

describe("selection", () => {
  const options = [
    { id: "a", label: "a" },
    { id: "b", label: "b" },
    { id: "c", label: "c" },
  ];

  it("starts on the current value, else the first option", () => {
    expect(initialActive(options, "b")).toBe(1);
    expect(initialActive(options, null)).toBe(0);
    expect(initialActive(options, "gone")).toBe(0);
    expect(initialActive([], "a")).toBe(-1);
  });

  it("moves within bounds", () => {
    expect(moveActive(0, 1, 3)).toBe(1);
    expect(moveActive(2, 1, 3)).toBe(2);
    expect(moveActive(0, -1, 3)).toBe(0);
    expect(moveActive(-1, 1, 3)).toBe(0);
    expect(moveActive(-1, -1, 3)).toBe(2);
    expect(moveActive(0, 1, 0)).toBe(-1);
  });
});
