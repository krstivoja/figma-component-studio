import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { inspectVariablesShape } from "../../mcp/tools";
import {
  collectBoundVariables,
  INSPECT_MAX_USED_BY,
  INSPECT_MAX_VARIABLES,
  type BoundVariableInfo,
} from "../../src/studioTools";
import type { VariableResolver } from "../../src/scan";
import type { BridgeResponse, PluginToUi } from "../../src/types";
import { FakeNode, MIXED, solid, type FakeCollection, type FakeVariable } from "../apply/fakeFigma";
import { bootPlugin, cardFile, type Card } from "./pluginHarness";

type Bag = Record<string, unknown>;

interface Inspect {
  root: { id: string; name: string; type: string } | null;
  selectionError?: string;
  localCollections: Array<{ id: string; name: string; modes: string[]; variableCount: number; hiddenFromPublishing: boolean }>;
  bound: BoundVariableInfo[];
  truncated: boolean;
  libraryCollections: { collections: Array<Bag>; truncated: boolean } | { error: string };
}

const figmaGlobal = () => (globalThis as unknown as { figma: Bag }).figma;

function responseOf(posted: PluginToUi[]): BridgeResponse {
  const msg = posted.find((m) => m.type === "bridge/response");
  if (!msg || msg.type !== "bridge/response") throw new Error("no bridge response");
  return msg.response;
}

async function inspect(plugin: Awaited<ReturnType<typeof bootPlugin>>, args: unknown = {}): Promise<Inspect> {
  await plugin.send({ type: "bridge/request", request: { id: "r1", tool: "studio_inspect_variables", args } });
  const response = responseOf(plugin.posted);
  if (!response.ok) throw new Error(response.error);
  return response.result as Inspect;
}

interface Fixture {
  card: Card;
  lib: FakeCollection;
  brand: FakeVariable;
  mixed: FakeNode;
  imports: string[];
}

// The card file plus: padding, an effect radius and typography bound to dimensions; a text with mixed segment fills;
// a fill bound to a variable from a library ("Core" > "brand colors"); a team library with two collections.
function fixture(): Fixture {
  const card = cardFile();
  const { world, root, frame, greeting, v } = card;
  const lib = world.collection("brand colors", ["light", "dark"]);
  Object.assign(lib, { remote: true, key: "libcol:brand" });
  const brand = world.variable(lib, "brand/primary", "COLOR", { light: "#0059FF", dark: "#3380FF" }, true);
  Object.assign(brand, { remote: true, key: "var:brand-primary" });

  root.setBoundVariable("paddingLeft", v.padM);
  (frame as unknown as Bag).effects = [{ type: "DROP_SHADOW", visible: true, boundVariables: { radius: world.alias(v.padM) } }];
  greeting.boundVariables.fontSize = [world.alias(v.padM)];
  greeting.fills = [solid("#0059FF", brand)];

  const mixed = new FakeNode(world, "TEXT", "mixed");
  Object.defineProperty(mixed, "fills", { value: MIXED });
  (mixed as unknown as Bag).getStyledTextSegments = () => [
    { characters: "Read", start: 0, end: 4, fills: [solid("#1A1A1A", v.on1)], boundVariables: {} },
    { characters: " more", start: 4, end: 9, fills: [solid("#FFFFFF", v.s1)], boundVariables: { fontSize: [world.alias(v.padM)] } },
  ];
  frame.append(mixed);

  const imports: string[] = [];
  const f = figmaGlobal();
  const variables = f.variables as Bag;
  variables.getLocalVariableCollectionsAsync = async () => world.collections.filter((c) => !(c as unknown as Bag).remote);
  variables.importVariableByKeyAsync = async (key: string) => {
    imports.push(key);
    return null;
  };
  f.teamLibrary = {
    getAvailableLibraryVariableCollectionsAsync: async () => [
      { name: "brand colors", libraryName: "Core", key: "libcol:brand" },
      { name: "spacing", libraryName: "Core", key: "libcol:spacing" },
    ],
    getVariablesInLibraryCollectionAsync: async (key: string) =>
      key === "libcol:brand"
        ? [
            { name: "brand/primary", key: "var:brand-primary", resolvedType: "COLOR" },
            { name: "brand/secondary", key: "var:brand-secondary", resolvedType: "COLOR" },
          ]
        : [{ name: "space/s", key: "var:space-s", resolvedType: "FLOAT" }],
  };
  return { card, lib, brand, mixed, imports };
}

