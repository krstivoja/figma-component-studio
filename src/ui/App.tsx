import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  adoptAllSuggestions,
  adoptUnmatched,
  buildReviewModel,
  canApply,
  collectProposal,
  countChecked,
  countsText,
  editedModel,
  emptyReviewText,
  findProblems,
  initialEdits,
  mergeRepaired,
  namingBanner,
  renameErrors,
  storedBannerText,
  suggestedKeys,
  surfaceChoices,
  tokenErrors,
  touchesSurface,
  trackAdopted,
  undoAdopt,
  type Edits,
  type RawRow,
  type SemanticOption,
  type TokenRow,
} from "../review";
import { qaReportMarkdown, qaSeverityText, qaSummaryText } from "../qa";
import type { ApplyResult, BridgeStatus, NamingSource, Phase, PluginToUi, Proposal, QaReport as Report, UiToPlugin } from "../types";
import { Banner } from "./components/Banner";
import { Button } from "./components/Button";
import { Checkbox } from "./components/Checkbox";
import { StatusPill } from "./components/StatusPill";
import { Tabs } from "./components/Tabs";
import { QaReport } from "./views/QaReport";
import { CopyButton, Result } from "./views/Result";
import { Review } from "./views/Review";

const USE_CLAUDE_KEY = "component-studio.useClaude";
const TAB_KEY = "component-studio.tab";
/** Before tabs, QA was a checkbox; its saved "on" opens the QA tab once, then the tab key takes over. */
const LEGACY_QA_KEY = "component-studio.qaMode";

export type StudioTab = Phase | "qa";

export const TABS: { id: StudioTab; label: string }[] = [
  { id: "rename", label: "Rename layers" },
  { id: "tokens", label: "Create tokens" },
  { id: "qa", label: "QA check" },
];

const INTROS: Record<StudioTab, string> = {
  rename: "Gives the component and its layers clear, consistent names. Nothing is written until you click Apply.",
  tokens: "Rename layers first: token names are built from layer names. Binds raw values to semantic tokens.",
  qa: "Read-only: reports naming and token problems with suggestions. Never changes the file.",
};

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function persist(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked in the plugin iframe; the choice still holds for this session.
  }
}

/** The last tab used; without one, the old QA checkbox decides between QA and the first step. */
export function readTab(): StudioTab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    if (TABS.some((t) => t.id === saved)) return saved as StudioTab;
    return localStorage.getItem(LEGACY_QA_KEY) === "1" ? "qa" : "rename";
  } catch {
    return "rename";
  }
}

export type FooterView = "empty" | "review" | "result" | "report";

/** The footer's primary action on each tab and view. */
export function ctaLabel(tab: StudioTab, view: FooterView): string {
  if (tab === "qa") return "Check selection";
  if (view === "review") return "Apply";
  if (view === "result") return "Scan again";
  return "Scan";
}

function send(msg: UiToPlugin) {
  parent.postMessage({ pluginMessage: msg }, "*");
}

interface ReviewState {
  phase: Phase;
  baseline: Proposal; // as the plugin sent it: holds unmatched rows for Undo
  original: Proposal; // baseline plus rows adopted from "No match"
  semantic: SemanticOption[];
  naming: NamingSource | null;
  edits: Edits;
  generation: number; // a new scan resets the scroll position; a re-pair keeps it
}

type ProposalMsg = Extract<PluginToUi, { type: "component/proposal" }>;

