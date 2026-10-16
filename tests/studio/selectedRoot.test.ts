import { afterEach, describe, expect, it } from "vitest";
import { selectedRoot } from "../../src/studioTools";

type Fake = { id: string; type: string; parent: Fake | null };

const node = (id: string, type: string, parent: Fake | null): Fake => ({ id, type, parent });

function select(n: Fake) {
  (globalThis as unknown as { figma: unknown }).figma = { currentPage: { selection: [n] } };
}

afterEach(() => {
  delete (globalThis as unknown as { figma?: unknown }).figma;
});

describe("selectedRoot", () => {
  const page = node("0:1", "PAGE", null);
  const screen = node("1:1", "FRAME", page);
  const control = node("1:2", "FRAME", screen);
  const action = node("1:3", "FRAME", control);
  const label = node("1:4", "TEXT", action);

  it("a frame outside any component is its own root, not the top-level screen", () => {
    select(control);
    expect(selectedRoot().id).toBe("1:2");
  });

  it("a text or shape outside any component resolves to its nearest frame", () => {
    select(label);
    expect(selectedRoot().id).toBe("1:3");
  });

  it("a layer inside a component resolves to the component, even through inner frames", () => {
    const component = node("2:1", "COMPONENT", page);
    const inner = node("2:2", "FRAME", component);
    select(node("2:3", "TEXT", inner));
    expect(selectedRoot().id).toBe("2:1");
  });

  it("a variant resolves to its component set", () => {
    const set = node("3:1", "COMPONENT_SET", page);
    select(node("3:2", "FRAME", node("3:3", "COMPONENT", set)));
    expect(selectedRoot().id).toBe("3:1");
  });

  it("a loose shape on the page is refused", () => {
    select(node("4:1", "RECTANGLE", page));
    expect(() => selectedRoot()).toThrow("not inside a component or a frame");
  });
});
