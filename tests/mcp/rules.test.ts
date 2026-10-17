import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PROMPTS, rulesMarkdown } from "../../mcp/rules";
import {
  buildRules,
  extractSection,
  parseSkill,
  promptText,
  renderModule,
  rulesSection,
  SECOND_BRAIN,
  SKILLS,
} from "../../mcp/rules-source";
import { NEVER_USE, VOCABULARY } from "../../src/vocabulary";

const root = resolve(__dirname, "../..");

const doc = [
  "# Title",
  "intro",
  "## Rules",
  "rule one",
  "### AI checks (run every time)",
  "```js",
  "# not a heading inside a fence",
  "```",
  "check",
  "## Page setup",
  "### Artboard size",
  "artboard",
  "### Surfaces",
  "surfaces table",
  "#### Detail",
  "detail",
  "",
  "---",
  "",
  "## Next",
  "next",
].join("\n");

describe("extractSection", () => {
  it("takes subsections up to the next heading of the same or a higher level", () => {
    expect(extractSection(doc, "Rules")).toBe(
      ["rule one", "### AI checks (run every time)", "```js", "# not a heading inside a fence", "```", "check"].join("\n"),
    );
  });

  it("stops a nested section at the next sibling and drops the trailing rule", () => {
    expect(extractSection(doc, "Artboard size")).toBe("artboard");
    expect(extractSection(doc, "Page setup > Surfaces")).toBe("surfaces table\n#### Detail\ndetail");
  });

  it("matches a heading with a trailing note in parentheses", () => {
    expect(extractSection(doc, "AI checks")).toContain("check");
  });

  it("fails loudly on a missing heading", () => {
    expect(() => extractSection(doc, "Missing", "Doc.md")).toThrow('Doc.md: heading "Missing" not found');
    // "Surfaces" exists, but not under "Rules".
    expect(() => extractSection(doc, "Rules > Surfaces")).toThrow('heading "Surfaces" not found');
    // A heading inside a code fence is not a heading.
    expect(() => extractSection(doc, "not a heading inside a fence")).toThrow("not found");
  });
});

describe("skills as the single source", () => {
  const skill = [
    "---",
    "name: x",
    "description: Does a thing. Use when the user says so.",
    "---",
    "",
    "# X",
    "",
    "## 0. Read the rules first (every time)",
    "",
    "- `src/vocabulary.ts` is the list.",
    '- `Design System/Naming Conventions.md` in the second brain. Read "Component names" and "Page setup > Surfaces".',
    "",
    "## 1. Connect",
    "",
    "- Call `studio_status`.",
  ].join("\n");

  it("reads the files and headings from the rules section", () => {
    const { body } = parseSkill(skill, "x");
    expect(rulesSection(body, "x").sources).toEqual([
      { file: "src/vocabulary.ts", headings: [] },
      { file: "Design System/Naming Conventions.md", headings: ["Component names", "Page setup > Surfaces"] },
    ]);
  });

  it("replaces the rules section with the studio_get_rules call", () => {
    const { body } = parseSkill(skill, "x");
    const text = promptText(body, "naming", rulesSection(body, "x").sources, "x");
    expect(text).toContain('Call `studio_get_rules` with `topic: "naming"`');
    expect(text).toContain('- Naming Conventions: "Component names", "Page setup > Surfaces"');
    expect(text).toContain("## 1. Connect");
    expect(text).not.toContain("Design System/");
  });

  it("refuses a prompt that still names a local file", () => {
    const leaky = parseSkill(`${skill}\n- Read \`plans/other.md\` too.`, "x").body;
    expect(() => promptText(leaky, "naming", [], "x")).toThrow("still names a local file");
  });

  it.skipIf(!existsSync(join(SECOND_BRAIN, "Design System")))(
    "mcp/rules.generated.ts is up to date (run npm run rules)",
    () => {
      expect(readFileSync(resolve(root, "mcp/rules.generated.ts"), "utf8")).toBe(renderModule(buildRules(root)));
    },
  );
});

describe("bundled rules and prompts", () => {
  it("has one prompt per skill", () => {
    expect(PROMPTS.map((p) => p.name)).toEqual(SKILLS.map((s) => s.prompt));
    expect(PROMPTS.map((p) => p.name)).toEqual(["name-component", "find-tokens"]);
  });

  it("prompts call studio_get_rules and name no repo or second-brain path", () => {
    for (const prompt of PROMPTS) {
      expect(prompt.text).toContain(`Call \`studio_get_rules\` with \`topic: "${prompt.topic}"\``);
      expect(prompt.text).not.toMatch(/src\/|plans\/|\.claude|second-brain|Design System\/|\/Users\//);
      expect(prompt.text).not.toMatch(/^---/);
      expect(prompt.description).toMatch(/\.$/);
      expect(prompt.description).not.toContain("Use when");
    }
  });

  it("naming rules carry the whole vocabulary from src/vocabulary.ts", () => {
    const naming = rulesMarkdown("naming");
    for (const entry of VOCABULARY) expect(naming).toContain(`| \`${entry.name}\` | ${entry.layer} |`);
    for (const rule of NEVER_USE) expect(naming).toContain(rule);
    for (const heading of ["Component names", "Layer (element) names", "Parent-context naming"]) {
      expect(naming).toContain(`: ${heading}\n`);
    }
  });

  it("token rules carry their sections and no vocabulary", () => {
    const tokens = rulesMarkdown("tokens");
    expect(tokens).not.toContain("## Vocabulary");
    for (const heading of [
      "Rules",
      "Property mapping",
      "Adding a new token",
      "Surface pairing in components",
      "Semantic: color",
      "Page setup > Surfaces",
      "Hard rules",
      "Collections",
    ]) {
      expect(tokens).toContain(`: ${heading}\n`);
    }
  });
});
