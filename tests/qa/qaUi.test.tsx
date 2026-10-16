import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { QaFinding, QaReport as Report } from "../../src/types";
import { App, ctaLabel, readTab } from "../../src/ui/App";
import { QaReport } from "../../src/ui/views/QaReport";

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  (globalThis as Record<string, unknown>).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
});

afterEach(() => {
  delete (globalThis as Record<string, unknown>).localStorage;
});

const finding = (over: Partial<QaFinding>): QaFinding => ({
  id: "x",
  area: "tokens",
  kind: "raw-value",
  severity: "error",
  issue: "Raw value, no token",
  layer: "card › label",
  nodeIds: ["1:2"],
  current: "#0059FF",
  currentColor: { hex: "#0059FF", opacity: 1 },
  suggestion: "card/color/text → color/on-surface/1/enabled",
  suggestionColor: { hex: "#1A1A1A", opacity: 1 },
  source: "rules",
  detail: null,
  ...over,
});

const report: Report = {
  componentId: "1:0",
  componentName: "card",
  naming: { source: "rules", claudeRequested: false },
  findings: [finding({ id: "a", area: "naming", kind: "default-name", severity: "warning", issue: "Default Figma name", current: "Frame 2", currentColor: null, suggestion: "wrapper", suggestionColor: null }), finding({ id: "b" })],
  notes: [],
};

const selectedTab = (html: string) => html.match(/role="tab"[^>]*aria-selected="true"[^>]*>([^<]*)</)?.[1] ?? html.match(/aria-selected="true"[^>]*role="tab"[^>]*>([^<]*)</)?.[1];

describe("tabs and QA UI parity", () => {
  it("three tabs replace the step buttons and the QA checkbox; a fresh start opens Rename layers with Scan", () => {
    const html = renderToStaticMarkup(<App bridgeStatus="disconnected" />);
    for (const label of ["Rename layers", "Create tokens", "QA check"]) expect(html).toContain(label);
    expect(html.match(/role="tab"/g)).toHaveLength(3);
    expect(selectedTab(html)).toBe("Rename layers");
    expect(html).toContain(">Scan<");
    expect(html).toContain("Help with Claude Code");
    expect(html).not.toMatch(/QA mode|1\. Rename layers|2\. Create tokens|Check selection/);
  });

  it("the saved tab opens again", () => {
    store.set("component-studio.tab", "tokens");
    const html = renderToStaticMarkup(<App bridgeStatus="disconnected" />);
    expect(selectedTab(html)).toBe("Create tokens");
    expect(html).toContain("token names are built from layer names");
    expect(html).toContain(">Scan<");
  });

  it("the old saved QA checkbox opens the QA tab: Check selection, no Claude checkbox, read-only intro", () => {
    store.set("component-studio.qaMode", "1");
    const html = renderToStaticMarkup(<App bridgeStatus="disconnected" />);
    expect(selectedTab(html)).toBe("QA check");
    expect(html).toContain("Check selection");
    expect(html).toContain("Never changes the file.");
    expect(html).not.toContain("Help with Claude Code");
    expect(html).not.toMatch(/>Scan<|>Apply</);
  });

  it("a saved tab wins over the old QA checkbox; an unknown saved value falls back", () => {
    store.set("component-studio.qaMode", "1");
    store.set("component-studio.tab", "rename");
    expect(readTab()).toBe("rename");
    store.set("component-studio.tab", "bogus");
    expect(readTab()).toBe("qa");
    store.clear();
    store.set("component-studio.tab", "bogus");
    expect(readTab()).toBe("rename");
  });

  it("storage that throws falls back to the Rename layers tab", () => {
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readTab()).toBe("rename");
    expect(selectedTab(renderToStaticMarkup(<App bridgeStatus="disconnected" />))).toBe("Rename layers");
  });

  it("the footer CTA: Scan, Apply during review, Scan again after Apply, Check selection on QA", () => {
    expect(ctaLabel("rename", "empty")).toBe("Scan");
    expect(ctaLabel("tokens", "empty")).toBe("Scan");
    expect(ctaLabel("rename", "review")).toBe("Apply");
    expect(ctaLabel("tokens", "review")).toBe("Apply");
    expect(ctaLabel("rename", "result")).toBe("Scan again");
    expect(ctaLabel("tokens", "result")).toBe("Scan again");
    expect(ctaLabel("qa", "empty")).toBe("Check selection");
    expect(ctaLabel("qa", "report")).toBe("Check selection");
  });

  it("the report has no Apply, inputs, checkboxes or token pickers", () => {
    const html = renderToStaticMarkup(<QaReport report={report} launched={false} onSelect={() => {}} />);
    expect(html).toContain("Default Figma name");
    expect(html).toContain("Naming (1)");
    expect(html).toContain("Tokens (1)");
    expect(html).not.toMatch(/Apply|Cancel|<input|<select|aria-haspopup|role="checkbox"/);
  });

  it("a clean component says No issues found; a check launch says so", () => {
    const html = renderToStaticMarkup(<QaReport report={{ ...report, findings: [] }} launched onSelect={() => {}} />);
    expect(html).toContain("No issues found.");
    expect(html).toContain("Check with Component Studio");
    expect(html).not.toContain("<table");
  });

  it("a draft says so in the header, and Frame instead of Component", () => {
    const html = renderToStaticMarkup(<QaReport report={{ ...report, draft: true, findings: [] }} launched={false} onSelect={() => {}} />);
    expect(html).toContain("Draft (not a component yet)");
    expect(html).toMatch(/Frame(<!-- -->)?: (<!-- -->)?card/);
    expect(html).toContain("Colors pair with their surfaces");
  });

  it("maps-to-different-values notes collapse into one line with a show-all button", () => {
    const notes = [
      "Plain note.",
      'Token name "card/color/text" maps to different values (#000000, #111111); rename one row before applying.',
      'Token name "card/spacing/gap" maps to different values (4, 8); rename one row before applying.',
    ];
    const html = renderToStaticMarkup(<QaReport report={{ ...report, notes }} launched={false} onSelect={() => {}} />);
    expect(html).toContain("Plain note.");
    expect(html).toContain("2 token names map to different values");
    expect(html).toContain("Show all 2");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("card/spacing/gap");
  });
});
