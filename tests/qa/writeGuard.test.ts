import { beforeEach, describe, expect, it } from "vitest";
import { NAMING_KEY, NAMING_NAMESPACE, TOKENS_KEY, type PluginToUi, type Proposal, type QaReport } from "../../src/types";
import { FakeNode } from "../apply/fakeFigma";
import { bootPlugin, cardFile, guard, type Card } from "../studio/pluginHarness";
import { coreFile } from "./coreLibraryFixture";

const STORED_NAMES = JSON.stringify({ version: 1, source: "claude", createdAt: "2026-10-16T09:00:00Z", rootId: "x", rootName: "x", structureHash: "stale", componentName: null, renames: [] });
const STORED_TOKENS = JSON.stringify({ version: 1, source: "claude", createdAt: "2026-10-16T09:00:00Z", rootId: "x", structureHash: "stale", suggestions: [] });

const reportOf = (posted: PluginToUi[]): QaReport => {
  const msg = posted.find((m) => m.type === "component/report");
  if (!msg || msg.type !== "component/report") throw new Error(`no report; got ${JSON.stringify(posted.map((m) => m.type === "component/error" ? m.message : m.type))}`);
  return msg.report;
};

describe("write guard", () => {
  it("catches renames, plugin data, relaunch data, bindings and variable creation", () => {
    const card = cardFile();
    const writes: string[] = [];
    const figma = guard((globalThis as unknown as { figma: object }).figma, writes) as unknown as {
      getNodeByIdAsync(id: string): Promise<FakeNode>;
      variables: { createVariable(...a: unknown[]): unknown };
    };
    const attempts: Array<() => unknown> = [
      () => figma.variables.createVariable("x", null, "COLOR"),
    ];
    for (const a of attempts) expect(a).toThrow(/read-only/);
    return figma.getNodeByIdAsync(card.root.id).then((root) => {
      const node = root as unknown as FakeNode & Record<string, (...a: unknown[]) => unknown>;
      expect(() => (node.name = "renamed")).toThrow(/read-only/);
      expect(() => node.setSharedPluginData("a", "b", "c")).toThrow(/read-only/);
      expect(() => node.setPluginData("a", "b")).toThrow(/read-only/);
      expect(() => node.setRelaunchData({ open: "" })).toThrow(/read-only/);
      expect(() => node.setBoundVariable("paddingLeft", null)).toThrow(/read-only/);
      expect(() => (node.children[0].fills = [])).toThrow(/read-only/);
      expect(writes).toHaveLength(7);
      expect(card.root.name).toBe("Card Marko");
    });
  });
});

