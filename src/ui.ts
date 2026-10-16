import type { ApplyResult, BridgeStatus, NamingSource, Phase, PluginToUi, Proposal, UiToPlugin } from "./types";
import { startBridge } from "./bridge";
import { closeTokenPicker, createTokenPicker } from "./tokenPicker";
import {
  adoptAllSuggestions,
  adoptUnmatched,
  auditView,
  buildReviewModel,
  collectProposal,
  countChecked,
  findProblems,
  lookChangeView,
  mergeRepaired,
  namingBanner,
  renamedTokensText,
  renameErrors,
  staleTokensText,
  stepTitle,
  suggestedKeys,
  summarizeResult,
  surfaceChoices,
  tokenErrors,
  touchesSurface,
  undoAdopt,
  type Edits,
  type OptionGroup,
  type RawRow,
  type ReviewModel,
  type SemanticOption,
} from "./review";

const scanRenameBtn = document.getElementById("scan-rename") as HTMLButtonElement;
const scanTokensBtn = document.getElementById("scan-tokens") as HTMLButtonElement;
const useClaudeCb = document.getElementById("use-claude") as HTMLInputElement;
const stepTitleEl = document.getElementById("step-title") as HTMLHeadingElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const reviewEl = document.getElementById("review") as HTMLDivElement;
const actionsEl = document.getElementById("review-actions") as HTMLDivElement;
const countsEl = document.getElementById("counts") as HTMLSpanElement;
const applyBtn = document.getElementById("apply") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const resultEl = document.getElementById("result") as HTMLDivElement;
const bridgeStatusEl = document.getElementById("bridge-status") as HTMLSpanElement;
const bridgeTextEl = document.getElementById("bridge-status-text") as HTMLSpanElement;
const storedBannerEl = document.getElementById("stored-banner") as HTMLDivElement;
const storedTextEl = document.getElementById("stored-text") as HTMLSpanElement;
const storedLoadBtn = document.getElementById("stored-load") as HTMLButtonElement;

let baseline: Proposal | null = null;
let original: Proposal | null = null;
let semantic: SemanticOption[] = [];
let semanticById = new Map<string, SemanticOption>();
let naming: NamingSource | null = null;
let lastApplied: Proposal | null = null;
let pendingStored: { phase: Phase; count: number } | null = null;
let focusAfterRender: string | null = null;
let phase: Phase = "rename";
let edits: Edits = { renames: [], tokens: [] };
let busy = false;
let uid = 0;
const renameErrorEls = new Map<number, { input: HTMLInputElement; error: HTMLElement }>();
const tokenErrorEls = new Map<string, { input: HTMLInputElement; error: HTMLElement }>();
const USE_CLAUDE_KEY = "component-studio.useClaude";

try {
  useClaudeCb.checked = localStorage.getItem(USE_CLAUDE_KEY) === "1";
} catch {
  useClaudeCb.checked = false;
}
function persistUseClaude() {
  try {
    localStorage.setItem(USE_CLAUDE_KEY, useClaudeCb.checked ? "1" : "0");
  } catch {
    // Storage can be blocked in the plugin iframe; the toggle still works for this session.
  }
}
useClaudeCb.addEventListener("change", persistUseClaude);

function send(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string } = {},
  children: Array<Node | null> = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.text !== undefined) node.textContent = props.text;
  for (const c of children) if (c) node.appendChild(c);
  return node;
}

function nextId(prefix: string) {
  uid += 1;
  return `${prefix}-${uid}`;
}

function hiddenLabel(forId: string, text: string) {
  const label = h("label", { className: "sr-only", text });
  label.htmlFor = forId;
  return label;
}

function checkbox(checked: boolean, label: string, onChange: (v: boolean) => void) {
  const input = h("input");
  input.type = "checkbox";
  input.id = nextId("cb");
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  const wrap = h("span", {}, [hiddenLabel(input.id, label), input]);
  return { wrap, input };
}

