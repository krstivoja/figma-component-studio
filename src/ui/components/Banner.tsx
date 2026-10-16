import type { ReactNode } from "react";

export type BannerTone = "info" | "warning" | "claude" | "danger" | "success" | "neutral";

const TONES: Record<BannerTone, string> = {
  info: "border-border-selected bg-brand-tertiary",
  warning: "border-border-warning bg-warning-tertiary",
  claude: "border-border-claude bg-claude-tertiary",
  danger: "border-border-danger bg-danger-tertiary",
  success: "border-success bg-success-tertiary",
  neutral: "border-border bg-bg-secondary",
};

export interface BannerProps {
  tone: BannerTone;
  children: ReactNode;
  /** Right-aligned control, e.g. "Load it" or "Copy". */
  action?: ReactNode;
  role?: "status" | "alert";
}

export function Banner({ tone, children, action, role }: BannerProps) {
  return (
    <div role={role} className={`flex items-start gap-2 rounded-md border px-2.5 py-1.5 text-sm text-text ${TONES[tone]}`}>
      <div className="min-w-0 flex-1 self-center">{children}</div>
      {action}
    </div>
  );
}
