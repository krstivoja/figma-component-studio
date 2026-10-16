import { beforeEach, describe, expect, it } from "vitest";
import { applyProposal } from "../../src/apply";
import { buildReviewModel, lookChangeView } from "../../src/review";
import { loadCatalog, type ScanRoot } from "../../src/scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "../../src/snapshot";
import { scanForTokens } from "../../src/studioTools";
import type { Catalog, Proposal, RowChoice } from "../../src/types";
import { FakeNode, solid, World, type FakeVariable } from "./fakeFigma";

interface Core {
  world: World;
  root: FakeNode;
  v: Record<string, FakeVariable>;
}

// Core file as found in Figma 2026-10-15: card-marko after earlier applies.
function coreFile(rootFill: "token" | "brand"): Core {
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
    s3: c("color/surface/3/enabled", "#E5E6F2"),
    brand: c("color/surface/brand/enabled", "#0059FF"),
    warning: c("color/surface/feedback/warning", "#FFF89D"),
    on1: c("color/on-surface/1/enabled", "#001B4D"),
    on1Disabled: c("color/on-surface/1/disabled", "#8A94A6"),
    on3: c("color/on-surface/3/enabled", "#0B1F5C"),
    onBrand: c("color/on-surface/brand/enabled", "#FFFFFE"),
    onWarning: c("color/on-surface/feedback/warning", "#3D3200"),
    border: c("color/border/medium", "#B0B8C4"),
    padM: world.variable(dims, "padding/m", "FLOAT", 16),
    gapS: world.variable(dims, "gap/s", "FLOAT", 12),
    famLabel: world.variable(typo, "font/family/label", "STRING", "Inter"),
    famBody: world.variable(typo, "font/family/body", "STRING", "Inter"),
    wLabel: world.variable(typo, "font/weight/Inter/label", "STRING", "Regular"),
    wBody: world.variable(typo, "font/weight/Inter/body", "STRING", "Regular"),
    sizeLabelS: world.variable(typo, "font/size/label/s", "FLOAT", 12),
    sizeLabelM: world.variable(typo, "font/size/label/m", "FLOAT", 14),
    sizeBodyS: world.variable(typo, "font/size/body/s", "FLOAT", 12),
    lhLabelS: world.variable(typo, "line-height/label/s", "FLOAT", 16),
    lhLabelM: world.variable(typo, "line-height/label/m", "FLOAT", 20),
    lhBodyS: world.variable(typo, "line-height/body/s", "FLOAT", 16),
    lsLabelS: world.variable(typo, "letter-spacing/label/s", "FLOAT", 0),
    lsLabelM: world.variable(typo, "letter-spacing/label/m", "FLOAT", 0),
    lsBodyS: world.variable(typo, "letter-spacing/body/s", "FLOAT", 0.2),
  };
  const k = (name: string, target: FakeVariable) => world.variable(comps, name, target.resolvedType, world.alias(target));
  v.bg = k("card-marko/color/background", v.s1);
  v.text = k("card-marko/color/text", v.on3);
  v.contentBg = k("card-marko/text-content/color/background", v.warning);
  v.padding = k("card-marko/spacing/padding", v.padM);
  v.navGap = k("card-marko/navbar/spacing/gap", v.gapS);

  const label = () => {
    const t = new FakeNode(world, "TEXT", "label");
    t.fills = [solid("#0B1F5C", v.text)];
    return t;
  };
  const navItems = [1, 2, 3].map(() => {
    const item = new FakeNode(world, "FRAME", "nav-item");
    item.layoutMode = "HORIZONTAL";
    return item.append(label());
  });
  const navbar = new FakeNode(world, "FRAME", "navbar").append(...navItems);
  navbar.layoutMode = "HORIZONTAL";
  navbar.itemSpacing = 12;
  navbar.setBoundVariable("itemSpacing", v.navGap);
  const content = new FakeNode(world, "FRAME", "text-content").append(label());
  content.layoutMode = "VERTICAL";
  content.fills = [solid("#FFF89D", v.contentBg)];

  const root = new FakeNode(world, "COMPONENT", "card-marko").append(navbar, content);
  root.layoutMode = "VERTICAL";
  root.height = 200;
  for (const side of ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]) root.setBoundVariable(side, v.padding);
  root.fills = rootFill === "token" ? [solid("#FFFFFF", v.bg)] : [solid("#0059FF", v.brand)];
  world.install();
  return { world, root, v };
}

