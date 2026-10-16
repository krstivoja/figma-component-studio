// "Segmented control" copied from the Core library (node 12466:364), rebuilt from studio_inspect_variables
// (2026-10-16): every bound variable is REMOTE, names carry their collection ("color/surface/…", "font/…"),
// ids, values and alias targets as inspected. The file's own variables use the local scheme ("surface/1/enabled"
// in the "color" collection) and the team library lists no collections.
import { FakeNode, solid, World, type FakeCollection, type FakeVariable } from "../apply/fakeFigma";
import type { Card } from "../studio/pluginHarness";

type Bag = Record<string, unknown>;

export const COLOR_COLLECTION_ID = "VariableCollectionId:76ca6935c3a0c9517ed3011997315bd9f6ff90e4/8465:1";
export const TYPOGRAPHY_COLLECTION_ID = "VariableCollectionId:a390b2693519299778ce19ce323910b6264d7aaf/4027:71";

export const LIBRARY_IDS = {
  surfaceSecondary: "VariableID:9425a1191d562bf240fa8b4f876814002f5296b5/8703:29",
  surfaceAccentPrimary: "VariableID:5ddc6b1b0256ea015d0de6ca0835c10767971336/8703:31",
  weightLabelM: "VariableID:de7e46978252502ed6c58e1e5eb24442acc76347/4602:119",
  familyLabel: "VariableID:c29cf8605e1be251b0c80e8a27585eab5a3faacf/4602:88",
  surfacePrimary: "VariableID:6a87bbb2db8eee9ddd08a2b7cf1132685af3423d/8703:23",
  onSurfacePrimary: "VariableID:baf40ee169b4da0be3ef464e65781e8e66ac30aa/8703:44",
} as const;

export interface CoreFile extends Card {
  action1: FakeNode;
  action1Label: FakeNode;
  action2: FakeNode;
  action2Label: FakeNode;
  lib: Record<keyof typeof LIBRARY_IDS, FakeVariable>;
  /** Library `color/surface/accent/primary/hover` (brand blue/50, brand blue/20), unbound until a test binds it. */
  accentHover: FakeVariable;
  /** Keys passed to importVariableByKeyAsync / importVariableCollection…: must stay empty. */
  imports: string[];
}

function remoteCollection(world: World, id: string, name: string, modes: string[], key: string): FakeCollection {
  const c = world.collection(`remote ${name}`, modes);
  Object.assign(c, { id, name, remote: true, key });
  c.modes = modes.map((m) => ({ modeId: `${id}:${m}`, name: m }));
  c.defaultModeId = c.modes[0].modeId;
  return c;
}

// values: by mode name; a FakeVariable value is an alias to it.
function remoteVar(world: World, col: FakeCollection, id: string | null, name: string, type: "COLOR" | "STRING", values: Record<string, string | FakeVariable>): FakeVariable {
  const v = world.variable(col, name, type, undefined);
  world.variables.delete(v.id);
  col.variableIds = col.variableIds.filter((x) => x !== v.id);
  v.id = id ?? `VariableID:core/${name}`;
  Object.assign(v, { remote: true, key: v.id.slice("VariableID:".length).split("/")[0] });
  for (const m of col.modes) {
    const raw = values[m.name];
    v.valuesByMode[m.modeId] = typeof raw === "string" ? (type === "COLOR" ? hex(raw) : raw) : world.alias(raw);
  }
  col.variableIds.push(v.id);
  world.variables.set(v.id, v);
  return v;
}

function hex(h: string): { r: number; g: number; b: number } {
  const x = h.replace("#", "");
  return { r: parseInt(x.slice(0, 2), 16) / 255, g: parseInt(x.slice(2, 4), 16) / 255, b: parseInt(x.slice(4, 6), 16) / 255 };
}

export interface CoreOptions {
  /** The file's brand surfaces (`surface/brand/*` aliasing `_global` "brand blue/*"); on by default, as in the user's file. */
  localBrand?: boolean;
}