function textInput(value: string, label: string, onInput: (v: string) => void) {
  const input = h("input");
  input.type = "text";
  input.id = nextId("tx");
  input.value = value;
  input.spellcheck = false;
  input.addEventListener("input", () => onInput(input.value));
  return { input, label: hiddenLabel(input.id, label) };
}

function aliasPicker(
  groups: OptionGroup[],
  value: string | null,
  label: string,
  onChange: (v: string) => void,
  labelVisible = true,
) {
  const labelEl = h("span", { className: labelVisible ? "picker-label" : "sr-only", text: label });
  labelEl.id = nextId("lbl");
  const trigger = createTokenPicker({ groups, value, entries: semanticById, labelId: labelEl.id, onChange });
  return { wrap: h("div", {}, [labelEl, trigger]), trigger };
}

function badge(text: string, variant = text, title?: string) {
  const el = h("span", { className: `badge ${variant}`, text });
  if (title) el.title = title;
  return el;
}

function smallButton(text: string, label: string, onClick: () => void) {
  const btn = h("button", { className: "secondary small", text });
  btn.type = "button";
  btn.setAttribute("aria-label", label);
  btn.addEventListener("click", onClick);
  return btn;
}

const BRIDGE_LABELS: Record<BridgeStatus, string> = {
  connected: "Claude connected",
  disconnected: "Claude not connected",
  conflict: "Another Component Studio window is connected",
};

function showBridgeStatus(status: BridgeStatus) {
  bridgeStatusEl.className = `pill ${status}`;
  bridgeTextEl.textContent = BRIDGE_LABELS[status];
  bridgeStatusEl.title =
    status === "disconnected" ? "Run `claude` in the figma-component-studio folder; it connects automatically." : "";
}

function renderStoredBanner() {
  storedBannerEl.hidden = !pendingStored;
  if (!pendingStored) return;
  const what = pendingStored.phase === "rename" ? "Claude updated the layer names" : "Claude suggested tokens";
  storedTextEl.textContent = `${what} (${pendingStored.count})`;
  storedLoadBtn.disabled = busy;
}

