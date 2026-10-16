import { Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { auditView, lookChangeView, renamedTokensText, staleTokensText, summarizeResult } from "../../review";
import type { ApplyResult, Phase, Proposal } from "../../types";
import { Banner } from "../components/Banner";
import { Button } from "../components/Button";
import { Section } from "../components/Section";

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Figma's plugin iframe may block the Clipboard API; execCommand still works there.
    const area = document.createElement("textarea");
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

function Lines({ lines }: { lines: string[] }) {
  return (
    <ul className="m-0 list-disc pl-4">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

export function CopyButton({
  text,
  label: idle = "Copy",
  ariaLabel = "Copy the renamed tokens list",
  size = "sm",
}: {
  text: string;
  label?: string;
  ariaLabel?: string;
  size?: "lg" | "sm";
}) {
  const [label, setLabel] = useState(idle);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  const copy = async () => {
    const ok = await copyText(text);
    setLabel(ok ? "Copied" : "Copy failed");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLabel(idle), 1500);
  };
  return (
    <Button variant="secondary" size={size} aria-label={label === idle ? ariaLabel : label} onPress={copy}>
      <Copy aria-hidden size={12} />
      {label}
    </Button>
  );
}

export interface ResultProps {
  result: ApplyResult;
  phase: Phase;
  applied: Proposal | null;
}

export function Result({ result, phase, applied }: ResultProps) {
  const stale = staleTokensText(result);
  const renamed = renamedTokensText(result);
  const look = lookChangeView(result, applied);
  const audit = auditView(result.audit);
  return (
    <div className="flex flex-col gap-3 pb-1">
      <h3 className="m-0 text-sm font-semibold">{summarizeResult(result, phase)}</h3>
      {stale ? <p className="m-0">{stale}</p> : null}
      {renamed ? (
        <Banner tone="neutral" action={<CopyButton text={renamed} />}>
          <strong className="font-semibold">Renamed tokens</strong>
          <pre className="m-0 mt-1 font-mono text-sm whitespace-pre-wrap [overflow-wrap:anywhere]">{renamed}</pre>
        </Banner>
      ) : null}
      {look.kind === "loud" ? (
        <Banner tone="danger" role="alert">
          <strong className="font-semibold text-danger">Look changed</strong>
          <Lines lines={look.lines} />
        </Banner>
      ) : look.kind === "intended" ? (
        <Banner tone="neutral">
          <strong className="font-semibold">Intended look changes (values mapped to different tokens)</strong>
          <Lines lines={look.lines} />
        </Banner>
      ) : (
        <p className="m-0 font-semibold text-success">Look unchanged</p>
      )}
      {audit.kind === "issues" ? (
        <Section title={audit.text}>
          <Lines lines={audit.lines} />
        </Section>
      ) : (
        <p className={`m-0 ${audit.kind === "pass" ? "font-semibold text-success" : "text-text-secondary"}`}>{audit.text}</p>
      )}
      {result.skipped.length ? (
        <Section title="Skipped">
          <Lines lines={result.skipped} />
        </Section>
      ) : null}
    </div>
  );
}
