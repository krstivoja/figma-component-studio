/// <reference types="@figma/plugin-typings" />

import { applyProposal } from "./apply";
import { lookChangeView } from "./review";
import { normalizeComponentName, proposeLayerNames } from "./naming";
import { resolveValue } from "./match";
import { loadCatalog, scanComponent, type ScanRoot } from "./scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "./snapshot";
import { applyTokenSuggestions, mergeRenames, parseStoredProposal, parseStoredTokenSuggestions } from "./storedProposal";
import { structureHash } from "./structureHash";
import { handleBridgeRequest, referenceVariant, scanForTokens, selectedRoot, staleTokenCount } from "./studioTools";
import {
  NAMING_KEY,
  NAMING_NAMESPACE,
  TOKENS_KEY,
  type ApplyResult,
  type Catalog,
  type CatalogVariable,
  type NamingSource,
  type Phase,
  type PluginToUi,
  type Proposal,
  type RowChoice,
  type SemanticToken,
  type UiToPlugin,
} from "./types";

const EMPTY_CATALOG: Catalog = {
  variables: [],
  componentsCollectionId: null,
  componentsModes: { desktop: null, mobile: null },
};

let pending: { phase: Phase; componentId: string; catalog: Catalog; usedClaude: boolean } | null = null;

figma.showUI(__html__, { width: 720, height: 640, title: "Component Studio" });

function post(msg: PluginToUi) {
  figma.ui.postMessage(msg);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function scanForRename(node: ScanRoot, useClaude: boolean): Promise<{ proposal: Proposal; naming: NamingSource }> {
  const scan = await scanComponent(node);
  const reference = scan.variants[0].root;
  const rules = proposeLayerNames(reference);
  const proposal: Proposal = {
    componentId: scan.id,
    componentName: scan.name,
    newComponentName: normalizeComponentName(scan.name),
    renames: rules,
    tokens: [],
    unmatched: [],
    warnings: [],
  };

  if (!useClaude) return { proposal, naming: { source: "rules", claudeRequested: false } };
  const raw = node.getSharedPluginData(NAMING_NAMESPACE, NAMING_KEY);
  if (raw === "") return { proposal, naming: { source: "rules", claudeRequested: true } };

  const parsed = parseStoredProposal(raw, { rootId: node.id, hash: structureHash(referenceVariant(node)), reference });
  if ("ignored" in parsed) {
    return { proposal: { ...proposal, warnings: [parsed.ignored] }, naming: { source: "rules", claudeRequested: true } };
  }
  return {
    proposal: {
      ...proposal,
      newComponentName: parsed.componentName ?? proposal.newComponentName,
      renames: mergeRenames(parsed.renames, rules, reference),
      warnings: parsed.warnings,
    },
    naming: parsed.naming,
  };
}

async function scanTokensWithClaude(
  node: ScanRoot,
  catalog: Catalog,
  useClaude: boolean,
  assume: RowChoice[],
): Promise<{ proposal: Proposal; usedClaude: boolean }> {
  const proposal = await scanForTokens(node, catalog, assume);
  if (!useClaude) return { proposal, usedClaude: false };
  const raw = node.getSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY);
  if (raw === "") return { proposal, usedClaude: false };
  const parsed = parseStoredTokenSuggestions(raw, { rootId: node.id, hash: structureHash(referenceVariant(node)) });
  if ("ignored" in parsed) return { proposal: { ...proposal, warnings: [...proposal.warnings, parsed.ignored] }, usedClaude: false };
  const applied = applyTokenSuggestions({ ...proposal, warnings: [...proposal.warnings, ...parsed.warnings] }, parsed.suggestions, catalog);
  return { proposal: applied, usedClaude: true };
}

async function handleScan(phase: Phase, useClaude: boolean, assume: RowChoice[] | undefined) {
  const node = selectedRoot();
  const catalog = phase === "tokens" ? await loadCatalog() : EMPTY_CATALOG;
  let proposal: Proposal;
  let naming: NamingSource | null = null;
  let usedClaude: boolean;
  if (phase === "rename") {
    ({ proposal, naming } = await scanForRename(node, useClaude));
    usedClaude = naming.source === "claude";
  } else {
    ({ proposal, usedClaude } = await scanTokensWithClaude(node, catalog, useClaude, assume ?? []));
  }
  pending = { phase, componentId: proposal.componentId, catalog, usedClaude };

  const semantic = catalog.variables.filter((v) => v.collection !== "components").map(semanticToken);
  post({ type: "component/proposal", phase, naming, proposal, semantic, ...(assume ? { repaired: true } : {}) });
}

function semanticToken(v: CatalogVariable): SemanticToken {
  const base: SemanticToken = { id: v.id, name: v.name, collection: v.collection, type: v.type };
  if (v.type === "COLOR") {
    const r = resolveValue(v, "light", ["global"]);
    if (r?.hex) base.light = { hex: r.hex, opacity: r.opacity ?? 1 };
  } else if (v.type === "FLOAT") {
    const r = resolveValue(v, "desktop", ["global"]);
    if (typeof r?.number === "number") base.value = r.number;
  }
  return base;
}

async function handleApply(proposal: Proposal) {
  if (!pending || pending.componentId !== proposal.componentId) {
    throw new Error("This review is out of date. Scan the component again.");
  }
  const { phase, catalog, usedClaude } = pending;

  const before = await takeSnapshot(proposal.componentId);
  const outcome = await applyProposal(proposal, catalog);
  if (usedClaude) await clearStoredProposal(proposal.componentId, phase === "rename" ? NAMING_KEY : TOKENS_KEY);
  const after = await takeSnapshot(proposal.componentId);
  const audit = phase === "tokens" ? await auditComponent(proposal.componentId) : "skipped";
  const staleTokenNames = phase === "rename" ? await staleTokensAfterRename(proposal.componentId) : 0;

  const result: ApplyResult = { ...outcome, snapshotDiff: diffSnapshots(before, after), audit, ...(staleTokenNames ? { staleTokenNames } : {}) };
  pending = null;
  post({ type: "component/applied", phase, result });

  if (lookChangeView(result, proposal).kind === "loud") {
    figma.notify("The component looks different after apply. Check the result, undo with Cmd+Z if needed.", {
      error: true,
    });
  }
}

async function staleTokensAfterRename(rootId: string): Promise<number> {
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || (root.type !== "COMPONENT" && root.type !== "COMPONENT_SET" && root.type !== "FRAME")) return 0;
  try {
    return await staleTokenCount(root);
  } catch {
    return 0;
  }
}

// Deleted after apply so a Claude proposal is never applied twice.
async function clearStoredProposal(rootId: string, key: string) {
  const root = await figma.getNodeByIdAsync(rootId);
  if (root && "setSharedPluginData" in root) root.setSharedPluginData(NAMING_NAMESPACE, key, "");
}

figma.ui.onmessage = async (msg: UiToPlugin) => {
  try {
    if (msg.type === "component/scan") await handleScan(msg.phase, msg.useClaude, msg.assume);
    else if (msg.type === "component/apply") await handleApply(msg.proposal);
    else if (msg.type === "component/cancel") pending = null;
    else if (msg.type === "bridge/request") post({ type: "bridge/response", response: await handleBridgeRequest(msg.request) });
  } catch (e) {
    post({ type: "component/error", message: errorText(e) });
  }
};
