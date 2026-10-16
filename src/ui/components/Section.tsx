import type { ReactNode } from "react";

export interface SectionProps {
  title: ReactNode;
  /** Right-aligned controls next to the heading. */
  action?: ReactNode;
  children: ReactNode;
}

export function Section({ title, action, children }: SectionProps) {
  return (
    <section className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center justify-between gap-2">
        <h3 className="m-0 text-sm font-semibold text-text">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
