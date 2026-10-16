import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { conflictSummaryText, groupWarnings, splitRawDisplay, type RawRow, type ReviewModel, type TokenRow } from "../../review";
import type { Phase, SemanticToken } from "../../types";
import { Badge } from "../components/Badge";
import { Banner, type BannerTone } from "../components/Banner";
import { Button } from "../components/Button";
import { Checkbox } from "../components/Checkbox";
import { Cell, ReviewTable, Row } from "../components/ReviewTable";
import { Section } from "../components/Section";
import { TextField } from "../components/TextField";
import { TokenPicker } from "../components/TokenPicker";

type TokenPatch = Partial<{ name: string; apply: boolean; aliasDesktop: string; aliasMobile: string }>;

export interface ReviewProps {
  phase: Phase;
  model: ReviewModel;
  banner: { tone: BannerTone; text: string } | null;
  entries: Map<string, SemanticToken>;
  renameErrors: Map<number, string>;
  tokenErrors: Map<string, string>;
  /** Keys of tokens adopted from "No match" that can go back there. */
  undoable: Set<string>;
  emptyText: string | null;
  focusKey: string | null;
  onFocused: () => void;
  onComponentName: (name: string) => void;
  onRename: (index: number, patch: Partial<{ newName: string; apply: boolean }>) => void;
  onToken: (row: TokenRow, patch: TokenPatch) => void;
  onTypography: (key: string, apply: boolean) => void;
  onRenameAll: (apply: boolean) => void;
  onAdopt: (row: RawRow & { key: string }, variableId: string, variableName: string) => void;
  onAdoptAll: () => void;
  onUndo: (key: string) => void;
}

