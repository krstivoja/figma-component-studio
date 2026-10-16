import { describe, expect, it } from "vitest";
import { structureHash, type HashNode } from "../../src/structureHash";

const vector = (): HashNode => ({
  type: "COMPONENT",
  name: "Button",
  children: [
    { type: "TEXT", name: "label" },
    {
      type: "FRAME",
      name: "icon-wrapper",
      children: [{ type: "INSTANCE", name: "icon", children: [{ type: "VECTOR", name: "Vector" }] }],
    },
  ],
});

describe("structureHash", () => {
  it("matches the fixed vector shared with the naming skill", () => {
    expect(structureHash(vector())).toBe("dea2e91f");
  });

  it("changes when a child name changes", () => {
    const t = vector();
    (t.children![0] as { name: string }).name = "title";
    expect(structureHash(t)).not.toBe(structureHash(vector()));
  });

  it("ignores the root name", () => {
    expect(structureHash({ ...vector(), name: "Other" })).toBe(structureHash(vector()));
  });

  it("ignores instance children", () => {
    const t = vector();
    const inst = t.children![1].children![0] as { children?: readonly HashNode[] };
    inst.children = [{ type: "RECTANGLE", name: "Changed" }, { type: "VECTOR", name: "More" }];
    expect(structureHash(t)).toBe(structureHash(vector()));
  });

  it("includes hidden layers", () => {
    const hidden = { ...vector(), children: [...vector().children!, { type: "RECTANGLE", name: "hidden", visible: false }] };
    expect(structureHash(hidden)).not.toBe(structureHash(vector()));
  });
});
