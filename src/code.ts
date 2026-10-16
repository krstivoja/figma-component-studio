/// <reference types="@figma/plugin-typings" />

import { applyProposal } from "./apply";
import { lookChangeView } from "./review";
import { normalizeComponentName, proposeLayerNames } from "./naming";
import { buildDraftQaReport, buildQaReport } from "./qa";
import { resolveValue } from "./match";
import { loadCatalog, scanComponent, type ScanRoot } from "./scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "./snapshot";
import { applyTokenSuggestions, mergeRenames, parseStoredProposal, parseStoredTokenSuggestions } from "./storedProposal";
import { structureHash } from "./structureHash";
import { handleBridgeRequest, referenceVariant, scanForTokens, selectedRoot, staleTokenCount, tokenScan, withBoundVariables } from "./studioTools";
import {
  NAMING_KEY,
  NAMING_NAMESPACE,
  RELAUNCH_CHECK_DESCRIPTION,
  TOKENS_KEY,
  type ApplyResult,
  type Catalog,
  type CatalogVariable,
  type ComponentScan,
  type LaunchCommand,
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
// Set by a QA check, cleared by a normal scan: an Apply can never follow a read-only check.
let lastWasCheck = false;

const launch: LaunchCommand = figma.command === "check" ? "check" : "open";

figma.showUI(__html__, { width: 720, height: 640, title: "Component Studio", themeColors: true });
setSidebarRelaunch();

// "Open Component Studio" under Tools in the right sidebar, for the file and this page. File metadata, no design change.
function setSidebarRelaunch() {
  try {
    figma.root.setRelaunchData({ open: "" });
    figma.currentPage.setRelaunchData({ open: "" });
  } catch {
    // View-only files cannot store relaunch data; the plugin works without it.
  }
}

function post(msg: PluginToUi) {
  figma.ui.postMessage(msg);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function scanForRename(node: ScanRoot, useClaude: boolean, scanned?: ComponentScan): Promise<{ proposal: Proposal; naming: NamingSource }> {
  const scan = scanned ?? (await scanComponent(node));
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

// Reads Claude's stored token suggestions; never clears them (only an Apply does).
async function scanTokensWithClaude(
  node: ScanRoot,
  catalog: Catalog,
  useClaude: boolean,
  proposal: Proposal,
): Promise<{ proposal: Proposal; usedClaude: boolean }> {
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
    ({ proposal, usedClaude } = await scanTokensWithClaude(node, catalog, useClaude, await scanForTokens(node, catalog, assume ?? [])));
  }
  lastWasCheck = false;
  pending = { phase, componentId: proposal.componentId, catalog, usedClaude };

  post({ type: "component/proposal", phase, naming, proposal, semantic: semanticTokens(catalog), ...(assume ? { repaired: true } : {}) });
}

function semanticTokens(catalog: Catalog): SemanticToken[] {
  return catalog.variables.filter((v) => v.collection !== "components").map(semanticToken);
}

// QA mode. Read-only by construction: scans and reads stored Claude proposals, never renames, binds, creates variables,
// writes plugin data or relaunch data. tests/qa/writeGuard.test.ts runs it on a figma API that fails on any write.
async function handleCheck(useClaude: boolean) {
  pending = null;
  lastWasCheck = true;
  const node = selectedRoot();
  // Local variables plus every variable bound in the selection (library ones too); read only, nothing imported.
  const [scan, catalog] = await Promise.all([scanComponent(node), loadCatalog().then((local) => withBoundVariables(local, node))]);
  const { proposal: naming, naming: namingSource } = await scanForRename(node, useClaude, scan);
  // A plain frame is a draft: checked against the semantic tokens only, no component token layer yet.
  if (node.type === "FRAME") {
    post({ type: "component/report", report: buildDraftQaReport({ scan, naming, namingSource, catalog }) });
    return;
  }
  const { proposal: base, setup } = await tokenScan(node, catalog, [], scan);
  const { proposal: tokens } = await scanTokensWithClaude(node, catalog, useClaude, base);
  const semantic = semanticTokens(catalog);
  const report = buildQaReport({ scan, naming, namingSource, tokens: { ...tokens, warnings: [...setup, ...tokens.warnings] }, semantic, catalog });
  post({ type: "component/report", report });
}

function pageOf(node: BaseNode): PageNode | null {
  let n: BaseNode | null = node;
  while (n && n.type !== "PAGE") n = n.parent;
  return n;
}

// Selection and viewport only: neither is part of the file or its undo history.
async function selectLayers(ids: string[]) {
  const found = await Promise.all(ids.map((id) => figma.getNodeByIdAsync(id)));
  const nodes = found.filter((n): n is SceneNode => !!n && n.type !== "DOCUMENT" && n.type !== "PAGE");
  if (!nodes.length) throw new Error("That layer no longer exists. Check the component again.");
  const page = pageOf(nodes[0]);
  if (page && page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
  const onPage = nodes.filter((n) => pageOf(n)?.id === page?.id);
  figma.currentPage.selection = onPage;
  figma.viewport.scrollAndZoomIntoView(onPage);
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
  if (lastWasCheck) throw new Error("QA check is read-only. Switch to Rename layers or Create tokens and scan the component to apply changes.");
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
  await setComponentRelaunch(proposal.componentId);
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

// Selecting a component the plugin has worked on shows "Check with Component Studio" in the sidebar.
// Each call replaces the node's relaunch data, so "open" is repeated.
async function setComponentRelaunch(rootId: string) {
  const root = await figma.getNodeByIdAsync(rootId);
  if (!root || !("setRelaunchData" in root)) return;
  try {
    root.setRelaunchData({ open: "", check: RELAUNCH_CHECK_DESCRIPTION });
  } catch {
    // Relaunch data is a convenience; a failure must not turn a successful apply into an error.
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
    else if (msg.type === "component/check") await handleCheck(msg.useClaude);
    else if (msg.type === "qa/select") await selectLayers(msg.nodeIds);
    else if (msg.type === "ui/ready") post({ type: "plugin/launch", command: launch });
    else if (msg.type === "bridge/request") post({ type: "bridge/response", response: await handleBridgeRequest(msg.request) });
  } catch (e) {
    post({ type: "component/error", message: errorText(e) });
  }
};
