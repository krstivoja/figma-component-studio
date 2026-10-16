import { useState } from "react";
import { Crosshair } from "lucide-react";
import { DRAFT_LABEL, foldLibraryFindings, libraryDetailText, librarySummaryText } from "../../qa";
import { namingBanner } from "../../review";
import type { QaColor, QaFinding, QaReport as Report, QaSeverity } from "../../types";
import { Badge, type BadgeTone } from "../components/Badge";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Cell, ReviewTable, Row } from "../components/ReviewTable";
import { Section } from "../components/Section";
import { Swatch } from "../components/Swatch";
import { ShowAllToggle, slashBreaks, WarningsBanner } from "./Review";

const SEVERITY_TONES: Record<QaSeverity, BadgeTone> = { error: "danger", warning: "warning", info: "info" };

const COLUMNS = [
  { label: "Severity", className: "w-16" },
  { label: "Layer", className: "w-[21%]" },
  { label: "Issue", className: "w-[25%]" },
  { label: "Current", className: "w-[21%]" },
  { label: "Suggestion" },
];

export interface QaReportProps {
  report: Report;
  /** Opened from the sidebar's "Check with Component Studio" button. */
  launched: boolean;
  onSelect: (nodeIds: string[]) => void;
}

function Value({ text, color }: { text: string; color: QaColor | null }) {
  return (
    <span className="flex min-w-0 items-start gap-1.5">
      {color ? (
        <span className="mt-px">
          <Swatch entry={{ light: color }} />
        </span>
      ) : null}
      <span className="min-w-0 break-words">{slashBreaks(text)}</span>
    </span>
  );
}

type RowProps = { showRules: boolean; onSelect: QaReportProps["onSelect"] };

function FindingRow({ f, showRules, onSelect }: { f: QaFinding } & RowProps) {
  return (
    <Row onClick={() => onSelect(f.nodeIds)}>
      <Cell>
        <Badge tone={SEVERITY_TONES[f.severity]}>{f.severity}</Badge>
      </Cell>
      <Cell>
        <Button
          variant="ghost"
          size="sm"
          aria-label={`Select ${f.layer} on the canvas`}
          onPress={() => onSelect(f.nodeIds)}
          className="-ml-2 h-auto! min-h-6 max-w-[calc(100%+0.5rem)] items-start! justify-start! py-1 text-left"
        >
          <Crosshair aria-hidden size={12} className="mt-0.5 shrink-0 text-icon-secondary" />
          <span className="min-w-0 font-normal whitespace-normal break-words">
            {f.layer}
            {f.nodeIds.length > 1 ? <span className="text-text-secondary"> +{f.nodeIds.length - 1} more</span> : null}
          </span>
        </Button>
      </Cell>
      <Cell>
        <div className="font-medium">{f.issue}</div>
        {f.detail ? <div className="text-text-secondary break-words">{slashBreaks(f.detail)}</div> : null}
      </Cell>
      <Cell className="tabular-nums">
        <Value text={f.current} color={f.currentColor} />
      </Cell>
      <Cell>
        {f.suggestion ? (
          <div className="flex flex-col items-start gap-0.5">
            <Value text={f.suggestion} color={f.suggestionColor} />
            {f.suggestionNote ? <span className="text-text-secondary">{f.suggestionNote}</span> : null}
            {f.source === "claude" ? <Badge tone="claude">Claude</Badge> : null}
            {f.source === "rules" && showRules ? <Badge>Rules</Badge> : null}
          </div>
        ) : (
          <span className="text-text-tertiary">No suggestion</span>
        )}
      </Cell>
    </Row>
  );
}

// Two or more "From a library" rows: one summary row; "Show all" lists them as plain rows under it.
export function LibraryRows({ findings, defaultOpen = false, ...rest }: { findings: QaFinding[]; defaultOpen?: boolean } & RowProps) {
  const [open, setOpen] = useState(defaultOpen);
  const summary = librarySummaryText(findings.length);
  return (
    <>
      <Row>
        <Cell>
          <Badge tone={SEVERITY_TONES[findings[0].severity]}>{findings[0].severity}</Badge>
        </Cell>
        <Cell colSpan={COLUMNS.length - 1}>
          <div>
            <span className="font-medium">{summary}</span>{" "}
            <ShowAllToggle
              open={open}
              count={findings.length}
              onToggle={setOpen}
              label={open ? "Show fewer library tokens" : `Show all ${findings.length} library tokens`}
            />
          </div>
          <div className="text-text-secondary">{libraryDetailText(findings)}</div>
        </Cell>
      </Row>
      {open ? findings.map((f) => <FindingRow key={f.id} f={f} {...rest} />) : null}
    </>
  );
}

// `showRules`: with Claude's names in play, the naming banner says rows marked Rules came from the rules.
function Findings({ title, findings, ...rest }: { title: string; findings: QaFinding[] } & RowProps) {
  if (!findings.length) return null;
  return (
    <Section title={`${title} (${findings.length})`}>
      <ReviewTable label={title} columns={COLUMNS}>
        {foldLibraryFindings(findings).map((item) =>
          item.type === "finding" ? (
            <FindingRow key={item.finding.id} f={item.finding} {...rest} />
          ) : (
            <LibraryRows key="library" findings={item.findings} {...rest} />
          ),
        )}
      </ReviewTable>
    </Section>
  );
}

export function QaReport({ report, launched, onSelect }: QaReportProps) {
  const banner = namingBanner(report.naming);
  const naming = report.findings.filter((f) => f.area === "naming");
  const tokens = report.findings.filter((f) => f.area === "tokens");
  return (
    <div className="flex flex-col gap-3 pb-1">
      {launched ? (
        <Banner tone="info">Opened from "Check with Component Studio". QA check is read-only: nothing in the file changes.</Banner>
      ) : null}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h3 className="m-0 text-sm font-semibold">
          {report.draft ? "Frame" : "Component"}: {report.componentName}
        </h3>
        {report.draft ? (
          <Badge tone="info" title="A plain frame: checked against the semantic tokens before it becomes a component.">
            {DRAFT_LABEL}
          </Badge>
        ) : null}
      </div>
      {report.findings.length ? null : (
        <Banner tone="success" role="status">
          <strong className="font-semibold">No issues found.</strong>{" "}
          {report.draft
            ? "Colors pair with their surfaces, values use tokens and layer names follow the rules."
            : "Layer names and tokens follow the conventions."}
        </Banner>
      )}
      {banner ? <Banner tone={banner.tone}>{banner.text}</Banner> : null}
      <WarningsBanner warnings={report.notes} />
      <Findings title="Naming" findings={naming} showRules={report.naming.source === "claude"} onSelect={onSelect} />
      <Findings title="Tokens" findings={tokens} showRules={false} onSelect={onSelect} />
      {report.findings.length ? <p className="m-0 text-text-secondary">Click a row to select the layer on the canvas.</p> : null}
    </div>
  );
}
