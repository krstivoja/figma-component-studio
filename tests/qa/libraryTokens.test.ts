import { describe, expect, it } from "vitest";
import { proposeLayerNames } from "../../src/naming";
import { buildProposal, localEquivalent } from "../../src/proposal";
import { buildDraftQaReport, buildQaReport, qaReportMarkdown } from "../../src/qa";
import { normalizeVariableName } from "../../src/scan";
import { equivalenceKey, withBoundVariables } from "../../src/studioTools";
import type { Catalog, CatalogVariable, ComponentScan, PluginToUi, QaReport } from "../../src/types";
import { FakeNode, solid } from "../apply/fakeFigma";
import { bootPlugin } from "../studio/pluginHarness";
import { layer, makeCatalog, numUse } from "../tokens/fixtures";
import { coreFile, LIBRARY_IDS, type CoreFile } from "./coreLibraryFixture";

const reportOf = (posted: PluginToUi[]): QaReport => {
  const msg = posted.find((m) => m.type === "component/report");
  if (!msg || msg.type !== "component/report") throw new Error(`no report; got ${JSON.stringify(posted)}`);
  return msg.report;
};

async function check(core: CoreFile, selected: FakeNode): Promise<QaReport> {
  const plugin = await bootPlugin(core, { selection: [selected] });
  const writes = plugin.guardWrites();
  await plugin.send({ type: "component/check", useClaude: false });
  expect(writes).toEqual([]);
  expect(core.imports).toEqual([]);
  return reportOf(plugin.posted);
}

const row = (r: QaReport, kind: string, layerPath: string) => r.findings.find((f) => f.kind === kind && f.layer === layerPath);

describe("name normalisation", () => {
  it("prefixes the collection only when the name does not carry it", () => {
    expect(normalizeVariableName("surface/1/enabled", "color")).toBe("color/surface/1/enabled");
    expect(normalizeVariableName("color/surface/accent/primary/enabled", "color")).toBe("color/surface/accent/primary/enabled");
    expect(equivalenceKey({ name: "surface/secondary/enabled", collection: "color" })).toBe(
      equivalenceKey({ name: "color/surface/secondary/enabled", collection: "color" }),
    );
    expect(equivalenceKey({ name: "font/family/label", collection: "typography" })).not.toBe(equivalenceKey({ name: "font/family/label", collection: "color" }));
  });
});

describe("QA catalog: local variables plus the ones bound in the selection", () => {
  it("adds every bound library variable, marked remote, resolved through its aliases; local color names normalised", async () => {
    const core = coreFile();
    const { loadCatalog } = await import("../../src/scan");
    const local = await loadCatalog();
    const catalog = await withBoundVariables(local, core.root as unknown as SceneNode);

    expect(local.variables.some((v) => v.remote)).toBe(false); // step 2's catalog stays local only
    expect(local.variables.find((v) => v.id === core.v.s1.id)?.name).toBe("surface/1/enabled");
    const byId = new Map(catalog.variables.map((v) => [v.id, v]));
    expect(byId.get(core.v.s1.id)?.name).toBe("color/surface/1/enabled");
    expect(byId.get(core.v.padS.id)?.name).toBe("padding/s"); // only the color collection is normalised
    expect(byId.get(LIBRARY_IDS.surfaceAccentPrimary)).toMatchObject({
      name: "color/surface/accent/primary/enabled",
      collection: "color",
      type: "COLOR",
      remote: true,
      values: { light: { hex: "#0059FF", opacity: 1 }, dark: { hex: "#3B8DFF", opacity: 1 } },
    });
    expect(byId.get(LIBRARY_IDS.surfacePrimary)?.values).toEqual({ light: { hex: "#FFFFFF", opacity: 1 }, dark: { hex: "#15151C", opacity: 1 } });
    expect(byId.get(LIBRARY_IDS.onSurfacePrimary)?.values.light).toEqual({ hex: "#001B4D", opacity: 1 });
    // Alias targets by name, in the form local `_global` primitives are compared in ("color/brand blue/40" -> "brand blue/40").
    expect(byId.get(LIBRARY_IDS.surfaceAccentPrimary)?.aliasKeys).toEqual({ light: "brand blue/40", dark: "brand blue/30" });
    expect(byId.get(LIBRARY_IDS.surfacePrimary)?.aliasKeys).toEqual({ light: "white", dark: "brand blue/90" });
    expect(byId.get(core.v.s1.id)?.aliasKeys).toBeUndefined();
    expect(byId.get(LIBRARY_IDS.weightLabelM)).toMatchObject({ name: "font/weight/label/m", collection: "typography", values: { desktop: { string: "semiBold" } } });
    expect(catalog.variables.filter((v) => v.remote).map((v) => v.id).sort()).toEqual(Object.values(LIBRARY_IDS).sort());
    // Alias targets (color/white, color/brand blue/40, …) are not bound in the selection, so not in the catalog.
    expect(catalog.variables.some((v) => v.name === "color/white")).toBe(false);
    expect(catalog.variables.slice(0, local.variables.length).every((v) => !v.remote)).toBe(true);
  });
});

