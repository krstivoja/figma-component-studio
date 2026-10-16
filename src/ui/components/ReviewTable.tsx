import type { ReactNode } from "react";

// A styled native table: rows hold their own checkbox, inputs and pickers, which a grid's
// row selection and arrow-key navigation (RAC Table) would fight with.

export interface Column {
  label: string;
  /** Announced to screen readers, not shown (e.g. the arrow column). */
  hidden?: boolean;
  className?: string;
}

export function ReviewTable({ label, columns, children }: { label: string; columns: Column[]; children: ReactNode }) {
  return (
    <table aria-label={label} className="w-full border-collapse text-sm">
      <thead>
        <tr>
          {columns.map((c, i) => (
            <th
              key={i}
              scope="col"
              className={`h-6 border-b border-border px-1.5 text-left align-middle text-xs font-medium whitespace-nowrap text-text-secondary first:pl-0 ${c.className ?? ""}`}
            >
              {c.hidden ? <span className="sr-only">{c.label}</span> : c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

/** `onClick` is a mouse shortcut only: the row must also hold a focusable control that does the same. */
export function Row({ dimmed = false, onClick, children }: { dimmed?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <tr
      data-dimmed={dimmed || undefined}
      onClick={onClick}
      className={`group/row border-b border-border last:border-b-0 ${onClick ? "hover:bg-bg-hover" : ""}`}
    >
      {children}
    </tr>
  );
}

export interface CellProps {
  children?: ReactNode;
  className?: string;
  /** Stays fully visible on a skipped row (its apply checkbox). */
  noDim?: boolean;
}

export function Cell({ children, className = "", noDim = false }: CellProps) {
  return (
    <td
      className={`px-1.5 py-1 align-middle first:pl-0 ${noDim ? "" : "group-data-[dimmed]/row:opacity-50"} ${className}`}
    >
      {children}
    </td>
  );
}
