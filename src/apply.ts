import type { BindableField, Catalog, Mode, Proposal, RawValueUse, TokenProposal } from "./types";

export interface ApplyOutcome {
  renamed: number;
  tokensCreated: number;
  tokensReused: number;
  bound: number;
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
  out: ApplyOutcome,
): Promise<Variable | null> {
  const label = `Token "${token.name}"`;
  const found = existing.get(token.name);

  if (found) {
    if (found.resolvedType !== token.type) {
      out.skipped.push(`${label}: existing variable is ${found.resolvedType}, expected ${token.type}.`);
      return null;
    }
    if (token.status === "new" && !aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias)) {
      out.skipped.push(`${label}: a variable with this name already exists with different aliases; not overwritten.`);
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
    const paint = paints[use.paintIndex];
    if (!paintMatches(use, paint as SolidPaint | undefined)) {
      out.skipped.push(`${where}: paint no longer matches ${use.hex}.`);
      return;
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
  const actual = (node as unknown as Record<string, unknown>)[use.field];
  if (!numberMatches(use.number, actual)) {
    out.skipped.push(`${where}: value is ${String(actual)}, expected ${use.number}.`);
    return;
  }
  node.setBoundVariable(use.field as VariableBindableNodeField, variable);
  out.bound++;
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function applyProposal(proposal: Proposal, catalog: Catalog): Promise<ApplyOutcome> {
  const out: ApplyOutcome = { renamed: 0, tokensCreated: 0, tokensReused: 0, bound: 0, skipped: [] };
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

    const tokens = proposal.tokens.filter((t) => !t.skip);
    if (tokens.length === 0) return out;

    if (!catalog.componentsCollectionId) {
      out.skipped.push("No components collection in this file; tokens not created. Add it, then run again.");
      return out;
    }
    const collection = await figma.variables.getVariableCollectionByIdAsync(catalog.componentsCollectionId);
    if (!collection) {
      out.skipped.push(`Components collection ${catalog.componentsCollectionId} not found; tokens not created.`);
      return out;
    }

    const existing = new Map<string, Variable>();
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) existing.set(v.name, v);
    }

    const byId = new Map(variants.map((v) => [v.id, v]));
    for (const token of tokens) {
      try {
        const variable = await resolveToken(token, collection, existing, catalog, out);
        if (!variable) continue;
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
  } catch (e) {
    out.skipped.push(`Apply stopped early: ${errorText(e)}. Counts above reflect what was done before the stop.`);
  }
  return out;
}
