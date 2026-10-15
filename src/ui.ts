import type { ApplyResult, Phase, PluginToUi, Proposal, UiToPlugin } from "./types";
import {
  auditView,
  buildReviewModel,
  collectProposal,
  countChecked,
  findProblems,
  renameErrors,
  stepTitle,
  summarizeResult,
  tokenErrors,
  type Edits,
  type OptionGroup,
  type ReviewModel,
} from "./review";

const scanRenameBtn = document.getElementById("scan-rename") as HTMLButtonElement;
const scanTokensBtn = document.getElementById("scan-tokens") as HTMLButtonElement;
const stepTitleEl = document.getElementById("step-title") as HTMLHeadingElement;
const statusEl = document.getElementById("status") as HTMLDivElement;
const reviewEl = document.getElementById("review") as HTMLDivElement;
const actionsEl = document.getElementById("review-actions") as HTMLDivElement;
const countsEl = document.getElementById("counts") as HTMLSpanElement;
const applyBtn = document.getElementById("apply") as HTMLButtonElement;
const cancelBtn = document.getElementById("cancel") as HTMLButtonElement;
const resultEl = document.getElementById("result") as HTMLDivElement;

let original: Proposal | null = null;
let phase: Phase = "rename";
let edits: Edits = { renames: [], tokens: [] };
let busy = false;
let uid = 0;
const renameErrorEls = new Map<number, { input: HTMLInputElement; error: HTMLElement }>();
const tokenErrorEls = new Map<string, { input: HTMLInputElement; error: HTMLElement }>();

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

function aliasSelect(groups: OptionGroup[], value: string | null, label: string, onChange: (v: string | null) => void) {
  const select = h("select");
  select.id = nextId("sel");
  if (value === null) {
    const empty = h("option", { text: "Pick a token" });
    empty.value = "";
    select.appendChild(empty);
  }
  for (const g of groups) {
    const og = h("optgroup");
    og.label = g.label;
    for (const o of g.options) {
      const opt = h("option", { text: o.label });
      opt.value = o.id;
      og.appendChild(opt);
    }
    select.appendChild(og);
  }
  select.value = value ?? "";
  select.addEventListener("change", () => onChange(select.value || null));
  const visible = h("label", { text: label });
  visible.htmlFor = select.id;
  return h("div", {}, [visible, select]);
}

function badge(text: string) {
  return h("span", { className: `badge ${text}`, text });
}

function setStatus(text: string, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("error", isError);
}

function setBusy(value: boolean) {
  busy = value;
  scanRenameBtn.disabled = value;
  scanTokensBtn.disabled = value;
  cancelBtn.disabled = value;
  refresh();
}

function clearReview() {
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
    (phase === "rename" ? `${counts.renames} renames` : `${counts.tokens} tokens`) +
    (problems.length ? ` · ${problems.length} problem${problems.length === 1 ? "" : "s"} to fix` : "");
  applyBtn.disabled = busy || problems.length > 0 || (counts.renames === 0 && counts.tokens === 0 && !nameChanged);
}

function renderHeader(model: ReviewModel) {
  const frag = document.createDocumentFragment();
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
  if (phase === "tokens" && model.warnings.length) {
    frag.appendChild(h("ul", { className: "warnings" }, model.warnings.map((w) => h("li", { text: w }))));
  }
  return frag;
}