describe("QA check path", () => {
  let card: Card;
  beforeEach(() => {
    card = cardFile();
    const root = card.root as unknown as { setSharedPluginData(ns: string, k: string, v: string): void };
    root.setSharedPluginData(NAMING_NAMESPACE, NAMING_KEY, STORED_NAMES);
    root.setSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY, STORED_TOKENS);
  });

  it("writes nothing, reads the stored Claude proposal and keeps it, and reports every issue in one go", async () => {
    const plugin = await bootPlugin(card);
    const writes = plugin.guardWrites();
    await plugin.send({ type: "component/check", useClaude: true });

    expect(writes).toEqual([]);
    expect(plugin.posted.filter((m) => m.type === "component/error")).toEqual([]);
    const report = reportOf(plugin.posted);
    expect(report.componentName).toBe("Card Marko");
    expect(report.naming).toEqual({ source: "rules", claudeRequested: true });
    expect(new Set(report.findings.map((f) => f.kind))).toEqual(
      new Set(["component-name", "default-name", "content-name", "raw-value", "semantic-binding", "deleted-binding"]),
    );
    expect(report.findings.find((f) => f.kind === "deleted-binding")).toMatchObject({ layer: "Card Marko › Frame 7 › label", nodeIds: [card.label.id] });
    expect(report.notes.some((n) => /Claude|proposal/i.test(n))).toBe(true);

    const root = card.root as unknown as { getSharedPluginData(ns: string, k: string): string };
    expect(root.getSharedPluginData(NAMING_NAMESPACE, NAMING_KEY)).toBe(STORED_NAMES);
    expect(root.getSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY)).toBe(STORED_TOKENS);
    expect(card.root.name).toBe("Card Marko");
    expect(card.frame.name).toBe("Frame 7");
    expect(card.root.boundVariables).toEqual({});
    expect((card.root as unknown as { relaunch?: unknown }).relaunch).toBeUndefined();
    expect(plugin.relaunch.map((r) => r.node)).toEqual(["root", "page"]); // from start-up only
  });

  it("checks a plain frame (draft) read-only: color, spacing and naming findings, nothing that needs component tokens", async () => {
    (card.root as unknown as { type: string }).type = "FRAME"; // the same design, not a component yet
    const plugin = await bootPlugin(card, { selection: [card.greeting] });
    const writes = plugin.guardWrites();
    await plugin.send({ type: "component/check", useClaude: true });

    expect(writes).toEqual([]);
    expect(plugin.posted.filter((m) => m.type === "component/error")).toEqual([]);
    const report = reportOf(plugin.posted);
    expect(report).toMatchObject({ draft: true, componentId: card.root.id, componentName: "Card Marko", notes: [] });
    expect(new Set(report.findings.map((f) => f.kind))).toEqual(new Set(["default-name", "content-name", "raw-value", "deleted-binding"]));
    expect(report.findings.find((f) => f.kind === "raw-value" && f.current === "16")).toMatchObject({ suggestion: "padding/m", nodeIds: [card.root.id] });
    expect(report.findings.find((f) => f.kind === "raw-value" && f.current === "#1A1A1A")).toMatchObject({ suggestion: "color/on-surface/1/enabled", nodeIds: [card.greeting.id] });

    const root = card.root as unknown as { getSharedPluginData(ns: string, k: string): string };
    expect(root.getSharedPluginData(NAMING_NAMESPACE, NAMING_KEY)).toBe(STORED_NAMES);
    expect(root.getSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY)).toBe(STORED_TOKENS);
    expect(card.frame.name).toBe("Frame 7");
    expect(card.root.boundVariables).toEqual({});
    expect((card.root as unknown as { relaunch?: unknown }).relaunch).toBeUndefined();
  });

  it("reads library (remote) variables bound in the selection without importing or writing anything", async () => {
    const core = coreFile();
    const before = JSON.stringify([...core.world.variables.values()].map((v) => [v.id, v.name, v.valuesByMode]));
    const localBefore = core.world.collections.map((c) => [c.id, c.variableIds.length]);
    const plugin = await bootPlugin(core, { selection: [core.action1Label] });
    const writes = plugin.guardWrites();
    await plugin.send({ type: "component/check", useClaude: false });

    expect(writes).toEqual([]);
    expect(core.imports).toEqual([]);
    expect(plugin.posted.filter((m) => m.type === "component/error")).toEqual([]);
    expect(reportOf(plugin.posted).findings.some((f) => f.kind === "role-family")).toBe(true);
    expect(JSON.stringify([...core.world.variables.values()].map((v) => [v.id, v.name, v.valuesByMode]))).toBe(before);
    expect(core.world.collections.map((c) => [c.id, c.variableIds.length])).toEqual(localBefore);
    expect(core.action1Label.boundVariables).toEqual({ fontStyle: [{ type: "VARIABLE_ALIAS", id: core.lib.weightLabelM.id }], fontFamily: [{ type: "VARIABLE_ALIAS", id: core.lib.familyLabel.id }] });
  });

  it("refuses an Apply after a check, even for a proposal the sandbox scanned before", async () => {
    const plugin = await bootPlugin(card);
    await plugin.send({ type: "component/scan", phase: "rename", useClaude: false });
    const scanned = plugin.posted.find((m) => m.type === "component/proposal") as Extract<PluginToUi, { type: "component/proposal" }>;
    const writes = plugin.guardWrites();
    await plugin.send({ type: "component/check", useClaude: false });
    await plugin.send({ type: "component/apply", proposal: scanned.proposal as Proposal });

    expect(writes).toEqual([]);
    expect(plugin.posted.slice(-1)[0]).toEqual({
      type: "component/error",
      message: "QA check is read-only. Switch to Rename layers or Create tokens and scan the component to apply changes.",
    });
    expect(card.frame.name).toBe("Frame 7");
  });

  it("selects report layers and scrolls them into view; selection and viewport only", async () => {
    const plugin = await bootPlugin(card);
    const writes = plugin.guardWrites(["selection"]);
    await plugin.send({ type: "qa/select", nodeIds: [card.label.id, card.greeting.id] });

    expect(writes).toEqual([]);
    const page = plugin.figma.currentPage as { selection: Array<{ id: string }> };
    expect(page.selection.map((n) => n.id)).toEqual([card.label.id, card.greeting.id]);
    expect(plugin.viewport).toEqual([[card.label.id, card.greeting.id]]);
  });

  it("switches to the layer's page first when it is on another page", async () => {
    const other = { id: "page:2", type: "PAGE", name: "Components", selection: [] as unknown[] };
    card.root.parent = other as unknown as FakeNode;
    const plugin = await bootPlugin(card);
    const writes = plugin.guardWrites(["selection", "setCurrentPageAsync"]);
    await plugin.send({ type: "qa/select", nodeIds: [card.greeting.id] });

    expect(writes).toEqual([]);
    expect((plugin.figma.currentPage as { id: string }).id).toBe("page:2");
    expect(other.selection.map((n) => (n as { id: string }).id)).toEqual([card.greeting.id]);
  });

  it("reports a layer that no longer exists", async () => {
    const plugin = await bootPlugin(card);
    plugin.guardWrites(["selection"]);
    await plugin.send({ type: "qa/select", nodeIds: ["404:1"] });
    expect(plugin.posted.slice(-1)[0]).toEqual({ type: "component/error", message: "That layer no longer exists. Check the component again." });
  });
});
