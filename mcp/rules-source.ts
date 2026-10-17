import { existsSync, readFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import type { GeneratedRules, RulesSection, RulesTopic } from "./rules";

// Build time only (`npm run rules`): never imported by server.ts, so none of this reaches the bundle.
// Each skill's SKILL.md is the single source. Its "Read the rules first" section names the files and headings
// Claude Code reads; this module bundles exactly those and turns the skill into the chat prompt.

export const SECOND_BRAIN = process.env.COMPONENT_STUDIO_SECOND_BRAIN || "/Users/marko/Downloads/second-brain";
export const VOCABULARY_SOURCE = "src/vocabulary.ts";

export const SKILLS: Array<{ topic: RulesTopic; prompt: string; skill: string }> = [
  { topic: "naming", prompt: "name-component", skill: ".claude/skills/component-studio-naming/SKILL.md" },
  { topic: "tokens", prompt: "find-tokens", skill: ".claude/skills/component-studio-tokens/SKILL.md" },
];

const RULES_HEADING = /^## \d+\. Read the rules first\b/;
// A prompt names files nobody in chat can open: these must never survive into one.
const LOCAL_PATH = /(?:^|[\s`(])(?:src|plans|\.claude)\/|second-brain|Design System\/|\.(?:md|ts)`/;

interface Heading {
  line: number;
  level: number;
  text: string;
}

/** ATX headings outside fenced code blocks. */
function headings(lines: string[]): Heading[] {
  const out: Heading[] = [];
  let fence: string | null = null;
  lines.forEach((line, index) => {
    const marker = /^\s*(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (fence === null) fence = marker[0];
      else if (marker[0] === fence) fence = null;
      return;
    }
    if (fence !== null) return;
    const match = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (match) out.push({ line: index, level: match[1].length, text: match[2] });
  });
  return out;
}

/** "Collections (confirmed in docs)" matches "Collections": a trailing note in parentheses is not part of the name. */
function sameHeading(text: string, name: string): boolean {
  return text === name || (text.startsWith(`${name} (`) && text.endsWith(")"));
}

/**
 * The section under `path` ("Page setup > Surfaces" = the "Surfaces" heading anywhere below "Page setup"),
 * heading line excluded, subsections included, up to the next heading of the same or a higher level.
 * Throws when a heading is missing, so a renamed heading fails the build instead of shipping empty rules.
 */
export function extractSection(markdown: string, path: string, file = "markdown"): string {
  const lines = markdown.split(/\r?\n/);
  const all = headings(lines);
  let from = 0;
  let to = lines.length;
  let found: Heading | null = null;
  for (const part of path.split(">").map((p) => p.trim())) {
    const inRange = all.filter((h) => h.line >= from && h.line < to && (!found || h.level > found.level));
    const hit = inRange.find((h) => sameHeading(h.text, part));
    if (!hit) throw new Error(`${file}: heading "${part}" not found (looking for "${path}")`);
    found = hit;
    const next = all.find((h) => h.line > hit.line && h.level <= hit.level);
    from = hit.line + 1;
    to = Math.min(to, next ? next.line : lines.length);
  }
  const body = lines.slice(from, to);
  // Trailing blank lines and the `---` rule that separates sections are layout, not content.
  while (body.length && /^\s*(-{3,})?\s*$/.test(body[body.length - 1])) body.pop();
  while (body.length && body[0].trim() === "") body.shift();
  return body.join("\n");
}

export interface SkillFile {
  description: string;
  body: string;
}

export function parseSkill(markdown: string, file: string): SkillFile {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(markdown.replace(/\r\n/g, "\n"));
  if (!match) throw new Error(`${file}: no frontmatter`);
  const description = /^description:\s*(.+)$/m.exec(match[1])?.[1].trim();
  if (!description) throw new Error(`${file}: no description in frontmatter`);
  return { description, body: match[2].trim() };
}

export interface RulesSource {
  file: string;
  headings: string[];
}

/** The rules section of a skill: its heading and, per bullet, the file in the first backticks and the quoted headings. */
export function rulesSection(body: string, file: string): { heading: string; sources: RulesSource[] } {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => RULES_HEADING.test(line));
  if (start < 0) throw new Error(`${file}: no "## <n>. Read the rules first" section`);
  const heading = lines[start];
  const sources: RulesSource[] = [];
  for (const line of lines.slice(start + 1, nextH2(lines, start))) {
    if (!line.startsWith("- ")) continue;
    const path = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1]).find((p) => /\.(md|ts)$/.test(p));
    if (!path) throw new Error(`${file}: rules bullet names no .md or .ts file: ${line}`);
    sources.push({ file: path, headings: [...line.matchAll(/"([^"]+)"/g)].map((m) => m[1]) });
  }
  if (!sources.length) throw new Error(`${file}: rules section lists no files`);
  return { heading, sources };
}

function nextH2(lines: string[], start: number): number {
  const next = lines.findIndex((line, i) => i > start && /^## /.test(line));
  return next < 0 ? lines.length : next;
}

/** The skill body with its rules section replaced by the studio_get_rules call, for chat (no file access). */
export function promptText(body: string, topic: RulesTopic, sources: RulesSource[], file: string): string {
  const lines = body.split("\n");
  const start = lines.findIndex((line) => RULES_HEADING.test(line));
  const end = nextH2(lines, start);
  const listed = sources.map((s) =>
    s.file === VOCABULARY_SOURCE
      ? "- the vocabulary (allowed layer names, names never to use, synonyms)"
      : `- ${sourceName(s.file)}: ${s.headings.map((h) => `"${h}"`).join(", ")}`,
  );
  const replacement = [
    lines[start],
    "",
    `Call \`studio_get_rules\` with \`topic: "${topic}"\` every run, do not rely on memory. It returns:`,
    "",
    ...listed,
    "",
  ];
  const text = [...lines.slice(0, start), ...replacement, ...lines.slice(end)].join("\n").trim();
  const leak = LOCAL_PATH.exec(text);
  if (leak) throw new Error(`${file}: the chat prompt still names a local file ("${leak[0].trim()}"); reword the skill`);
  return text;
}

/** "Design System/Token Creation Logic.md" -> "Token Creation Logic". */
export function sourceName(file: string): string {
  return basename(file, extname(file));
}

function resolveSource(file: string, repoRoot: string, secondBrain: string): string {
  for (const base of [repoRoot, secondBrain]) {
    const full = join(base, file);
    if (existsSync(full)) return full;
  }
  throw new Error(`${file}: not found in the repo or the second brain (${secondBrain})`);
}

export function buildRules(repoRoot: string, secondBrain = SECOND_BRAIN): GeneratedRules {
  const out = { topics: {}, prompts: [] } as unknown as GeneratedRules;
  for (const { topic, prompt, skill } of SKILLS) {
    const { description, body } = parseSkill(readFileSync(join(repoRoot, skill), "utf8"), skill);
    const { sources } = rulesSection(body, skill);
    let vocabulary = false;
    const sections: RulesSection[] = [];
    for (const source of sources) {
      if (source.file === VOCABULARY_SOURCE) {
        // Imported at run time from src/vocabulary.ts, the plugin's own list; never copied.
        vocabulary = true;
        continue;
      }
      if (source.file.endsWith(".ts")) throw new Error(`${skill}: only ${VOCABULARY_SOURCE} can be bundled, not ${source.file}`);
      if (!source.headings.length) throw new Error(`${skill}: no quoted section names for ${source.file}`);
      const markdown = readFileSync(resolveSource(source.file, repoRoot, secondBrain), "utf8");
      for (const heading of source.headings) {
        sections.push({ source: sourceName(source.file), heading, markdown: extractSection(markdown, heading, source.file) });
      }
    }
    out.topics[topic] = { vocabulary, sections };
    // The first sentence of the skill's description says what it does; the rest is Claude Code trigger phrasing.
    out.prompts.push({
      name: prompt,
      topic,
      description: /^.*?\.(?=\s|$)/.exec(description)?.[0] ?? description,
      text: promptText(body, topic, sources, skill),
    });
  }
  return out;
}

export function renderModule(rules: GeneratedRules): string {
  return [
    "// Generated by `npm run rules` (scripts/gen-rules.ts) from .claude/skills/*/SKILL.md and the sections they name.",
    "// Do not edit: change the skill or the source document, then run `npm run rules`.",
    'import type { GeneratedRules } from "./rules";',
    "",
    `export const GENERATED_RULES: GeneratedRules = ${JSON.stringify(rules, null, 2)};`,
    "",
  ].join("\n");
}
