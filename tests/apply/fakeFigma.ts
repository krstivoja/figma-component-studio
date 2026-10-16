// In-memory stand-in for the parts of the Figma plugin API that scan, apply, snapshot and audit use.
type Bag = Record<string, unknown>;
type Alias = { type: "VARIABLE_ALIAS"; id: string };
type Rgb = { r: number; g: number; b: number };
type VarType = "COLOR" | "FLOAT" | "STRING";

export const MIXED = Symbol("mixed");

export interface FakeCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

export interface FakeVariable {
  id: string;
  name: string;
  variableCollectionId: string;
  resolvedType: VarType;
  valuesByMode: Record<string, unknown>;
  remote: boolean;
  scopes: string[];
  setValueForMode(modeId: string, value: unknown): void;
  pluginData: Record<string, string>;
  setPluginData(key: string, value: string): void;
  getPluginData(key: string): string;
}

const isAlias = (v: unknown): v is Alias => !!v && typeof v === "object" && (v as Bag).type === "VARIABLE_ALIAS";

export function rgb(hex: string): Rgb {
  const h = hex.replace("#", "");
  return { r: parseInt(h.slice(0, 2), 16) / 255, g: parseInt(h.slice(2, 4), 16) / 255, b: parseInt(h.slice(4, 6), 16) / 255 };
}

export class World {
  collections: FakeCollection[] = [];
  variables = new Map<string, FakeVariable>();
  nodes = new Map<string, FakeNode>();
  fonts = new Set<string>(["Inter|Regular"]);
  private seq = 0;

  collection(name: string, modes: string[]): FakeCollection {
    const c: FakeCollection = {
      id: `col:${name}`,
      name,
      modes: modes.map((m) => ({ modeId: `${name}:${m}`, name: m })),
      defaultModeId: `${name}:${modes[0]}`,
      variableIds: [],
    };
    this.collections.push(c);
    return c;
  }

  variable(collection: FakeCollection, name: string, type: VarType, value: unknown | Record<string, unknown>, perMode = false): FakeVariable {
    const v: FakeVariable = {
      id: `var:${collection.name}/${name}`,
      name,
      variableCollectionId: collection.id,
      resolvedType: type,
      valuesByMode: {},
      remote: false,
      scopes: ["ALL_SCOPES"],
      setValueForMode(modeId, val) {
        this.valuesByMode[modeId] = val;
      },
      pluginData: {},
      setPluginData(key, val) {
        this.pluginData[key] = val;
      },
      getPluginData(key) {
        return this.pluginData[key] ?? "";
      },
    };
    for (const m of collection.modes) {
      const raw = perMode ? (value as Record<string, unknown>)[m.name] : value;
      v.valuesByMode[m.modeId] = typeof raw === "string" && type === "COLOR" ? rgb(raw) : raw;
    }
    collection.variableIds.push(v.id);
    this.variables.set(v.id, v);
    return v;
  }

  alias(target: FakeVariable): Alias {
    return { type: "VARIABLE_ALIAS", id: target.id };
  }

  resolve(id: string): unknown {
    let v = this.variables.get(id);
    for (let depth = 0; v && depth < 16; depth++) {
      const col = this.collections.find((c) => c.id === v!.variableCollectionId)!;
      const value = v.valuesByMode[col.defaultModeId];
      if (!isAlias(value)) return value;
      v = this.variables.get(value.id);
    }
    return undefined;
  }

  nextId(): string {
    this.seq++;
    return `${this.seq}:1`;
  }

  install(): void {
    const world = this;
    (globalThis as Bag).figma = {
      mixed: MIXED,
      variables: {
        getLocalVariableCollectionsAsync: async () => world.collections,
        getVariableByIdAsync: async (id: string) => world.variables.get(id) ?? null,
        getVariableCollectionByIdAsync: async (id: string) => world.collections.find((c) => c.id === id) ?? null,
        createVariable(name: string, collection: FakeCollection, type: VarType) {
          const v = world.variable(collection, name, type, undefined);
          v.valuesByMode = {};
          return v;
        },
        setBoundVariableForPaint(paint: Bag, _field: string, variable: FakeVariable) {
          return { ...paint, boundVariables: { color: world.alias(variable) } };
        },
      },
      getNodeByIdAsync: async (id: string) => world.nodes.get(id) ?? null,
      loadAllPagesAsync: async () => {},
      root: {
        findAllWithCriteria: ({ types }: { types: string[] }) => [...world.nodes.values()].filter((n) => types.includes(n.type)),
      },
      loadFontAsync: async (font: { family: string; style: string }) => {
        if (!world.fonts.has(`${font.family}|${font.style}`)) throw new Error("font not available");
      },
    };
  }
}

