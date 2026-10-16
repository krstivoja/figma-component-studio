import { describe, expect, it } from "vitest";
import { applyProposal } from "../../src/apply";
import { aliasOptions, buildReviewModel, lookChangeView } from "../../src/review";
import { loadCatalog, type ScanRoot } from "../../src/scan";
import { auditComponent, diffSnapshots, takeSnapshot } from "../../src/snapshot";
import { scanForTokens } from "../../src/studioTools";
import type { Catalog, Proposal } from "../../src/types";
import { FakeNode, rgb, solid, World, type FakeCollection, type FakeVariable } from "./fakeFigma";

const STATES = ["enabled", "hover", "pressed", "disabled", "loading"];
const INTENTS = ["dimmed", "brand", "dark brand", "success", "warning", "error"];
const FEEDBACK = ["info", "promo", "success", "warning", "error", "neutral"];
const BORDERS = ["2x-low", "x-low", "low", "medium", "high", "brand", "promo", "error", "success", "warning", "neutral"];

const KNOWN: Record<string, string> = {
  "color/background/primary": "#F7F7F7",
  "color/on-background/primary": "#0A0A0A",
  "color/on-background/brand": "#0059FF",
  "color/surface/1/enabled": "#FFFFFF",
  "color/surface/2/enabled": "#F2F3F8",
  "color/surface/3/enabled": "#E5E6F2",
  "color/surface/subtle/enabled": "#EEF2FA",
  "color/surface/accent/enabled": "#FBBC2C",
  "color/surface/accent/hover": "#FFD15C",
  "color/surface/accent/pressed": "#C98A00",
  "color/surface/brand/enabled": "#0059FF",
  "color/surface/brand/hover": "#0047CC",
  "color/surface/brand/pressed": "#00369B",
  "color/surface/feedback/info": "#D6E8FF",
  "color/surface/feedback/promo": "#EBDDFF",
  "color/surface/feedback/success": "#D9F5E6",
  "color/surface/feedback/warning": "#FFF89D",
  "color/surface/feedback/error": "#FFE0E0",
  "color/surface/feedback/neutral": "#EDEDED",
  "color/on-surface/1/enabled": "#001B4D",
  "color/on-surface/accent/enabled": "#001B4D",
  "color/on-surface/brand/enabled": "#FFFFFF",
  "color/on-surface/brand/disabled": "#747487",
  "color/border/warning": "#E3AA1D",
};

function coreNames(): string[] {
  const names = ["color/background/primary", ...["primary", "brand", "dark brand", "success", "warning", "error", "disabled"].map((i) => `color/on-background/${i}`)];
  for (const s of ["1", "2", "3", "subtle", "accent", "brand"]) {
    for (const state of STATES) names.push(`color/surface/${s}/${state}`, `color/on-surface/${s}/${state}`);
    for (const i of s === "brand" ? ["success", "warning", "error"] : INTENTS) names.push(`color/on-surface/${s}/${i}`);
  }
  for (const k of FEEDBACK) names.push(`color/surface/feedback/${k}`, `color/on-surface/feedback/${k}`);
  for (const b of BORDERS) names.push(`color/border/${b}`);
  return names;
}

interface Core {
  world: World;
  root: FakeNode;
  comps: FakeCollection;
  c: Record<string, FakeVariable>;
}

function coreFile(bound: boolean): Core {
  const world = new World();
  const color = world.collection("color", ["light", "dark"]);
  const typo = world.collection("typography", ["desktop", "mobile"]);
  const comps = world.collection("components", ["desktop", "mobile"]);
  const c: Record<string, FakeVariable> = {};
  coreNames().forEach((name, i) => {
    c[name] = world.variable(color, name, "COLOR", KNOWN[name] ?? `#2${i.toString(16).padStart(5, "0")}`);
  });
  world.variable(typo, "font/family/label", "STRING", "Inter");
  world.variable(typo, "font/weight/Inter/label", "STRING", "Regular");
  world.variable(typo, "font/size/label/s", "FLOAT", 12);
  world.variable(typo, "line-height/label/s", "FLOAT", 16);
  world.variable(typo, "letter-spacing/label/s", "FLOAT", 0);

  const token = (name: string, target: string) => (bound ? world.variable(comps, name, "COLOR", world.alias(c[target])) : undefined);
  const rootBg = token("card-marko/color/background", "color/on-background/brand");
  const text = token("card-marko/color/text", "color/on-surface/brand/disabled");
  const contentBg = token("card-marko/text-content/color/background", "color/border/warning");
  const contentText = token("card-marko/text-content/color/text", "color/on-surface/accent/enabled");

  const label = (hex: string, v?: FakeVariable) => {
    const t = new FakeNode(world, "TEXT", "label");
    t.fills = [solid(hex, v)];
    return t;
  };
  const navbar = new FakeNode(world, "FRAME", "navbar").append(
    ...[1, 2, 3].map(() => new FakeNode(world, "FRAME", "nav-item").append(label("#747487", text))),
  );
  const content = new FakeNode(world, "FRAME", "text-content").append(label("#001B4D", contentText));
  content.fills = [solid("#E3AA1D", contentBg)];
  const root = new FakeNode(world, "COMPONENT", "card-marko").append(navbar, content);
  root.height = 200;
  root.fills = [solid("#0059FF", rootBg)];
  world.install();
  return { world, root, comps, c };
}

async function scan(core: Core): Promise<{ proposal: Proposal; catalog: Catalog }> {
  const catalog = await loadCatalog();
  return { proposal: await scanForTokens(core.root as unknown as ScanRoot, catalog), catalog };
}

