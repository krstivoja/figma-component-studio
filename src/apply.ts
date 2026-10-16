import { getLiveVariable } from "./variables";
import { normalizeComponentName } from "./naming";
import { ownTokenPrefix } from "./proposal";
import { textStyleOf } from "./scan";
import { COMPONENT_ID_KEY, type BindableField, type Catalog, type Mode, type Proposal, type RawValueUse, type TextStyleValues, type TokenProposal, type TypographyProposal } from "./types";

export interface ApplyOutcome {
  renamed: number;
  tokensCreated: number;
  tokensReused: number;
  bound: number;
  aliasesChanged: number;
  tokenRenames: Array<{ from: string; to: string }>;
  skipped: string[];
}

const MODES: Mode[] = ["desktop", "mobile"];
const CORNERS: BindableField[] = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
const CREATED_BY = "component-studio";

export function scopesFor(token: Pick<TokenProposal, "name" | "type">): VariableScope[] {
  const segments = token.name.split("/").map((s) => s.toLowerCase());
  const category = segments.findIndex((s) => s === "color" || s === "spacing" || s === "shape");
  const searched = category >= 0 ? segments.slice(category + 1) : segments;

  if (token.type === "COLOR") {
    for (const s of searched) {
      if (s === "background") return ["FRAME_FILL", "SHAPE_FILL"];
      if (s === "text" || s === "icon") return ["TEXT_FILL", "SHAPE_FILL"];
      if (s === "border") return ["STROKE_COLOR"];
      if (s.startsWith("shadow")) return ["EFFECT_COLOR"];
    }
    return ["ALL_SCOPES"];
  }

  for (const s of searched) {
    if (s.startsWith("padding") || s.startsWith("gap") || s.endsWith("spacing")) return ["GAP"];
    if (s.startsWith("cornerradius") || s.startsWith("radius")) return ["CORNER_RADIUS"];
    if (s.startsWith("stroke")) return ["STROKE_FLOAT"];
    if (s.startsWith("shadow")) return ["EFFECT_FLOAT"];
    if (/^(min|max)?(width|height)$/.test(s) || s === "diameter" || s === "size") return ["WIDTH_HEIGHT"];
  }
  return ["ALL_SCOPES"];
}

// The scan emits one use per corner, so each use binds only its own corner; the group is for callers that need it.
export function radiusFieldsFor(field: BindableField): BindableField[] {
  return CORNERS.includes(field) ? [...CORNERS] : [];
}

