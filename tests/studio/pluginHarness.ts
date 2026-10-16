// Boots src/code.ts against the in-memory figma API from tests/apply/fakeFigma.ts, and can swap in a guard
// that fails on any write: property assignment anywhere under `figma`, or a call to a mutating method.
import { vi } from "vitest";
import type { PluginToUi, UiToPlugin } from "../../src/types";
import { FakeNode, solid, World, type FakeVariable } from "../apply/fakeFigma";

type Bag = Record<string | symbol, unknown>;

const MUTATING = /^(set|create|remove|delete|append|insert|rename|import|commit|resize|rescale|group|flatten|detach|swap)/;

export interface Relaunch {
  node: string;
  data: Record<string, string>;
}

// Plugin data, shared plugin data and relaunch data on the fake nodes (fakeFigma.ts has none of them).
const proto = FakeNode.prototype as unknown as Bag & { prototype?: never };
Object.assign(proto, {
  getSharedPluginData(this: Bag, ns: string, key: string) {
    return ((this.shared as Record<string, string> | undefined) ?? {})[`${ns}/${key}`] ?? "";
  },
  setSharedPluginData(this: Bag, ns: string, key: string, value: string) {
    this.shared = { ...((this.shared as Record<string, string> | undefined) ?? {}), [`${ns}/${key}`]: value };
  },
  getPluginData(this: Bag, key: string) {
    return ((this.plugin as Record<string, string> | undefined) ?? {})[key] ?? "";
  },
  setPluginData(this: Bag, key: string, value: string) {
    this.plugin = { ...((this.plugin as Record<string, string> | undefined) ?? {}), [key]: value };
  },
  setRelaunchData(this: Bag, data: Record<string, string>) {
    this.relaunch = data;
  },
});

/** `allow`: method or property names the path may still write (e.g. "selection" for the select path). */
export function guard<T extends object>(root: T, writes: string[], allow: string[] = []): T {
  const cache = new WeakMap<object, object>();
  const wrap = (value: unknown, path: string): unknown => {
    if (value instanceof Promise) return value.then((v) => wrap(v, path));
    if (!value || (typeof value !== "object" && typeof value !== "function")) return value;
    const raw = value as object;
    const hit = cache.get(raw);
    if (hit) return hit;
    // Built-ins with internal slots (Map, Set, iterators) only work on the real object; their results are still wrapped.
    const slotted = typeof raw !== "function" && !Array.isArray(raw) && Object.prototype.toString.call(raw) !== "[object Object]";
    const proxy = new Proxy(raw, {
      get(target, prop, receiver) {
        const v = Reflect.get(target, prop, slotted ? target : receiver);
        if (typeof v !== "function") return wrap(v, `${path}.${String(prop)}`);
        const name = String(prop);
        return (...args: unknown[]) => {
          if (MUTATING.test(name) && !allow.includes(name)) {
            writes.push(`${path}.${name}()`);
            throw new Error(`write in a read-only path: ${path}.${name}()`);
          }
          return wrap(Reflect.apply(v, slotted ? target : receiver, args), `${path}.${name}()`);
        };
      },
      set(target, prop, value) {
        if (allow.includes(String(prop))) return Reflect.set(target, prop, value);
        writes.push(`${path}.${String(prop)} =`);
        throw new Error(`write in a read-only path: ${path}.${String(prop)} =`);
      },
      deleteProperty(_target, prop) {
        writes.push(`delete ${path}.${String(prop)}`);
        throw new Error(`write in a read-only path: delete ${path}.${String(prop)}`);
      },
      defineProperty(_target, prop) {
        writes.push(`define ${path}.${String(prop)}`);
        throw new Error(`write in a read-only path: define ${path}.${String(prop)}`);
      },
    });
    cache.set(raw, proxy);
    return proxy;
  };
  return wrap(root, "figma") as T;
}

export interface Card {
  world: World;
  root: FakeNode;
  frame: FakeNode;
  label: FakeNode;
  greeting: FakeNode;
  v: Record<string, FakeVariable>;
}