export function coreFile(opts: CoreOptions = {}): CoreFile {
  const world = new World();
  // The file's own variables, local scheme: names without the collection prefix, colors aliasing `_global` primitives.
  const global = world.collection("_global", ["global"]);
  const color = world.collection("color", ["light", "dark"]);
  const dims = world.collection("dimensions", ["desktop", "mobile"]);
  world.collection("typography", ["desktop", "mobile"]);
  world.collection("components", ["desktop", "mobile"]);
  const v: Record<string, FakeVariable> = {
    page: world.variable(color, "background/primary", "COLOR", { light: "#F7F7F7", dark: "#111111" }, true),
    s1: world.variable(color, "surface/1/enabled", "COLOR", { light: "#FFFFFF", dark: "#1A1A1A" }, true),
    on1: world.variable(color, "on-surface/1/enabled", "COLOR", { light: "#1A1A1A", dark: "#FFFFFF" }, true),
    padS: world.variable(dims, "padding/s", "FLOAT", 12),
  };
  if (opts.localBrand ?? true) {
    const g = (name: string, hex: string) => world.variable(global, name, "COLOR", hex);
    const p = {
      white: g("white", "#FFFFFF"),
      b20: g("brand blue/20", "#6699FF"),
      b30: g("brand blue/30", "#3B8DFF"),
      b40: g("brand blue/40", "#0059FF"),
      b50: g("brand blue/50", "#0047CC"),
    };
    const local = (name: string, light: FakeVariable, dark: FakeVariable) =>
      world.variable(color, name, "COLOR", { light: world.alias(light), dark: world.alias(dark) }, true);
    Object.assign(v, {
      brand: local("surface/brand/enabled", p.b40, p.b30),
      brandHover: local("surface/brand/hover", p.b50, p.b20),
      onBrand: local("on-surface/brand/enabled", p.white, p.white),
      onBrandHover: local("on-surface/brand/hover", p.white, p.white),
    });
  }

  // The Core library, as far as the selection reaches it.
  const rc = remoteCollection(world, COLOR_COLLECTION_ID, "color", ["light", "dark"], "76ca6935c3a0c9517ed3011997315bd9f6ff90e4");
  const rt = remoteCollection(world, TYPOGRAPHY_COLLECTION_ID, "typography", ["desktop", "mobile"], "a390b2693519299778ce19ce323910b6264d7aaf");
  const prim = (name: string, value: string) => remoteVar(world, rc, null, name, "COLOR", { light: value, dark: value });
  const neutral10 = prim("color/neutral/10", "#F2F4FF");
  const neutral100 = prim("color/neutral/100", "#1F222D");
  const blue40 = prim("color/brand blue/40", "#0059FF");
  const blue30 = prim("color/brand blue/30", "#3B8DFF");
  const white = prim("color/white", "#FFFFFF");
  const blue90 = prim("color/brand blue/90", "#15151C");
  const blue50 = prim("color/brand blue/50", "#0047CC");
  const blue20 = prim("color/brand blue/20", "#6699FF");
  const blue80 = prim("color/brand blue/80", "#001B4D");
  const semiBold = remoteVar(world, rt, null, "typography/weight/semiBold", "STRING", { desktop: "semiBold", mobile: "semiBold" });
  const spline = remoteVar(world, rt, null, "typography/family/Spline Sans", "STRING", { desktop: "Spline Sans", mobile: "Spline Sans" });
  const lib = {
    surfaceSecondary: remoteVar(world, rc, LIBRARY_IDS.surfaceSecondary, "color/surface/secondary/enabled", "COLOR", { light: neutral10, dark: neutral100 }),
    surfaceAccentPrimary: remoteVar(world, rc, LIBRARY_IDS.surfaceAccentPrimary, "color/surface/accent/primary/enabled", "COLOR", { light: blue40, dark: blue30 }),
    weightLabelM: remoteVar(world, rt, LIBRARY_IDS.weightLabelM, "font/weight/label/m", "STRING", { desktop: semiBold, mobile: semiBold }),
    familyLabel: remoteVar(world, rt, LIBRARY_IDS.familyLabel, "font/family/label", "STRING", { desktop: spline, mobile: spline }),
    surfacePrimary: remoteVar(world, rc, LIBRARY_IDS.surfacePrimary, "color/surface/primary/enabled", "COLOR", { light: white, dark: blue90 }),
    onSurfacePrimary: remoteVar(world, rc, LIBRARY_IDS.onSurfacePrimary, "color/on-surface/primary/enabled", "COLOR", { light: blue80, dark: white }),
  };

  // In the library, not bound by the inspected selection; tests bind it to check state-aware pairing.
  const accentHover = remoteVar(world, rc, null, "color/surface/accent/primary/hover", "COLOR", { light: blue50, dark: blue20 });

  const label = (characters: string, fill: FakeVariable) => {
    const t = new FakeNode(world, "TEXT", "label-text");
    t.characters = characters;
    t.fontName = { family: "Spline Sans", style: "semiBold" };
    t.fontSize = 14;
    t.fills = [solid("#000000", fill)]; // the getter shows the variable's value
    t.boundVariables.fontStyle = [world.alias(lib.weightLabelM)];
    t.boundVariables.fontFamily = [world.alias(lib.familyLabel)];
    return t;
  };
  const action1Label = label("Day", lib.surfacePrimary); // white text on the accent segment: wrong family
  const action2Label = label("Week", lib.onSurfacePrimary); // on-surface/primary on surface/secondary: off its pair
  const action1 = new FakeNode(world, "FRAME", "Action 1").append(action1Label);
  action1.fills = [solid("#000000", lib.surfaceAccentPrimary)];
  const action2 = new FakeNode(world, "FRAME", "Action 2").append(action2Label);
  action2.fills = [solid("#000000", lib.surfaceSecondary)];
  const root = new FakeNode(world, "FRAME", "Segmented control").append(action1, action2);
  root.fills = [solid("#000000", lib.surfaceSecondary)];
  world.install();

  const imports: string[] = [];
  const f = (globalThis as unknown as { figma: Bag }).figma;
  const variables = f.variables as Bag;
  variables.getLocalVariableCollectionsAsync = async () => world.collections.filter((c) => !(c as unknown as Bag).remote);
  variables.importVariableByKeyAsync = async (key: string) => {
    imports.push(key);
    return null;
  };
  f.teamLibrary = {
    getAvailableLibraryVariableCollectionsAsync: async () => [],
    getVariablesInLibraryCollectionAsync: async () => [],
  };

  return { world, root, frame: action1, label: action1Label, greeting: action2Label, v, action1, action1Label, action2, action2Label, lib, accentHover, imports };
}