export function hexFromRgb(c: { r: number; g: number; b: number }): string {
  return (
    "#" +
    [c.r, c.g, c.b]
      .map((x) => Math.round(x * 255).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

export function numberMatches(expected: number | null, actual: unknown): boolean {
  return expected !== null && typeof actual === "number" && Math.abs(actual - expected) < 0.01;
}

export function paintMatches(
  use: Pick<RawValueUse, "hex" | "opacity">,
  paint: { type: string; color?: { r: number; g: number; b: number }; opacity?: number; boundVariables?: { color?: unknown } } | undefined,
): boolean {
  if (!paint || paint.type !== "SOLID" || !paint.color || paint.boundVariables?.color) return false;
  if (use.hex === null || hexFromRgb(paint.color) !== use.hex.toUpperCase()) return false;
  return Math.abs((paint.opacity ?? 1) - (use.opacity ?? 1)) < 0.005;
}

export function aliasesMatch(
  valuesByMode: Record<string, unknown>,
  modeIds: Record<Mode, string | null>,
  alias: Record<Mode, string | null>,
): boolean {
  return MODES.every((mode) => {
    const modeId = modeIds[mode];
    if (!modeId) return false;
    const v = valuesByMode[modeId] as { type?: string; id?: string } | undefined;
    return !!v && v.type === "VARIABLE_ALIAS" && v.id === alias[mode];
  });
}

const CATEGORY_ORDER = ["color", "spacing", "shape"];

function componentPrefix(componentName: string): string {
  return ownTokenPrefix(normalizeComponentName(componentName) ?? componentName);
}

export function mayChangeAlias(tokenName: string, componentName: string): boolean {
  const prefix = componentPrefix(componentName);
  return tokenName.startsWith(prefix) && tokenName.length > prefix.length;
}

function comparePaths(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}

// Figma cannot reorder variables, so creation order is the order the components collection shows.
export function creationOrder<T extends Pick<TokenProposal, "name" | "uses">>(tokens: T[], componentName: string): T[] {
  const prefix = componentPrefix(componentName);
  const keyOf = (t: T) => {
    const rest = t.name.startsWith(prefix) ? t.name.slice(prefix.length).split("/") : null;
    const cat = rest ? rest.findIndex((s) => CATEGORY_ORDER.includes(s)) : -1;
    if (!rest || cat < 0) return { depth: Number.MAX_SAFE_INTEGER, layer: [] as number[], category: 0 };
    const paths = t.uses.map((u) => u.indexPath).sort(comparePaths);
    return {
      depth: cat,
      layer: cat === 0 ? [] : (paths[0] ?? [Number.MAX_SAFE_INTEGER]),
      category: CATEGORY_ORDER.indexOf(rest[cat]),
    };
  };
  const keys = new Map(tokens.map((t) => [t, keyOf(t)]));
  return [...tokens].sort((a, b) => {
    const x = keys.get(a)!;
    const y = keys.get(b)!;
    return (
      x.depth - y.depth ||
      comparePaths(x.layer, y.layer) ||
      x.category - y.category ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    );
  });
}

export function withoutBinding<P extends { boundVariables?: unknown }>(paint: P): Omit<P, "boundVariables"> {
  const { boundVariables: _drop, ...rest } = paint;
  return rest;
}

export function describeUse(use: Pick<RawValueUse, "layerName" | "field" | "indexPath" | "variantId">): string {
  return `"${use.layerName}" ${use.field} (variant ${use.variantId}, path [${use.indexPath.join(",")}])`;
}

function nodeAtPath(root: SceneNode, path: number[]): SceneNode | null {
  let node: SceneNode = root;
  for (const i of path) {
    if (!("children" in node)) return null;
    const next: SceneNode | undefined = node.children[i];
    if (!next) return null;
    node = next;
  }
  return node;
}

async function loadFontsFor(node: TextNode): Promise<string | null> {
  if (node.hasMissingFont) return "missing font";
  const fonts =
    node.fontName === figma.mixed ? node.getRangeAllFontNames(0, node.characters.length) : [node.fontName as FontName];
  for (const font of fonts) {
    try {
      await figma.loadFontAsync(font);
    } catch {
      return `font ${font.family} ${font.style} not available`;
    }
  }
  return null;
}

function renameLayers(proposal: Proposal, variants: Array<ComponentNode | FrameNode>, out: ApplyOutcome): void {
  for (const rename of proposal.renames) {
    if (rename.skip) continue;
    for (const variant of variants) {
      try {
        const node = nodeAtPath(variant, rename.indexPath);
        if (!node) {
          out.skipped.push(`Rename "${rename.oldName}" -> "${rename.newName}": no layer at [${rename.indexPath.join(",")}] in "${variant.name}".`);
          continue;
        }
        if (node.name === rename.newName) continue;
        if (node.name !== rename.oldName) {
          out.skipped.push(`Rename "${rename.oldName}" -> "${rename.newName}": layer in "${variant.name}" is named "${node.name}".`);
          continue;
        }
        node.name = rename.newName;
        out.renamed++;
      } catch (e) {
        out.skipped.push(`Rename "${rename.oldName}" in "${variant.name}" failed: ${errorText(e)}`);
      }
    }
  }
}

async function resolveToken(
  token: TokenProposal,
  collection: VariableCollection,
  existing: Map<string, Variable>,
  catalog: Catalog,
  componentId: string,
  out: ApplyOutcome,
): Promise<Variable | null> {
  const label = `Token "${token.name}"`;
  const found = existing.get(token.name);

  if (found) {
    if (found.resolvedType !== token.type) {
      out.skipped.push(`${label}: existing variable is ${found.resolvedType}, expected ${token.type}.`);
      return null;
    }
    const aliased = Object.values(found.valuesByMode).some((v) => (v as { type?: string } | null)?.type === "VARIABLE_ALIAS");
    const matches = aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias);
    if (token.status === "new" && !matches) {
      out.skipped.push(`${label}: a variable with this name already exists with different aliases; not overwritten.`);
      return null;
    }
    if (token.kind !== "alias-change" && aliased && !matches) {
      out.skipped.push(`${label}: it aliases something else than this row; not rebound. Scan again.`);
      return null;
    }
    out.tokensReused++;
    return found;
  }

  if (token.status === "existing") {
    out.skipped.push(`${label}: marked existing but not found in the components collection.`);
    return null;
  }

  for (const mode of MODES) {
    if (!catalog.componentsModes[mode]) {
      out.skipped.push(`${label}: components collection has no "${mode}" mode.`);
      return null;
    }
    const aliasId = token.alias[mode];
    if (!aliasId) {
      out.skipped.push(`${label}: no ${mode} alias chosen.`);
      return null;
    }
    const target = await figma.variables.getVariableByIdAsync(aliasId);
    if (!target) {
      out.skipped.push(`${label}: ${mode} alias variable ${aliasId} not found.`);
      return null;
    }
    if (target.resolvedType !== token.type) {
      out.skipped.push(`${label}: ${mode} alias "${target.name}" is ${target.resolvedType}, expected ${token.type}.`);
      return null;
    }
  }

  const variable = figma.variables.createVariable(token.name, collection, token.type);
  variable.setPluginData("createdBy", CREATED_BY);
  variable.setPluginData(COMPONENT_ID_KEY, componentId);
  try {
    for (const mode of MODES) {
      variable.setValueForMode(catalog.componentsModes[mode] as string, { type: "VARIABLE_ALIAS", id: token.alias[mode] as string });
    }
    variable.scopes = scopesFor(token);
  } catch (e) {
    out.skipped.push(`${label}: created but not fully set up (${errorText(e)}); check it in the components collection.`);
    out.tokensCreated++;
    return null;
  }
  existing.set(token.name, variable);
  out.tokensCreated++;
  return variable;
}

function renameToken(token: TokenProposal, existing: Map<string, Variable>, out: ApplyOutcome): void {
  const from = token.previousName ?? "";
  const label = `Rename token "${from}" -> "${token.name}"`;
  const found = existing.get(from);
  if (!found) {
    out.skipped.push(`${label}: not found in the components collection; scan again.`);
    return;
  }
  if (existing.has(token.name)) {
    out.skipped.push(`${label}: a token with the new name already exists; scan again.`);
    return;
  }
  found.name = token.name;
  existing.delete(from);
  existing.set(token.name, found);
  out.tokenRenames.push({ from, to: token.name });
}

async function changeAlias(
  token: TokenProposal,
  found: Variable,
  collection: VariableCollection,
  catalog: Catalog,
  componentName: string,
  out: ApplyOutcome,
): Promise<boolean> {
  const label = `Alias change "${token.name}"`;
  if (!mayChangeAlias(token.name, componentName)) {
    out.skipped.push(`${label}: not a token of this component; left unchanged.`);
    return false;
  }
  if (aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias)) return true;
  if (!token.previousAlias || !aliasesMatch(found.valuesByMode, catalog.componentsModes, token.previousAlias)) {
    out.skipped.push(`${label}: its alias changed since the scan; scan again.`);
    return false;
  }
  for (const mode of MODES) {
    const target = token.alias[mode] ? await figma.variables.getVariableByIdAsync(token.alias[mode] as string) : null;
    if (!target || target.resolvedType !== found.resolvedType || target.variableCollectionId === collection.id) {
      out.skipped.push(`${label}: ${mode} alias is missing, of another type or a components token.`);
      return false;
    }
  }
  for (const mode of MODES) {
    found.setValueForMode(catalog.componentsModes[mode] as string, { type: "VARIABLE_ALIAS", id: token.alias[mode] as string });
  }
  out.aliasesChanged++;
  return true;
}

function aliasId(a: unknown): string | undefined {
  const x = Array.isArray(a) ? a[0] : a;
  return x && typeof x === "object" && typeof (x as { id?: unknown }).id === "string" ? (x as { id: string }).id : undefined;
}

async function isLive(id: string): Promise<boolean> {
  return !!(await getLiveVariable(id));
}

async function bindUse(use: RawValueUse, variable: Variable, variants: Map<string, ComponentNode | FrameNode>, tokenName: string, out: ApplyOutcome): Promise<void> {
  const where = `Bind "${tokenName}" to ${describeUse(use)}`;
  const variant = variants.get(use.variantId);
  const node = variant ? nodeAtPath(variant, use.indexPath) : null;
  if (!node) {
    out.skipped.push(`${where}: layer not found.`);
    return;
  }

  if (node.type === "TEXT") {
    const fontProblem = await loadFontsFor(node);
    if (fontProblem) {
      out.skipped.push(`${where}: ${fontProblem}.`);
      return;
    }
  }

  if (use.kind === "color") {
    if (use.field !== "fills" && use.field !== "strokes") {
      out.skipped.push(`${where}: color use on unsupported field.`);
      return;
    }
    const current = (node as unknown as Record<string, unknown>)[use.field];
    if (!Array.isArray(current) || use.paintIndex === null) {
      out.skipped.push(`${where}: paints are mixed or missing.`);
      return;
    }
    const paints = [...(current as Paint[])];
    let paint = paints[use.paintIndex] as SolidPaint | undefined;
    const boundNow = aliasId(paint?.boundVariables?.color);
    if (use.boundVariableId) {
      if (boundNow === variable.id) return;
      if (boundNow !== use.boundVariableId) {
        out.skipped.push(`${where}: its binding changed since the scan.`);
        return;
      }
    } else {
      if (paint && boundNow) {
        if (await isLive(boundNow)) {
          out.skipped.push(`${where}: paint is already bound to another variable.`);
          return;
        }
        paint = withoutBinding(paint) as SolidPaint;
      }
      if (!paintMatches(use, paint)) {
        out.skipped.push(`${where}: paint no longer matches ${use.hex}.`);
        return;
      }
    }
    paints[use.paintIndex] = figma.variables.setBoundVariableForPaint(paint as SolidPaint, "color", variable);
    if (use.field === "fills") (node as GeometryMixin).fills = paints;
    else (node as MinimalStrokesMixin).strokes = paints;
    out.bound++;
    return;
  }

  if (!(use.field in node)) {
    out.skipped.push(`${where}: layer has no ${use.field}.`);
    return;
  }
  const field = use.field as VariableBindableNodeField;
  const boundNow = aliasId(("boundVariables" in node ? (node.boundVariables as Record<string, unknown> | undefined) : undefined)?.[field]);
  if (use.boundVariableId) {
    if (boundNow === variable.id) return;
    if (boundNow !== use.boundVariableId) {
      out.skipped.push(`${where}: its binding changed since the scan.`);
      return;
    }
  } else {
    if (boundNow && (await isLive(boundNow))) {
      out.skipped.push(`${where}: already bound to another variable.`);
      return;
    }
    const actual = (node as unknown as Record<string, unknown>)[use.field];
    if (!numberMatches(use.number, actual)) {
      out.skipped.push(`${where}: value is ${String(actual)}, expected ${use.number}.`);
      return;
    }
  }
  try {
    node.setBoundVariable(field, variable);
  } catch (e) {
    if (!boundNow) throw e;
    node.setBoundVariable(field, null);
    node.setBoundVariable(field, variable);
  }
  out.bound++;
}

function sameStyle(a: TextStyleValues, b: TextStyleValues): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

async function bindTypography(row: TypographyProposal, variants: Map<string, ComponentNode | FrameNode>, out: ApplyOutcome): Promise<void> {
  const vars = new Map<string, Variable>();
  for (const id of new Set(Object.values(row.bindings))) {
    const v = id ? await getLiveVariable(id) : null;
    if (!v) {
      out.skipped.push(`Typography ${row.role}: variable ${id} not found.`);
      return;
    }
    vars.set(id!, v);
  }
  const stringValue = (id: string | undefined) => {
    const value = id ? Object.values(vars.get(id)?.valuesByMode ?? {})[0] : undefined;
    return typeof value === "string" ? value : undefined;
  };
  for (const use of row.uses) {
    const where = `Typography ${row.role} on "${use.layerName}" (variant ${use.variantId}, path [${use.indexPath.join(",")}])`;
    const variant = variants.get(use.variantId);
    const node = variant ? nodeAtPath(variant, use.indexPath) : null;
    if (!node || node.type !== "TEXT") {
      out.skipped.push(`${where}: text layer not found.`);
      continue;
    }
    const style = textStyleOf(node);
    if (!style) {
      out.skipped.push(`${where}: mixed text styles in one layer.`);
      continue;
    }
    if (!sameStyle(style, use.expect)) {
      out.skipped.push(`${where}: text style changed since the scan.`);
      continue;
    }
    const fontProblem = await loadFontsFor(node);
    if (fontProblem) {
      out.skipped.push(`${where}: ${fontProblem}.`);
      continue;
    }
    const family = use.fields.includes("fontFamily") ? stringValue(row.bindings.fontFamily) : style.fontFamily;
    const weight = use.fields.includes("fontStyle") ? stringValue(row.bindings.fontStyle) : style.fontStyle;
    try {
      await figma.loadFontAsync({ family: family ?? style.fontFamily, style: weight ?? style.fontStyle });
    } catch {
      out.skipped.push(`${where}: font ${family} ${weight} not available.`);
      continue;
    }
    for (const field of use.fields) {
      const variable = vars.get(row.bindings[field] as string);
      if (!variable) continue;
      try {
        node.setBoundVariable(field, variable);
        out.bound++;
      } catch (e) {
        out.skipped.push(`${where}: ${field} failed: ${errorText(e)}`);
      }
    }
  }
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function applyProposal(proposal: Proposal, catalog: Catalog): Promise<ApplyOutcome> {
  const out: ApplyOutcome = { renamed: 0, tokensCreated: 0, tokensReused: 0, bound: 0, aliasesChanged: 0, tokenRenames: [], skipped: [] };
  try {
    const root = await figma.getNodeByIdAsync(proposal.componentId);
    if (!root || (root.type !== "COMPONENT" && root.type !== "COMPONENT_SET" && root.type !== "FRAME")) {
      out.skipped.push(`Component ${proposal.componentId} not found; nothing applied.`);
      return out;
    }
    const variants: Array<ComponentNode | FrameNode> =
      root.type === "COMPONENT_SET"
        ? root.children.filter((c): c is ComponentNode => c.type === "COMPONENT")
        : [root];

    if (proposal.newComponentName !== null && proposal.newComponentName !== root.name) {
      try {
        root.name = proposal.newComponentName;
        out.renamed++;
      } catch (e) {
        out.skipped.push(`Rename component to "${proposal.newComponentName}" failed: ${errorText(e)}`);
      }
    }
    renameLayers(proposal, variants, out);

    const byId = new Map(variants.map((v) => [v.id, v]));
    await applyTokens(proposal, catalog, byId, out);
    for (const row of proposal.typography ?? []) {
      if (row.skip) continue;
      try {
        await bindTypography(row, byId, out);
      } catch (e) {
        out.skipped.push(`Typography ${row.role} failed: ${errorText(e)}`);
      }
    }
  } catch (e) {
    out.skipped.push(`Apply stopped early: ${errorText(e)}. Counts above reflect what was done before the stop.`);
  }
  return out;
}

async function applyTokens(proposal: Proposal, catalog: Catalog, byId: Map<string, ComponentNode | FrameNode>, out: ApplyOutcome): Promise<void> {
  const checked = proposal.tokens.filter((t) => !t.skip);
  const renames = checked.filter((t) => t.kind === "rename");
  const tokens = [
    ...creationOrder(checked.filter((t) => t.kind !== "alias-change" && t.kind !== "rename"), proposal.componentName),
    ...checked.filter((t) => t.kind === "alias-change"),
  ];
  if (tokens.length === 0 && renames.length === 0) return;

  if (!catalog.componentsCollectionId) {
    out.skipped.push("No components collection in this file; tokens not created. Add it, then run again.");
    return;
  }
  const collection = await figma.variables.getVariableCollectionByIdAsync(catalog.componentsCollectionId);
  if (!collection) {
    out.skipped.push(`Components collection ${catalog.componentsCollectionId} not found; tokens not created.`);
    return;
  }

  const existing = new Map<string, Variable>();
  for (const id of collection.variableIds) {
    const v = await figma.variables.getVariableByIdAsync(id);
    if (v) existing.set(v.name, v);
  }

  // Renames first, so a token created below never collides with an old name.
  for (const token of renames) {
    try {
      renameToken(token, existing, out);
    } catch (e) {
      out.skipped.push(`Rename token "${token.previousName}" failed: ${errorText(e)}`);
    }
  }

  for (const token of tokens) {
    try {
      const variable = await resolveToken(token, collection, existing, catalog, proposal.componentId, out);
      if (!variable) continue;
      if (token.kind === "alias-change" && !(await changeAlias(token, variable, collection, catalog, proposal.componentName, out))) continue;
      for (const use of token.uses) {
        try {
          await bindUse(use, variable, byId, token.name, out);
        } catch (e) {
          out.skipped.push(`Bind "${token.name}" to ${describeUse(use)} failed: ${errorText(e)}`);
        }
      }
    } catch (e) {
      out.skipped.push(`Token "${token.name}" failed: ${errorText(e)}`);
    }
  }
}