const TEXT_FIELDS = new Set(["fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing"]);

export class FakeNode {
  id: string;
  visible = true;
  width = 100;
  height = 40;
  layoutMode: "NONE" | "HORIZONTAL" | "VERTICAL" = "NONE";
  layoutWrap = "NO_WRAP";
  primaryAxisAlignItems = "MIN";
  layoutSizingHorizontal = "HUG";
  layoutSizingVertical = "HUG";
  paddingLeft = 0;
  paddingRight = 0;
  paddingTop = 0;
  paddingBottom = 0;
  itemSpacing = 0;
  counterAxisSpacing = 0;
  topLeftRadius = 0;
  topRightRadius = 0;
  bottomLeftRadius = 0;
  bottomRightRadius = 0;
  strokeWeight = 0;
  strokes: Bag[] = [];
  isMask = false;
  boundVariables: Bag = {};
  children: FakeNode[] = [];
  parent: FakeNode | null = null;
  characters = "";
  fontName: { family: string; style: string } = { family: "Inter", style: "Regular" };
  fontSize = 12;
  lineHeight: Bag = { unit: "AUTO" };
  letterSpacing: Bag = { unit: "PERCENT", value: 0 };
  hasMissingFont = false;
  private paints: Bag[] = [];

  constructor(
    private world: World,
    public type: "COMPONENT_SET" | "COMPONENT" | "FRAME" | "TEXT",
    public name: string,
  ) {
    this.id = world.nextId();
    world.nodes.set(this.id, this);
    if (type === "TEXT") this.characters = name;
  }

  // Bound paints show their variable's current value, like Figma does after an alias change.
  get fills(): Bag[] {
    return this.paints.map((p) => {
      const id = ((p.boundVariables as Bag | undefined)?.color as Alias | undefined)?.id;
      const value = id ? this.world.resolve(id) : undefined;
      return value ? { ...p, color: value } : p;
    });
  }

  set fills(value: Bag[]) {
    this.paints = value.map((p) => ({ ...p }));
  }

  append(...children: FakeNode[]): this {
    for (const c of children) {
      c.parent = this;
      this.children.push(c);
    }
    return this;
  }

  getStyledTextSegments(): Array<{ fontSize: number }> {
    return [{ fontSize: this.fontSize }];
  }

  getRangeAllFontNames(): Array<{ family: string; style: string }> {
    return [this.fontName];
  }

  async getMainComponentAsync(): Promise<null> {
    return null;
  }

  setBoundVariable(field: string, variable: FakeVariable | null): void {
    if (!variable) {
      delete this.boundVariables[field];
      return;
    }
    const value = this.world.resolve(variable.id);
    if (TEXT_FIELDS.has(field)) {
      if (this.type !== "TEXT") throw new Error(`${field} on ${this.type}`);
      this.boundVariables[field] = [this.world.alias(variable)];
      if (field === "fontFamily") this.fontName = { ...this.fontName, family: value as string };
      else if (field === "fontStyle") this.fontName = { ...this.fontName, style: value as string };
      else if (field === "fontSize") this.fontSize = value as number;
      else this[field as "lineHeight" | "letterSpacing"] = { unit: "PIXELS", value };
      return;
    }
    this.boundVariables[field] = this.world.alias(variable);
    (this as unknown as Bag)[field] = value;
  }
}

export function solid(hex: string, variable?: FakeVariable): Bag {
  return {
    type: "SOLID",
    visible: true,
    opacity: 1,
    color: rgb(hex),
    ...(variable ? { boundVariables: { color: { type: "VARIABLE_ALIAS", id: variable.id } } } : {}),
  };
}
