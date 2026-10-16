import { inRoleFamily, normalizeHex, resolveValue } from "./match";
import { isUnnamed } from "./naming";
import { currentAlias } from "./proposal";
import type {
  Catalog,
  CatalogVariable,
  LayerNode,
  LayerRename,
  NamingSource,
  Proposal,
  RawValueUse,
  StoredNamingProposal,
  StoredTokenSuggestions,
  TokenProposal,
} from "./types";

export interface ParsedProposal {
  renames: LayerRename[];
  componentName: string | null;
  naming: NamingSource;
  warnings: string[];
}

export interface ParseContext {
  rootId: string;
  hash: string;
  reference: LayerNode;
}

export function parseStoredProposal(raw: string, ctx: ParseContext): ParsedProposal | { ignored: string } {
  let data: Partial<StoredNamingProposal>;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ignored: "Stored Claude proposal is not valid JSON; using rules." };
  }
  if (!data || typeof data !== "object") return { ignored: "Stored Claude proposal is not an object; using rules." };
  if (data.version !== 1) return { ignored: `Stored Claude proposal has unsupported version ${String(data.version)}; using rules.` };
  if (data.rootId !== ctx.rootId) return { ignored: "Stored Claude proposal belongs to a different layer; using rules." };
  if (!Array.isArray(data.renames)) return { ignored: "Stored Claude proposal has no renames list; using rules." };

  const warnings: string[] = [];
  if (data.structureHash !== ctx.hash) {
    warnings.push("Layers changed since Claude proposed these names; changed rows are unchecked.");
  }

  const renames: LayerRename[] = [];
  for (const r of data.renames) {
    const indexPath = Array.isArray(r?.indexPath) ? r.indexPath : [];
    const oldName = typeof r?.oldName === "string" ? r.oldName : "";
    const newName = typeof r?.newName === "string" ? r.newName.trim() : "";
    if (newName === "") {
      warnings.push(`Claude proposed an empty name for "${oldName}" at [${indexPath.join(",")}]; row dropped.`);
      continue;
    }
    if (newName === oldName) continue;

    const reason = typeof r.reason === "string" ? r.reason : "";
    const layer = layerAt(ctx.reference, indexPath);
    let stale: string | null = null;
    if (!layer) stale = `Stale: no layer at [${indexPath.join(",")}] any more.`;
    else if (layer.name !== oldName) stale = `Stale: layer is now named "${layer.name}", not "${oldName}".`;

    renames.push({
      indexPath,
      oldName,
      newName,
      reason: stale ? `${stale} ${reason}`.trim() : reason,
      skip: stale !== null,
      source: "claude",
      outsideVocabulary: r.outsideVocabulary === true,
    });
  }

  return {
    renames,
    componentName: typeof data.componentName === "string" && data.componentName.trim() !== "" ? data.componentName.trim() : null,
    naming: { source: "claude", createdAt: typeof data.createdAt === "string" ? data.createdAt : "" },
    warnings,
  };
}

function layerAt(root: LayerNode, indexPath: number[]): LayerNode | null {
  let n: LayerNode | undefined = root;
  for (const i of indexPath) {
    n = n?.children[i];
    if (!n) return null;
  }
  return n;
}

/** With `reference`, rules fill only layers whose current name is Unnamed in it. */
export function mergeRenames(claude: LayerRename[], rules: LayerRename[], reference?: LayerNode): LayerRename[] {
  const covered = new Set(claude.map((r) => r.indexPath.join(".")));
  const fills = (r: LayerRename): boolean => {
    if (covered.has(r.indexPath.join("."))) return false;
    if (!reference) return true;
    const layer = layerAt(reference, r.indexPath);
    return layer !== null && isUnnamed(layer, reference.name);
  };
  const merged = [...claude, ...rules.filter(fills)];
  return merged.sort((a, b) => comparePaths(a.indexPath, b.indexPath));
}

function comparePaths(a: number[], b: number[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return a.length - b.length;
}

export type TokenSuggestion = StoredTokenSuggestions["suggestions"][number];

export interface ParsedTokenSuggestions {
  suggestions: TokenSuggestion[];
  warnings: string[];
}

export function parseStoredTokenSuggestions(
  raw: string,
  ctx: { rootId: string; hash: string },
): ParsedTokenSuggestions | { ignored: string } {
  let data: Partial<StoredTokenSuggestions>;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ignored: "Stored Claude token suggestions are not valid JSON; ignored." };
  }
  if (!data || typeof data !== "object") return { ignored: "Stored Claude token suggestions are not an object; ignored." };
  if (data.version !== 1) return { ignored: `Stored Claude token suggestions have unsupported version ${String(data.version)}; ignored.` };
  if (data.rootId !== ctx.rootId) return { ignored: "Stored Claude token suggestions belong to a different layer; ignored." };
  if (!Array.isArray(data.suggestions)) return { ignored: "Stored Claude token suggestions have no suggestions list; ignored." };

  const warnings: string[] = [];
  if (data.structureHash !== ctx.hash) warnings.push("Layers changed since Claude suggested these tokens; check the Claude rows.");
  const suggestions: TokenSuggestion[] = [];
  for (const s of data.suggestions) {
    if (!s || typeof s.key !== "string" || typeof s.variableId !== "string" || s.key === "" || s.variableId === "") {
      warnings.push("A stored Claude token suggestion has no key or variable; dropped.");
      continue;
    }
    suggestions.push({
      key: s.key,
      variableId: s.variableId,
      variableName: typeof s.variableName === "string" ? s.variableName : "",
      reason: typeof s.reason === "string" ? s.reason : "",
    });
  }
  return { suggestions, warnings };
}