describe("QA on the Core segmented control (library tokens)", () => {
  it("Segmented control: Action 1's label gets the local on-surface of the brand surface its library surface maps to", async () => {
    const core = coreFile();
    const r = await check(core, core.root);
    expect(r.draft).toBe(true);

    // The user's case: text bound to library surface/primary/enabled on library surface/accent/primary/enabled
    // (brand blue/40 light, brand blue/30 dark) = the file's surface/brand/enabled, so on-surface/brand/enabled.
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")).toMatchObject({
      severity: "error",
      issue: "Wrong color family",
      nodeIds: [core.action1Label.id],
      current: "color/surface/primary/enabled",
      currentColor: { hex: "#FFFFFF", opacity: 1 },
      suggestion: "color/on-surface/brand/enabled",
      suggestionColor: { hex: "#FFFFFF", opacity: 1 },
      source: "rules",
      detail:
        "color/surface/primary/enabled is not a text color; text colors come from on-surface/*, on-background/*. " +
        "Text on surface brand (mapped from library surface/accent/primary/enabled) uses on-surface/brand/enabled; look unchanged.",
    });
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")?.suggestionNote).toBeUndefined();
    // Library surface/secondary has no local match: the library partner, named as text.
    expect(row(r, "surface-pairing", "Segmented control › Action 2 › label-text")).toMatchObject({
      severity: "error",
      issue: "Wrong surface pairing",
      current: "color/on-surface/primary/enabled",
      currentColor: { hex: "#001B4D", opacity: 1 },
      suggestion: "color/on-surface/secondary/enabled",
      suggestionColor: null,
      suggestionNote: "From the library, not in this file",
      detail: "Text on surface secondary uses on-surface/secondary/enabled.",
    });
    // One error per label: a wrong family is not repeated as a pairing row.
    expect(r.findings.filter((f) => f.severity === "error").map((f) => f.layer)).toEqual([
      "Segmented control › Action 1 › label-text",
      "Segmented control › Action 2 › label-text",
    ]);
  });

  it("without a local match the library partner is named as text (no swatch)", async () => {
    const core = coreFile({ localBrand: false });
    const r = await check(core, core.root);
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")).toMatchObject({
      current: "color/surface/primary/enabled",
      suggestion: "color/on-surface/accent/primary/enabled",
      suggestionColor: null,
      suggestionNote: "From the library, not in this file",
      detail:
        "color/surface/primary/enabled is not a text color; text colors come from on-surface/*, on-background/*. " +
        "Text on surface accent/primary uses on-surface/accent/primary/enabled.",
    });
    expect(r.findings.find((f) => f.kind === "library-token" && f.current === "color/surface/accent/primary/enabled")).toMatchObject({
      suggestion: null,
      detail: 'Library collection "color", no local equivalent: the design uses another token set.',
    });
  });

  it("state-aware: a library hover surface maps to the local hover surface, text gets on-surface/brand/hover", async () => {
    const core = coreFile();
    core.action1.fills = [solid("#000000", core.accentHover)];
    const r = await check(core, core.action1);
    expect(row(r, "role-family", "Action 1 › label-text")).toMatchObject({
      current: "color/surface/primary/enabled",
      suggestion: "color/on-surface/brand/hover",
      suggestionColor: { hex: "#FFFFFF", opacity: 1 },
    });
    expect(row(r, "role-family", "Action 1 › label-text")?.detail).toContain(
      "Text on surface brand hover (mapped from library surface/accent/primary/hover) uses on-surface/brand/hover",
    );
    expect(r.findings.find((f) => f.kind === "library-token" && f.current === "color/surface/accent/primary/hover")?.suggestion).toBe(
      "color/surface/brand/hover",
    );
  });

  it("text already on the mapped local partner pairs: no error", async () => {
    const core = coreFile();
    core.action1Label.fills = [solid("#000000", core.v.onBrand)];
    const r = await check(core, core.root);
    expect(r.findings.filter((f) => f.layer === "Segmented control › Action 1 › label-text" && f.severity === "error")).toEqual([]);
  });

  it('lists every library variable with no local equivalent once, as "From a library" info, with its layers', async () => {
    const core = coreFile();
    const r = await check(core, core.root);
    const lib = r.findings.filter((f) => f.kind === "library-token");
    expect(lib.every((f) => f.severity === "info" && f.issue === "From a library" && f.area === "tokens")).toBe(true);
    expect(lib.map((f) => f.current).sort()).toEqual([
      "color/on-surface/primary/enabled",
      "color/surface/accent/primary/enabled",
      "color/surface/primary/enabled",
      "color/surface/secondary/enabled",
      "font/family/label",
      "font/weight/label/m",
    ]);
    expect(lib.find((f) => f.current === "color/surface/secondary/enabled")).toMatchObject({
      layer: "Segmented control",
      nodeIds: [core.root.id, core.action2.id],
      currentColor: { hex: "#F2F4FF", opacity: 1 },
      suggestion: null,
      detail: 'Library collection "color", no local equivalent: the design uses another token set.',
    });
    expect(lib.find((f) => f.current === "font/weight/label/m")?.nodeIds).toEqual([core.action1Label.id, core.action2Label.id]);
    // Same alias targets as the file's surface/brand/enabled: still info, with the local equivalent.
    expect(lib.find((f) => f.current === "color/surface/accent/primary/enabled")).toMatchObject({
      severity: "info",
      layer: "Segmented control › Action 1",
      currentColor: { hex: "#0059FF", opacity: 1 },
      suggestion: "color/surface/brand/enabled",
      suggestionColor: { hex: "#0059FF", opacity: 1 },
      suggestionNote: "Local equivalent",
      detail: 'Library collection "color", local equivalent: color/surface/brand/enabled.',
    });
  });

  it('Markdown: the library rows fold into one "come from a library" bullet with a nested list; counts stay per finding', async () => {
    const core = coreFile();
    const r = await check(core, core.root);
    const md = qaReportMarkdown(r);
    const lines = md.split("\n");
    const at = lines.indexOf("- **info** 6 tokens come from a library:");
    expect(at).toBeGreaterThan(-1);
    const end = lines.findIndex((l, i) => i > at && !l.startsWith("  - "));
    const nested = lines.slice(at + 1, end);
    expect(nested).toHaveLength(6);
    expect(nested).toContain(
      "  - `Segmented control › Action 1` · current `color/surface/accent/primary/enabled` · suggested `color/surface/brand/enabled` (local equivalent) (rules) · Library collection \"color\", local equivalent: color/surface/brand/enabled.",
    );
    expect(md).not.toContain("From a library");
    expect(md).toContain("6 info");
  });

  it("selecting Action 1 checks Action 1 as the root and still reports the wrong family", async () => {
    const core = coreFile();
    const r = await check(core, core.action1);
    expect(r.componentName).toBe("Action 1");
    expect(row(r, "role-family", "Action 1 › label-text")).toMatchObject({
      current: "color/surface/primary/enabled",
      suggestion: "color/on-surface/brand/enabled",
      suggestionColor: { hex: "#FFFFFF", opacity: 1 },
    });
    expect(r.findings.filter((f) => f.kind === "library-token").map((f) => f.current).sort()).toEqual([
      "color/surface/accent/primary/enabled",
      "color/surface/primary/enabled",
      "font/family/label",
      "font/weight/label/m",
    ]);
  });

  it("a partner the file has locally is suggested with its swatch; a local equivalent is not listed as library", async () => {
    const core = coreFile();
    const color = core.world.collections.find((c) => c.name === "color" && !(c as unknown as { remote?: boolean }).remote)!;
    core.world.variable(color, "on-surface/secondary/enabled", "COLOR", { light: "#001B4D", dark: "#FFFFFF" }, true);
    core.world.variable(color, "surface/secondary/enabled", "COLOR", { light: "#F2F4FF", dark: "#1F222D" }, true);
    const r = await check(core, core.root);
    const pairing = row(r, "surface-pairing", "Segmented control › Action 2 › label-text")!;
    expect(pairing).toMatchObject({ suggestion: "color/on-surface/secondary/enabled", suggestionColor: { hex: "#001B4D", opacity: 1 } });
    expect(pairing.suggestionNote).toBeUndefined();
    expect(r.findings.some((f) => f.kind === "library-token" && f.current === "color/surface/secondary/enabled")).toBe(false);
  });

  it("component QA: the same errors instead of a plain wrap row", async () => {
    const core = coreFile();
    (core.root as unknown as { type: string }).type = "COMPONENT";
    const r = await check(core, core.root);
    expect(r.draft).toBeUndefined();
    // Component root: step 2's fix row, aliasing the local partner of the mapped surface.
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")).toMatchObject({
      severity: "error",
      current: "color/surface/primary/enabled",
      suggestion: "segmented-control/action-1/color/text → color/on-surface/brand/enabled",
      suggestionColor: { hex: "#FFFFFF", opacity: 1 },
      detail:
        "color/surface/primary/enabled is not a text color; text colors come from on-surface/*, on-background/*. " +
        "Text on surface brand (mapped from library surface/accent/primary/enabled) uses on-surface/brand/enabled; look unchanged.",
    });
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")?.suggestionNote).toBeUndefined();
    // The wrap of the library surface aliases its local equivalent, as step 2 (local variables only) would.
    expect(row(r, "semantic-binding", "Segmented control › Action 1")).toMatchObject({
      current: "color/surface/accent/primary/enabled",
      suggestion: "segmented-control/action-1/color/background → color/surface/brand/enabled",
      suggestionColor: { hex: "#0059FF", opacity: 1 },
    });
    expect(row(r, "surface-pairing", "Segmented control › Action 2 › label-text")).toMatchObject({
      suggestion: "color/on-surface/secondary/enabled",
      suggestionNote: "From the library, not in this file",
    });
    expect(r.findings.filter((f) => f.kind === "library-token")).toHaveLength(6);
    const md = qaReportMarkdown(r);
    expect(md).toContain("suggested `segmented-control/action-1/color/text → color/on-surface/brand/enabled` (rules)");
    expect(md).toContain("suggested `color/on-surface/secondary/enabled` (from the library, not in this file) (rules)");
  });

  it("component QA without a local match: the library partner as text instead of a plain wrap row", async () => {
    const core = coreFile({ localBrand: false });
    (core.root as unknown as { type: string }).type = "COMPONENT";
    const r = await check(core, core.root);
    expect(row(r, "role-family", "Segmented control › Action 1 › label-text")).toMatchObject({
      current: "color/surface/primary/enabled",
      suggestion: "color/on-surface/accent/primary/enabled",
      suggestionColor: null,
      suggestionNote: "From the library, not in this file",
    });
    expect(qaReportMarkdown(r)).toContain(
      "suggested `color/on-surface/accent/primary/enabled` (from the library, not in this file) (rules)",
    );
  });
});