const rows = (p: Proposal) => p.tokens.map((t) => [t.name, t.kind, t.status, t.match, t.skip, t.alias.desktop, t.uses.length]);
const paths = (p: Proposal, name: string) => p.tokens.find((t) => t.name === name)!.uses.map((u) => u.indexPath.join("."));

async function scan(core: Core, assume: RowChoice[] = []): Promise<{ proposal: Proposal; catalog: Catalog }> {
  const catalog = await loadCatalog();
  return { proposal: await scanForTokens(core.root as unknown as ScanRoot, catalog, assume), catalog };
}

async function applyAndCheck(core: Core, proposal: Proposal, catalog: Catalog) {
  const before = await takeSnapshot(core.root.id);
  const outcome = await applyProposal(proposal, catalog);
  const diff = diffSnapshots(before, await takeSnapshot(core.root.id));
  return { outcome, diff, audit: await auditComponent(core.root.id) };
}

describe("card-marko end to end: text token on the wrong surface (root on surface 1)", () => {
  let core: Core;
  beforeEach(() => {
    core = coreFile("token");
  });

  it("proposes the alias fix, the split for text-content and typography, all checked", async () => {
    const { proposal } = await scan(core);
    const { v } = core;
    expect(proposal.unmatched).toEqual([]);
    expect(rows(proposal)).toEqual([
      ["card-marko/color/text", "alias-change", "existing", "manual", false, v.on1.id, 3],
      ["card-marko/text-content/color/text", "rebind", "new", "manual", false, v.onWarning.id, 1],
    ]);
    expect(proposal.tokens[0].previousAlias).toEqual({ desktop: v.on3.id, mobile: v.on3.id });
    expect(paths(proposal, "card-marko/color/text")).toEqual(["0.0.0", "0.1.0", "0.2.0"]);
    expect(paths(proposal, "card-marko/text-content/color/text")).toEqual(["1.0"]);
    expect(proposal.warnings.filter((w) => /pick|pattern|different surfaces/.test(w))).toEqual([]);

    const [typo] = proposal.typography!;
    expect(proposal.typography).toHaveLength(1);
    expect(typo).toMatchObject({ role: "label/s", match: "exact", skip: false });
    expect(typo.uses).toHaveLength(4);
    expect(typo.bindings).toEqual({ fontFamily: v.famLabel.id, fontStyle: v.wLabel.id, fontSize: v.sizeLabelS.id, letterSpacing: v.lsLabelS.id });
    expect(typo.uses.every((u) => u.fields.join() === "fontFamily,fontStyle,fontSize,letterSpacing")).toBe(true);
    expect(typo.note).toContain("Line height is auto and no typography variable represents auto; left unbound.");
  });

  it("review lists the typography row with role and layer count", async () => {
    const { proposal, catalog } = await scan(core);
    const semantic = catalog.variables.filter((x) => x.collection !== "components").map((x) => ({ id: x.id, name: x.name, collection: x.collection, type: x.type }));
    const model = buildReviewModel(proposal, semantic);
    expect(model.typography.map((t) => [t.role, t.layerCount, t.apply, t.bindings.map((b) => b.variable)])).toEqual([
      ["label/s", 4, true, ["font/family/label", "font/weight/Inter/label", "font/size/label/s", "letter-spacing/label/s"]],
    ]);
    expect(model.tokens.map((t) => [t.name, t.apply])).toEqual([
      ["card-marko/color/text", true],
      ["card-marko/text-content/color/text", true],
    ]);
  });

  it("applies as intended look changes, audit PASS, and a re-scan proposes nothing", async () => {
    const { proposal, catalog } = await scan(core);
    const { outcome, diff, audit } = await applyAndCheck(core, proposal, catalog);
    expect(outcome.skipped).toEqual([]);
    expect(outcome).toMatchObject({ tokensCreated: 1, aliasesChanged: 1, bound: 1 + 4 * 4 });
    expect(diff.every((l) => / › fills: \[#0B1F5C\] -> \[#(001B4D|3D3200)\]$/.test(l))).toBe(true);
    expect(diff).toHaveLength(4);
    expect(lookChangeView({ ...outcome, snapshotDiff: diff, audit }, proposal).kind).toBe("intended");
    expect(audit).toBe("PASS");

    const label = core.root.children[1].children[0];
    expect(Object.keys(label.boundVariables).sort()).toEqual(["fontFamily", "fontSize", "fontStyle", "letterSpacing"]);
    expect(label.lineHeight).toEqual({ unit: "AUTO" });

    const again = (await scan(core)).proposal;
    expect(again.tokens).toEqual([]);
    expect(again.unmatched).toEqual([]);
    expect(again.typography).toEqual([]);
  });

  it("skips a text layer with mixed styles, with a reason", async () => {
    const label = core.root.children[1].children[0];
    label.fontSize = (globalThis as unknown as { figma: { mixed: number } }).figma.mixed;
    const { proposal } = await scan(core);
    expect(proposal.typography![0].uses).toHaveLength(3);
    expect(proposal.warnings).toContain('"label": mixed text styles in one layer; typography not bound.');
  });

  it("a role off in one field is the closest role, unchecked look change", async () => {
    for (const item of core.root.children[0].children) item.children[0].fontSize = 11.5;
    const { proposal } = await scan(core);
    expect(proposal.typography!.map((t) => [t.role, t.match, t.skip, t.uses.length])).toEqual([
      ["label/s", "exact", false, 1],
      ["label/s", "manual", true, 3],
    ]);
    expect(proposal.typography![1].note).toContain("closest is label/s (fontSize 11.5 -> 12)");
  });
});

describe("card-marko end to end: root changed by hand to the brand surface", () => {
  let core: Core;
  beforeEach(() => {
    core = coreFile("brand");
  });

  it("re-pairs the navbar labels with brand and splits text-content, all three checked", async () => {
    const { proposal } = await scan(core);
    const { v } = core;
    expect(rows(proposal)).toEqual([
      ["card-marko/color/background", "alias-change", "existing", "exact", false, v.brand.id, 1],
      ["card-marko/color/text", "alias-change", "existing", "manual", false, v.onBrand.id, 3],
      ["card-marko/text-content/color/text", "rebind", "new", "manual", false, v.onWarning.id, 1],
    ]);
    expect(proposal.warnings.some((w) => w.includes("by hand"))).toBe(false);
  });

  it("with the background row checked too, applies to an idempotent PASS state", async () => {
    const { proposal, catalog } = await scan(core);
    const all = { ...proposal, tokens: proposal.tokens.map((t) => ({ ...t, skip: false })) };
    const { outcome, audit } = await applyAndCheck(core, all, catalog);
    expect(outcome.skipped).toEqual([]);
    expect(audit).toBe("PASS");
    const again = (await scan(core)).proposal;
    expect([again.tokens, again.unmatched, again.typography]).toEqual([[], [], []]);
  });

  it("a checked background alias change re-pairs the text on it in the same review", async () => {
    const first = (await scan(core)).proposal;
    const bg = first.tokens.find((t) => t.name === "card-marko/color/background")!;
    const assume: RowChoice[] = [{ key: bg.key, apply: true, alias: { desktop: core.v.s1.id, mobile: core.v.s1.id } }];
    const repaired = (await scan(core, assume)).proposal;
    expect(rows(repaired).find((r) => r[0] === "card-marko/color/text")).toEqual([
      "card-marko/color/text", "alias-change", "existing", "manual", false, core.v.on1.id, 3,
    ]);
  });
});

describe("reuse safety", () => {
  it("never rebinds raw values to an existing token whose alias differs; it becomes an explicit unchecked alias change", async () => {
    const core = coreFile("token");
    core.root.fills = [solid("#E5E6F2")];
    const { proposal, catalog } = await scan(core);
    const bg = proposal.tokens.find((t) => t.name === "card-marko/color/background")!;
    expect(bg).toMatchObject({ kind: "alias-change", skip: true, alias: { desktop: core.v.s3.id } });
    expect(bg.previousAlias?.desktop).toBe(core.v.s1.id);
    const { outcome } = await applyAndCheck(core, proposal, catalog);
    expect(core.root.fills[0].boundVariables).toBeUndefined();
    expect(outcome.skipped).toEqual([]);
  });
});
