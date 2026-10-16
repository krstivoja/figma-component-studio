/// <reference types="@figma/plugin-typings" />

import { primitiveKey, resolveValue } from "./match";
import { isUnnamed, normalizeComponentName, proposeLayerNames } from "./naming";
import { buildProposal, countTokenRenames } from "./proposal";
import {
  aggregateVariantProperties,
  catalogVariable,
  createResolver,
  isAlias,
  isRgb,
  loadCatalog,
  normalizeVariableName,
  parseVariantName,
  scanComponent,
  toHex,
  type ScanRoot,
  type VariableResolver,
} from "./scan";
import { aliasTargetProblem, isAliasTarget, type TokenSuggestion } from "./storedProposal";
import { structureHash } from "./structureHash";
import { vocabularyEntry } from "./vocabulary";
import {
  NAMING_KEY,
  NAMING_NAMESPACE,
  TOKENS_KEY,
  type BridgeRequest,
  type BridgeResponse,
  type Catalog,
  type CatalogVariable,
  type ComponentScan,
  type LayerNode,
  type Proposal,
  type RawValueUse,
  type RowChoice,
  type StoredNamingProposal,
  type StoredTokenSuggestions,
} from "./types";

const MAX_DEPTH = 6;
const MAX_NEIGHBOURS = 15;
const MAX_TEXT = 80;
const MAX_IMAGE_SIDE = 1600;
const SELECTION_CHANGED = "The selection changed; ask again after selecting the component.";

type Bag = Record<string, unknown>;

// Any layer inside a component resolves to that component, so the whole tree is reviewed at once.
// Outside a component the selected frame itself is the root (or the nearest frame around a selected text or shape),
// so a part of a design can be checked before it becomes a component.
export function selectedRoot(): ScanRoot {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    throw new Error("Select one component, component set or frame (or any layer inside it).");
  }
  let node: BaseNode | null = selection[0];
  let nearestFrame: FrameNode | null = null;
  while (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
    if (node.type === "COMPONENT_SET") return node;
    if (node.type === "COMPONENT") return node.parent?.type === "COMPONENT_SET" ? node.parent : node;
    if (node.type === "FRAME" && !nearestFrame) nearestFrame = node;
    node = node.parent;
  }
  if (nearestFrame) return nearestFrame;
  throw new Error("The selection is not inside a component or a frame.");
}

export function referenceVariant(root: ScanRoot): ComponentNode | FrameNode {
  if (root.type !== "COMPONENT_SET") return root;
  const first = root.children.find((c): c is ComponentNode => c.type === "COMPONENT");
  if (!first) throw new Error("The component set has no variants.");
  return first;
}

export async function otherComponentNames(root: ScanRoot): Promise<string[]> {
  await figma.loadAllPagesAsync();
  const names = new Set<string>();
  for (const n of figma.root.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
    if (n.id === root.id || n.parent?.id === root.id) continue;
    if (n.type === "COMPONENT" && n.parent?.type === "COMPONENT_SET") continue;
    names.add(n.name);
  }
  return [...names];
}

export async function staleTokenCount(node: ScanRoot): Promise<number> {
  const scan = await scanComponent(node);
  return countTokenRenames(scan, await loadCatalog(), normalizeComponentName(scan.name) ?? scan.name, await otherComponentNames(node));
}

// `scanned` reuses a scan of `node` taken moments ago (the QA check scans once for names and tokens).
export async function scanForTokens(node: ScanRoot, catalog: Catalog, assume: RowChoice[] = [], scanned?: ComponentScan): Promise<Proposal> {
  const { proposal, stepHints, setup } = await tokenScan(node, catalog, assume, scanned);
  return { ...proposal, warnings: [...setup, ...stepHints, ...proposal.warnings] };
}