describe("studio_inspect_variables", () => {
  let fx: Fixture;
  beforeEach(() => {
    fx = fixture();
  });

  it("is declared: teamlibrary permission and an optional selection scope", () => {
    const manifest = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
    expect(manifest.permissions).toEqual(["teamlibrary"]);
    const schema = z.object(inspectVariablesShape);
    expect(schema.safeParse({}).success).toBe(true);
    expect(schema.safeParse({ scope: "selection" }).success).toBe(true);
    expect(schema.safeParse({ scope: "file" }).success).toBe(false);
  });

  it("writes nothing and imports nothing (write guard)", async () => {
    const plugin = await bootPlugin(fx.card);
    const writes = plugin.guardWrites();
    const result = await inspect(plugin, { scope: "selection" });

    expect(writes).toEqual([]);
    expect(fx.imports).toEqual([]);
    expect(result.bound.length).toBeGreaterThan(0);
    expect(fx.card.root.name).toBe("Card Marko");
    expect(fx.card.root.boundVariables).toEqual({ paddingLeft: { type: "VARIABLE_ALIAS", id: fx.card.v.padM.id } });
  });

  it("lists local collections with mode names, variable counts and publishing flag", async () => {
    const plugin = await bootPlugin(fx.card);
    plugin.guardWrites();
    const result = await inspect(plugin);
    expect(result.root).toEqual({ id: fx.card.root.id, name: "Card Marko", type: "COMPONENT" });
    expect(result.localCollections).toEqual([
      { id: "col:color", name: "color", modes: ["light", "dark"], variableCount: 3, hiddenFromPublishing: false },
      { id: "col:dimensions", name: "dimensions", modes: ["desktop", "mobile"], variableCount: 1, hiddenFromPublishing: false },
      { id: "col:components", name: "components", modes: ["desktop", "mobile"], variableCount: 0, hiddenFromPublishing: false },
    ]);
  });

  it("groups every binding by variable with resolved values per mode and where it is used", async () => {
    const plugin = await bootPlugin(fx.card);
    plugin.guardWrites();
    const { bound, truncated } = await inspect(plugin);
    const byName = (name: string) => bound.find((b) => b.name === name)!;
    expect(truncated).toBe(false);

    expect(byName("padding/m")).toEqual({
      id: fx.card.v.padM.id,
      name: "padding/m",
      resolvedType: "FLOAT",
      collection: { id: "col:dimensions", name: "dimensions" },
      remote: false,
      key: null,
      values: { desktop: 16, mobile: 16 },
      usedBy: [
        { layerPath: "Card Marko", field: "paddingLeft" },
        { layerPath: "Card Marko › Frame 7", field: "effects[0].radius" },
        { layerPath: "Card Marko › Frame 7 › mixed", field: "text[4-9].fontSize" },
        { layerPath: "Card Marko › Hello world", field: "fontSize" },
      ],
    } satisfies BoundVariableInfo);

    expect(byName("color/surface/1/enabled")).toMatchObject({
      values: { light: "#FFFFFF", dark: "#FFFFFF" },
      usedBy: [
        { layerPath: "Card Marko", field: "fills[0].color" },
        { layerPath: "Card Marko › Frame 7 › mixed", field: "text[4-9].fills[0].color" },
      ],
    });
    expect(byName("color/on-surface/1/enabled").usedBy).toEqual([{ layerPath: "Card Marko › Frame 7 › mixed", field: "text[0-4].fills[0].color" }]);

    // Soft-deleted variable: still resolves through its alias, flagged missing.
    expect(byName("card-marko/color/old-text")).toMatchObject({
      missing: true,
      collection: { id: "col:components", name: "components" },
      values: { desktop: "#1A1A1A", mobile: "#1A1A1A" },
      aliasOf: { desktop: "color/on-surface/1/enabled", mobile: "color/on-surface/1/enabled" },
      usedBy: [{ layerPath: "Card Marko › Frame 7 › label", field: "fills[0].color" }],
    });

    expect(byName("brand/primary")).toMatchObject({
      remote: true,
      key: "var:brand-primary",
      collection: { id: "col:brand colors", name: "brand colors" },
      libraryCollection: "brand colors",
      libraryName: "Core",
      values: { light: "#0059FF", dark: "#3380FF" },
      usedBy: [{ layerPath: "Card Marko › Hello world", field: "fills[0].color" }],
    });
    expect(byName("padding/m").libraryCollection).toBeUndefined();
  });

  it("lists library collections with variable counts, names only", async () => {
    const plugin = await bootPlugin(fx.card);
    plugin.guardWrites();
    const { libraryCollections } = await inspect(plugin);
    expect(libraryCollections).toEqual({
      collections: [
        { name: "brand colors", libraryName: "Core", key: "libcol:brand", variableCount: 2 },
        { name: "spacing", libraryName: "Core", key: "libcol:spacing", variableCount: 1 },
      ],
      truncated: false,
    });
  });

  it("reports a missing teamlibrary permission for that part only", async () => {
    figmaGlobal().teamLibrary = {
      getAvailableLibraryVariableCollectionsAsync: async () => {
        throw new Error('"teamlibrary" permission not specified in manifest.json');
      },
    };
    const plugin = await bootPlugin(fx.card);
    const writes = plugin.guardWrites();
    const result = await inspect(plugin);
    expect(writes).toEqual([]);
    expect(result.libraryCollections).toEqual({ error: 'Library collections are not available: "teamlibrary" permission not specified in manifest.json' });
    expect(result.localCollections).toHaveLength(3);
    const brand = result.bound.find((b) => b.name === "brand/primary")!;
    expect(brand).toMatchObject({ libraryCollection: "brand colors", libraryName: null });
  });

  it("keeps a per-collection error when one library cannot be read", async () => {
    const team = figmaGlobal().teamLibrary as Bag;
    const original = team.getVariablesInLibraryCollectionAsync as (k: string) => Promise<unknown[]>;
    team.getVariablesInLibraryCollectionAsync = async (key: string) => {
      if (key === "libcol:spacing") throw new Error("not published");
      return original(key);
    };
    const plugin = await bootPlugin(fx.card);
    plugin.guardWrites();
    const { libraryCollections } = await inspect(plugin);
    expect(libraryCollections).toMatchObject({
      collections: [{ key: "libcol:brand", variableCount: 2 }, { key: "libcol:spacing", variableCount: null, error: "not published" }],
    });
  });

  it("answers without a selection: collections only, root null", async () => {
    const plugin = await bootPlugin(fx.card, { selection: [] });
    plugin.guardWrites();
    const result = await inspect(plugin);
    expect(result.root).toBeNull();
    expect(result.selectionError).toMatch(/Select one component/);
    expect(result.bound).toEqual([]);
    expect(result.localCollections).toHaveLength(3);
  });
});

