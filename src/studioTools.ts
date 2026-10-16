/// <reference types="@figma/plugin-typings" />

import { resolveValue } from "./match";
import { isUnnamed, normalizeComponentName, proposeLayerNames } from "./naming";
import { buildProposal, countTokenRenames } from "./proposal";
import { aggregateVariantProperties, loadCatalog, parseVariantName, scanComponent, type ScanRoot } from "./scan";
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

function isTopLevel(node: BaseNode): boolean {
  return node.parent?.type === "PAGE" || node.parent?.type === "SECTION";
}

// Any layer inside a component or a top-level frame resolves to that root, so the whole tree is reviewed at once.
export function selectedRoot(): ScanRoot {
  const selection = figma.currentPage.selection;
  if (selection.length !== 1) {
    throw new Error("Select one component, component set or top-level frame (or any layer inside it).");
  }
  let node: BaseNode | null = selection[0];
  let topFrame: FrameNode | null = null;
  while (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
    if (node.type === "COMPONENT_SET") return node;
    if (node.type === "COMPONENT") return node.parent?.type === "COMPONENT_SET" ? node.parent : node;
    if (node.type === "FRAME" && isTopLevel(node)) topFrame = node;
    node = node.parent;
  }
  if (topFrame) return topFrame;
  throw new Error("The selection is not inside a component or a top-level frame.");
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

export async function scanForTokens(node: ScanRoot, catalog: Catalog, assume: RowChoice[] = []): Promise<Proposal> {
  const scan = await scanComponent(node);
  const normalized = normalizeComponentName(scan.name);
  const proposal = buildProposal(scan, catalog, [], normalized ?? scan.name, assume, await otherComponentNames(node));
  const warnings = [...proposal.warnings];

  const pendingRenames = proposeLayerNames(scan.variants[0].root).filter((r) => !r.skip).length;
  if (pendingRenames > 0) {
    warnings.unshift(
      `${pendingRenames} layer${pendingRenames === 1 ? "" : "s"} still need a better name. Run "1. Rename layers" first, token names are built from layer names.`,
    );
  }
  if (normalized !== null) {
    warnings.unshift(`Component name "${scan.name}" does not follow the convention; tokens use "${normalized}". Rename it in step 1.`);
  }
  if (catalog.componentsCollectionId === null) {
    warnings.unshift('No "components" variable collection in this file. Tokens cannot be created until it exists.');
  }
  return { ...proposal, newComponentName: null, renames: [], warnings };
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
      default:
        return { id, ok: false, error: `Unknown tool ${String((req as { tool?: unknown }).tool)}.` };
    }
  } catch (e) {
    return { id, ok: false, error: errorText(e) };
  }
}
