import { Focusable, Tooltip, TooltipTrigger } from "react-aria-components";
import type { BridgeStatus } from "../../types";

const LABELS: Record<BridgeStatus, string> = {
  connected: "Claude connected",
  disconnected: "Claude not connected",
  conflict: "Another Component Studio window is connected",
};

const HINTS: Record<BridgeStatus, string | null> = {
  connected: null,
  disconnected: "Run `claude` in the figma-component-studio folder; it connects automatically.",
  conflict: null,
};

const TONES: Record<BridgeStatus, { pill: string; dot: string }> = {
  connected: { pill: "bg-success-tertiary text-success", dot: "bg-success" },
  disconnected: { pill: "bg-bg-secondary text-text-secondary", dot: "bg-text-tertiary" },
  conflict: { pill: "bg-warning-tertiary text-warning", dot: "bg-warning" },
};

export function StatusPill({ status }: { status: BridgeStatus }) {
  const tone = TONES[status];
  const hint = HINTS[status];
  const pill = (
    <span
      role={hint ? "note" : undefined}
      tabIndex={hint ? 0 : undefined}
      className={`inline-flex h-5 items-center gap-1.5 whitespace-nowrap rounded-full px-2 text-sm ${tone.pill}`}
    >
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} />
      {LABELS[status]}
    </span>
  );
  return (
    <div role="status" aria-live="polite">
      {hint ? (
        <TooltipTrigger delay={300}>
          <Focusable>{pill}</Focusable>
          <Tooltip
            placement="bottom end"
            offset={6}
            className="max-w-64 rounded-md bg-bg-secondary px-2 py-1.5 text-sm text-text shadow-lg ring-1 ring-border"
          >
            {hint}
          </Tooltip>
        </TooltipTrigger>
      ) : (
        pill
      )}
    </div>
  );
}