// Long slash paths break after a slash rather than mid-segment.
export function slashBreaks(text: string): ReactNode {
  const parts = text.split("/");
  return parts.map((part, i) => (
    <Fragment key={i}>
      {part}
      {i < parts.length - 1 ? (
        <>
          /<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

// The ghost "Show all N / Show less" button after a folded summary line.
export function ShowAllToggle({
  open,
  count,
  onToggle,
  label,
}: {
  open: boolean;
  count: number;
  onToggle: (open: boolean) => void;
  /** Accessible name when the visible text alone is unclear out of context. */
  label?: string;
}) {
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <Button
      variant="ghost"
      size="sm"
      aria-expanded={open}
      aria-label={label}
      onPress={() => onToggle(!open)}
      className="-my-0.5 h-5! px-1.5! align-middle"
    >
      {open ? "Show less" : `Show all ${count}`}
      <Chevron aria-hidden size={12} className="text-icon-secondary" />
    </Button>
  );
}

// Scan warnings; the "maps to different values" ones collapse into one line with a show-all list.
export function WarningsBanner({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false);
  if (!warnings.length) return null;
  const { other, conflicts } = groupWarnings(warnings);
  return (
    <Banner tone="warning">
      <ul className="m-0 list-disc pl-4">
        {other.map((w, i) => (
          <li key={i}>{w}</li>
        ))}
        {conflicts.length ? (
          <li>
            {conflictSummaryText(conflicts.length)}{" "}
            <ShowAllToggle open={open} count={conflicts.length} onToggle={setOpen} />
            {open ? (
              <ul className="m-0 mt-1 list-[circle] pl-4">
                {conflicts.map((c) => (
                  <li key={c.name}>
                    <span className="font-medium">{slashBreaks(c.name)}</span>
                    <span className="text-text-secondary">: </span>
                    <span className="tabular-nums">{c.values}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ) : null}
      </ul>
    </Banner>
  );
}

export function Review(props: ReviewProps) {
  const { phase, model, banner, focusKey, onFocused } = props;
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focusKey || !root.current) return;
    const target = Array.from(root.current.querySelectorAll<HTMLElement>("[data-focus]")).find((el) => el.dataset.focus === focusKey);
    target?.focus();
    onFocused();
  }, [focusKey, model, onFocused]);

  return (
    <div ref={root} className="flex flex-col gap-3 pb-1">
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      <div className="flex flex-col gap-1.5">
        <h3 className="m-0 text-sm font-semibold">Component: {model.componentName}</h3>
        {phase === "rename" && model.newComponentName !== null ? (
          <TextField
            label="New component name"
            labelVisible
            value={model.newComponentName}
            onChange={props.onComponentName}
            className="max-w-80"
          />
        ) : null}
      </div>
      <WarningsBanner warnings={model.warnings} />
      {phase === "rename" ? (
        <Renames {...props} />
      ) : (
        <>
          <Tokens {...props} />
          <Typography {...props} />
          <Raw {...props} />
        </>
      )}
      {props.emptyText ? <p className="m-0 text-text-secondary">{props.emptyText}</p> : null}
    </div>
  );
}

function Renames({ model, renameErrors, onRename }: ReviewProps) {
  if (!model.renames.length) return null;
  const showSource = model.renames.some((r) => r.source === "claude");
  const columns = [
    { label: "Apply", className: "w-8" },
    { label: "Layer" },
    { label: "Becomes", hidden: true, className: "w-4" },
    { label: "New name", className: "w-[34%]" },
    ...(showSource ? [{ label: "Source" }] : []),
    { label: "Reason" },
  ];
  return (
    <Section title="Layer renames">
      <ReviewTable label="Layer renames" columns={columns}>
        {model.renames.map((r) => (
          <Row key={r.index} dimmed={!r.apply}>
            <Cell noDim>
              <Checkbox
                isSelected={r.apply}
                onChange={(apply) => onRename(r.index, { apply })}
                aria-label={`Apply rename of ${r.oldName}`}
              />
            </Cell>
            <Cell className="whitespace-nowrap">
              <span className="inline-block" style={{ width: r.depth * 10 }} />
              {r.oldName}
            </Cell>
            <Cell className="text-center text-text-tertiary">→</Cell>
            <Cell>
              <TextField
                label={`New name for ${r.oldName}`}
                value={r.newName}
                error={renameErrors.get(r.index)}
                onChange={(newName) => onRename(r.index, { newName })}
              />
            </Cell>
            {showSource ? (
              <Cell className="whitespace-nowrap">
                <span className="inline-flex gap-1">
                  {r.source === "claude" ? <Badge tone="claude">Claude</Badge> : <Badge>Rules</Badge>}
                  {r.outsideVocabulary ? (
                    <Badge tone="warning" outline title="Claude used a name outside the vocabulary list; check it">
                      not in vocabulary
                    </Badge>
                  ) : null}
                </span>
              </Cell>
            ) : null}
            <Cell className="text-text-secondary">{r.reason}</Cell>
          </Row>
        ))}
      </ReviewTable>
    </Section>
  );
}

const KIND_BADGES: Record<NonNullable<TokenRow["kind"]>, ReactNode> = {
  wrap: (
    <Badge tone="info" title="Bound straight to a semantic variable; wrapped in a component token and rebound.">
      wrap
    </Badge>
  ),
  "alias-change": (
    <Badge tone="warning" outline title="Changes the alias of an existing token of this component; every use of it changes.">
      alias change
    </Badge>
  ),
  rebind: (
    <Badge tone="info" title="Moves bound layers to a token with the right name.">
      rebind
    </Badge>
  ),
  rename: (
    <Badge tone="success" title="Renames the existing token in place; nothing changes visually.">
      rename
    </Badge>
  ),
};

const READ_ONLY_TITLES: Partial<Record<NonNullable<TokenRow["kind"]>, string>> = {
  "alias-change": "Existing token; only its alias changes.",
  rename: "Existing token renamed in place; its bindings and alias stay.",
};

function MatchBadge({ match, manualTitle }: { match: string; manualTitle: string }) {
  if (match === "manual")
    return (
      <Badge tone="warning" outline title={manualTitle}>
        manual
      </Badge>
    );
  return <Badge tone={match === "exact" ? "success" : "warning"}>{match}</Badge>;
}

function AliasCell({ t, entries, onToken }: { t: TokenRow } & Pick<ReviewProps, "entries" | "onToken">) {
  if (t.kind === "rename") {
    const names = [t.aliasDesktop, t.aliasMobile].map((id) => (id ? (entries.get(id)?.name ?? id) : "raw value"));
    return <span className="text-text-secondary">{slashBreaks(names[0] === names[1] ? names[0] : `${names[0]} / ${names[1]}`)}</span>;
  }
  if (t.splitModes) {
    return (
      <div className="flex flex-col gap-1">
        <TokenPicker
          groups={t.options}
          value={t.aliasDesktop}
          entries={entries}
          label="desktop"
          labelVisible
          onChange={(v) => onToken(t, { aliasDesktop: v })}
        />
        <TokenPicker
          groups={t.options}
          value={t.aliasMobile}
          entries={entries}
          label="mobile"
          labelVisible
          onChange={(v) => onToken(t, { aliasMobile: v })}
        />
      </div>
    );
  }
  return (
    <TokenPicker
      groups={t.options}
      value={t.aliasDesktop}
      entries={entries}
      label="both modes"
      labelVisible
      onChange={(v) => onToken(t, { aliasDesktop: v, aliasMobile: v })}
    />
  );
}

function Tokens({ model, entries, tokenErrors, undoable, onToken, onRenameAll, onUndo }: ReviewProps) {
  if (!model.tokens.length) return null;
  const renames = model.tokens.filter((t) => t.kind === "rename");
  const allOn = renames.every((t) => t.apply);
  const toggle =
    renames.length >= 2 ? (
      <Button
        variant="secondary"
        size="sm"
        aria-label={allOn ? "Skip all token renames" : "Rename all tokens"}
        onPress={() => onRenameAll(!allOn)}
      >
        {allOn ? "Skip all renames" : "Rename all"}
      </Button>
    ) : null;
  const columns = [
    { label: "Apply", className: "w-8" },
    { label: "Token" },
    { label: "Status", className: "w-[17%]" },
    { label: "Alias", className: "w-[28%] min-w-40" },
    { label: "Replaces" },
    { label: "Uses" },
  ];
  return (
    <Section title="Tokens" action={toggle}>
      <ReviewTable label="Tokens" columns={columns}>
        {model.tokens.map((t) => (
          <Row key={t.key} dimmed={!t.apply}>
            <Cell noDim>
              <Checkbox isSelected={t.apply} onChange={(apply) => onToken(t, { apply })} aria-label={`Apply token ${t.name}`} />
            </Cell>
            <Cell>
              <div className="flex min-w-0 flex-col gap-0.5">
                {t.previousName ? (
                  <div className="text-text-secondary line-through">{slashBreaks(`${t.previousName} →`)}</div>
                ) : null}
                <TextField
                  label="Token name"
                  value={t.name}
                  error={tokenErrors.get(t.key)}
                  isReadOnly={t.kind === "alias-change" || t.kind === "rename"}
                  title={t.kind ? READ_ONLY_TITLES[t.kind] : undefined}
                  onChange={(name) => onToken(t, { name })}
                />
                {t.note ? <div className="text-text-secondary">{t.note}</div> : null}
              </div>
            </Cell>
            <Cell>
              <div className="flex flex-wrap items-center gap-1">
                <Badge tone={t.status === "new" ? "info" : "neutral"}>{t.status}</Badge>
                {t.kind ? KIND_BADGES[t.kind] : null}
                <MatchBadge match={t.match} manualTitle="Mapped to a token with a different value; the component will look different." />
                {t.source === "claude" ? <Badge tone="claude">Claude</Badge> : null}
                {t.source === "user" ? <Badge tone="info">You</Badge> : null}
                {t.source === "user" && undoable.has(t.key) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    data-focus={`undo:${t.key}`}
                    aria-label={`Undo token for ${t.name}, leave the value raw`}
                    onPress={() => onUndo(t.key)}
                  >
                    Undo
                  </Button>
                ) : null}
              </div>
            </Cell>
            <Cell>
              {t.previousAlias ? <div className="mb-0.5 text-warning">{slashBreaks(`${t.previousAlias} →`)}</div> : null}
              <AliasCell t={t} entries={entries} onToken={onToken} />
            </Cell>
            <Cell className="whitespace-nowrap tabular-nums">{t.replaces}</Cell>
            <Cell className="tabular-nums">{t.useCount}</Cell>
          </Row>
        ))}
      </ReviewTable>
    </Section>
  );
}

function Typography({ model, onTypography }: ReviewProps) {
  if (!model.typography.length) return null;
  const columns = [
    { label: "Apply", className: "w-8" },
    { label: "Role" },
    { label: "Status" },
    { label: "Binds", className: "w-[40%]" },
    { label: "Layers" },
  ];
  return (
    <Section title="Typography">
      <ReviewTable label="Typography" columns={columns}>
        {model.typography.map((t) => (
          <Row key={t.key} dimmed={!t.apply}>
            <Cell noDim>
              <Checkbox isSelected={t.apply} onChange={(apply) => onTypography(t.key, apply)} aria-label={`Bind typography ${t.role}`} />
            </Cell>
            <Cell>
              <strong className="font-semibold">{t.role}</strong>
              {t.note ? <div className="text-text-secondary">{t.note}</div> : null}
            </Cell>
            <Cell>
              <MatchBadge match={t.match} manualTitle="Closest role; the text will look different." />
            </Cell>
            <Cell>
              {t.bindings.map((b) => (
                <div key={b.field}>
                  <span className="text-text-secondary">{b.field}: </span>
                  {slashBreaks(b.variable)}
                </div>
              ))}
            </Cell>
            <Cell className="tabular-nums">{t.layerCount}</Cell>
          </Row>
        ))}
      </ReviewTable>
    </Section>
  );
}

function RawTokenCell({ row, entries, onAdopt }: { row: RawRow & { key: string } } & Pick<ReviewProps, "entries" | "onAdopt">) {
  const [chosen, setChosen] = useState<string | null>(row.selected);
  if (!row.options.length) return <span className="text-text-secondary">No token of this type</span>;
  const names = new Map(row.options.flatMap((g) => g.options.map((o) => [o.id, o.label] as const)));
  return (
    <div className="flex items-center gap-1.5">
      <div className="min-w-0 flex-1">
        <TokenPicker
          groups={row.options}
          value={chosen}
          entries={entries}
          label={`Semantic token for ${row.display}`}
          focusKey={`raw:${row.key}`}
          onChange={setChosen}
        />
      </div>
      {row.suggested && chosen === row.selected ? (
        <Badge tone="success" title="Role default from the rules. Nothing changes until you click Use token.">
          Suggested
        </Badge>
      ) : null}
      <Button
        variant="secondary"
        size="sm"
        isDisabled={!chosen}
        aria-label={`Use the chosen token for ${row.display}`}
        onPress={() => chosen && onAdopt(row, chosen, names.get(chosen) ?? chosen)}
      >
        Use token
      </Button>
    </div>
  );
}

function Raw({ model, entries, onAdopt, onAdoptAll }: ReviewProps) {
  if (!model.raw.length) return null;
  const suggestedCount = model.raw.filter((r) => r.key && r.suggested).length;
  const useAll =
    suggestedCount >= 2 ? (
      <Button
        variant="secondary"
        size="sm"
        aria-label={`Use the suggested token for all ${suggestedCount} values`}
        onPress={onAdoptAll}
      >
        Use all suggestions
      </Button>
    ) : null;
  const columns = [{ label: "Value" }, { label: "Uses" }, { label: "Reason" }, { label: "Token", className: "w-[46%] min-w-60" }];
  return (
    <Section title="No match, left raw" action={useAll}>
      <ReviewTable label="No match, left raw" columns={columns}>
        {model.raw.map((r, i) => {
          const split = splitRawDisplay(r.display);
          return (
            <Row key={r.key ?? `none-${i}`}>
              <Cell>
                {split ? (
                  <>
                    <span className="block font-semibold tabular-nums">{split.value}</span>
                    <span className="block text-xs text-text-secondary">{slashBreaks(split.token)}</span>
                  </>
                ) : (
                  r.display
                )}
              </Cell>
              <Cell className="tabular-nums">{r.useCount}</Cell>
              <Cell className="text-text-secondary">{r.reason}</Cell>
              <Cell>{r.key ? <RawTokenCell row={{ ...r, key: r.key }} entries={entries} onAdopt={onAdopt} /> : null}</Cell>
            </Row>
          );
        })}
      </ReviewTable>
    </Section>
  );
}
