// QA mode: turns the rename and token proposals into a read-only lint report.
// Pure: every rule comes from naming.ts, vocabulary.ts and the proposals; this file only classifies and words them.
import { colorFamily, modeWarnings, normalizeHex, resolveValue } from "./match";
import { isDefaultFigmaName, isIconGlyph, isSlotName, looksLikeRandomTyping } from "./naming";
import { checkValues, localEquivalent, type ValueCheck } from "./proposal";
import { splitRawDisplay } from "./review";
import { equivalenceKey, layerAtPath, nameClass } from "./studioTools";
import { synonymOf } from "./vocabulary";
import type {
  Catalog,
  CatalogVariable,
  ComponentScan,
  LayerNode,
  LayerRename,
  NamingSource,
  Proposal,
  QaColor,
  QaFinding,
  QaKind,
  QaReport,
  QaSeverity,
  RawValueUse,
  SemanticToken,
  TokenProposal,
  TypographyField,
  TypographyProposal,
} from "./types";
import { proposeTypography } from "./typography";

export interface QaInput {
  scan: ComponentScan;
  /** Step 1 proposal: rule (or Claude) renames of the reference variant and the component name. */
  naming: Proposal;
  namingSource: NamingSource;
  /** Step 2 proposal with typography; its warnings without the hints that point back to step 1. */
  tokens: Proposal;
  semantic: SemanticToken[];
  /** QA catalog (local + bound variables): bound colors whose partner is only in a library, and "From a library" rows. */
  catalog?: Catalog;
}

/** QA on a plain frame (a draft, not a component yet): no component token layer exists, so no token proposal. */
export interface DraftQaInput {
  scan: ComponentScan;
  naming: Proposal;
  namingSource: NamingSource;
  catalog: Catalog;
}

// Layer-name rules that hold before a component exists; the rest needs the component's vocabulary and name.
const DRAFT_NAMING = new Set<QaKind>(["default-name", "content-name", "keyboard-mash", "synonym"]);

const SEVERITY: Record<QaKind, QaSeverity> = {
  "component-name": "warning",
  "default-name": "warning",
  "content-name": "warning",
  "keyboard-mash": "warning",
  synonym: "info",
  "naming-convention": "info",
  "not-in-vocabulary": "info",
  "raw-value": "warning",
  "deleted-binding": "error",
  "semantic-binding": "warning",
  "surface-pairing": "error",
  "role-family": "error",
  "stale-token-name": "info",
  "property-split": "info",
  "token-mismatch": "warning",
  "unbound-typography": "warning",
  "library-token": "info",
};

const ISSUE: Record<QaKind, string> = {
  "component-name": "Component name off convention",
  "default-name": "Default Figma name",
  "content-name": "Named after its text",
  "keyboard-mash": "Keyboard mash",
  synonym: "Synonym of a vocabulary name",
  "naming-convention": "Name off convention",
  "not-in-vocabulary": "Not in the vocabulary",
  "raw-value": "Raw value, no token",
  "deleted-binding": "Bound to a deleted variable",
  "semantic-binding": "Bound to a semantic token directly",
  "surface-pairing": "Wrong surface pairing",
  "role-family": "Wrong color family",
  "stale-token-name": "Token name no longer matches",
  "property-split": "Token should be split",
  "token-mismatch": "Token named for another layer",
  "unbound-typography": "Unbound typography",
  "library-token": "From a library",
};

const NEAREST_ISSUE = "Raw value, nearest token";
const EXACT_ISSUE = "Raw value, token exists";
const LIBRARY_NOTE = "From the library, not in this file";
const LOCAL_NOTE = "Local equivalent";

const SEVERITY_RANK: Record<QaSeverity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};
const SEP = " › ";

const pathKey = (p: number[]) => p.join(".");
const useKey = (variantId: string, indexPath: number[], field: string) => `${variantId}|${pathKey(indexPath)}|${field}`;

interface Located {
  id: string;
  path: string;
}