function aliases(core: Core): Record<string, string> {
  const out: Record<string, string> = {};
  for (const id of core.comps.variableIds) {
    const v = core.world.variables.get(id)!;
    const value = v.valuesByMode[core.comps.defaultModeId] as { id: string };
    out[v.name] = core.world.variables.get(value.id)!.name;
  }
  return out;
}

const FINAL = {
  "card-marko/color/background": "color/surface/brand/enabled",
  "card-marko/color/text": "color/on-surface/brand/enabled",
  "card-marko/text-content/color/background": "color/surface/accent/enabled",
  "card-marko/text-content/color/text": "color/on-surface/accent/enabled",
};

async function applyAll(core: Core, proposal: Proposal, catalog: Catalog) {
  const before = await takeSnapshot(core.root.id);
  const outcome = await applyProposal(proposal, catalog);
  const diff = diffSnapshots(before, await takeSnapshot(core.root.id));
  return { outcome, diff, audit: await auditComponent(core.root.id) };
}

describe("card-marko in the real Core file: role families and state pairing", () => {
  it("one scan fixes every wrong-family and wrong-state alias, all rows checked", async () => {
    const core = coreFile(true);
    const { proposal } = await scan(core);
    const { c } = core;
    expect(proposal.unmatched).toEqual([]);
    expect(proposal.tokens.map((t) => [t.name, t.kind, t.match, t.skip, t.alias.desktop, t.uses.length])).toEqual([
      ["card-marko/color/background", "alias-change", "exact", false, c["color/surface/brand/enabled"].id, 1],
      ["card-marko/color/text", "alias-change", "manual", false, c["color/on-surface/brand/enabled"].id, 3],
      ["card-marko/text-content/color/background", "alias-change", "manual", false, c["color/surface/accent/enabled"].id, 1],
    ]);
    expect(proposal.typography!.map((t) => [t.role, t.match, t.skip])).toEqual([["label/s", "exact", false]]);
  });

  it("applies as intended look changes, audit PASS, and a re-scan proposes nothing", async () => {
    const core = coreFile(true);
    const { proposal, catalog } = await scan(core);
    const { outcome, diff, audit } = await applyAll(core, proposal, catalog);
    expect(outcome.skipped).toEqual([]);
    expect(outcome.aliasesChanged).toBe(3);
    expect(diff.filter((l) => l.endsWith("fills: [#747487] -> [#FFFFFF]"))).toHaveLength(3);
    expect(diff.filter((l) => l.endsWith("fills: [#E3AA1D] -> [#FBBC2C]"))).toHaveLength(1);
    expect(diff).toHaveLength(4);
    expect(lookChangeView({ ...outcome, snapshotDiff: diff, audit }, proposal).kind).toBe("intended");
    expect(audit).toBe("PASS");
    expect(aliases(core)).toEqual(FINAL);

    const again = (await scan(core)).proposal;
    expect([again.tokens, again.unmatched, again.typography]).toEqual([[], [], []]);
  });

  it("the same layers raw end on the same aliases", async () => {
    const core = coreFile(false);
    const { proposal, catalog } = await scan(core);
    expect(proposal.unmatched).toEqual([]);
    expect(proposal.tokens.every((t) => !t.skip)).toBe(true);
    const { outcome, audit } = await applyAll(core, proposal, catalog);
    expect(outcome.skipped).toEqual([]);
    expect(audit).toBe("PASS");
    expect(aliases(core)).toEqual(FINAL);
    const again = (await scan(core)).proposal;
    expect([again.tokens, again.unmatched, again.typography]).toEqual([[], [], []]);
  });

  it("review dropdowns offer only the row's family, the surface pair first for text", async () => {
    const core = coreFile(true);
    const { proposal, catalog } = await scan(core);
    const semantic = catalog.variables.filter((x) => x.collection !== "components").map((x) => ({ id: x.id, name: x.name, collection: x.collection, type: x.type }));
    const model = buildReviewModel(proposal, semantic);
    const labels = (key: string) => model.tokens.find((t) => t.name === key)!.options.flatMap((g) => g.options.map((o) => o.label));
    expect(labels("card-marko/color/background").every((n) => n.startsWith("color/surface/") || n === "color/background/primary")).toBe(true);

    const text = proposal.tokens.find((t) => t.name === "card-marko/color/text")!;
    const groups = aliasOptions(text, semantic);
    expect(groups[1]).toEqual({
      label: "Pairs with the surface",
      options: ["success", "warning", "error"].map((i) => ({ id: core.c[`color/on-surface/brand/${i}`].id, label: `color/on-surface/brand/${i}` })),
    });
    expect(groups.flatMap((g) => g.options.map((o) => o.label)).every((n) => /^color\/on-(surface|background)\//.test(n))).toBe(true);
  });

  it("an intent is kept only on an exact value and an interactive state", async () => {
    const core = coreFile(false);
    const setLight = (name: string, hex: string) => (core.c[name].valuesByMode["color:light"] = rgb(hex));
    setLight("color/on-surface/brand/success", "#00FF00");
    setLight("color/surface/brand/disabled", "#8080FF");
    core.root.children[0].children[0].children[0].fills = [solid("#00FF00")];
    const green = async () => (await scan(core)).proposal.tokens.find((t) => t.replaces === "#00FF00")?.alias.desktop;

    expect(await green()).toBe(core.c["color/on-surface/brand/success"].id);
    core.root.fills = [solid("#8080FF")];
    expect(await green()).toBe(core.c["color/on-surface/brand/disabled"].id);
  });
});
