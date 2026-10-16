import { FieldError, Input, Label, TextField as AriaTextField } from "react-aria-components";

export interface TextFieldProps {
  label: string;
  /** Hidden labels still name the input for screen readers. */
  labelVisible?: boolean;
  value: string;
  onChange?: (value: string) => void;
  error?: string;
  isReadOnly?: boolean;
  title?: string;
  className?: string;
}

const INPUT =
  "h-6 w-full min-w-0 rounded-control border border-border bg-bg px-2 text-sm text-text outline-none " +
  "placeholder:text-text-tertiary hover:border-border-strong/40 " +
  "data-[focused]:border-border-selected data-[focused]:shadow-[inset_0_0_0_1px_var(--color-border-selected)] " +
  "data-[invalid]:border-border-danger data-[invalid]:data-[focused]:shadow-[inset_0_0_0_1px_var(--color-border-danger)] " +
  "read-only:bg-bg-secondary read-only:text-text-secondary read-only:hover:border-border";

export function TextField({ label, labelVisible = false, value, onChange, error, isReadOnly, title, className = "" }: TextFieldProps) {
  return (
    <AriaTextField
      value={value}
      onChange={onChange}
      isReadOnly={isReadOnly}
      isInvalid={!!error}
      validationBehavior="aria"
      className={`flex min-w-0 flex-col gap-0.5 ${className}`}
    >
      <Label className={labelVisible ? "text-sm text-text-secondary" : "sr-only"}>{label}</Label>
      <Input spellCheck={false} title={title} className={INPUT} />
      <FieldError className="text-xs text-danger">{error}</FieldError>
    </AriaTextField>
  );
}