// "Card Marko": off-convention component name, a default-named frame, a content-named text, raw padding,
// a fill bound straight to a semantic token and a text fill bound to a deleted variable.
export function cardFile(): Card {
  const world = new World();
  const color = world.collection("color", ["light", "dark"]);
  const dims = world.collection("dimensions", ["desktop", "mobile"]);
  const comps = world.collection("components", ["desktop", "mobile"]);
  const v: Record<string, FakeVariable> = {
    page: world.variable(color, "color/background/primary", "COLOR", "#F7F7F7"),
    s1: world.variable(color, "color/surface/1/enabled", "COLOR", "#FFFFFF"),
    on1: world.variable(color, "color/on-surface/1/enabled", "COLOR", "#1A1A1A"),
    padM: world.variable(dims, "padding/m", "FLOAT", 16),
  };
  v.gone = world.variable(comps, "card-marko/color/old-text", "COLOR", world.alias(v.on1));
  comps.variableIds = comps.variableIds.filter((id) => id !== v.gone.id); // deleted, still returned by id

  const label = new FakeNode(world, "TEXT", "label");
  label.characters = "Read more";
  label.fills = [solid("#1A1A1A", v.gone)];
  const frame = new FakeNode(world, "FRAME", "Frame 7").append(label);
  frame.layoutMode = "HORIZONTAL";
  const greeting = new FakeNode(world, "TEXT", "Hello world");
  greeting.characters = "Hello world, nice to see you";
  greeting.fills = [solid("#1A1A1A")];
  const root = new FakeNode(world, "COMPONENT", "Card Marko").append(frame, greeting);
  root.layoutMode = "VERTICAL";
  for (const side of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"] as const) root[side] = 16;
  root.fills = [solid("#FFFFFF", v.s1)];
  world.install();
  return { world, root, frame, label, greeting, v };
}

export interface Plugin {
  posted: PluginToUi[];
  relaunch: Relaunch[];
  viewport: string[][];
  figma: Bag;
  send(msg: UiToPlugin): Promise<void>;
  /** From now on every write under `figma` (except `allow`) is recorded in the returned list and throws. */
  guardWrites(allow?: string[]): string[];
}

export async function bootPlugin(card: Card, opts: { command?: string; selection?: FakeNode[] } = {}): Promise<Plugin> {
  const posted: PluginToUi[] = [];
  const relaunch: Relaunch[] = [];
  const viewport: string[][] = [];
  const f = (globalThis as unknown as { figma: Bag }).figma;
  const page: Bag = {
    id: "page:1",
    type: "PAGE",
    name: "Page 1",
    selection: opts.selection ?? [card.root],
    setRelaunchData: (data: Record<string, string>) => relaunch.push({ node: "page", data }),
  };
  Object.assign(f, {
    command: opts.command ?? "",
    showUI: () => {},
    ui: { postMessage: (m: PluginToUi) => posted.push(m), onmessage: null },
    currentPage: page,
    notify: () => {},
    viewport: { scrollAndZoomIntoView: (nodes: Array<{ id: string }>) => viewport.push(nodes.map((n) => n.id)) },
    setCurrentPageAsync: async (p: Bag) => {
      f.currentPage = p;
    },
  });
  Object.assign(f.root as Bag, {
    name: "Test file",
    setRelaunchData: (data: Record<string, string>) => relaunch.push({ node: "root", data }),
  });
  (globalThis as Bag).__html__ = "<html></html>";
  vi.resetModules();
  await import("../../src/code");
  const handler = (f.ui as Bag).onmessage as (msg: UiToPlugin) => Promise<void>;
  return {
    posted,
    relaunch,
    viewport,
    figma: f,
    send: (msg) => handler(msg),
    guardWrites(allow = []) {
      const writes: string[] = [];
      (globalThis as unknown as { figma: unknown }).figma = guard(f, writes, allow);
      return writes;
    },
  };
}
