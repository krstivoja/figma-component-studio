import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { Checkbox as AriaCheckbox } from "react-aria-components";

export interface CheckboxProps {
  isSelected: boolean;
  onChange: (value: boolean) => void;
  isDisabled?: boolean;
  /** Visible label. Without it, `aria-label` names the checkbox. */
  children?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
}

export function Checkbox({ children, ...props }: CheckboxProps) {
  return (
    <AriaCheckbox
      {...props}
      className="group inline-flex cursor-default items-center gap-2 text-sm text-text outline-none data-[disabled]:text-text-disabled"
    >
      {({ isSelected }) => (
        <>
          <span
            className={
              "flex size-3.5 shrink-0 items-center justify-center rounded-[3px] border " +
              "group-data-[focus-visible]:outline-solid group-data-[focus-visible]:outline-2 group-data-[focus-visible]:outline-offset-1 group-data-[focus-visible]:outline-border-selected " +
              (isSelected ? "border-brand bg-brand text-text-onbrand" : "border-border-strong/60 bg-bg") +
              " group-data-[disabled]:opacity-50"
            }
          >
            {isSelected ? <Check aria-hidden size={10} strokeWidth={3} /> : null}
          </span>
          {children}
        </>
      )}
    </AriaCheckbox>
  );
}