describe("localEquivalent: library color -> the file's own", () => {
  const lib = (name: string, light: string, dark: string, aliasKeys?: Record<string, string>): CatalogVariable => ({
    id: `lib:${name}`,
    name,
    collection: "color",
    type: "COLOR",
    values: { light: { hex: light, opacity: 1 }, dark: { hex: dark, opacity: 1 } },
    remote: true,
    ...(aliasKeys ? { aliasKeys } : {}),
  });
  const prim = (name: string, hex: string): CatalogVariable => ({ id: `g:${name}`, name, collection: "_global", type: "COLOR", values: { global: { hex, opacity: 1 } } });
  const local = (name: string, light: CatalogVariable, dark: CatalogVariable): CatalogVariable => ({
    id: `c:${name}`,
    name,
    collection: "color",
    type: "COLOR",
    values: { light: light.values.global, dark: dark.values.global },
    aliasOf: { light: light.id, dark: dark.id },
  });
  const b40 = prim("brand blue/40", "#0059FF");
  const b30 = prim("brand blue/30", "#3B8DFF");
  const x40 = prim("ocean/40", "#0059FF"); // same value, another primitive
  const x30 = prim("ocean/30", "#3B8DFF");
  const accent = lib("color/surface/accent/primary/enabled", "#0059FF", "#3B8DFF", { light: "brand blue/40", dark: "brand blue/30" });
  const catalog = (...vars: CatalogVariable[]): Catalog => ({
    variables: [b40, b30, x40, x30, ...vars],
    componentsCollectionId: null,
    componentsModes: { desktop: null, mobile: null },
  });
  const name = (v: CatalogVariable, c: Catalog) => localEquivalent(v, c)?.name ?? null;

  it("same alias targets win over the same values, even with more shared name segments", () => {
    const c = catalog(local("color/surface/accent/enabled", x40, x30), local("color/surface/brand/enabled", b40, b30), accent);
    expect(name(accent, c)).toBe("color/surface/brand/enabled");
  });

  it("several alias matches: the one sharing the most name segments", () => {
    const c = catalog(local("color/surface/brand/enabled", b40, b30), local("color/surface/accent/enabled", b40, b30), accent);
    expect(name(accent, c)).toBe("color/surface/accent/enabled");
  });

  it("no alias match: identical light and dark values, most shared segments first", () => {
    const c = catalog(local("color/surface/ocean/enabled", x40, x30), local("color/surface/accent/x/enabled", x40, x30), accent);
    expect(name(accent, c)).toBe("color/surface/accent/x/enabled");
    // makeCatalog's surface/brand/enabled is #0059FF light but #4D8BFF dark: not a match on values alone.
    expect(name(accent, makeCatalog())).toBeNull();
    // Only light the same: no match.
    expect(name(lib("color/surface/x/enabled", "#0059FF", "#000001"), catalog(local("color/surface/brand/enabled", b40, b30)))).toBeNull();
  });

  it("stays in the role family, prefers a same-name local, and ignores local variables", () => {
    const onSame = local("color/on-surface/brand/enabled", b40, b30);
    expect(name(accent, catalog(onSame))).toBeNull();
    const sameName = local("color/surface/accent/primary/enabled", x40, x30);
    expect(name(accent, catalog(local("color/surface/brand/enabled", b40, b30), sameName))).toBe("color/surface/accent/primary/enabled");
    expect(localEquivalent(sameName, catalog(sameName))).toBeNull();
  });
});