function locator(scan: ComponentScan): (variantId: string, indexPath: number[]) => Located | null {
  const roots = new Map(scan.variants.map((v) => [v.id, v.root]));
  return (variantId, indexPath) => {
    const root = roots.get(variantId);
    if (!root) return null;
    const names = [root.name];
    let n: LayerNode = root;
    for (const i of indexPath) {
      const next: LayerNode | undefined = n.children[i];
      if (!next) return null;
      n = next;
      names.push(n.name);
    }
    return { id: n.id, path: names.join(SEP) };
  };
}

type Draft = Omit<QaFinding, "id" | "severity" | "issue"> & {
  severity?: QaSeverity;
  issue?: string;
};

function finding(kind: QaKind, d: Omit<Draft, "kind">): Omit<QaFinding, "id"> {
  return {
    ...d,
    kind,
    severity: d.severity ?? SEVERITY[kind],
    issue: d.issue ?? ISSUE[kind],
  };
}

// Same classes the rules use (naming.ts isUnnamed, vocabulary synonyms), told apart so the report can say which one hit.
function nameKind(layer: LayerNode, rootName: string, rename: LayerRename | undefined): QaKind | null {
  const name = layer.name.trim();
  if (name === "" || isDefaultFigmaName(name) || name === rootName) return "default-name";
  if (looksLikeRandomTyping(name)) return "keyboard-mash";
  if (layer.text !== null && layer.text.characters.trim().startsWith(name)) return "content-name";
  if (synonymOf(layer.name)) return "synonym";
  if (rename) return "naming-convention";
  if (!isSlotName(layer.name) && nameClass(layer, rootName) === "deliberate") return "not-in-vocabulary";
  return null;
}

function namingFindings(
  input: Pick<QaInput, "scan" | "naming" | "namingSource">,
  locate: ReturnType<typeof locator>,
  draft = false,
): Array<Omit<QaFinding, "id">> {
  const { scan, naming, namingSource } = input;
  const out: Array<Omit<QaFinding, "id">> = [];
  const nameSource = namingSource.source === "claude" ? "claude" : "rules";
  if (!draft && naming.newComponentName !== null && naming.newComponentName !== scan.name) {
    out.push(
      finding("component-name", {
        area: "naming",
        layer: scan.name,
        nodeIds: [scan.id],
        current: scan.name,
        currentColor: null,
        suggestion: naming.newComponentName,
        suggestionColor: null,
        source: nameSource,
        detail: null,
      }),
    );
  }

  const variant = scan.variants[0];
  const reference = variant.root;
  const renames = new Map(naming.renames.map((r) => [pathKey(r.indexPath), r]));
  const seen = new Set<string>();
  const add = (layer: LayerNode, kind: QaKind, rename: LayerRename | undefined) => {
    const where = locate(variant.id, layer.indexPath);
    const reason = rename ? rename.reason + (rename.outsideVocabulary ? " (outside the vocabulary)" : "") : null;
    out.push(
      finding(kind, {
        area: "naming",
        layer: where?.path ?? layer.name,
        nodeIds: [layer.id],
        current: layer.name,
        currentColor: null,
        suggestion: rename?.newName ?? null,
        suggestionColor: null,
        source: rename?.source ?? null,
        detail: reason || null,
      }),
    );
  };
  // Walks the layers the rules walk: visible ones, not inside instances or icon glyphs.
  const walk = (parent: LayerNode) => {
    for (const layer of parent.children) {
      if (!layer.visible) continue;
      const key = pathKey(layer.indexPath);
      seen.add(key);
      const rename = renames.get(key);
      const kind = nameKind(layer, reference.name, rename);
      if (kind) add(layer, kind, rename);
      if (layer.kind !== "INSTANCE" && !isIconGlyph(layer)) walk(layer);
    }
  };
  walk(reference);
  // Claude may name layers the rules skip (hidden ones, inside a glyph).
  for (const r of naming.renames) {
    if (seen.has(pathKey(r.indexPath))) continue;
    const layer = layerAtPath(reference, r.indexPath);
    if (layer) add(layer, nameKind(layer, reference.name, r) ?? "naming-convention", r);
  }
  return draft ? out.filter((f) => DRAFT_NAMING.has(f.kind)) : out;
}