// The token proposal plus, apart from its warnings, the file setup problems and the hints that point back to step 1
// (the QA report shows those hints as naming rows instead).
export async function tokenScan(
  node: ScanRoot,
  catalog: Catalog,
  assume: RowChoice[] = [],
  scanned?: ComponentScan,
): Promise<{ proposal: Proposal; stepHints: string[]; setup: string[] }> {
  const scan = scanned ?? (await scanComponent(node));
  const normalized = normalizeComponentName(scan.name);
  const proposal = buildProposal(scan, catalog, [], normalized ?? scan.name, assume, await otherComponentNames(node));
  const stepHints: string[] = [];
  const setup: string[] = [];

  const pendingRenames = proposeLayerNames(scan.variants[0].root).filter((r) => !r.skip).length;
  if (pendingRenames > 0) {
    stepHints.push(
      `${pendingRenames} layer${pendingRenames === 1 ? "" : "s"} still need a better name. Run "Rename layers" first, token names are built from layer names.`,
    );
  }
  if (normalized !== null) {
    stepHints.unshift(`Component name "${scan.name}" does not follow the convention; tokens use "${normalized}". Rename it in step 1.`);
  }
  if (catalog.componentsCollectionId === null) {
    setup.push('No "components" variable collection in this file. Tokens cannot be created until it exists.');
  }
  return { proposal: { ...proposal, newComponentName: null, renames: [] }, stepHints, setup };
}

export type NameClass = "unnamed" | "vocabulary" | "deliberate";

export function nameClass(layer: LayerNode, rootName: string): NameClass {
  if (isUnnamed(layer, rootName)) return "unnamed";
  const name = layer.name.trim();
  return vocabularyEntry(name) || vocabularyEntry(name.toLowerCase()) ? "vocabulary" : "deliberate";
}