function renderRenames(model: ReviewModel) {
  if (!model.renames.length) return null;
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
    tr.append(
      h("td", {}, [cb.wrap]),
      h("td", {}, [indent, document.createTextNode(r.oldName)]),
      h("td", { className: "arrow", text: "→" }),
      h("td", {}, [label, input, error]),
      h("td", { className: "muted", text: r.reason }),
    );
    return tr;
  });
  const head = h("tr", {}, ["Apply", "Layer", "", "New name", "Reason"].map((t) => h("th", { text: t })));
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
    });
    const { input, label } = textInput(t.name, "Token name", (v) => {
      edit.name = v;
      refresh();
    });
    const error = h("div", { className: "field-error" });
    tokenErrorEls.set(t.key, { input, error });
    const alias = h("td", { className: "alias" });
    if (t.splitModes) {
      alias.append(
        aliasSelect(t.options, t.aliasDesktop, "desktop", (v) => {
          edit.aliasDesktop = v;
          refresh();
        }),
        aliasSelect(t.options, t.aliasMobile, "mobile", (v) => {
          edit.aliasMobile = v;
          refresh();
        }),
      );
    } else {
      alias.append(
        aliasSelect(t.options, t.aliasDesktop, "both modes", (v) => {
          edit.aliasDesktop = v;
          edit.aliasMobile = v;
          refresh();
        }),
      );
    }
    tr.append(
      h("td", {}, [cb.wrap]),
      h("td", {}, [label, input, error, t.note ? h("div", { className: "muted", text: t.note }) : null]),
      h("td", {}, [badge(t.status), document.createTextNode(" "), badge(t.match)]),
      alias,
      h("td", { text: t.replaces }),
      h("td", { text: String(t.useCount) }),
    );
    return tr;
  });
  const head = h("tr", {}, ["Apply", "Token", "Status", "Alias", "Replaces", "Uses"].map((t) => h("th", { text: t })));
  return h("section", {}, [
    h("h3", { text: "Tokens" }),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function renderRaw(model: ReviewModel) {
  if (!model.raw.length) return null;
  const rows = model.raw.map((r) =>
    h("tr", {}, [
      h("td", { text: r.display }),
      h("td", { text: String(r.useCount) }),
      h("td", { className: "muted", text: r.reason }),
    ]),
  );
  const head = h("tr", {}, ["Value", "Uses", "Reason"].map((t) => h("th", { text: t })));
  return h("section", {}, [
    h("h3", { text: "No match, left raw" }),
    h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows)]),
  ]);
}

function showProposal(msg: Extract<PluginToUi, { type: "component/proposal" }>) {
  clearReview();
  resultEl.hidden = true;
  phase = msg.phase;
  const proposal = msg.proposal;
  original = proposal;
  const model = buildReviewModel(proposal, msg.semantic);
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
  };
  reviewEl.append(renderHeader(model));
  const sections = phase === "rename" ? [renderRenames(model)] : [renderTokens(model), renderRaw(model)];
  for (const section of sections) {
    if (section) reviewEl.appendChild(section);
  }
  if (sections.every((s) => !s) && model.newComponentName === null) {
    const text =
      phase === "rename"
        ? "Nothing to rename, all layer names follow the convention."
        : "Nothing to tokenize, every value is already bound to a token.";
    reviewEl.appendChild(h("p", { className: "muted", text }));
  }
  stepTitleEl.textContent = stepTitle(phase);
  stepTitleEl.hidden = false;
  reviewEl.hidden = false;
  actionsEl.hidden = false;
  reviewEl.scrollTop = 0;
  setStatus("Review the changes. Nothing is written until you click Apply.");
  refresh();
}

function lineList(lines: string[], className?: string) {
  return h("ul", className ? { className } : {}, lines.map((l) => h("li", { text: l })));
}

function showResult(result: ApplyResult, applied: Phase) {
  clearReview();
  resultEl.replaceChildren();
  resultEl.appendChild(h("h3", { text: summarizeResult(result, applied) }));
  if (result.snapshotDiff.length) {
    resultEl.appendChild(
      h("div", { className: "loud" }, [
        h("strong", { text: "Look changed" }),
        lineList(result.snapshotDiff),
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
  clearReview();
  resultEl.hidden = true;
  setStatus("Scanning component…");
  setBusy(true);
  send({ type: "component/scan", phase: next });
}

scanRenameBtn.addEventListener("click", () => scan("rename"));
scanTokensBtn.addEventListener("click", () => scan("tokens"));

applyBtn.addEventListener("click", () => {
  if (!original || applyBtn.disabled) return;
  const proposal = collectProposal(original, edits);
  if (findProblems(proposal).length) return;
  setStatus("Applying…");
  setBusy(true);
  send({ type: "component/apply", proposal });
});

cancelBtn.addEventListener("click", () => {
  send({ type: "component/cancel" });
  clearReview();
  setStatus("Cancelled. Nothing was changed.");
});

window.addEventListener("message", (event) => {
  const msg = event.data?.pluginMessage as PluginToUi | undefined;
  if (!msg || typeof msg.type !== "string" || !msg.type.startsWith("component/")) return;
  if (msg.type === "component/proposal") {
    setBusy(false);
    showProposal(msg);
  } else if (msg.type === "component/applied") {
    setBusy(false);
    showResult(msg.result, msg.phase);
    if (msg.phase === "rename") setPrimaryStep("tokens");
  } else if (msg.type === "component/error") {
    setBusy(false);
    setStatus(`Error: ${msg.message}`, true);
  }
});