export function App({ bridgeStatus }: { bridgeStatus: BridgeStatus }) {
  const [useClaude, setUseClaude] = useState(() => readFlag(USE_CLAUDE_KEY));
  const [tab, setTab] = useState<StudioTab>(readTab);
  const [launched, setLaunched] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState({ text: "", error: false });
  const [stored, setStored] = useState<{ phase: Phase; count: number } | null>(null);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [result, setResult] = useState<{ result: ApplyResult; phase: Phase; applied: Proposal | null } | null>(null);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const lastApplied = useRef<Proposal | null>(null);
  const generation = useRef(0);

  const changeUseClaude = (value: boolean) => {
    setUseClaude(value);
    persist(USE_CLAUDE_KEY, value ? "1" : "0");
  };

  // A tab only switches the view: it never scans. The screen starts clean, and an open review is dropped in the sandbox too.
  const changeTab = (next: StudioTab, save = true) => {
    if (review) send({ type: "component/cancel" });
    setTab(next);
    if (save) persist(TAB_KEY, next);
    setReview(null);
    setResult(null);
    setReport(null);
    setStored(null);
    setLaunched(false);
    setStatus({ text: "", error: false });
  };

  const check = (claude = useClaude) => {
    setStored(null);
    setReport(null);
    setStatus({ text: "Checking component…", error: false });
    setBusy(true);
    send({ type: "component/check", useClaude: claude });
  };

  const selectLayers = (nodeIds: string[]) => {
    if (nodeIds.length) send({ type: "qa/select", nodeIds });
  };

  const scan = (phase: Phase, claude = useClaude) => {
    setStored(null);
    setReview(null);
    setResult(null);
    setStatus({ text: "Scanning component…", error: false });
    setBusy(true);
    send({ type: "component/scan", phase, useClaude: claude });
  };

  const showProposal = (msg: ProposalMsg) => {
    generation.current += 1;
    setResult(null);
    setReview({
      phase: msg.phase,
      baseline: msg.proposal,
      original: msg.proposal,
      semantic: msg.semantic,
      naming: msg.naming,
      edits: initialEdits(buildReviewModel(msg.proposal, msg.semantic)),
      generation: generation.current,
    });
    setStatus({ text: "Review the changes. Nothing is written until you click Apply.", error: false });
  };

  const showRepaired = (msg: ProposalMsg, prev: ReviewState) => {
    const merged = mergeRepaired({ original: prev.original, edits: prev.edits }, msg.proposal);
    setReview({ ...prev, baseline: msg.proposal, original: merged.original, edits: merged.edits, semantic: msg.semantic });
    setStatus({ text: "Text re-paired with the changed surface. Nothing is written until you click Apply.", error: false });
  };

  // The listener is registered once and always calls the latest handler, which sees current state.
  const onMessage = useRef<(msg: PluginToUi) => void>(() => {});
  onMessage.current = (msg) => {
    if (msg.type === "claude/proposal-stored") {
      setStored({ phase: msg.phase, count: msg.count });
    } else if (msg.type === "plugin/launch") {
      // The sidebar's Check button: the QA tab for this session (not saved), and the check runs at once.
      if (msg.command !== "check") return;
      changeTab("qa", false);
      setLaunched(true);
      check();
    } else if (msg.type === "component/report") {
      setBusy(false);
      if (tab !== "qa") return; // the tab changed while the check ran
      setReport(msg.report);
      setStatus({ text: `${qaSummaryText(msg.report)}. Read-only: nothing was changed.`, error: false });
    } else if (msg.type === "component/proposal") {
      setBusy(false);
      if (msg.phase !== tab) {
        send({ type: "component/cancel" }); // a review for a tab no longer shown: nothing stays pending
        return;
      }
      if (msg.repaired && review) showRepaired(msg, review);
      else showProposal(msg);
    } else if (msg.type === "component/applied") {
      setBusy(false);
      setReview(null);
      setResult({ result: msg.result, phase: msg.phase, applied: lastApplied.current });
      setStatus({ text: "Applied.", error: false });
    } else if (msg.type === "component/error") {
      setBusy(false);
      setStatus({ text: `Error: ${msg.message}`, error: true });
    }
  };
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      const msg = event.data?.pluginMessage as PluginToUi | undefined;
      if (msg && typeof msg.type === "string") onMessage.current(msg);
    };
    window.addEventListener("message", listener);
    send({ type: "ui/ready" });
    return () => window.removeEventListener("message", listener);
  }, []);

  const derived = useMemo(() => {
    if (!review) return null;
    const current = collectProposal(review.original, review.edits);
    const model = editedModel(review.original, review.semantic, review.edits);
    const empty =
      model.newComponentName === null &&
      (review.phase === "rename" ? !model.renames.length : !model.tokens.length && !model.typography.length && !model.raw.length);
    return {
      current,
      model,
      entries: new Map(review.semantic.map((s) => [s.id, s])),
      renameErrors: renameErrors(current),
      tokenErrors: tokenErrors(current),
      counts: countsText(review.phase, countChecked(current), findProblems(current).length),
      applicable: canApply(current),
      undoable: new Set(review.baseline.unmatched.map((u) => u.key)),
      emptyText: empty ? emptyReviewText(review.phase, model.warnings.length > 0) : null,
    };
  }, [review]);

  // A changed background re-pairs the text on it: the sandbox rebuilds the proposal assuming the review's background rows.
  const update = (original: Proposal, edits: Edits, repair: boolean, focus: string | null = null) => {
    if (!review) return;
    setReview({ ...review, original, edits });
    if (focus) setFocusKey(focus);
    if (!repair || busy || review.phase !== "tokens") return;
    setStatus({ text: "Re-pairing text with the changed surface…", error: false });
    setBusy(true);
    send({ type: "component/scan", phase: "tokens", useClaude, assume: surfaceChoices(collectProposal(original, edits)) });
  };

  const onToken = (row: TokenRow, patch: Partial<{ name: string; apply: boolean; aliasDesktop: string; aliasMobile: string }>) => {
    if (!review) return;
    const tokens = review.edits.tokens.map((e) => (e.key === row.key ? { ...e, ...patch } : e));
    update(review.original, { ...review.edits, tokens }, row.surface && ("apply" in patch || "aliasDesktop" in patch));
  };

  const onAdopt = (row: RawRow & { key: string }, variableId: string, variableName: string) => {
    if (!review) return;
    const original = adoptUnmatched(review.original, row.key, variableId, variableName);
    update(original, trackAdopted(review.edits, original, row.key), row.surface, `undo:${row.key}`);
  };

  const onAdoptAll = () => {
    if (!review) return;
    const keys = suggestedKeys(review.original);
    const surface = review.original.unmatched.some((u) => keys.includes(u.key) && touchesSurface(u.uses));
    const original = adoptAllSuggestions(review.original);
    const edits = keys.reduce((acc, key) => trackAdopted(acc, original, key), review.edits);
    update(original, edits, surface, keys.length ? `undo:${keys[0]}` : null);
  };

  const onUndo = (key: string) => {
    if (!review) return;
    const surface = touchesSurface(review.original.tokens.find((t) => t.key === key)?.uses ?? []);
    const original = undoAdopt(review.original, key, review.baseline);
    update(original, { ...review.edits, tokens: review.edits.tokens.filter((e) => e.key !== key) }, surface, `raw:${key}`);
  };

  const onRenameAll = (apply: boolean) => {
    if (!review) return;
    const keys = new Set(review.original.tokens.filter((t) => t.kind === "rename").map((t) => t.key));
    const tokens = review.edits.tokens.map((e) => (keys.has(e.key) ? { ...e, apply } : e));
    update(review.original, { ...review.edits, tokens }, false);
  };

  const editOnly = (edits: Partial<Edits>) => review && update(review.original, { ...review.edits, ...edits }, false);

  const apply = () => {
    if (!review || !derived || busy || !derived.applicable) return;
    lastApplied.current = derived.current;
    setStatus({ text: "Applying…", error: false });
    setBusy(true);
    send({ type: "component/apply", proposal: derived.current });
  };

  const cancel = () => {
    send({ type: "component/cancel" });
    setReview(null);
    setStatus({ text: "Cancelled. Nothing was changed.", error: false });
  };

  // A stored proposal for the other step opens that step's tab first.
  const loadStored = () => {
    if (!stored || busy) return;
    changeUseClaude(true);
    if (tab === "qa") return check(true);
    if (stored.phase !== tab) changeTab(stored.phase);
    scan(stored.phase, true);
  };

  const onFocused = useCallback(() => setFocusKey(null), []);
  const banner = review?.phase === "rename" ? namingBanner(review.naming) : null;

  const shownResult = result && result.phase === tab ? result : null;
  const view: FooterView = review && derived ? "review" : report ? "report" : shownResult ? "result" : "empty";
  const primary = () => {
    if (tab === "qa") check();
    else if (view === "review") apply();
    else scan(tab);
  };
  const footerText =
    view === "review" && derived
      ? derived.counts
      : view === "report" && report
        ? report.findings.length
          ? `${qaSummaryText(report)} · ${qaSeverityText(report)}`
          : qaSummaryText(report)
        : "";

  return (
    <main aria-labelledby="app-title" className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between gap-2 px-3 pt-3 pb-1">
        <h2 id="app-title" className="m-0 text-sm font-semibold">
          Component Studio
        </h2>
        <StatusPill status={bridgeStatus} />
      </header>

      <Tabs label="Studio steps" items={TABS} selectedKey={tab} onSelectionChange={(next) => changeTab(next)} isDisabled={busy} className="flex-1">
        <div className="flex shrink-0 flex-col gap-2 px-3 py-2.5">
          <p className="m-0 text-text-secondary">{INTROS[tab]}</p>
          {tab === "qa" ? null : (
            <div className="flex flex-col gap-0.5">
              <Checkbox isSelected={useClaude} onChange={changeUseClaude} isDisabled={busy} aria-describedby="use-claude-help">
                Help with Claude Code
              </Checkbox>
              <p id="use-claude-help" className="m-0 pl-5.5 text-text-secondary">
                Off: automatic names from the built-in rules. On: uses names Claude Code stored on the component (ask Claude Code to 'name
                this component' first).
              </p>
            </div>
          )}
          {/* The live region stays mounted (visually hidden while empty) so the first status after load is announced too. */}
          <div
            role="status"
            aria-live="polite"
            className={!status.text ? "sr-only" : status.error ? "font-semibold text-danger" : "text-text"}
          >
            {status.text}
          </div>
          {stored ? (
            <Banner
              tone="claude"
              role="status"
              action={
                <Button size="sm" isDisabled={busy} onPress={loadStored}>
                  Load it
                </Button>
              }
            >
              {storedBannerText(stored)}
            </Banner>
          ) : null}
        </div>

        <div
          key={review ? `review-${review.generation}` : view}
          className="flex min-h-0 flex-1 flex-col overflow-y-auto border-t border-border px-3 pt-2.5"
        >
          {review && derived ? (
            <Review
              phase={review.phase}
              model={derived.model}
              banner={banner}
              entries={derived.entries}
              renameErrors={derived.renameErrors}
              tokenErrors={derived.tokenErrors}
              undoable={derived.undoable}
              emptyText={derived.emptyText}
              focusKey={focusKey}
              onFocused={onFocused}
              onComponentName={(newComponentName) => editOnly({ newComponentName })}
              onRename={(index, patch) =>
                editOnly({ renames: review.edits.renames.map((e) => (e.index === index ? { ...e, ...patch } : e)) })
              }
              onToken={onToken}
              onTypography={(key, value) =>
                editOnly({ typography: review.edits.typography?.map((e) => (e.key === key ? { ...e, apply: value } : e)) })
              }
              onRenameAll={onRenameAll}
              onAdopt={onAdopt}
              onAdoptAll={onAdoptAll}
              onUndo={onUndo}
            />
          ) : report ? (
            <QaReport report={report} launched={launched} onSelect={selectLayers} />
          ) : shownResult ? (
            <Result result={shownResult.result} phase={shownResult.phase} applied={shownResult.applied} />
          ) : (
            <p className="m-auto max-w-md pb-2.5 text-center text-text-secondary">
              {busy
                ? "Working…"
                : tab === "qa"
                  ? "Select a component or frame on the canvas, then click Check selection."
                  : "Select a component on the canvas, then click Scan."}
            </p>
          )}
        </div>

        <footer className="flex shrink-0 items-center gap-2 border-t border-border px-3 py-2">
          <span className="min-w-0 flex-1 text-text-secondary">{footerText}</span>
          {view === "review" ? (
            <Button variant="secondary" size="lg" isDisabled={busy} onPress={cancel}>
              Cancel
            </Button>
          ) : null}
          {view === "report" && report ? (
            <CopyButton text={qaReportMarkdown(report)} label="Copy report" ariaLabel="Copy the QA report as Markdown" size="lg" />
          ) : null}
          {view === "result" && shownResult?.phase === "rename" ? (
            <Button variant="secondary" size="lg" isDisabled={busy} onPress={() => changeTab("tokens")}>
              Next: create tokens
            </Button>
          ) : null}
          <Button size="lg" isDisabled={busy || (view === "review" && !derived?.applicable)} onPress={primary}>
            {ctaLabel(tab, view)}
          </Button>
        </footer>
      </Tabs>
    </main>
  );
}