function setStatus(text: string, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setBusy(value: boolean) {
  busy = value;
  scanRenameBtn.disabled = value;
  scanTokensBtn.disabled = value;
  useClaudeCb.disabled = value;
  cancelBtn.disabled = value;
  renderStoredBanner();
  refresh();
}

function clearReview() {
  closeTokenPicker();
  baseline = null;
  original = null;
  edits = { renames: [], tokens: [] };
  renameErrorEls.clear();
  tokenErrorEls.clear();
  reviewEl.replaceChildren();
  reviewEl.hidden = true;
  stepTitleEl.hidden = true;
  actionsEl.hidden = true;
}

function showFieldError(input: HTMLInputElement, errorEl: HTMLElement, err: string | undefined) {
  errorEl.textContent = err ?? "";
  input.classList.toggle("invalid", !!err);
  input.setAttribute("aria-invalid", err ? "true" : "false");
}

function refresh() {
  if (!original) return;
  const current = collectProposal(original, edits);
  const rErr = renameErrors(current);
  const tErr = tokenErrors(current);
  for (const [i, els] of renameErrorEls) showFieldError(els.input, els.error, rErr.get(i));
  for (const [key, els] of tokenErrorEls) showFieldError(els.input, els.error, tErr.get(key));
  const counts = countChecked(current);
  const problems = findProblems(current);
  const nameChanged = current.newComponentName !== null && current.newComponentName !== current.componentName;
  countsEl.textContent =
    (phase === "rename"
      ? `${counts.renames} rename${counts.renames === 1 ? "" : "s"}`
      : `${counts.tokens} token${counts.tokens === 1 ? "" : "s"}` +
        (counts.typography ? ` · ${counts.typography} text style${counts.typography === 1 ? "" : "s"}` : "")) +
    (problems.length ? ` · ${problems.length} problem${problems.length === 1 ? "" : "s"} to fix` : "");
  applyBtn.disabled =
    busy || problems.length > 0 || (counts.renames === 0 && counts.tokens === 0 && counts.typography === 0 && !nameChanged);
}

function renderHeader(model: ReviewModel, naming: NamingSource | null) {
  const frag = document.createDocumentFragment();
  const banner = phase === "rename" ? namingBanner(naming) : null;
  if (banner) frag.appendChild(h("p", { className: `naming-banner ${banner.tone}`, text: banner.text }));
  frag.appendChild(h("h3", { text: `Component: ${model.componentName}` }));
  if (phase === "rename" && model.newComponentName !== null) {
    const { input } = textInput(model.newComponentName, "New component name", (v) => {
      edits.newComponentName = v;
      refresh();
    });
    const visible = h("label", { text: "New component name" });
    visible.htmlFor = input.id;
    frag.appendChild(h("div", { className: "name-field" }, [visible, input]));
  }
  if (model.warnings.length) {
    frag.appendChild(h("ul", { className: "warnings" }, model.warnings.map((w) => h("li", { text: w }))));
  }
  return frag;
}

function renderRenames(model: ReviewModel) {
  if (!model.renames.length) return null;
  const showSource = model.renames.some((r) => r.source === "claude");
  const rows = model.renames.map((r) => {
    const tr = h("tr", { className: r.apply ? "" : "off" });
    const edit = edits.renames.find((e) => e.index === r.index)!;
    const cb = checkbox(r.apply, `Apply rename of ${r.oldName}`, (v) => {
      edit.apply = v;
      tr.className = v ? "" : "off";
      refresh();
    });
    const { input, label } = textInput(r.newName, `New name for ${r.oldName}`, (v) => {
      edit.newName = v;
      refresh();
    });
    const error = h("div", { className: "field-error" });
    renameErrorEls.set(r.index, { input, error });
    const indent = h("span", { className: "indent" });
    indent.style.width = `${r.depth * 10}px`;
    const source = showSource
      ? h("td", { className: "source" }, [badge(r.source === "claude" ? "Claude" : "Rules", r.source)])
      : null;
    if (source && r.outsideVocabulary) {
      const warn = badge("not in vocabulary", "off-vocab");
      warn.title = "Claude used a name outside the vocabulary list; check it";
      source.append(document.createTextNode(" "), warn);
    }
    tr.append(
      h("td", {}, [cb.wrap]),
      h("td", { className: "nowrap" }, [indent, document.createTextNode(r.oldName)]),
      h("td", { className: "arrow", text: "→" }),
      h("td", {}, [label, input, error]),
      ...(source ? [source] : []),
      h("td", { className: "muted", text: r.reason }),
    );
    return tr;
  });
  const columns = ["Apply", "Layer", "", "New name", ...(showSource ? ["Source"] : []), "Reason"];
  const head = h("tr", {}, columns.map((t) => h("th", { text: t })));
  return h("section", {}, [
    h("h3", { text: "Layer renames" }),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function renderTokens(model: ReviewModel) {
  if (!model.tokens.length) return null;
  const rows = model.tokens.map((t) => {
    const tr = h("tr", { className: t.apply ? "" : "off" });
    const edit = edits.tokens.find((e) => e.key === t.key)!;
    const cb = checkbox(t.apply, `Apply token ${t.name}`, (v) => {
      edit.apply = v;
      tr.className = v ? "" : "off";
      refresh();
      if (t.surface) requestRepair();
    });
    const { input, label } = textInput(t.name, "Token name", (v) => {
      edit.name = v;
      refresh();
    });
    if (t.kind === "alias-change") {
      input.readOnly = true;
      input.title = "Existing token; only its alias changes.";
    }
    if (t.kind === "rename") {
      input.readOnly = true;
      input.title = "Existing token renamed in place; its bindings and alias stay.";
    }
    const error = h("div", { className: "field-error" });
    tokenErrorEls.set(t.key, { input, error });
    const alias = h("td", { className: "alias" });
    if (t.previousAlias) alias.append(h("div", { className: "was" }, [slashBreaks(`${t.previousAlias} →`)]));
    if (t.kind === "rename") {
      const names = [t.aliasDesktop, t.aliasMobile].map((id) => (id ? (semanticById.get(id)?.name ?? id) : "raw value"));
      alias.append(h("span", { className: "muted" }, [slashBreaks(names[0] === names[1] ? names[0] : `${names[0]} / ${names[1]}`)]));
    } else if (t.splitModes) {
      alias.append(
        aliasPicker(t.options, t.aliasDesktop, "desktop", (v) => {
          edit.aliasDesktop = v;
          refresh();
          if (t.surface) requestRepair();
        }).wrap,
        aliasPicker(t.options, t.aliasMobile, "mobile", (v) => {
          edit.aliasMobile = v;
          refresh();
        }).wrap,
      );
    } else {
      alias.append(
        aliasPicker(t.options, t.aliasDesktop, "both modes", (v) => {
          edit.aliasDesktop = v;
          edit.aliasMobile = v;
          refresh();
          if (t.surface) requestRepair();
        }).wrap,
      );
    }
    const status = h("td", { className: "badges" }, [
      badge(t.status),
      t.kind === "wrap" ? badge("wrap", "wrap", "Bound straight to a semantic variable; wrapped in a component token and rebound.") : null,
      t.kind === "alias-change"
        ? badge("alias change", "alias-change", "Changes the alias of an existing token of this component; every use of it changes.")
        : null,
      t.kind === "rebind" ? badge("rebind", "rebind", "Moves bound layers to a token with the right name.") : null,
      t.kind === "rename" ? badge("rename", "rename", "Renames the existing token in place; nothing changes visually.") : null,
      t.match === "manual"
        ? badge("manual", "manual", "Mapped to a token with a different value; the component will look different.")
        : badge(t.match),
      t.source === "claude" ? badge("Claude", "claude") : null,
      t.source === "user" ? badge("You", "user") : null,
    ]);
    if (t.source === "user" && baseline?.unmatched.some((u) => u.key === t.key)) {
      const undo = smallButton("Undo", `Undo token for ${t.name}, leave the value raw`, () => undoRow(t.key));
      undo.dataset.focus = `undo:${t.key}`;
      status.append(undo);
    }
    const was = t.previousName ? h("div", { className: "was-name" }, [slashBreaks(`${t.previousName} →`)]) : null;
    tr.append(
      h("td", {}, [cb.wrap]),
      h("td", {}, [was, label, input, error, t.note ? h("div", { className: "muted", text: t.note }) : null]),
      status,
      alias,
      h("td", { text: t.replaces }),
      h("td", { text: String(t.useCount) }),
    );
    return tr;
  });
  const head = h("tr", {}, ["Apply", "Token", "Status", "Alias", "Replaces", "Uses"].map((t) => h("th", { text: t })));
  const renames = model.tokens.filter((t) => t.kind === "rename");
  const allOn = renames.every((t) => t.apply);
  const toggle =
    renames.length >= 2
      ? smallButton(allOn ? "Skip all renames" : "Rename all", allOn ? "Skip all token renames" : "Rename all tokens", () => setRenames(!allOn))
      : null;
  return h("section", {}, [
    h("div", { className: "raw-head" }, [h("h3", { text: "Tokens" }), toggle]),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function setRenames(apply: boolean) {
  if (!original) return;
  const keys = new Set(original.tokens.filter((t) => t.kind === "rename").map((t) => t.key));
  for (const e of edits.tokens) if (keys.has(e.key)) e.apply = apply;
  renderReview();
}

function renderTypography(model: ReviewModel) {
  if (!model.typography.length) return null;
  const rows = model.typography.map((t) => {
    const tr = h("tr", { className: t.apply ? "" : "off" });
    const edit = edits.typography?.find((e) => e.key === t.key);
    const cb = checkbox(t.apply, `Bind typography ${t.role}`, (v) => {
      if (edit) edit.apply = v;
      tr.className = v ? "" : "off";
      refresh();
    });
    const binds = h(
      "td",
      { className: "alias" },
      t.bindings.map((b) => h("div", {}, [h("span", { className: "muted", text: `${b.field}: ` }), slashBreaks(b.variable)])),
    );
    tr.append(
      h("td", {}, [cb.wrap]),
      h("td", {}, [h("strong", { text: t.role }), t.note ? h("div", { className: "muted", text: t.note }) : null]),
      h("td", { className: "badges" }, [
        t.match === "manual"
          ? badge("manual", "manual", "Closest role; the text will look different.")
          : badge("exact"),
      ]),
      binds,
      h("td", { text: String(t.layerCount) }),
    );
    return tr;
  });
  const head = h("tr", {}, ["Apply", "Role", "Status", "Binds", "Layers"].map((t) => h("th", { text: t })));
  return h("section", {}, [
    h("h3", { text: "Typography" }),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function rawTokenCell(r: RawRow & { key: string }) {
  const { key, display, options } = r;
  const cell = h("td", { className: "adopt" });
  if (!options.length) {
    cell.appendChild(h("span", { className: "muted", text: "No token of this type" }));
    return cell;
  }
  const names = new Map(options.flatMap((g) => g.options.map((o) => [o.id, o.label] as const)));
  let chosen: string | null = r.selected;
  const use = smallButton("Use token", `Use the chosen token for ${display}`, () => {
    if (chosen) adoptRow(key, chosen, names.get(chosen) ?? chosen, r.surface);
  });
  use.disabled = !chosen;
  const tag = r.suggested ? badge("Suggested", "suggested", "Role default from the rules. Nothing changes until you click Use token.") : null;
  const { wrap, trigger } = aliasPicker(
    options,
    r.selected,
    `Semantic token for ${display}`,
    (v) => {
      chosen = v;
      use.disabled = false;
      if (tag) tag.hidden = v !== r.selected;
    },
    false,
  );
  trigger.dataset.focus = `raw:${key}`;
  cell.appendChild(h("div", { className: "adopt-row" }, [wrap, tag, use]));
  return cell;
}

function slashBreaks(text: string) {
  const frag = document.createDocumentFragment();
  text.split("/").forEach((part, i, all) => {
    frag.append(document.createTextNode(part + (i < all.length - 1 ? "/" : "")));
    if (i < all.length - 1) frag.append(document.createElement("wbr"));
  });
  return frag;
}

function renderRaw(model: ReviewModel) {
  if (!model.raw.length) return null;
  const valueCell = (display: string) => {
    const m = /^(.*) \(([^()]*)\)$/.exec(display);
    if (!m) return h("td", { text: display });
    const token = h("span", { className: "raw-token" }, [slashBreaks(m[1])]);
    return h("td", {}, [h("span", { className: "raw-value", text: m[2] }), token]);
  };
  const rows = model.raw.map((r) =>
    h("tr", {}, [
      valueCell(r.display),
      h("td", { text: String(r.useCount) }),
      h("td", { className: "muted", text: r.reason }),
      r.key ? rawTokenCell({ ...r, key: r.key }) : h("td"),
    ]),
  );
  const head = h("tr", {}, ["Value", "Uses", "Reason", "Token"].map((t) => h("th", { text: t })));
  const suggestedCount = model.raw.filter((r) => r.key && r.suggested).length;
  const useAll =
    suggestedCount >= 2
      ? smallButton("Use all suggestions", `Use the suggested token for all ${suggestedCount} values`, adoptAllRows)
      : null;
  return h("section", {}, [
    h("div", { className: "raw-head" }, [h("h3", { text: "No match, left raw" }), useAll]),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function editedModel(p: Proposal): ReviewModel {
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

function trackAdopted(key: string) {
  const t = original?.tokens.find((x) => x.key === key);
  if (t && !edits.tokens.some((e) => e.key === key)) {
    edits.tokens.push({ key, name: t.name, apply: true, aliasDesktop: t.alias.desktop, aliasMobile: t.alias.mobile });
  }
}

function adoptRow(key: string, variableId: string, variableName: string, surface: boolean) {
  if (!original) return;
  original = adoptUnmatched(original, key, variableId, variableName);
  trackAdopted(key);
  focusAfterRender = `undo:${key}`;
  renderReview();
  if (surface) requestRepair();
}

function adoptAllRows() {
  if (!original) return;
  const keys = suggestedKeys(original);
  const surface = original.unmatched.some((u) => keys.includes(u.key) && touchesSurface(u.uses));
  original = adoptAllSuggestions(original);
  keys.forEach(trackAdopted);
  if (keys.length) focusAfterRender = `undo:${keys[0]}`;
  renderReview();
  if (surface) requestRepair();
}

function undoRow(key: string) {
  if (!original || !baseline) return;
  const surface = touchesSurface(original.tokens.find((t) => t.key === key)?.uses ?? []);
  original = undoAdopt(original, key, baseline);
  edits.tokens = edits.tokens.filter((e) => e.key !== key);
  focusAfterRender = `raw:${key}`;
  renderReview();
  if (surface) requestRepair();
}

// A changed background re-pairs the text on it: the sandbox rebuilds the proposal assuming the review's background rows.
function requestRepair() {
  if (!original || busy || phase !== "tokens") return;
  setStatus("Re-pairing text with the changed surface…");
  setBusy(true);
  send({ type: "component/scan", phase: "tokens", useClaude: useClaudeCb.checked, assume: surfaceChoices(collectProposal(original, edits)) });
}

function showRepaired(msg: Extract<PluginToUi, { type: "component/proposal" }>) {
  if (!original) return showProposal(msg);
  const merged = mergeRepaired({ original, edits }, msg.proposal);
  baseline = msg.proposal;
  original = merged.original;
  edits = merged.edits;
  semantic = msg.semantic;
  renderReview();
  setStatus("Text re-paired with the changed surface. Nothing is written until you click Apply.");
}

function showProposal(msg: Extract<PluginToUi, { type: "component/proposal" }>) {
  clearReview();
  resultEl.hidden = true;
  phase = msg.phase;
  baseline = msg.proposal;
  original = msg.proposal;
  semantic = msg.semantic;
  naming = msg.naming;
  const model = buildReviewModel(original, semantic);
  edits = {
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
  renderReview();
  stepTitleEl.textContent = stepTitle(phase);
  stepTitleEl.hidden = false;
  reviewEl.hidden = false;
  actionsEl.hidden = false;
  reviewEl.scrollTop = 0;
  setStatus("Review the changes. Nothing is written until you click Apply.");
}

function renderReview() {
  if (!original) return;
  closeTokenPicker();
  semanticById = new Map(semantic.map((s) => [s.id, s]));
  const scrollTop = reviewEl.scrollTop;
  renameErrorEls.clear();
  tokenErrorEls.clear();
  reviewEl.replaceChildren();
  const model = editedModel(original);
  reviewEl.append(renderHeader(model, naming));
  const sections = phase === "rename" ? [renderRenames(model)] : [renderTokens(model), renderTypography(model), renderRaw(model)];
  for (const section of sections) {
    if (section) reviewEl.appendChild(section);
  }
  if (sections.every((s) => !s) && model.newComponentName === null) {
    const text =
      model.warnings.length > 0
        ? "No rows to apply; check the warnings above."
        : phase === "rename"
          ? "Nothing to rename, all layer names follow the convention."
          : "Nothing to tokenize, every value is already bound to a token.";
    reviewEl.appendChild(h("p", { className: "muted", text }));
  }
  reviewEl.scrollTop = scrollTop;
  if (focusAfterRender) {
    const target = Array.from(reviewEl.querySelectorAll<HTMLElement>("[data-focus]")).find(
      (el) => el.dataset.focus === focusAfterRender,
    );
    target?.focus();
    focusAfterRender = null;
  }
  refresh();
}

function lineList(lines: string[], className?: string) {
  return h("ul", className ? { className } : {}, lines.map((l) => h("li", { text: l })));
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Figma's plugin iframe may block the Clipboard API; execCommand still works there.
    const area = h("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

function renamedTokensBlock(text: string) {
  const copy = smallButton("Copy", "Copy the renamed tokens list", async () => {
    const ok = await copyText(text);
    copy.textContent = ok ? "Copied" : "Copy failed";
    setTimeout(() => (copy.textContent = "Copy"), 1500);
  });
  return h("div", { className: "renamed-tokens" }, [
    h("div", { className: "raw-head" }, [h("strong", { text: "Renamed tokens" }), copy]),
    h("pre", { text }),
  ]);
}

function showResult(result: ApplyResult, applied: Phase) {
  clearReview();
  resultEl.replaceChildren();
  resultEl.appendChild(h("h3", { text: summarizeResult(result, applied) }));
  const stale = staleTokensText(result);
  if (stale) resultEl.appendChild(h("p", { text: stale }));
  const renamed = renamedTokensText(result);
  if (renamed) resultEl.appendChild(renamedTokensBlock(renamed));
  const look = lookChangeView(result, lastApplied);
  if (look.kind === "loud") {
    resultEl.appendChild(h("div", { className: "loud" }, [h("strong", { text: "Look changed" }), lineList(look.lines)]));
  } else if (look.kind === "intended") {
    resultEl.appendChild(
      h("div", { className: "intended" }, [
        h("strong", { text: "Intended look changes (values mapped to different tokens)" }),
        lineList(look.lines),
      ]),
    );
  } else {
    resultEl.appendChild(h("p", { className: "pass", text: "Look unchanged" }));
  }
  const audit = auditView(result.audit);
  if (audit.kind === "issues") {
    resultEl.append(h("h3", { text: audit.text }), lineList(audit.lines));
  } else {
    resultEl.appendChild(h("p", { className: audit.kind === "pass" ? "pass" : "muted", text: audit.text }));
  }
  if (result.skipped.length) {
    resultEl.append(h("h3", { text: "Skipped" }), lineList(result.skipped));
  }
  resultEl.hidden = false;
  setStatus("Applied.");
}

function setPrimaryStep(next: Phase) {
  scanRenameBtn.classList.toggle("secondary", next !== "rename");
  scanTokensBtn.classList.toggle("secondary", next !== "tokens");
}

function scan(next: Phase) {
  setPrimaryStep(next);
  pendingStored = null;
  clearReview();
  resultEl.hidden = true;
  setStatus("Scanning component…");
  setBusy(true);
  send({ type: "component/scan", phase: next, useClaude: useClaudeCb.checked });
}

scanRenameBtn.addEventListener("click", () => scan("rename"));
scanTokensBtn.addEventListener("click", () => scan("tokens"));

applyBtn.addEventListener("click", () => {
  if (!original || applyBtn.disabled) return;
  const proposal = collectProposal(original, edits);
  if (findProblems(proposal).length) return;
  lastApplied = proposal;
  setStatus("Applying…");
  setBusy(true);
  send({ type: "component/apply", proposal });
});

cancelBtn.addEventListener("click", () => {
  send({ type: "component/cancel" });
  clearReview();
  setStatus("Cancelled. Nothing was changed.");
});

storedLoadBtn.addEventListener("click", () => {
  if (!pendingStored || busy) return;
  useClaudeCb.checked = true;
  persistUseClaude();
  scan(pendingStored.phase);
});

window.addEventListener("message", (event) => {
  const msg = event.data?.pluginMessage as PluginToUi | undefined;
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "claude/proposal-stored") {
    pendingStored = { phase: msg.phase, count: msg.count };
    renderStoredBanner();
  } else if (msg.type === "component/proposal") {
    setBusy(false);
    if (msg.repaired) showRepaired(msg);
    else showProposal(msg);
  } else if (msg.type === "component/applied") {
    setBusy(false);
    showResult(msg.result, msg.phase);
    if (msg.phase === "rename") setPrimaryStep("tokens");
  } else if (msg.type === "component/error") {
    setBusy(false);
    setStatus(`Error: ${msg.message}`, true);
  }
});

showBridgeStatus("disconnected");
startBridge(showBridgeStatus);
