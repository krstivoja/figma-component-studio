import { describe, expect, it } from "vitest";
import { applyProposal } from "../../src/apply";
import { buildReviewModel, collectProposal, renamedTokensText, staleTokensText, summarizeResult } from "../../src/review";
import { loadCatalog, type ScanRoot } from "../../src/scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "../../src/snapshot";
import { scanForTokens, staleTokenCount } from "../../src/studioTools";
import type { ApplyResult, Catalog, Proposal } from "../../src/types";
import { FakeNode, solid, World, type FakeCollection, type FakeVariable } from "./fakeFigma";

interface File {
  world: World;
  comps: FakeCollection;
  root: FakeNode;
  v: Record<string, FakeVariable>;
}

function baseFile(): Omit<File, "root"> {
  const world = new World();
  const color = world.collection("color", ["light", "dark"]);
  const dims = world.collection("dimensions", ["desktop", "mobile"]);
  const typo = world.collection("typography", ["desktop", "mobile"]);
  const comps = world.collection("components", ["desktop", "mobile"]);
  const c = (name: string, hex: string) => world.variable(color, name, "COLOR", hex);
  const v: Record<string, FakeVariable> = {
    page: c("color/background/primary", "#F7F7F7"),
    onPage: c("color/on-background/primary", "#0A0A0A"),
    s1: c("color/surface/1/enabled", "#FFFFFF"),
    brand: c("color/surface/brand/enabled", "#0059FF"),
    on1: c("color/on-surface/1/enabled", "#001B4D"),
    on3: c("color/on-surface/1/dimmed", "#4A5578"),
    padS: world.variable(dims, "padding/s", "FLOAT", 12),
    padM: world.variable(dims, "padding/m", "FLOAT", 16),
    padXl: world.variable(dims, "padding/xl", "FLOAT", 24),
    gapS: world.variable(dims, "gap/s", "FLOAT", 12),
    famLabel: world.variable(typo, "font/family/label", "STRING", "Inter"),
    wLabel: world.variable(typo, "font/weight/Inter/label", "STRING", "Regular"),
    sizeLabelS: world.variable(typo, "font/size/label/s", "FLOAT", 12),
    lhLabelS: world.variable(typo, "line-height/label/s", "FLOAT", 16),
    lsLabelS: world.variable(typo, "letter-spacing/label/s", "FLOAT", 0),
  };
  return { world, comps, v };
}

function token(f: Omit<File, "root">, name: string, target: FakeVariable): FakeVariable {
  return f.world.variable(f.comps, name, target.resolvedType, f.world.alias(target));
}

// Figma test 2026-10-16 08.44: padding was 12 on all sides, then left/right set to raw 24.
function paddingSplit(withContent = false): File {
  const f = baseFile();
  const { world, v } = f;
  v.bg = token(f, "card-markooo/color/background", v.s1);
  v.padding = token(f, "card-markooo/spacing/padding", v.padS);
  const root = new FakeNode(world, "COMPONENT", "card-markooo");
  root.layoutMode = "VERTICAL";
  root.height = 200;
  root.fills = [solid("#FFFFFF", v.bg)];
  for (const side of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]) root.setBoundVariable(side, v.padding);
  for (const side of ["paddingLeft", "paddingRight"]) {
    root.setBoundVariable(side, null);
    (root as unknown as Record<string, number>)[side] = 24;
  }
  if (withContent) {
    const content = new FakeNode(world, "FRAME", "content");
    content.layoutMode = "VERTICAL";
    for (const side of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]) content.setBoundVariable(side, v.padding);
    root.append(content);
  }
  world.install();
  return { ...f, root };
}

// Component renamed card-marko -> card-markooo after its tokens were made; a badge borrows a button token.
function renamedComponent(extra?: (f: Omit<File, "root">) => void): File {
  const f = baseFile();
  const { world, v } = f;
  v.bg = token(f, "card-marko/color/background", v.s1);
  v.text = token(f, "card-marko/color/text", v.on1);
  v.gap = token(f, "card-marko/spacing/gap", v.gapS);
  v.buttonBg = token(f, "button/color/background", v.brand);
  extra?.(f);

  new FakeNode(world, "COMPONENT", "button");
  const label = new FakeNode(world, "TEXT", "label");
  label.fills = [solid("#001B4D", v.text)];
  for (const [field, id] of [["fontFamily", v.famLabel], ["fontStyle", v.wLabel], ["fontSize", v.sizeLabelS], ["letterSpacing", v.lsLabelS]] as const) {
    label.setBoundVariable(field, id);
  }
  label.letterSpacing = { unit: "PERCENT", value: 0 };
  const badge = new FakeNode(world, "FRAME", "badge");
  badge.fills = [solid("#0059FF", v.buttonBg)];
  const root = new FakeNode(world, "COMPONENT", "card-markooo").append(label, badge);
  root.layoutMode = "VERTICAL";
  root.height = 200;
  root.itemSpacing = 12;
  root.setBoundVariable("itemSpacing", v.gap);
  root.fills = [solid("#FFFFFF", v.bg)];
  world.install();
  return { ...f, root };
}