describe("collectBoundVariables caps", () => {
  const alias = (id: string) => ({ type: "VARIABLE_ALIAS", id });
  const node = (name: string, boundVariables: Bag, children: unknown[] = []) => ({ type: "FRAME", name, boundVariables, children });
  const resolver: VariableResolver = {
    getVariable: async () => null,
    getCollection: async () => null,
    resolve: async () => null,
  };

  it(`stops at ${INSPECT_MAX_VARIABLES} variables and ${INSPECT_MAX_USED_BY} uses each, and says so`, async () => {
    const children = [
      ...Array.from({ length: INSPECT_MAX_VARIABLES + 20 }, (_, i) => node(`a${i}`, { paddingLeft: alias(`v${i}`) })),
      ...Array.from({ length: INSPECT_MAX_USED_BY + 10 }, (_, i) => node(`b${i}`, { itemSpacing: alias("v0") })),
    ];
    const root = node("root", {}, children) as unknown as SceneNode;
    const { variables, truncated } = await collectBoundVariables(root, resolver);
    expect(truncated).toBe(true);
    expect(variables).toHaveLength(INSPECT_MAX_VARIABLES);
    const v0 = variables.find((v) => v.id === "v0")!;
    expect(v0.usedBy).toHaveLength(INSPECT_MAX_USED_BY);
    expect(v0.usedByTruncated).toBe(true);
    expect(v0).toMatchObject({ name: null, missing: true, values: {} });
  });

  it("not truncated when under the caps", async () => {
    const root = node("root", { paddingTop: alias("v1"), componentProperties: { label: alias("v2") } }) as unknown as SceneNode;
    const { variables, truncated } = await collectBoundVariables(root, resolver);
    expect(truncated).toBe(false);
    expect(variables.map((v) => [v.id, v.usedBy])).toEqual([
      ["v1", [{ layerPath: "root", field: "paddingTop" }]],
      ["v2", [{ layerPath: "root", field: "componentProperties.label" }]],
    ]);
  });
});