function colorOf(uses: RawValueUse[]): QaColor | null {
  const u = uses.find((x) => x.kind === "color" && x.hex);
  return u ? { hex: u.hex!, opacity: u.opacity ?? 1 } : null;
}

function tokenFindings(input: QaInput, locate: ReturnType<typeof locator>): Array<Omit<QaFinding, "id">> {
  const { scan, tokens, semantic } = input;
  const byId = new Map(semantic.map((s) => [s.id, s]));
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? id) : "none");
  const colorById = (id: string | null | undefined): QaColor | null => {
    const light = id ? byId.get(id)?.light : undefined;
    return light ? { hex: light.hex, opacity: light.opacity } : null;
  };
  const missing = new Set(scan.variants.flatMap((v) => (v.missingUses ?? []).map((m) => useKey(v.id, m.indexPath, m.field))));
  const isMissing = (u: RawValueUse) => missing.has(useKey(u.variantId, u.indexPath, u.field));
  const layersOf = layerLister(scan, locate);
  const aliasText = (t: Pick<TokenProposal, "alias">) =>
    t.alias.desktop === t.alias.mobile ? nameOf(t.alias.desktop) : `${nameOf(t.alias.desktop)} (desktop) / ${nameOf(t.alias.mobile)} (mobile)`;
  const out: Array<Omit<QaFinding, "id">> = [];
  // Where each deleted binding would be bound again by step 2.
  const fixFor: FixMap = new Map();
  // Bound text/icons off their pair whose partner is in no catalog (library tokens): step 2 only wraps them.
  const expectedPair = new Map<string, ValueCheck & { bound: CatalogVariable; pairExpected: string }>();
  // Which token pairs with the surface, per use: completes the "wrong color family" detail.
  const pairNotes = new Map<string, string>();
  if (input.catalog)
    for (const c of checkValues(scan, input.catalog)) {
      const k = useKey(c.use.variantId, c.use.indexPath, c.use.field);
      if (c.bound && c.pairExpected) expectedPair.set(k, { ...c, bound: c.bound, pairExpected: c.pairExpected });
      if (c.pairNote) pairNotes.set(k, c.pairNote);
    }
  const pairNoteOf = (uses: RawValueUse[]) => uses.map((u) => pairNotes.get(useKey(u.variantId, u.indexPath, u.field))).find(Boolean);
  // A wrap onto a library variable the file has a local equivalent of: step 2 (local variables only) aliases that one.
  const localTarget = (id: string | null | undefined) => {
    const v = id && input.catalog ? input.catalog.variables.find((x) => x.id === id) : undefined;
    return v?.remote && input.catalog ? localEquivalent(v, input.catalog) : null;
  };

  for (const t of tokens.tokens) {
    const suggestion = `${t.name} → ${aliasText(t)}`;
    const source: QaFinding["source"] = t.source === "claude" ? "claude" : "rules";
    for (const u of t.uses)
      if (isMissing(u))
        fixFor.set(useKey(u.variantId, u.indexPath, u.field), {
          suggestion,
          color: colorById(t.alias.desktop),
          source,
        });
    const base = { area: "tokens" as const, source, detail: t.note };
    if (t.issue === "surface-pairing") {
      const current = t.previousAlias ? `${t.name} → ${nameOf(t.previousAlias.desktop)}` : t.replaces;
      const role = t.uses[0]?.role ?? "other";
      for (const kind of pairingKinds(!!t.wrongFamily, role)) {
        out.push(
          finding(kind, {
            ...base,
            ...layersOf(t.uses),
            current,
            currentColor: colorOf(t.uses),
            suggestion,
            suggestionColor: colorById(t.alias.desktop),
            ...(kind === "role-family" ? { detail: familyDetail(t.previousAlias ? nameOf(t.previousAlias.desktop) : t.replaces, role, pairNoteOf(t.uses)) } : {}),
          }),
        );
      }
      continue;
    }
    if (t.kind === "rename" || t.issue === "property-split") {
      out.push(
        finding(t.kind === "rename" ? "stale-token-name" : "property-split", {
          ...base,
          ...layersOf(t.uses),
          current: t.previousName ?? t.replaces,
          currentColor: null,
          suggestion: t.name,
          suggestionColor: null,
        }),
      );
      continue;
    }
    const raw = t.uses.filter((u) => !u.boundVariableId && !isMissing(u));
    if (t.match === "none" || raw.length) {
      if (!raw.length) continue; // only deleted bindings: reported on their own rows
      out.push(
        finding("raw-value", {
          ...base,
          ...layersOf(raw),
          issue: t.match === "none" ? ISSUE["raw-value"] : t.match === "nearest" ? NEAREST_ISSUE : EXACT_ISSUE,
          severity: t.match === "none" ? "error" : "warning",
          current: t.replaces,
          currentColor: colorOf(raw),
          suggestion: t.match === "none" ? null : suggestion,
          suggestionColor: t.match === "none" ? null : colorById(t.alias.desktop),
        }),
      );
      continue;
    }
    const expected = t.kind === "wrap" ? t.uses.map((u) => expectedPair.get(useKey(u.variantId, u.indexPath, u.field))).find(Boolean) : undefined;
    if (expected) {
      out.push(...expectedPairFindings(expected, colorById(expected.bound.id) ?? colorOf(t.uses), layersOf(t.uses)));
      continue;
    }
    if (t.kind === "wrap") {
      const bound = t.uses.find((u) => u.boundVariableId)?.boundVariableId;
      const local = t.alias.desktop === t.alias.mobile ? localTarget(t.alias.desktop) : null;
      out.push(
        finding("semantic-binding", {
          ...base,
          ...layersOf(t.uses),
          current: bound ? nameOf(bound) : t.replaces,
          currentColor: colorById(bound) ?? colorOf(t.uses),
          suggestion: local ? `${t.name} → ${local.name}` : suggestion,
          suggestionColor: local ? lightOf(local) : colorById(t.alias.desktop),
          ...(local ? { detail: `Bound directly to the library's ${nameOf(t.alias.desktop)}; wrap it in a component token aliasing the local equivalent ${local.name}.` } : {}),
        }),
      );
      continue;
    }
    if (t.kind === "rebind" || t.kind === "alias-change") {
      out.push(
        finding("token-mismatch", {
          ...base,
          ...layersOf(t.uses),
          current: t.kind === "alias-change" && t.previousAlias ? `${t.name} → ${nameOf(t.previousAlias.desktop)}` : t.replaces,
          currentColor: colorOf(t.uses),
          suggestion,
          suggestionColor: colorById(t.alias.desktop),
        }),
      );
    }
  }

  for (const u of tokens.unmatched) {
    const raw = u.uses.filter((x) => !isMissing(x));
    const s = u.suggestion;
    for (const x of u.uses) {
      if (isMissing(x))
        fixFor.set(useKey(x.variantId, x.indexPath, x.field), {
          suggestion: s ? `${u.tokenName} → ${s.variableName}` : u.tokenName,
          color: colorById(s?.variableId),
          source: "rules",
        });
    }
    if (!raw.length) continue;
    out.push(
      finding("raw-value", {
        area: "tokens",
        ...layersOf(raw),
        severity: "error",
        current: splitRawDisplay(u.display)?.value ?? u.display,
        currentColor: colorOf(raw),
        suggestion: s ? `${u.tokenName} → ${s.variableName}` : null,
        suggestionColor: colorById(s?.variableId),
        source: s ? "rules" : null,
        detail: u.reason,
      }),
    );
  }

  out.push(...deletedFindings(scan, locate, fixFor), ...typographyFindings(tokens.typography ?? [], layersOf));
  if (input.catalog) out.push(...libraryFindings(scan, input.catalog, layersOf));
  return out;
}