export interface LayerSummary {
  path: string;
  indexPath: number[];
  id: string;
  type: string;
  name: string;
  visible: boolean;
  size: [number, number];
  layout?: string;
  text?: string;
  fontSize?: number;
  fills?: string[];
  mainComponent?: string;
  nameClass?: NameClass;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function layoutText(l: LayerNode["layout"]): string | undefined {
  if (l.mode === "NONE") return undefined;
  const pad = [l.paddingTop, l.paddingRight, l.paddingBottom, l.paddingLeft].map(round).join("/");
  const gap = l.spaceBetween ? "space-between" : `gap ${round(l.itemSpacing)}`;
  return `${l.mode}${l.wrap ? " wrap" : ""} ${gap} pad ${pad} w:${l.widthSizing} h:${l.heightSizing}`;
}

export function hexWithAlpha(hex: string, opacity: number): string {
  if (opacity >= 1) return hex;
  const a = Math.round(Math.max(0, opacity) * 255).toString(16).padStart(2, "0").toUpperCase();
  return `${hex}${a}`;
}

/** `rawType` maps node id -> raw Figma type; LayerNode.kind folds unknown types into OTHER. */
export function summarizeLayers(reference: LayerNode, rawType: (id: string) => string | undefined, maxDepth = MAX_DEPTH): LayerSummary[] {
  const out: LayerSummary[] = [];
  const walk = (n: LayerNode) => {
    const row: LayerSummary = {
      path: n.indexPath.join("."),
      indexPath: n.indexPath,
      id: n.id,
      type: rawType(n.id) ?? n.kind,
      name: n.name,
      visible: n.visible,
      size: [round(n.width), round(n.height)],
    };
    const layout = layoutText(n.layout);
    if (layout) row.layout = layout;
    if (n.text) {
      row.text = n.text.characters.slice(0, MAX_TEXT);
      row.fontSize = n.text.fontSize;
    }
    if (n.fills.length > 0) row.fills = n.fills.map((f) => hexWithAlpha(f.hex, f.opacity));
    if (n.mainComponentName) row.mainComponent = n.mainComponentName;
    if (n.indexPath.length > 0) row.nameClass = nameClass(n, reference.name);
    out.push(row);
    if (n.indexPath.length < maxDepth) n.children.forEach(walk);
  };
  walk(reference);
  return out;
}

export function layerAtPath(root: LayerNode, indexPath: number[]): LayerNode | null {
  let n: LayerNode | undefined = root;
  for (const i of indexPath) {
    n = n?.children[i];
    if (!n) return null;
  }
  return n;
}

export interface StaleRow {
  indexPath: unknown;
  oldName: unknown;
  problem: string;
}

export function validateRenames(
  reference: LayerNode,
  raw: unknown,
): { renames: StoredNamingProposal["renames"]; staleRows: StaleRow[] } {
  const renames: StoredNamingProposal["renames"] = [];
  const staleRows: StaleRow[] = [];
  if (!Array.isArray(raw)) return { renames, staleRows: [{ indexPath: null, oldName: null, problem: "renames is not a list." }] };
  for (const r of raw as Bag[]) {
    const indexPath = r?.indexPath;
    const oldName = r?.oldName;
    const reject = (problem: string) => staleRows.push({ indexPath: indexPath ?? null, oldName: oldName ?? null, problem });
    if (!Array.isArray(indexPath) || !indexPath.every((i) => Number.isInteger(i) && i >= 0)) {
      reject("indexPath is not a list of child indexes.");
      continue;
    }
    const newName = typeof r.newName === "string" ? r.newName.trim() : "";
    if (newName === "") {
      reject("newName is empty.");
      continue;
    }
    const layer = layerAtPath(reference, indexPath as number[]);
    if (!layer) {
      reject(`No layer at [${indexPath.join(",")}] in the reference variant.`);
      continue;
    }
    if (layer.name !== oldName) {
      reject(`Layer at [${indexPath.join(",")}] is named "${layer.name}", not "${String(oldName)}".`);
      continue;
    }
    renames.push({
      indexPath: indexPath as number[],
      nodeId: layer.id,
      oldName: layer.name,
      newName,
      reason: typeof r.reason === "string" ? r.reason : "",
      outsideVocabulary: r.outsideVocabulary === true,
    });
  }
  return { renames, staleRows };
}

export interface RejectedSuggestion {
  key: unknown;
  variableId: unknown;
  reason: string;
}

export function validateTokenSuggestions(
  proposal: Proposal,
  catalog: Catalog,
  raw: unknown,
): { suggestions: TokenSuggestion[]; rejected: RejectedSuggestion[] } {
  const suggestions: TokenSuggestion[] = [];
  const rejected: RejectedSuggestion[] = [];
  if (!Array.isArray(raw)) return { suggestions, rejected: [{ key: null, variableId: null, reason: "suggestions is not a list." }] };
  const types = new Map<string, "COLOR" | "FLOAT">();
  const roles = new Map<string, RawValueUse["role"] | undefined>();
  for (const r of [...proposal.unmatched, ...proposal.tokens]) {
    types.set(r.key, r.type);
    roles.set(r.key, r.uses[0]?.role);
  }
  const seen = new Set<string>();
  for (const s of raw as Bag[]) {
    const key = s?.key;
    const variableId = s?.variableId;
    const reject = (reason: string) => rejected.push({ key: key ?? null, variableId: variableId ?? null, reason });
    if (typeof key !== "string" || typeof variableId !== "string") {
      reject("key and variableId must be strings.");
      continue;
    }
    const type = types.get(key);
    if (!type) {
      reject("Unknown key; use a key from studio_get_tokens (tokens or unmatched).");
      continue;
    }
    if (seen.has(key)) {
      reject("Duplicate key; only the first suggestion is kept.");
      continue;
    }
    const problem = aliasTargetProblem(catalog, variableId, type, roles.get(key));
    if (problem) {
      reject(problem);
      continue;
    }
    seen.add(key);
    const variable = catalog.variables.find((v) => v.id === variableId)!;
    suggestions.push({ key, variableId, variableName: variable.name, reason: typeof s.reason === "string" ? s.reason : "" });
  }
  return { suggestions, rejected };
}

type SemanticValue = string | number;

function valueOf(v: Catalog["variables"][number], mode: string, fallbacks: string[]): SemanticValue | undefined {
  const val = resolveValue(v, mode, fallbacks);
  if (!val) return undefined;
  if (v.type === "COLOR") return val.hex ? hexWithAlpha(val.hex, val.opacity ?? 1) : undefined;
  return typeof val.number === "number" ? val.number : undefined;
}

export function tokensPayload(proposal: Proposal, catalog: Catalog) {
  const nameOf = (id: string | null) => (id ? catalog.variables.find((v) => v.id === id)?.name ?? id : null);
  const dedupeUses = (uses: Proposal["unmatched"][number]["uses"]) => {
    const seen = new Set<string>();
    const out: Array<{ layerName: string; field: string }> = [];
    for (const u of uses) {
      const k = `${u.layerName}|${u.field}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ layerName: u.layerName, field: u.field });
    }
    return out;
  };
  const semantic = catalog.variables
    .filter((v) => isAliasTarget(v) && (v.type === "COLOR" || v.type === "FLOAT"))
    .map((v) => {
      const row: { id: string; name: string; collection: string; type: string; light?: SemanticValue; dark?: SemanticValue; desktop?: SemanticValue; mobile?: SemanticValue } = {
        id: v.id,
        name: v.name,
        collection: v.collection,
        type: v.type,
      };
      if (v.type === "COLOR") {
        row.light = valueOf(v, "light", ["global"]);
        row.dark = valueOf(v, "dark", ["global"]);
      } else {
        row.desktop = valueOf(v, "desktop", ["global"]);
        row.mobile = valueOf(v, "mobile", ["desktop", "global"]);
      }
      return row;
    });
  return {
    componentName: proposal.componentName,
    tokens: proposal.tokens.map((t) => ({
      key: t.key,
      name: t.name,
      match: t.match,
      source: t.source,
      replaces: t.replaces,
      aliasDesktop: nameOf(t.alias.desktop),
      aliasMobile: nameOf(t.alias.mobile),
      note: t.note,
      ...(t.kind ? { kind: t.kind } : {}),
      ...(t.previousAlias ? { previousAliasDesktop: nameOf(t.previousAlias.desktop), previousAliasMobile: nameOf(t.previousAlias.mobile) } : {}),
    })),
    unmatched: proposal.unmatched.map((u) => ({
      key: u.key,
      tokenName: u.tokenName,
      type: u.type,
      display: u.display,
      reason: u.reason,
      suggestion: u.suggestion,
      uses: dedupeUses(u.uses),
    })),
    semantic,
    warnings: proposal.warnings,
  };
}

export function imageScale(width: number, height: number): number {
  const longest = Math.max(width, height);
  return longest > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longest : 1;
}

function rawTypes(root: SceneNode): Map<string, string> {
  const types = new Map<string, string>();
  const walk = (n: SceneNode) => {
    types.set(n.id, n.type);
    if (n.type !== "INSTANCE" && "children" in n) n.children.forEach(walk);
  };
  walk(root);
  return types;
}

async function referenceLayers(root: ScanRoot): Promise<{ variant: ComponentNode | FrameNode; tree: LayerNode }> {
  const variant = referenceVariant(root);
  const scan = await scanComponent(variant);
  return { variant, tree: scan.variants[0].root };
}

function rootFor(rootId: unknown): ScanRoot {
  const root = selectedRoot();
  if (root.id !== rootId) throw new Error(SELECTION_CHANGED);
  return root;
}

function status() {
  const base = { fileName: figma.root.name, page: figma.currentPage.name };
  try {
    const root = selectedRoot();
    return { ...base, selection: { rootId: root.id, rootName: root.name, rootType: root.type } };
  } catch (e) {
    return { ...base, selection: null, selectionError: errorText(e) };
  }
}

async function getComponent(id: string): Promise<BridgeResponse> {
  const root = selectedRoot();
  const { variant, tree } = await referenceLayers(root);
  const types = rawTypes(variant);
  const variantProperties =
    root.type === "COMPONENT_SET"
      ? aggregateVariantProperties(root.children.filter((c) => c.type === "COMPONENT").map((c) => parseVariantName(c.name)))
      : {};
  const parent = root.parent;
  const neighbours =
    parent && "children" in parent
      ? parent.children
          .filter((c) => c.id !== root.id)
          .slice(0, MAX_NEIGHBOURS)
          .map((c) => `${c.type}: ${c.name}`)
      : [];
  const result = {
    rootId: root.id,
    rootName: root.name,
    rootType: root.type,
    referenceVariantId: variant.id,
    variantProperties,
    structureHash: structureHash(variant),
    placement: {
      page: figma.currentPage.name,
      parent: parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT" ? { type: parent.type, name: parent.name } : null,
      neighbours,
    },
    layers: summarizeLayers(tree, (nodeId) => types.get(nodeId)),
  };
  try {
    const bytes = await root.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: imageScale(root.width, root.height) } });
    return { id, ok: true, result, image: { mimeType: "image/png", base64: figma.base64Encode(bytes) } };
  } catch (e) {
    return { id, ok: true, result: { ...result, imageError: errorText(e) } };
  }
}

async function getTokens() {
  const root = selectedRoot();
  const catalog = await loadCatalog();
  return tokensPayload(await scanForTokens(root, catalog), catalog);
}

async function proposeNames(args: Bag) {
  const root = rootFor(args.rootId);
  const { variant, tree } = await referenceLayers(root);
  const { renames, staleRows } = validateRenames(tree, args.renames);
  const componentName = typeof args.componentName === "string" && args.componentName.trim() !== "" ? args.componentName.trim() : null;
  const stored: StoredNamingProposal = {
    version: 1,
    source: "claude",
    createdAt: new Date().toISOString(),
    rootId: root.id,
    rootName: root.name,
    structureHash: structureHash(variant),
    componentName,
    renames,
  };
  root.setSharedPluginData(NAMING_NAMESPACE, NAMING_KEY, JSON.stringify(stored));
  figma.ui.postMessage({ type: "claude/proposal-stored", phase: "rename", count: renames.length });
  return { stored: renames.length, staleRows };
}

async function proposeTokens(args: Bag) {
  const root = rootFor(args.rootId);
  const catalog = await loadCatalog();
  const proposal = await scanForTokens(root, catalog);
  const { suggestions, rejected } = validateTokenSuggestions(proposal, catalog, args.suggestions);
  if (suggestions.length > 0) {
    const stored: StoredTokenSuggestions = {
      version: 1,
      source: "claude",
      createdAt: new Date().toISOString(),
      rootId: root.id,
      structureHash: structureHash(referenceVariant(root)),
      suggestions,
    };
    root.setSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY, JSON.stringify(stored));
    figma.ui.postMessage({ type: "claude/proposal-stored", phase: "tokens", count: suggestions.length });
  }
  return { stored: suggestions.length, rejected };
}

// ---- studio_inspect_variables: strictly read only (no import*, set*, create* calls) ----

export const INSPECT_MAX_VARIABLES = 300;
export const INSPECT_MAX_USED_BY = 50;
const INSPECT_MAX_LIBRARY_COLLECTIONS = 100;
const PATH_SEPARATOR = " › ";

export interface BindingUse {
  layerPath: string;
  field: string;
}

type InspectValue = string | number | boolean | null;

export interface BoundVariableInfo {
  id: string;
  name: string | null;
  resolvedType: string | null;
  collection: { id: string; name: string | null } | null;
  remote: boolean;
  key: string | null;
  libraryCollection?: string | null;
  libraryName?: string | null;
  /** The variable is gone (null by id) or soft-deleted (still returned by id, no longer in its collection). */
  missing?: true;
  values: Record<string, InspectValue>;
  aliasOf?: Record<string, string>;
  usedBy: BindingUse[];
  usedByTruncated?: true;
}

function aliasIdsIn(value: unknown, field: string, out: Array<{ field: string; id: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => aliasIdsIn(v, value.length === 1 ? field : `${field}[${i}]`, out));
  } else if (isAlias(value)) {
    out.push({ field, id: value.id });
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Bag)) aliasIdsIn(v, `${field}.${k}`, out);
  }
}

function paintAliases(paints: unknown, field: string, out: Array<{ field: string; id: string }>): void {
  if (!Array.isArray(paints)) return;
  paints.forEach((p, i) => {
    const bv = (p as Bag | null)?.boundVariables;
    if (bv && typeof bv === "object") aliasIdsIn(bv, `${field}[${i}]`, out);
  });
}

/** Every variable binding on one node: node.boundVariables (all fields), paints, effects, and mixed text segments. */
export function nodeBindings(node: SceneNode): Array<{ field: string; id: string }> {
  const out: Array<{ field: string; id: string }> = [];
  const bag = node as unknown as Bag;
  const bound = ("boundVariables" in node ? node.boundVariables : undefined) as Bag | undefined;
  for (const [field, value] of Object.entries(bound ?? {})) {
    // Paint and effect bindings are read from the paints themselves, so the index is the real one.
    if (field === "fills" || field === "strokes" || field === "effects") continue;
    aliasIdsIn(value, field, out);
  }
  paintAliases(bag.fills, "fills", out);
  paintAliases(bag.strokes, "strokes", out);
  paintAliases(bag.effects, "effects", out);
  if (node.type === "TEXT" && typeof node.getStyledTextSegments === "function") {
    const mixedFills = node.fills === figma.mixed;
    let segments: Array<Bag> = [];
    try {
      segments = node.getStyledTextSegments(["fills", "boundVariables"]) as unknown as Bag[];
    } catch {
      segments = [];
    }
    const nodeLevel = new Set(Object.keys(bound ?? {}));
    for (const seg of Array.isArray(segments) ? segments : []) {
      const range = `text[${String(seg.start)}-${String(seg.end)}]`;
      if (mixedFills) paintAliases(seg.fills, `${range}.fills`, out);
      for (const [field, value] of Object.entries((seg.boundVariables as Bag | undefined) ?? {})) {
        if (!nodeLevel.has(field)) aliasIdsIn(value, `${range}.${field}`, out);
      }
    }
  }
  return out;
}

function inspectValue(value: VariableValue | null): InspectValue {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" || typeof value === "string" || typeof value === "boolean") return value;
  if (isRgb(value)) return hexWithAlpha(toHex(value), "a" in value ? value.a : 1);
  return null;
}

async function describeVariable(id: string, resolver: VariableResolver): Promise<Omit<BoundVariableInfo, "usedBy">> {
  const v = await resolver.getVariable(id);
  if (!v) return { id, name: null, resolvedType: null, collection: null, remote: false, key: null, missing: true, values: {} };
  const col = await resolver.getCollection(v.variableCollectionId);
  const info: Omit<BoundVariableInfo, "usedBy"> = {
    id,
    name: v.name,
    resolvedType: v.resolvedType,
    collection: { id: v.variableCollectionId, name: col?.name ?? null },
    remote: v.remote === true,
    key: typeof v.key === "string" ? v.key : null,
    values: {},
  };
  if (!v.remote && col && !col.variableIds.includes(v.id)) info.missing = true;
  const aliasOf: Record<string, string> = {};
  for (const mode of col?.modes ?? []) {
    info.values[mode.name] = inspectValue(await resolver.resolve(v, mode.name, mode.modeId));
    const raw = v.valuesByMode[mode.modeId];
    if (isAlias(raw)) aliasOf[mode.name] = (await resolver.getVariable(raw.id))?.name ?? raw.id;
  }
  if (Object.keys(aliasOf).length) info.aliasOf = aliasOf;
  return info;
}

export async function collectBoundVariables(
  root: SceneNode,
  resolver: VariableResolver,
): Promise<{ variables: BoundVariableInfo[]; truncated: boolean }> {
  const uses = new Map<string, BindingUse[]>();
  const overflow = new Set<string>();
  let truncated = false;
  const walk = (node: SceneNode, path: string) => {
    const seen = new Set<string>();
    for (const { field, id } of nodeBindings(node)) {
      const k = `${id}|${field}`;
      if (seen.has(k)) continue;
      seen.add(k);
      let list = uses.get(id);
      if (!list) {
        if (uses.size >= INSPECT_MAX_VARIABLES) {
          truncated = true;
          continue;
        }
        list = [];
        uses.set(id, list);
      }
      if (list.length >= INSPECT_MAX_USED_BY) {
        overflow.add(id);
        truncated = true;
        continue;
      }
      list.push({ layerPath: path, field });
    }
    if ("children" in node) for (const c of node.children) walk(c, `${path}${PATH_SEPARATOR}${c.name}`);
  };
  walk(root, root.name);

  const variables: BoundVariableInfo[] = [];
  for (const [id, usedBy] of uses) {
    const info = await describeVariable(id, resolver);
    variables.push({ ...info, usedBy, ...(overflow.has(id) ? { usedByTruncated: true as const } : {}) });
  }
  return { variables, truncated };
}

// Only the color collection's names are normalised in the catalog: role families and surface pairing read colors
// as "color/…", while typography ("font/…"), dimensions and components keep the names their rules expect.
const NORMALISED_COLLECTION = "color";

function normalized(v: CatalogVariable): CatalogVariable {
  if (v.collection.trim().toLowerCase() !== NORMALISED_COLLECTION) return v;
  const name = normalizeVariableName(v.name, NORMALISED_COLLECTION);
  return name === v.name ? v : { ...v, name };
}

/** Same name in the same collection once both are normalised: a library variable the file also has locally. */
export function equivalenceKey(v: Pick<CatalogVariable, "name" | "collection">): string {
  return `${v.collection.trim().toLowerCase()}|${normalizeVariableName(v.name, v.collection)}`;
}

// QA's catalog: the local variables plus every variable bound in the selection (library ones included, marked
// `remote`), resolved with the shared resolver. Strictly read only: nothing is imported. Step 2 keeps `loadCatalog`.
export async function withBoundVariables(catalog: Catalog, root: SceneNode): Promise<Catalog> {
  const local = await figma.variables.getLocalVariableCollectionsAsync();
  const resolver = createResolver(local);
  const { variables: bound } = await collectBoundVariables(root, resolver);
  const known = new Set(catalog.variables.map((v) => v.id));
  const added: CatalogVariable[] = [];
  for (const info of bound) {
    if (info.missing || !info.remote || known.has(info.id)) continue;
    const v = await resolver.getVariable(info.id);
    const col = v ? await resolver.getCollection(v.variableCollectionId) : null;
    const entry = v && col ? await catalogVariable(v, col, resolver.resolve) : null;
    if (!entry) continue;
    // Alias targets by name, so a library surface can be matched to a local one aliasing the same primitive.
    const aliasKeys: Record<string, string> = {};
    for (const [mode, id] of Object.entries(entry.aliasOf ?? {})) {
      const target = await resolver.getVariable(id);
      const tcol = target ? await resolver.getCollection(target.variableCollectionId) : null;
      if (target && tcol) aliasKeys[mode] = primitiveKey(target.name, tcol.name);
    }
    added.push({ ...entry, remote: true, ...(Object.keys(aliasKeys).length ? { aliasKeys } : {}) });
  }
  // Local first: a library variable with the same name never shadows the file's own.
  return { ...catalog, variables: [...catalog.variables, ...added].map(normalized) };
}

async function libraryCollections(): Promise<
  | { collections: Array<{ name: string; libraryName: string; key: string; variableCount: number | null; error?: string }>; truncated: boolean }
  | { error: string }
> {
  try {
    const available = await figma.teamLibrary.getAvailableLibraryVariableCollectionsAsync();
    const list = available.slice(0, INSPECT_MAX_LIBRARY_COLLECTIONS);
    const collections = await Promise.all(
      list.map(async (c) => {
        const row = { name: c.name, libraryName: c.libraryName, key: c.key };
        try {
          // Names and types only: nothing is imported into the file.
          const vars = await figma.teamLibrary.getVariablesInLibraryCollectionAsync(c.key);
          return { ...row, variableCount: vars.length };
        } catch (e) {
          return { ...row, variableCount: null, error: errorText(e) };
        }
      }),
    );
    return { collections, truncated: available.length > list.length };
  } catch (e) {
    return { error: `Library collections are not available: ${errorText(e)}` };
  }
}

export async function inspectVariables() {
  const local = await figma.variables.getLocalVariableCollectionsAsync();
  const resolver = createResolver(local);
  const localCollections = local.map((c) => ({
    id: c.id,
    name: c.name,
    modes: c.modes.map((m) => m.name),
    variableCount: c.variableIds.length,
    hiddenFromPublishing: c.hiddenFromPublishing === true,
  }));
  const libraries = await libraryCollections();

  let root: ScanRoot | null = null;
  let selectionError: string | undefined;
  try {
    root = selectedRoot();
  } catch (e) {
    selectionError = errorText(e);
  }
  let bound: BoundVariableInfo[] = [];
  let truncated = false;
  if (root) {
    ({ variables: bound, truncated } = await collectBoundVariables(root, resolver));
    // A remote collection's library name comes from the team library list, matched by collection key.
    const libraryByKey = new Map("collections" in libraries ? libraries.collections.map((c) => [c.key, c.libraryName]) : []);
    for (const v of bound) {
      if (!v.remote || !v.collection) continue;
      const col = await resolver.getCollection(v.collection.id);
      v.libraryCollection = col?.name ?? null;
      v.libraryName = (col && libraryByKey.get(col.key)) ?? null;
    }
  }
  return {
    root: root ? { id: root.id, name: root.name, type: root.type } : null,
    ...(selectionError ? { selectionError } : {}),
    localCollections,
    bound,
    truncated,
    libraryCollections: libraries,
  };
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export async function handleBridgeRequest(req: BridgeRequest): Promise<BridgeResponse> {
  const id = typeof req?.id === "string" ? req.id : "";
  try {
    const args = (req.args && typeof req.args === "object" ? req.args : {}) as Bag;
    switch (req.tool) {
      case "studio_status":
        return { id, ok: true, result: status() };
      case "studio_get_component":
        return await getComponent(id);
      case "studio_get_tokens":
        return { id, ok: true, result: await getTokens() };
      case "studio_propose_names":
        return { id, ok: true, result: await proposeNames(args) };
      case "studio_propose_tokens":
        return { id, ok: true, result: await proposeTokens(args) };
      case "studio_inspect_variables":
        return { id, ok: true, result: await inspectVariables() };
      default:
        return { id, ok: false, error: `Unknown tool ${String((req as { tool?: unknown }).tool)}.` };
    }
  } catch (e) {
    return { id, ok: false, error: errorText(e) };
  }
}