describe("raw value titles: exact token vs nearest token", () => {
  const V = "f:pad";
  function padded(kind: "FRAME" | "COMPONENT", values: { left: number; gap: number }): ComponentScan {
    const root = layer("panel", kind, [], [layer("a", "FRAME", [0]), layer("b", "FRAME", [1])]);
    root.layout = { ...root.layout, mode: "HORIZONTAL", paddingLeft: values.left, paddingRight: values.left, paddingTop: values.left, paddingBottom: values.left, itemSpacing: values.gap };
    const uses = [
      ...(["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"] as const).map((f) => numUse(V, [], "panel", f, values.left)),
      numUse(V, [], "panel", "itemSpacing", values.gap),
    ];
    return { id: "9:0", name: "panel", kind, variantProperties: {}, variants: [{ id: V, props: {}, root, uses }] };
  }
  const naming = (s: ComponentScan) => ({
    componentId: s.id,
    componentName: s.name,
    newComponentName: null,
    renames: proposeLayerNames(s.variants[0].root),
    tokens: [],
    unmatched: [],
    warnings: [],
  });
  const raw = (r: QaReport) => r.findings.filter((f) => f.kind === "raw-value").map((f) => [f.issue, f.severity, f.current, f.suggestion]);

  it("draft: 11 -> padding/s (12) is a nearest token, 12 an existing one", () => {
    const s = padded("FRAME", { left: 11, gap: 12 });
    const r = buildDraftQaReport({ scan: s, naming: naming(s), namingSource: { source: "rules", claudeRequested: false }, catalog: makeCatalog() });
    expect(raw(r)).toEqual([
      ["Raw value, nearest token", "warning", "11", "padding/s"],
      ["Raw value, token exists", "warning", "12", "gap/s"],
    ]);
  });

  it("component QA: the same titles from the step 2 rows", () => {
    const s = padded("COMPONENT", { left: 11, gap: 12 });
    const catalog = makeCatalog();
    const tokens = buildProposal(s, catalog, [], "panel");
    const semantic = catalog.variables.map((v) => ({ id: v.id, name: v.name, collection: v.collection, type: v.type }));
    const r = buildQaReport({ scan: s, naming: naming(s), namingSource: { source: "rules", claudeRequested: false }, tokens, semantic });
    expect(raw(r).map((x) => x.slice(0, 3))).toEqual([
      ["Raw value, token exists", "warning", "12"],
      ["Raw value, nearest token", "warning", "11"],
    ]);
  });
});