// Bound text/icon whose surface partner is not in the file: still an error, the partner named as text (no swatch).
function expectedPairFindings(
  c: ValueCheck & { bound: CatalogVariable; pairExpected: string },
  currentColor: QaColor | null,
  where: { layer: string; nodeIds: string[] },
): Array<Omit<QaFinding, "id">> {
  return pairingKinds(c.wrongFamily, c.use.role).map((kind) =>
    finding(kind, {
      area: "tokens",
      ...where,
      current: c.bound.name,
      currentColor,
      suggestion: c.pairExpected,
      suggestionColor: null,
      suggestionNote: LIBRARY_NOTE,
      source: "rules",
      detail: kind === "role-family" ? familyDetail(c.bound.name, c.use.role, c.pairNote) : c.pairNote,
    }),
  );
}

// Every variable id bound on a layer of the scan (paints, number fields, typography), with where it is bound.
function boundUses(scan: ComponentScan): Map<string, Array<{ variantId: string; indexPath: number[] }>> {
  const out = new Map<string, Array<{ variantId: string; indexPath: number[] }>>();
  for (const v of scan.variants) {
    const walk = (n: LayerNode) => {
      const ids = [...n.fills, ...n.strokes].map((p) => p.boundVariableId).concat(Object.values(n.bound), Object.values(n.text?.bound ?? {}));
      for (const id of new Set(ids)) if (id) out.set(id, [...(out.get(id) ?? []), { variantId: v.id, indexPath: n.indexPath }]);
      n.children.forEach(walk);
    };
    walk(v.root);
  }
  return out;
}

