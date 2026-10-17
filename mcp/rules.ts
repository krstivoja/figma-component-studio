import { NEVER_USE, SYNONYMS, VOCABULARY, VOCABULARY_GROUPS } from "../src/vocabulary";
import { GENERATED_RULES } from "./rules.generated";

// The naming and token rules for Claude clients without the repo or the second brain (Claude Desktop chat).
// The server answers studio_get_rules and the prompts itself, so they work with the plugin closed.

export const RULES_TOPICS = ["naming", "tokens"] as const;
export type RulesTopic = (typeof RULES_TOPICS)[number];

export interface RulesSection {
  source: string;
  heading: string;
  markdown: string;
}

export interface RulesPrompt {
  name: string;
  topic: RulesTopic;
  description: string;
  text: string;
}

export interface GeneratedRules {
  topics: Record<RulesTopic, { vocabulary: boolean; sections: RulesSection[] }>;
  prompts: RulesPrompt[];
}

export const PROMPTS: readonly RulesPrompt[] = GENERATED_RULES.prompts;

const cell = (text: string) => text.replace(/\|/g, "\\|");

/** Markdown of src/vocabulary.ts, the same list the plugin names layers from. */
export function vocabularyMarkdown(): string {
  const out = [
    "## Vocabulary (allowed layer names)",
    "",
    "`layer`: `text` names only fit TEXT layers, `frame` names only non-text layers, `any` fits both.",
  ];
  for (const { id, title } of VOCABULARY_GROUPS) {
    out.push("", `### ${title}`, "", "| name | layer | description | signal |", "|---|---|---|---|");
    for (const e of VOCABULARY.filter((entry) => entry.group === id)) {
      out.push(`| \`${e.name}\` | ${e.layer} | ${cell(e.description)} | ${cell(e.signal)} |`);
    }
  }
  out.push("", "### Never use as final names", "", ...NEVER_USE.map((rule) => `- ${rule}`));
  out.push("", "### Synonyms (a deliberate name and the vocabulary name it could be)", "");
  for (const [from, to] of SYNONYMS) out.push(`- \`${from}\` -> \`${to}\``);
  return out.join("\n");
}

export function rulesMarkdown(topic: RulesTopic): string {
  const { vocabulary, sections } = GENERATED_RULES.topics[topic];
  const parts = [`# Component Studio ${topic} rules`];
  if (vocabulary) parts.push(vocabularyMarkdown());
  for (const s of sections) parts.push(`## ${s.source}: ${s.heading}\n\n${s.markdown}`);
  return parts.join("\n\n");
}
