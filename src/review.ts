import { creationOrder } from "./apply";
import { inRoleFamily } from "./match";
import { parseValueConflict } from "./tokenNames";
import { sortByTokenName } from "./tokenPicker";
import type {
  ApplyResult,
  CatalogVariable,
  LayerRename,
  NamingSource,
  Phase,
  Proposal,
  RawValueUse,
  RowChoice,
  SemanticToken,
  TokenProposal,
  TypographyField,
  TypographyProposal,
  UnmatchedValue,
} from "./types";

export interface SemanticOption {
  id: string;
  name: string;
  collection: string;
  type: CatalogVariable["type"];
  light?: SemanticToken["light"];
  value?: number;
}

export interface OptionGroup {
  label: string;
  options: Array<{ id: string; label: string }>;
}

export interface RenameRow {
  index: number;
  depth: number;
  oldName: string;
  newName: string;
  reason: string;
  apply: boolean;
  source: LayerRename["source"];
  outsideVocabulary: boolean;
}

export interface TokenRow {
  key: string;
  name: string;
  apply: boolean;
  status: TokenProposal["status"];
  match: TokenProposal["match"];
  source: TokenProposal["source"];
  splitModes: boolean;
  aliasDesktop: string | null;
  aliasMobile: string | null;
  options: OptionGroup[];
  replaces: string;
  useCount: number;
  note: string | null;
  kind: TokenProposal["kind"] | null;
  previousAlias: string | null; // alias-change: current alias name(s), shown as old -> new
  previousName: string | null; // rename: current token name, shown as old -> new
  surface: boolean; // changes a background: text pairing is recomputed when it is toggled or edited
}

export interface TypographyRow {
  key: string;
  role: string;
  apply: boolean;
  match: TypographyProposal["match"];
  layerCount: number;
  bindings: Array<{ field: TypographyField; variable: string }>;
  note: string | null;
}

export interface RawRow {
  key: string | null; // UnmatchedValue key, null for legacy match none tokens that cannot be adopted
  display: string;
  useCount: number;
  reason: string;
  options: OptionGroup[];
  selected: string | null; // pre-selected option id (the role-default suggestion)
  suggested: boolean;
  surface: boolean;
}

export interface ReviewModel {
  componentName: string;
  newComponentName: string | null;
  warnings: string[];
  renames: RenameRow[];
  tokens: TokenRow[];
  typography: TypographyRow[];
  raw: RawRow[];
}

export interface Edits {
  newComponentName?: string | null;
  renames: Array<{ index: number; newName: string; apply: boolean }>;
  tokens: Array<{ key: string; name: string; apply: boolean; aliasDesktop: string | null; aliasMobile: string | null }>;
  typography?: Array<{ key: string; apply: boolean }>;
}