// Library variables bound in the selection with no local variable of the same (normalised) name: the design uses
// another token set. One info row per variable, listing its layers.
function libraryFindings(scan: ComponentScan, catalog: Catalog, layersOf: ReturnType<typeof layerLister>): Array<Omit<QaFinding, "id">> {
  const local = new Set(catalog.variables.filter((v) => !v.remote).map(equivalenceKey));
  const uses = boundUses(scan);
  return catalog.variables
    .filter((v) => v.remote && !local.has(equivalenceKey(v)))
    .map((v) => {
      // Matched by alias targets or values (`localEquivalent`), the way pairing maps library surfaces.
      const local = localEquivalent(v, catalog);
      return finding("library-token", {
        area: "tokens",
        ...layersOf(uses.get(v.id) ?? []),
        current: v.name,
        currentColor: lightOf(v),
        suggestion: local?.name ?? null,
        suggestionColor: local ? lightOf(local) : null,
        ...(local ? { suggestionNote: LOCAL_NOTE } : {}),
        source: local ? "rules" : null,
        detail: local
          ? `Library collection "${v.collection}", local equivalent: ${local.name}.`
          : `Library collection "${v.collection}", no local equivalent: the design uses another token set.`,
      });
    });
}

type FixMap = Map<string, { suggestion: string; color: QaColor | null; source: "claude" | "rules" }>;

function layerLister(scan: ComponentScan, locate: ReturnType<typeof locator>) {
  return (uses: Array<{ variantId: string; indexPath: number[] }>) => {
    const ids: string[] = [];
    let first: string | null = null;
    for (const u of uses) {
      const where = locate(u.variantId, u.indexPath);
      if (!where || ids.includes(where.id)) continue;
      ids.push(where.id);
      first ??= where.path;
    }
    return { nodeIds: ids, layer: first ?? scan.name };
  };
}

function deletedFindings(scan: ComponentScan, locate: ReturnType<typeof locator>, fixFor: FixMap): Array<Omit<QaFinding, "id">> {
  const out: Array<Omit<QaFinding, "id">> = [];
  for (const v of scan.variants) {
    for (const m of v.missingUses ?? []) {
      const where = locate(v.id, m.indexPath);
      if (!where) continue;
      const fix = fixFor.get(useKey(v.id, m.indexPath, m.field));
      out.push(
        finding("deleted-binding", {
          area: "tokens",
          layer: where.path,
          nodeIds: [where.id],
          current: `${m.field}: deleted variable`,
          currentColor: null,
          suggestion: fix?.suggestion ?? null,
          suggestionColor: fix?.color ?? null,
          source: fix?.source ?? null,
          detail: "The layer keeps the last value, but the variable is gone.",
        }),
      );
    }
  }
  return out;
}

