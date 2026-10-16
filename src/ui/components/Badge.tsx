import type { ReactNode } from "react";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger" | "claude";

const TONES: Record<BadgeTone, string> = {
  neutral: "bg-bg-secondary text-text-secondary",
  info: "bg-brand-tertiary text-text-brand",
  success: "bg-success-tertiary text-success",
  warning: "bg-warning-tertiary text-warning",
  danger: "bg-danger-tertiary text-danger",
  claude: "bg-claude-tertiary text-claude",
};

const OUTLINES: Record<BadgeTone, string> = {
  neutral: "border-border",
  info: "border-border-selected",
  success: "border-success",
  warning: "border-border-warning",
  danger: "border-border-danger",
  claude: "border-border-claude",
};

export interface BadgeProps {
  tone?: BadgeTone;
  /** Outlined: draws attention to a row that changes something on purpose. */
  outline?: boolean;
  title?: string;
  children: ReactNode;
}

export function Badge({ tone = "neutral", outline = false, title, children }: BadgeProps) {
  return (
    <span
      title={title}
      className={
        "inline-flex h-4 shrink-0 items-center whitespace-nowrap rounded-[4px] border px-1.5 text-xs font-medium " +
        TONES[tone] +
        " " +
        (outline ? OUTLINES[tone] : "border-transparent")
      }
    >
      {children}
    </span>
  );
}