const CATEGORIES = ["color", "spacing", "shape"];
const COMPONENT_SEGMENT = /^_?[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
const SEGMENT = /^[a-z0-9][a-zA-Z0-9]*(?:-[a-z0-9][a-zA-Z0-9]*)*$/;

export function validateTokenName(name: string): string | null {
  if (!name.trim()) return "Name is empty";
  if (name !== name.trim() || /\s/.test(name)) return "No spaces allowed";
  const parts = name.split("/");
  if (parts.some((p) => p === "")) return "Empty segment (check the slashes)";
  if (!COMPONENT_SEGMENT.test(parts[0])) return "Component segment must be lowercase-kebab";
  const bad = parts.slice(1).find((p) => !SEGMENT.test(p));
  if (bad) return `Segment "${bad}" must start lowercase (camelCase or kebab)`;
  const catIndex = parts.findIndex((p, i) => i > 0 && CATEGORIES.includes(p));
  if (catIndex === -1) return "Needs a category: color, spacing or shape";
  if (catIndex > 2) return "Category must follow the component or its part";
  if (parts.filter((p) => CATEGORIES.includes(p)).length > 1) return "Only one category segment allowed";
  if (catIndex === parts.length - 1) return "Needs a property after the category";
  return null;
}

function semanticType(t: TokenProposal["type"]): CatalogVariable["type"] {
  return t === "COLOR" ? "COLOR" : "FLOAT";
}

const FAMILY_LABELS: Record<RawValueUse["role"], string> = {
  background: "Fits background",
  text: "Fits text",
  icon: "Fits icon",
  border: "Fits border",
  other: "",
};

type OptionSource = Pick<UnmatchedValue, "type" | "uses" | "pairOptions">;

function familyGroups(u: OptionSource, semantic: SemanticOption[], first: string[]): OptionGroup[] {
  const want = semanticType(u.type);
  const role = u.uses[0]?.role ?? "other";
  const byId = new Map(semantic.map((s) => [s.id, s]));
  const restricted = u.type === "COLOR" && role !== "other";
  const fits = (s: SemanticOption) => s.type === want && (!restricted || inRoleFamily(s, role));
  const option = (s: SemanticOption) => ({ id: s.id, label: s.name });
  const taken = new Set<string>();
  const groups: OptionGroup[] = [];
  const add = (label: string, list: SemanticOption[]) => {
    const fresh = list.filter((s) => !taken.has(s.id));
    fresh.forEach((s) => taken.add(s.id));
    if (fresh.length) groups.push({ label, options: fresh.map(option) });
  };
  const known = (ids: string[]) => ids.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : []));
  for (const id of first) taken.add(id);
  add("Pairs with the surface", known(u.pairOptions ?? []).filter(fits));
  if (restricted) {
    add(FAMILY_LABELS[role], sortByTokenName(semantic.filter(fits)));
    return groups;
  }
  const byCollection = new Map<string, SemanticOption[]>();
  for (const s of semantic) if (fits(s)) byCollection.set(s.collection, [...(byCollection.get(s.collection) ?? []), s]);
  for (const [label, list] of byCollection) add(label, sortByTokenName(list));
  return groups;
}

export function aliasOptions(token: TokenProposal, semantic: SemanticOption[]): OptionGroup[] {
  const byId = new Map(semantic.map((s) => [s.id, s]));
  const role = token.uses[0]?.role ?? "other";
  const suggested: string[] = [];
  for (const id of [token.alias.desktop, token.alias.mobile]) if (id && !suggested.includes(id)) suggested.push(id);
  for (const id of token.candidates) {
    const s = byId.get(id);
    const fits = !s || token.type !== "COLOR" || role === "other" || inRoleFamily(s, role);
    if (fits && !suggested.includes(id)) suggested.push(id);
  }
  const groups: OptionGroup[] = [];
  if (suggested.length) {
    groups.push({
      label: "Suggested",
      options: suggested.map((id) => ({ id, label: byId.get(id)?.name ?? id })),
    });
  }
  return [...groups, ...familyGroups(token, semantic, suggested)];
}

export function unmatchedOptions(u: OptionSource, semantic: SemanticOption[]): OptionGroup[] {
  return familyGroups(u, semantic, []);
}

function rawValue(u: UnmatchedValue): string {
  const prefix = `${u.tokenName}|`;
  return u.key.startsWith(prefix) ? u.key.slice(prefix.length) : u.display;
}

export function adoptUnmatched(p: Proposal, key: string, variableId: string, variableName: string): Proposal {
  const u = p.unmatched.find((x) => x.key === key);
  if (!u) return p;
  const value = rawValue(u);
  const adopted: TokenProposal = {
    key: u.key,
    name: u.tokenName,
    status: "new",
    type: u.type,
    alias: { desktop: variableId, mobile: variableId },
    candidates: [],
    match: "manual",
    source: "user",
    replaces: value,
    uses: u.uses.slice(),
    note: `Changes the look: ${value} -> ${variableName}`,
    skip: false,
  };
  return {
    ...p,
    tokens: [...p.tokens, adopted],
    unmatched: p.unmatched.filter((x) => x.key !== key),
  };
}

// `baseline` is the proposal as the plugin sent it; it holds the unmatched row and its original position.
export function undoAdopt(p: Proposal, key: string, baseline: Proposal): Proposal {
  const t = p.tokens.find((x) => x.key === key);
  if (!t || t.source !== "user" || !baseline.unmatched.some((u) => u.key === key)) return p;
  const keep = new Set([...p.unmatched.map((u) => u.key), key]);
  return {
    ...p,
    tokens: p.tokens.filter((x) => x.key !== key),
    unmatched: baseline.unmatched.filter((u) => keep.has(u.key)),
  };
}