function typographyFindings(list: TypographyProposal[], layersOf: ReturnType<typeof layerLister>): Array<Omit<QaFinding, "id">> {
  return list.map((t) => {
    const fields = [...new Set(t.uses.flatMap((u) => u.fields))] as TypographyField[];
    return finding("unbound-typography", {
      area: "tokens",
      ...layersOf(t.uses),
      current: `${fields.join(", ")} unbound`,
      currentColor: null,
      suggestion: t.role,
      suggestionColor: null,
      source: "rules",
      detail: t.note,
    });
  });
}

// A color from another role family (a surface on text, on-surface on a fill, border off strokes) is one error row;
// its suggestion already pairs with the surface underneath, so no second pairing row repeats it.
function pairingKinds(wrongFamily: boolean, _role: RawValueUse["role"]): QaKind[] {
  return wrongFamily ? ["role-family"] : ["surface-pairing"];
}

function familyDetail(current: string, role: RawValueUse["role"], pairing?: string | null): string {
  const family = colorFamily(role).map((p) => p.replace(/^color\//, "") + (p.endsWith("/") ? "*" : ""));
  const text = `${current} is not a ${role} color; ${role} colors come from ${family.join(", ")}.`;
  return pairing ? `${text} ${pairing}` : text;
}

// Placed once every layer of a draft row is known.
const UNPLACED = { layer: "", nodeIds: [] as string[] };

const round2 = (n: number) => String(Math.round(n * 100) / 100);

function lightOf(v: CatalogVariable | null | undefined): QaColor | null {
  const val = v?.type === "COLOR" ? resolveValue(v, "light", ["global"]) : null;
  return val?.hex ? { hex: val.hex, opacity: val.opacity ?? 1 } : null;
}

function valueText(c: ValueCheck): string {
  const u = c.use;
  if (u.kind === "number") return round2(u.number ?? 0);
  const hex = normalizeHex(u.hex!);
  const opacity = u.opacity ?? 1;
  return opacity === 1 ? hex : `${hex} @ ${round2(opacity)}`;
}

// Draft findings: each value checked on its own (`checkValues`), then one row per issue, value and suggestion,
// listing every layer it covers. Bound values that pair correctly and sizes are not findings.
function draftTokenFindings(input: DraftQaInput, locate: ReturnType<typeof locator>): Array<Omit<QaFinding, "id">> {
  const { scan, catalog } = input;
  const layersOf = layerLister(scan, locate);
  const missing = new Set(scan.variants.flatMap((v) => (v.missingUses ?? []).map((m) => useKey(v.id, m.indexPath, m.field))));
  const fixFor: FixMap = new Map();
  const rows = new Map<string, { draft: Omit<QaFinding, "id">; uses: RawValueUse[] }>();

  for (const c of checkValues(scan, catalog)) {
    if (c.group === "size") continue;
    const fix = c.pairFix || c.match !== "none" ? c.target : null;
    const suggested = fix ?? (c.suggestion ? (catalog.variables.find((v) => v.id === c.suggestion!.variableId) ?? null) : null);
    const k = useKey(c.use.variantId, c.use.indexPath, c.use.field);
    if (missing.has(k)) {
      if (suggested)
        fixFor.set(k, {
          suggestion: suggested.name,
          color: lightOf(suggested),
          source: "rules",
        });
      continue;
    }
    const value = valueText(c);
    const color = c.use.kind === "color" ? { hex: c.use.hex!, opacity: c.use.opacity ?? 1 } : null;
    let fs: Array<Omit<QaFinding, "id">>;
    if (c.pairFix && fix) {
      const current = c.bound ? c.bound.name : value;
      fs = pairingKinds(c.wrongFamily, c.use.role).map((kind) =>
        finding(kind, {
          area: "tokens",
          current,
          currentColor: c.bound ? (lightOf(c.bound) ?? color) : color,
          suggestion: fix.name,
          suggestionColor: lightOf(fix),
          source: "rules",
          detail: kind === "role-family" ? familyDetail(current, c.use.role, c.pairNote ?? c.pairFix) : c.pairFix,
          ...UNPLACED,
        }),
      );
    } else if (c.bound && c.pairExpected) {
      fs = expectedPairFindings({ ...c, bound: c.bound, pairExpected: c.pairExpected }, lightOf(c.bound) ?? color, UNPLACED);
    } else if (c.bound && c.wrongFamily) {
      fs = [
        finding("role-family", {
          area: "tokens",
          current: c.bound.name,
          currentColor: lightOf(c.bound) ?? color,
          suggestion: null,
          suggestionColor: null,
          source: null,
          detail: familyDetail(c.bound.name, c.use.role),
          ...UNPLACED,
        }),
      ];
    } else if (c.bound) {
      continue;
    } else if (fix) {
      fs = [
        finding("raw-value", {
          area: "tokens",
          issue: c.match === "nearest" ? NEAREST_ISSUE : EXACT_ISSUE,
          current: value,
          currentColor: color,
          suggestion: fix.name,
          suggestionColor: lightOf(fix),
          source: "rules",
          detail: c.note,
          ...UNPLACED,
        }),
      ];
    } else {
      fs = [
        finding("raw-value", {
          area: "tokens",
          severity: "error",
          current: value,
          currentColor: color,
          suggestion: suggested?.name ?? null,
          suggestionColor: lightOf(suggested),
          source: suggested ? "rules" : null,
          detail: c.reason,
          ...UNPLACED,
        }),
      ];
    }
    for (const f of fs) {
      const key = [f.kind, f.issue, f.current, f.suggestion, f.detail].join("|");
      const row = rows.get(key) ?? { draft: f, uses: [] };
      row.uses.push(c.use);
      rows.set(key, row);
    }
  }

  const out: Array<Omit<QaFinding, "id">> = [];
  for (const { draft, uses } of rows.values()) out.push({ ...draft, ...layersOf(uses) });
  out.push(
    ...deletedFindings(scan, locate, fixFor),
    ...typographyFindings(proposeTypography(scan, catalog, []), layersOf),
    ...libraryFindings(scan, catalog, layersOf),
  );
  return out;
}

const bySeverity = (a: Omit<QaFinding, "id">, b: Omit<QaFinding, "id">) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];

export function buildQaReport(input: QaInput): QaReport {
  const locate = locator(input.scan);
  const naming = namingFindings(input, locate).sort(bySeverity);
  const tokens = tokenFindings(input, locate).sort(bySeverity);
  return {
    componentId: input.scan.id,
    componentName: input.scan.name,
    naming: input.namingSource,
    findings: [...naming, ...tokens].map((f, i) => ({
      ...f,
      id: `${f.kind}:${i}`,
    })),
    notes: [...new Set([...input.naming.warnings, ...input.tokens.warnings])],
  };
}

export const DRAFT_LABEL = "Draft (not a component yet)";

export function buildDraftQaReport(input: DraftQaInput): QaReport {
  const locate = locator(input.scan);
  const naming = namingFindings(input, locate, true).sort(bySeverity);
  const tokens = draftTokenFindings(input, locate).sort(bySeverity);
  return {
    componentId: input.scan.id,
    componentName: input.scan.name,
    naming: input.namingSource,
    findings: [...naming, ...tokens].map((f, i) => ({
      ...f,
      id: `${f.kind}:${i}`,
    })),
    // Catalog problems only: everything else the token scan warns about needs the component token layer.
    notes: modeWarnings(input.catalog),
    draft: true,
  };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function qaCounts(report: QaReport): Record<"naming" | "tokens" | QaSeverity, number> {
  const count = (test: (f: QaFinding) => boolean) => report.findings.filter(test).length;
  return {
    naming: count((f) => f.area === "naming"),
    tokens: count((f) => f.area === "tokens"),
    error: count((f) => f.severity === "error"),
    warning: count((f) => f.severity === "warning"),
    info: count((f) => f.severity === "info"),
  };
}

export function qaSummaryText(report: QaReport): string {
  const c = qaCounts(report);
  if (!report.findings.length) return "No issues found";
  return [c.naming ? plural(c.naming, "naming issue") : "", c.tokens ? plural(c.tokens, "token issue") : ""].filter(Boolean).join(", ");
}

export function qaSeverityText(report: QaReport): string {
  const c = qaCounts(report);
  return [c.error ? plural(c.error, "error") : "", c.warning ? plural(c.warning, "warning") : "", c.info ? `${c.info} info` : ""]
    .filter(Boolean)
    .join(" · ");
}

// "From a library" rows are informational and come in bunches: two or more fold into one summary row (report and
// Markdown alike), placed where the first of them was. Counts stay per finding.
export type QaListItem = { type: "finding"; finding: QaFinding } | { type: "library"; findings: QaFinding[] };

export function foldLibraryFindings(findings: QaFinding[]): QaListItem[] {
  const library = findings.filter((f) => f.kind === "library-token");
  if (library.length < 2) return findings.map((finding) => ({ type: "finding", finding }));
  const out: QaListItem[] = [];
  for (const finding of findings) {
    if (finding.kind !== "library-token") out.push({ type: "finding", finding });
    else if (finding === library[0]) out.push({ type: "library", findings: library });
  }
  return out;
}

export function librarySummaryText(count: number): string {
  return `${count} tokens come from a library`;
}

export function libraryDetailText(findings: QaFinding[]): string {
  const local = findings.filter((f) => f.suggestion).length;
  if (!local) return "None has a local equivalent";
  if (local === findings.length) return local === 1 ? "It has a local equivalent" : `All ${local} have a local equivalent`;
  return `${local} ${local === 1 ? "has" : "have"} a local equivalent`;
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

// `nested`: an entry under the library summary bullet, which already says severity and issue.
function markdownLine(f: QaFinding, nested = false): string {
  const parts = [nested ? `  - ${code(f.layer)}` : `- **${f.severity}** ${f.issue}: ${code(f.layer)}`];
  if (f.nodeIds.length > 1) parts[0] += ` (+${f.nodeIds.length - 1} more)`;
  parts.push(`current ${code(f.current)}`);
  if (f.suggestion)
    parts.push(`suggested ${code(f.suggestion)}${f.suggestionNote ? ` (${f.suggestionNote.toLowerCase()})` : ""}${f.source ? ` (${f.source === "claude" ? "Claude" : "rules"})` : ""}`);
  if (f.detail) parts.push(f.detail);
  return parts.join(" · ");
}

export function qaReportMarkdown(report: QaReport): string {
  const lines = [
    `# QA report: ${report.componentName}`,
    "",
    ...(report.draft ? [`${DRAFT_LABEL}: colors, spacing, typography and layer names only.`, ""] : []),
    report.findings.length ? `${qaSummaryText(report)} (${qaSeverityText(report)})` : "No issues found.",
  ];
  for (const [area, title] of [
    ["naming", "Naming"],
    ["tokens", "Tokens"],
  ] as const) {
    const list = report.findings.filter((f) => f.area === area);
    if (!list.length) continue;
    lines.push("", `## ${title}`, "");
    for (const item of foldLibraryFindings(list)) {
      if (item.type === "finding") lines.push(markdownLine(item.finding));
      else lines.push(`- **${item.findings[0].severity}** ${librarySummaryText(item.findings.length)}:`, ...item.findings.map((f) => markdownLine(f, true)));
    }
  }
  if (report.notes.length) lines.push("", "## Notes", "", ...report.notes.map((n) => `- ${n}`));
  return lines.join("\n") + "\n";
}