async function scan(f: File): Promise<{ proposal: Proposal; catalog: Catalog }> {
  const catalog = await loadCatalog();
  return { proposal: await scanForTokens(f.root as unknown as ScanRoot, catalog), catalog };
}

async function applyAll(f: File, proposal: Proposal, catalog: Catalog): Promise<ApplyResult> {
  const before = await takeSnapshot(f.root.id);
  const outcome = await applyProposal(proposal, catalog);
  const snapshotDiff = diffSnapshots(before, await takeSnapshot(f.root.id));
  return { ...outcome, snapshotDiff, audit: await auditComponent(f.root.id) };
}

const rows = (p: Proposal) => p.tokens.map((t) => [t.previousName ?? null, t.name, t.kind ?? null, t.status, t.match, t.skip, t.alias.desktop]);
const fieldsOf = (p: Proposal, name: string) => p.tokens.find((t) => t.name === name)!.uses.map((u) => `${u.indexPath.join(".")}:${u.field}`);
const boundName = (f: File, node: FakeNode, field: string) => f.world.variables.get((node.boundVariables[field] as { id: string }).id)!.name;
const componentNames = (f: File) => f.comps.variableIds.map((id) => f.world.variables.get(id)!.name);

describe("property split: padding -> paddingX + paddingY (card-markooo)", () => {
  it("one scan, all checked: new paddingX for left/right, padding renamed to paddingY", async () => {
    const f = paddingSplit();
    const { proposal } = await scan(f);
    expect(proposal.unmatched).toEqual([]);
    expect(rows(proposal)).toEqual([
      [null, "card-markooo/spacing/paddingX", null, "new", "exact", false, f.v.padXl.id],
      ["card-markooo/spacing/padding", "card-markooo/spacing/paddingY", "rename", "existing", "exact", false, f.v.padS.id],
    ]);
    expect(fieldsOf(proposal, "card-markooo/spacing/paddingX")).toEqual([":paddingLeft", ":paddingRight"]);
    expect(fieldsOf(proposal, "card-markooo/spacing/paddingY")).toEqual([":paddingBottom", ":paddingTop"]);
    expect(proposal.tokens[1].note).toBe("No visible change. Renaming tokens can break developers' code.");
    expect(proposal.warnings.filter((w) => w.includes("pattern"))).toEqual([]);
  });

  it("applies with no visible change, audit PASS, nothing bound to padding, re-scan proposes nothing", async () => {
    const f = paddingSplit();
    const { proposal, catalog } = await scan(f);
    const result = await applyAll(f, proposal, catalog);
    expect(result.skipped).toEqual([]);
    expect(result.tokenRenames).toEqual([{ from: "card-markooo/spacing/padding", to: "card-markooo/spacing/paddingY" }]);
    expect(result).toMatchObject({ tokensCreated: 1, bound: 2, snapshotDiff: [], audit: "PASS" });
    expect(f.v.padding.name).toBe("card-markooo/spacing/paddingY");
    expect(boundName(f, f.root, "paddingTop")).toBe("card-markooo/spacing/paddingY");
    expect(boundName(f, f.root, "paddingBottom")).toBe("card-markooo/spacing/paddingY");
    expect(boundName(f, f.root, "paddingLeft")).toBe("card-markooo/spacing/paddingX");
    expect(componentNames(f)).toEqual(["card-markooo/color/background", "card-markooo/spacing/paddingY", "card-markooo/spacing/paddingX"]);
    const created = f.world.variables.get((f.root.boundVariables.paddingLeft as { id: string }).id)!;
    expect(created.pluginData).toEqual({ createdBy: "component-studio", componentId: f.root.id });
    expect(summarizeResult(result, "tokens")).toBe("Step 2: create tokens applied. 1 tokens created, 0 reused, 2 bound, 1 renamed");
    expect(renamedTokensText(result)).toBe("- card-markooo/spacing/padding -> card-markooo/spacing/paddingY");

    const again = (await scan(f)).proposal;
    expect([again.tokens, again.unmatched]).toEqual([[], []]);
  });

  it("padding still used on four equal sides elsewhere: no rename, new paddingY on the root's top/bottom only", async () => {
    const f = paddingSplit(true);
    const { proposal, catalog } = await scan(f);
    expect(rows(proposal)).toEqual([
      [null, "card-markooo/spacing/paddingX", null, "new", "exact", false, f.v.padXl.id],
      [null, "card-markooo/spacing/paddingY", "rebind", "new", "exact", false, f.v.padS.id],
    ]);
    expect(fieldsOf(proposal, "card-markooo/spacing/paddingY")).toEqual([":paddingBottom", ":paddingTop"]);

    const result = await applyAll(f, proposal, catalog);
    expect(result.skipped).toEqual([]);
    expect(result).toMatchObject({ tokenRenames: [], snapshotDiff: [], audit: "PASS" });
    const content = f.root.children[0];
    expect(boundName(f, f.root, "paddingTop")).toBe("card-markooo/spacing/paddingY");
    expect(boundName(f, content, "paddingTop")).toBe("card-markooo/spacing/padding");
    expect(f.v.padding.name).toBe("card-markooo/spacing/padding");
  });
});

