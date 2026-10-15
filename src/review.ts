import type { ApplyResult, CatalogVariable, Phase, Proposal, TokenProposal } from "./types";

export interface SemanticOption {
  id: string;
  name: string;
  collection: string;
  type: CatalogVariable["type"];
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
}

export interface TokenRow {
  key: string;
  name: string;
  apply: boolean;
  status: TokenProposal["status"];
  match: TokenProposal["match"];
  splitModes: boolean;
  aliasDesktop: string | null;
  aliasMobile: string | null;
  options: OptionGroup[];
  replaces: string;
  useCount: number;
  note: string | null;
}

export interface RawRow {
  display: string;
  useCount: number;
  reason: string;
}

export interface ReviewModel {
  componentName: string;
  newComponentName: string | null;
  warnings: string[];
  renames: RenameRow[];
  tokens: TokenRow[];
  raw: RawRow[];
}

export interface Edits {
  newComponentName?: string | null;
  renames: Array<{ index: number; newName: string; apply: boolean }>;
  tokens: Array<{ key: string; name: string; apply: boolean; aliasDesktop: string | null; aliasMobile: string | null }>;
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

export function aliasOptions(token: TokenProposal, semantic: SemanticOption[]): OptionGroup[] {
  const byId = new Map(semantic.map((s) => [s.id, s]));
  const suggested: string[] = [];
  for (const id of [token.alias.desktop, token.alias.mobile, ...token.candidates]) {
    if (id && !suggested.includes(id)) suggested.push(id);
  }
  const groups: OptionGroup[] = [];
  if (suggested.length) {
    groups.push({
      label: "Suggested",
      options: suggested.map((id) => ({ id, label: byId.get(id)?.name ?? id })),
    });
  }
  const want = semanticType(token.type);
  const byCollection = new Map<string, Array<{ id: string; label: string }>>();
  for (const s of semantic) {
    if (s.type !== want || suggested.includes(s.id)) continue;
    const list = byCollection.get(s.collection) ?? [];
    list.push({ id: s.id, label: s.name });
    byCollection.set(s.collection, list);
  }
  for (const [label, options] of byCollection) groups.push({ label, options });
  return groups;
}

export function buildReviewModel(p: Proposal, semantic: SemanticOption[]): ReviewModel {
  const raw: RawRow[] = [];
  const tokens: TokenRow[] = [];
  for (const t of p.tokens) {
    if (t.match === "none") {
      raw.push({ display: `${t.name} (${t.replaces})`, useCount: t.uses.length, reason: t.note ?? "No semantic token matches this value" });
      continue;
    }
    tokens.push({
      key: t.key,
      name: t.name,
      apply: !t.skip,
      status: t.status,
      match: t.match,
      splitModes: t.alias.desktop !== t.alias.mobile,
      aliasDesktop: t.alias.desktop,
      aliasMobile: t.alias.mobile,
      options: aliasOptions(t, semantic),
      replaces: t.replaces,
      useCount: t.uses.length,
      note: t.note,
    });
  }
  for (const u of p.unmatched) raw.push({ display: u.display, useCount: u.uses.length, reason: u.reason });
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
    })),
    tokens,
    raw,
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
    warnings: original.warnings.slice(),
  };
}

export function tokenErrors(p: Proposal): Map<string, string> {
  const errors = new Map<string, string>();
  const active = p.tokens.filter((t) => !t.skip && t.match !== "none");
  const byName = new Map<string, TokenProposal[]>();
  for (const t of active) {
    const err = validateTokenName(t.name);
    if (err) errors.set(t.key, err);
    if (!t.alias.desktop || !t.alias.mobile) errors.set(t.key, errors.get(t.key) ?? "Pick an alias for every mode");
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

export function countChecked(p: Proposal): { renames: number; tokens: number } {
  return {
    renames: p.renames.filter((r) => !r.skip).length,
    tokens: p.tokens.filter((t) => !t.skip && t.match !== "none").length,
  };
}

export function stepTitle(phase: Phase): string {
  return phase === "rename" ? "Step 1: rename layers" : "Step 2: create tokens";
}

export function summarizeResult(r: ApplyResult, phase: Phase): string {
  const counts =
    phase === "rename"
      ? `${r.renamed} renamed`
      : `${r.tokensCreated} tokens created, ${r.tokensReused} reused, ${r.bound} bound`;
  return `${stepTitle(phase)} applied. ${counts}`;
}

export type AuditView = { kind: "pass" | "skipped"; text: string } | { kind: "issues"; text: string; lines: string[] };

export function auditView(audit: ApplyResult["audit"]): AuditView {
  if (audit === "PASS") return { kind: "pass", text: "Audit: PASS" };
  if (audit === "skipped") return { kind: "skipped", text: "Audit: not run in the rename step" };
  return { kind: "issues", text: "Audit issues", lines: audit };
}