export function touchesSurface(uses: RawValueUse[]): boolean {
  return uses.some((u) => u.kind === "color" && u.field === "fills" && u.role === "background");
}

export function rawRow(u: UnmatchedValue, semantic: SemanticOption[]): RawRow {
  const options = unmatchedOptions(u, semantic);
  const s = u.suggestion;
  const offered = !!s && options.some((g) => g.options.some((o) => o.id === s.variableId));
  return {
    key: u.key,
    display: u.display,
    useCount: u.uses.length,
    reason: offered ? `${u.reason} ${s!.reason}` : u.reason,
    options,
    selected: offered ? s!.variableId : null,
    suggested: offered,
    surface: touchesSurface(u.uses),
  };
}

export function suggestedKeys(p: Proposal): string[] {
  return p.unmatched.filter((u) => u.suggestion).map((u) => u.key);
}

// Same as clicking "Use token" on every suggested row; each one stays undoable on its own.
export function adoptAllSuggestions(p: Proposal): Proposal {
  let next = p;
  for (const u of p.unmatched) {
    if (u.suggestion) next = adoptUnmatched(next, u.key, u.suggestion.variableId, u.suggestion.variableName);
  }
  return next;
}

export function buildReviewModel(p: Proposal, semantic: SemanticOption[]): ReviewModel {
  const raw: RawRow[] = [];
  const tokens: TokenRow[] = [];
  const names = new Map(semantic.map((s) => [s.id, s.name]));
  const previousText = (prev: TokenProposal["previousAlias"]): string | null => {
    if (!prev) return null;
    const n = (id: string | null) => (id ? (names.get(id) ?? id) : "none");
    return prev.desktop === prev.mobile ? n(prev.desktop) : `${n(prev.desktop)} (desktop) / ${n(prev.mobile)} (mobile)`;
  };
  for (const t of creationOrder(p.tokens, p.componentName)) {
    if (t.match === "none") {
      raw.push({
        key: null,
        display: `${t.name} (${t.replaces})`,
        useCount: t.uses.length,
        reason: t.note ?? "No semantic token matches this value",
        options: [],
        selected: null,
        suggested: false,
        surface: false,
      });
      continue;
    }
    tokens.push({
      key: t.key,
      name: t.name,
      apply: !t.skip,
      status: t.status,
      match: t.match,
      source: t.source,
      splitModes: t.alias.desktop !== t.alias.mobile,
      aliasDesktop: t.alias.desktop,
      aliasMobile: t.alias.mobile,
      options: aliasOptions(t, semantic),
      replaces: t.replaces,
      useCount: t.uses.length,
      note: t.note,
      kind: t.kind ?? null,
      previousAlias: t.kind === "alias-change" ? previousText(t.previousAlias) : null,
      previousName: t.kind === "rename" ? (t.previousName ?? null) : null,
      surface: touchesSurface(t.uses),
    });
  }
  for (const u of p.unmatched) raw.push(rawRow(u, semantic));
  return {
    componentName: p.componentName,
    newComponentName: p.newComponentName,
    warnings: p.warnings.slice(),
    renames: p.renames.map((r, index) => ({
      index,
      depth: r.indexPath.length,
      oldName: r.oldName,
      newName: r.newName,
      reason: r.reason,
      apply: !r.skip,
      source: r.source,
      outsideVocabulary: r.outsideVocabulary,
    })),
    tokens,
    typography: (p.typography ?? []).map((t) => ({
      key: t.key,
      role: t.role,
      apply: !t.skip,
      match: t.match,
      layerCount: t.uses.length,
      bindings: (Object.entries(t.bindings) as Array<[TypographyField, string]>).map(([field, id]) => ({ field, variable: names.get(id) ?? id })),
      note: t.note,
    })),
    raw,
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export interface NamingBanner {
  tone: "claude" | "warning";
  text: string;
}

export function namingBanner(naming: NamingSource | null): NamingBanner | null {
  if (!naming) return null;
  if (naming.source === "claude") {
    return {
      tone: "claude",
      text: `Names proposed by Claude, ${formatLocalTime(naming.createdAt)}. Rows marked Rules were filled in for layers Claude did not cover.`,
    };
  }
  if (!naming.claudeRequested) return null;
  return {
    tone: "warning",
    text: "No Claude proposal found on this component. Ask Claude Code to name it, then scan again. Showing rule-based names meanwhile.",
  };
}

export function collectProposal(original: Proposal, edits: Edits): Proposal {
  const renameEdits = new Map(edits.renames.map((e) => [e.index, e]));
  const tokenEdits = new Map(edits.tokens.map((e) => [e.key, e]));
  return {
    ...original,
    newComponentName:
      edits.newComponentName === undefined || original.newComponentName === null
        ? original.newComponentName
        : edits.newComponentName,
    renames: original.renames.map((r, i) => {
      const e = renameEdits.get(i);
      return { ...r, indexPath: r.indexPath.slice(), ...(e ? { newName: e.newName, skip: !e.apply } : {}) };
    }),
    tokens: original.tokens.map((t) => {
      const e = tokenEdits.get(t.key);
      const copy: TokenProposal = { ...t, alias: { ...t.alias }, candidates: t.candidates.slice(), uses: t.uses.slice() };
      if (e) {
        copy.name = e.name;
        copy.skip = !e.apply;
        copy.alias = { desktop: e.aliasDesktop, mobile: e.aliasMobile };
      }
      if (copy.match === "none") copy.skip = true;
      return copy;
    }),
    unmatched: original.unmatched.map((u) => ({ ...u, uses: u.uses.slice() })),
    ...(original.typography
      ? {
          typography: original.typography.map((t) => {
            const e = edits.typography?.find((x) => x.key === t.key);
            return { ...t, uses: t.uses.slice(), bindings: { ...t.bindings }, skip: e ? !e.apply : t.skip };
          }),
        }
      : {}),
    warnings: original.warnings.slice(),
  };
}

export function surfaceChoices(current: Proposal): RowChoice[] {
  return current.tokens
    .filter((t) => touchesSurface(t.uses) && t.match !== "none")
    .map((t) => ({ key: t.key, apply: !t.skip, alias: { ...t.alias } }));
}

export function mergeRepaired(
  previous: { original: Proposal; edits: Edits },
  next: Proposal,
): { original: Proposal; edits: Edits } {
  let original = next;
  for (const t of previous.original.tokens) {
    if (t.source === "user" && next.unmatched.some((u) => u.key === t.key) && t.alias.desktop) {
      const adopted = adoptUnmatched(original, t.key, t.alias.desktop, "");
      original = { ...adopted, tokens: adopted.tokens.map((x) => (x.key === t.key ? { ...x, alias: { ...t.alias }, note: t.note } : x)) };
    }
  }
  const before = new Map(previous.original.tokens.map((t) => [t.key, t]));
  const same = (a: TokenProposal, b: TokenProposal | undefined) =>
    !!b && a.skip === b.skip && a.alias.desktop === b.alias.desktop && a.alias.mobile === b.alias.mobile && a.kind === b.kind;
  const tokens = original.tokens.map((t) => {
    const kept = previous.edits.tokens.find((e) => e.key === t.key);
    return kept && same(t, before.get(t.key))
      ? { ...kept }
      : { key: t.key, name: t.name, apply: !t.skip, aliasDesktop: t.alias.desktop, aliasMobile: t.alias.mobile };
  });
  const typography = (original.typography ?? []).map((t) => previous.edits.typography?.find((e) => e.key === t.key) ?? { key: t.key, apply: !t.skip });
  return { original, edits: { ...previous.edits, tokens, typography } };
}

export function tokenErrors(p: Proposal): Map<string, string> {
  const errors = new Map<string, string>();
  const active = p.tokens.filter((t) => !t.skip && t.match !== "none");
  const byName = new Map<string, TokenProposal[]>();
  for (const t of active) {
    const err = validateTokenName(t.name);
    if (err) errors.set(t.key, err);
    if (t.kind !== "rename" && (!t.alias.desktop || !t.alias.mobile)) errors.set(t.key, errors.get(t.key) ?? "Pick an alias for every mode");
    const list = byName.get(t.name) ?? [];
    list.push(t);
    byName.set(t.name, list);
  }
  for (const [name, list] of byName) {
    const first = list[0];
    const conflict = list.some((t) => t.alias.desktop !== first.alias.desktop || t.alias.mobile !== first.alias.mobile);
    if (!conflict) continue;
    for (const t of list) errors.set(t.key, errors.get(t.key) ?? `"${name}" is used with different aliases`);
  }
  return errors;
}

export function renameErrors(p: Proposal): Map<number, string> {
  const errors = new Map<number, string>();
  p.renames.forEach((r, i) => {
    if (!r.skip && !r.newName.trim()) errors.set(i, "New name is empty");
  });
  return errors;
}

export function findProblems(p: Proposal): string[] {
  const problems: string[] = [];
  for (const [i, err] of renameErrors(p)) problems.push(`Rename "${p.renames[i].oldName}": ${err}`);
  const byKey = new Map(p.tokens.map((t) => [t.key, t]));
  for (const [key, err] of tokenErrors(p)) problems.push(`Token "${byKey.get(key)?.name ?? key}": ${err}`);
  if (p.newComponentName !== null && !p.newComponentName.trim()) problems.push("New component name is empty");
  return problems;
}

export function countChecked(p: Proposal): { renames: number; tokens: number; typography: number } {
  return {
    renames: p.renames.filter((r) => !r.skip).length,
    tokens: p.tokens.filter((t) => !t.skip && t.match !== "none").length,
    typography: (p.typography ?? []).filter((t) => !t.skip).length,
  };
}

export function stepTitle(phase: Phase): string {
  return phase === "rename" ? "Rename layers" : "Create tokens"; // the tab labels
}

export function summarizeResult(r: ApplyResult, phase: Phase): string {
  const counts =
    phase === "rename"
      ? `${r.renamed} renamed`
      : `${r.tokensCreated} tokens created, ${r.tokensReused} reused, ${r.bound} bound` +
        (r.tokenRenames?.length ? `, ${r.tokenRenames.length} renamed` : "") +
        (r.aliasesChanged ? `, ${r.aliasesChanged} alias${r.aliasesChanged === 1 ? "" : "es"} changed` : "");
  return `${stepTitle(phase)} applied. ${counts}`;
}

export function renamedTokensText(r: ApplyResult): string | null {
  if (!r.tokenRenames?.length) return null;
  return r.tokenRenames.map((x) => `- ${x.from} -> ${x.to}`).join("\n");
}

export function staleTokensText(r: ApplyResult): string | null {
  const n = r.staleTokenNames ?? 0;
  if (n <= 0) return null;
  return n === 1
    ? "1 token still uses the old names; step 2 will offer to rename it."
    : `${n} tokens still use the old names; step 2 will offer to rename them.`;
}

export type AuditView = { kind: "pass" | "skipped"; text: string } | { kind: "issues"; text: string; lines: string[] };

export function auditView(audit: ApplyResult["audit"]): AuditView {
  if (audit === "PASS") return { kind: "pass", text: "Audit: PASS" };
  if (audit === "skipped") return { kind: "skipped", text: "Audit: not run in the rename step" };
  return { kind: "issues", text: "Audit issues", lines: audit };
}

export type LookChangeView = { kind: "unchanged" } | { kind: "intended" | "loud"; lines: string[] };

export function lookChangeView(result: ApplyResult, applied: Proposal | null): LookChangeView {
  if (!result.snapshotDiff.length) return { kind: "unchanged" };
  const intended =
    !!applied && (applied.tokens.some((t) => t.match === "manual" && !t.skip) || (applied.typography ?? []).some((t) => t.match === "manual" && !t.skip));
  return { kind: intended ? "intended" : "loud", lines: result.snapshotDiff.slice() };
}

// The review model with the user's edits laid over it (what the tables show).
export function editedModel(p: Proposal, semantic: SemanticOption[], edits: Edits): ReviewModel {
  const model = buildReviewModel(p, semantic);
  if (edits.newComponentName !== undefined && model.newComponentName !== null) model.newComponentName = edits.newComponentName;
  for (const r of model.renames) {
    const e = edits.renames.find((x) => x.index === r.index);
    if (e) Object.assign(r, { newName: e.newName, apply: e.apply });
  }
  for (const t of model.typography) {
    const e = edits.typography?.find((x) => x.key === t.key);
    if (e) t.apply = e.apply;
  }
  for (const t of model.tokens) {
    const e = edits.tokens.find((x) => x.key === t.key);
    if (!e) continue;
    Object.assign(t, { name: e.name, apply: e.apply, aliasDesktop: e.aliasDesktop, aliasMobile: e.aliasMobile });
    t.splitModes = t.splitModes || e.aliasDesktop !== e.aliasMobile;
  }
  return model;
}

// Edits as a fresh proposal arrives: every row as proposed.
export function initialEdits(model: ReviewModel): Edits {
  return {
    newComponentName: model.newComponentName,
    renames: model.renames.map((r) => ({ index: r.index, newName: r.newName, apply: r.apply })),
    tokens: model.tokens.map((t) => ({
      key: t.key,
      name: t.name,
      apply: t.apply,
      aliasDesktop: t.aliasDesktop,
      aliasMobile: t.aliasMobile,
    })),
    typography: model.typography.map((t) => ({ key: t.key, apply: t.apply })),
  };
}

// Edit entry for a row adopted from "No match": it starts as the adopted token proposes.
export function trackAdopted(edits: Edits, p: Proposal, key: string): Edits {
  const t = p.tokens.find((x) => x.key === key);
  if (!t || edits.tokens.some((e) => e.key === key)) return edits;
  return {
    ...edits,
    tokens: [...edits.tokens, { key, name: t.name, apply: true, aliasDesktop: t.alias.desktop, aliasMobile: t.alias.mobile }],
  };
}

const plural = (n: number, word: string, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export function countsText(phase: Phase, counts: ReturnType<typeof countChecked>, problems: number): string {
  const main =
    phase === "rename"
      ? plural(counts.renames, "rename")
      : plural(counts.tokens, "token") + (counts.typography ? ` · ${plural(counts.typography, "text style")}` : "");
  return main + (problems ? ` · ${plural(problems, "problem")} to fix` : "");
}

// Apply needs at least one change and no validation problem.
export function canApply(current: Proposal): boolean {
  const counts = countChecked(current);
  const nameChanged = current.newComponentName !== null && current.newComponentName !== current.componentName;
  return findProblems(current).length === 0 && (counts.renames > 0 || counts.tokens > 0 || counts.typography > 0 || nameChanged);
}

export function storedBannerText(stored: { phase: Phase; count: number }): string {
  const what = stored.phase === "rename" ? "Claude updated the layer names" : "Claude suggested tokens";
  return `${what} (${stored.count})`;
}

export function emptyReviewText(phase: Phase, hasWarnings: boolean): string {
  if (hasWarnings) return "No rows to apply; check the warnings above.";
  return phase === "rename"
    ? "Nothing to rename, all layer names follow the convention."
    : "Nothing to tokenize, every value is already bound to a token.";
}

// "button/color/bg (#0059FF)" -> value "#0059FF" over token "button/color/bg"; null when it has no value part.
export function splitRawDisplay(display: string): { value: string; token: string } | null {
  const m = /^(.*) \(([^()]*)\)$/.exec(display);
  return m ? { value: m[2], token: m[1] } : null;
}

export interface WarningGroups {
  other: string[];
  /** "maps to different values" warnings, grouped into one line when there are two or more. */
  conflicts: Array<{ name: string; values: string }>;
}

export function groupWarnings(warnings: string[]): WarningGroups {
  const conflicts = warnings.map(parseValueConflict).filter((c): c is NonNullable<typeof c> => !!c);
  if (conflicts.length < 2) return { other: warnings, conflicts: [] };
  return { other: warnings.filter((w) => !parseValueConflict(w)), conflicts };
}

export function conflictSummaryText(count: number): string {
  return `${count} token names map to different values; rename one row of each before applying.`;
}