describe("component renamed: card-marko tokens -> card-markooo", () => {
  it("three checked rename rows, the other component's token untouched", async () => {
    const f = renamedComponent();
    const { proposal, catalog } = await scan(f);
    expect(proposal.unmatched).toEqual([]);
    expect(proposal.typography).toEqual([]);
    expect(rows(proposal)).toEqual([
      ["card-marko/color/background", "card-markooo/color/background", "rename", "existing", "exact", false, f.v.s1.id],
      ["card-marko/color/text", "card-markooo/color/text", "rename", "existing", "exact", false, f.v.on1.id],
      ["card-marko/spacing/gap", "card-markooo/spacing/gap", "rename", "existing", "exact", false, f.v.gapS.id],
    ]);

    const semantic = catalog.variables.filter((x) => x.collection !== "components").map((x) => ({ id: x.id, name: x.name, collection: x.collection, type: x.type }));
    const model = buildReviewModel(proposal, semantic);
    expect(model.tokens.map((t) => [t.previousName, t.name, t.apply])).toEqual([
      ["card-marko/color/background", "card-markooo/color/background", true],
      ["card-marko/color/text", "card-markooo/color/text", true],
      ["card-marko/spacing/gap", "card-markooo/spacing/gap", true],
    ]);
  });

  it("applies in place: same ids, same order, no visible change, audit PASS, re-scan proposes nothing", async () => {
    const f = renamedComponent();
    const ids = f.comps.variableIds.slice();
    const { proposal, catalog } = await scan(f);
    const result = await applyAll(f, collectProposal(proposal, { renames: [], tokens: [] }), catalog);
    expect(result.skipped).toEqual([]);
    expect(result).toMatchObject({ tokensCreated: 0, bound: 0, snapshotDiff: [], audit: "PASS" });
    expect(f.comps.variableIds).toEqual(ids);
    expect(componentNames(f)).toEqual([
      "card-markooo/color/background",
      "card-markooo/color/text",
      "card-markooo/spacing/gap",
      "button/color/background",
    ]);
    expect(renamedTokensText(result)).toBe(
      [
        "- card-marko/color/background -> card-markooo/color/background",
        "- card-marko/color/text -> card-markooo/color/text",
        "- card-marko/spacing/gap -> card-markooo/spacing/gap",
      ].join("\n"),
    );
    const again = (await scan(f)).proposal;
    expect([again.tokens, again.unmatched, again.typography]).toEqual([[], [], []]);
  });

  it("step 1 result counts the tokens still on old names", async () => {
    const f = renamedComponent();
    const count = await staleTokenCount(f.root as unknown as ScanRoot);
    expect(count).toBe(3);
    const result = { staleTokenNames: count } as ApplyResult;
    expect(staleTokensText(result)).toBe("3 tokens still use the old names; step 2 will offer to rename them.");
    expect(staleTokensText({ staleTokenNames: 0 } as ApplyResult)).toBeNull();
  });

  it("target exists with the same alias: rebind row to the existing token", async () => {
    const f = renamedComponent((b) => (b.v.existingText = token(b, "card-markooo/color/text", b.v.on1)));
    const { proposal, catalog } = await scan(f);
    expect(rows(proposal).find((r) => r[1] === "card-markooo/color/text")).toEqual([
      null, "card-markooo/color/text", "rebind", "existing", "exact", false, f.v.on1.id,
    ]);
    const result = await applyAll(f, proposal, catalog);
    expect(result.skipped).toEqual([]);
    expect(result).toMatchObject({ snapshotDiff: [], audit: "PASS" });
    const fill = f.root.children[0].fills[0] as { boundVariables: { color: { id: string } } };
    expect(fill.boundVariables.color.id).toBe(f.v.existingText.id);
  });

  it("target exists with another alias: unchecked alias change, as for any existing token", async () => {
    const f = renamedComponent((b) => (b.v.existingText = token(b, "card-markooo/color/text", b.v.on3)));
    const { proposal } = await scan(f);
    const row = proposal.tokens.find((t) => t.name === "card-markooo/color/text")!;
    expect(row).toMatchObject({ kind: "alias-change", status: "existing", match: "manual", skip: true });
    expect(row.previousAlias).toEqual({ desktop: f.v.on3.id, mobile: f.v.on3.id });
  });

  it("a token another component created (componentId) is never renamed, a token with this root's id is", async () => {
    const f = renamedComponent((b) => b.v.text.setPluginData("componentId", "other:1"));
    f.v.buttonBg.setPluginData("componentId", f.root.id);
    const { proposal } = await scan(f);
    expect(proposal.tokens.filter((t) => t.kind === "rename").map((t) => [t.previousName, t.name])).toEqual([
      ["button/color/background", "card-markooo/badge/color/background"],
      ["card-marko/color/background", "card-markooo/color/background"],
      ["card-marko/spacing/gap", "card-markooo/spacing/gap"],
    ]);
  });
});
