/// <reference types="@figma/plugin-typings" />

import { applyProposal } from "./apply";
import { normalizeComponentName, proposeLayerNames } from "./naming";
import { buildProposal } from "./proposal";
import { loadCatalog, scanComponent, type ScanRoot } from "./scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "./snapshot";
import type { ApplyResult, Catalog, Phase, PluginToUi, Proposal, UiToPlugin } from "./types";

const EMPTY_CATALOG: Catalog = {
  variables: [],
  componentsCollectionId: null,
  componentsModes: { desktop: null, mobile: null },
};

let pending: { phase: Phase; componentId: string; catalog: Catalog } | null = null;

figma.showUI(__html__, { width: 720, height: 640, title: "Component Studio" });

function post(msg: PluginToUi) {
  figma.ui.postMessage(msg);
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isTopLevel(node: BaseNode): boolean {
  return node.parent?.type === "PAGE" || node.parent?.type === "SECTION";
}

// Any layer inside a component or a top-level frame resolves to that root, so the whole tree is reviewed at once.
function selectedRoot(): ScanRoot {
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

async function scanForRename(node: ScanRoot): Promise<Proposal> {
  const scan = await scanComponent(node);
  return {
    componentId: scan.id,
    componentName: scan.name,
    newComponentName: normalizeComponentName(scan.name),
    renames: proposeLayerNames(scan.variants[0].root),
    tokens: [],
    unmatched: [],
    warnings: [],
  };
}

async function scanForTokens(node: ScanRoot, catalog: Catalog): Promise<Proposal> {
  const scan = await scanComponent(node);
  const normalized = normalizeComponentName(scan.name);
  const proposal = buildProposal(scan, catalog, [], normalized ?? scan.name);
  const warnings = [...proposal.warnings];

  const pendingRenames = proposeLayerNames(scan.variants[0].root).length;
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

async function handleScan(phase: Phase) {
  const node = selectedRoot();
  const catalog = phase === "tokens" ? await loadCatalog() : EMPTY_CATALOG;
  const proposal = phase === "rename" ? await scanForRename(node) : await scanForTokens(node, catalog);
  pending = { phase, componentId: proposal.componentId, catalog };

  const semantic = catalog.variables
    .filter((v) => v.collection !== "components")
    .map((v) => ({ id: v.id, name: v.name, collection: v.collection, type: v.type }));
  post({ type: "component/proposal", phase, proposal, semantic });
}

async function handleApply(proposal: Proposal) {
  if (!pending || pending.componentId !== proposal.componentId) {
    throw new Error("This review is out of date. Scan the component again.");
  }
  const { phase, catalog } = pending;

  const before = await takeSnapshot(proposal.componentId);
  const outcome = await applyProposal(proposal, catalog);
  const after = await takeSnapshot(proposal.componentId);
  const audit = phase === "tokens" ? await auditComponent(proposal.componentId) : "skipped";

  const result: ApplyResult = { ...outcome, snapshotDiff: diffSnapshots(before, after), audit };
  pending = null;
  post({ type: "component/applied", phase, result });

  if (result.snapshotDiff.length > 0) {
    figma.notify("The component looks different after apply. Check the result, undo with Cmd+Z if needed.", {
      error: true,
    });
  }
}

figma.ui.onmessage = async (msg: UiToPlugin) => {
  try {
    if (msg.type === "component/scan") await handleScan(msg.phase);
    else if (msg.type === "component/apply") await handleApply(msg.proposal);
    else if (msg.type === "component/cancel") pending = null;
  } catch (e) {
    post({ type: "component/error", message: errorText(e) });
  }
};