export function isAliasTarget(v: CatalogVariable): boolean {
  if (v.collection === "color" || v.collection === "dimensions") return true;
  return v.collection === "_global" && (v.name === "color/transparent" || v.name.startsWith("metrics/"));
}

export function aliasTargetProblem(catalog: Catalog, variableId: string, type: TokenProposal["type"], role?: RawValueUse["role"]): string | null {
  const v = catalog.variables.find((x) => x.id === variableId);
  if (!v) return `Variable ${variableId} is not in this file.`;
  if (!isAliasTarget(v)) return `${v.name} (${v.collection}) is not a semantic variable a token may alias.`;
  if (v.type !== type) return `${v.name} is ${v.type}, the value needs ${type}.`;
  if (type === "COLOR" && role && role !== "other" && !inRoleFamily(v, role)) return `${v.name} is not a ${role} color.`;
  return null;
}

function replacesOf(key: string, tokenName: string): string {
  return key.startsWith(`${tokenName}|`) ? key.slice(tokenName.length + 1) : key;
}

function sameAsRaw(v: CatalogVariable, uses: RawValueUse[]): boolean {
  if (uses.length === 0) return false;
  if (v.type === "COLOR") {
    const val = resolveValue(v, "light", ["global"]);
    if (!val?.hex) return false;
    return uses.every(
      (u) => u.hex !== null && normalizeHex(u.hex) === normalizeHex(val.hex!) && (u.opacity ?? 1) === (val.opacity ?? 1),
    );
  }
  const numbers = (["desktop", "mobile"] as const)
    .map((m) => resolveValue(v, m, ["desktop", "global"])?.number)
    .filter((n): n is number => typeof n === "number");
  return uses.every((u) => u.number !== null && numbers.includes(u.number));
}

function byNameThenKey(a: TokenProposal, b: TokenProposal): number {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
}

export function applyTokenSuggestions(proposal: Proposal, suggestions: TokenSuggestion[], catalog: Catalog): Proposal {
  const warnings = [...proposal.warnings];
  let tokens = proposal.tokens.slice();
  let unmatched = proposal.unmatched.slice();
  const seen = new Set<string>();

  for (const s of suggestions) {
    if (seen.has(s.key)) {
      warnings.push(`Claude suggested more than one token for "${s.key}"; only the first is used.`);
      continue;
    }
    seen.add(s.key);
    const value = unmatched.find((u) => u.key === s.key);
    const token = value ? undefined : tokens.find((t) => t.key === s.key);
    if (!value && !token) {
      warnings.push(`Claude suggested a token for "${s.key}", which is no longer a value of this component; ignored.`);
      continue;
    }
    const type = (value ?? token)!.type;
    const problem = aliasTargetProblem(catalog, s.variableId, type, (value ?? token)!.uses[0]?.role);
    if (problem) {
      warnings.push(`Claude suggestion for "${s.key}" ignored: ${problem}`);
      continue;
    }
    const variable = catalog.variables.find((v) => v.id === s.variableId)!;
    const alias = { desktop: variable.id, mobile: variable.id };
    const note = s.reason || null;

    if (value) {
      const existing = catalog.variables.find((v) => v.collection === "components" && v.name === value.tokenName);
      const previous = existing?.aliasOf ? currentAlias(existing) : null;
      const retarget = !!previous && (previous.desktop !== alias.desktop || previous.mobile !== alias.mobile);
      unmatched = unmatched.filter((u) => u !== value);
      tokens.push({
        key: value.key,
        name: value.tokenName,
        status: existing ? "existing" : "new",
        type,
        alias,
        candidates: [],
        match: "manual",
        source: "claude",
        replaces: replacesOf(value.key, value.tokenName),
        uses: value.uses,
        note: retarget ? `${note ?? ""} ${value.tokenName} already exists with another alias; changes every use of this token.`.trim() : note,
        skip: retarget,
        ...(retarget ? { kind: "alias-change" as const, previousAlias: previous! } : {}),
      });
      continue;
    }
    const t = token!;
    const previous = [t.alias.desktop, t.alias.mobile].filter((id): id is string => id !== null && id !== variable.id);
    tokens = tokens.map((x) =>
      x === t
        ? {
            ...t,
            alias,
            candidates: [...new Set([...previous, ...t.candidates])].filter((id) => id !== variable.id),
            match: sameAsRaw(variable, t.uses) ? "exact" : "manual",
            source: "claude",
            note,
          }
        : x,
    );
  }

  return { ...proposal, tokens: tokens.sort(byNameThenKey), unmatched, warnings };
}
