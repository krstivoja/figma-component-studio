import { Button as AriaButton, type ButtonProps as AriaButtonProps } from "react-aria-components";

export type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends Omit<AriaButtonProps, "className"> {
  variant?: ButtonVariant;
  /** `lg`: footer actions, Figma's Share-button size (32px high, semibold). */
  size?: "lg" | "md" | "sm";
  className?: string;
}

const BASE =
  "inline-flex shrink-0 cursor-default items-center justify-center gap-1 whitespace-nowrap rounded-control text-sm outline-offset-1 " +
  "data-[disabled]:cursor-not-allowed";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-brand text-text-onbrand data-[hovered]:bg-brand-hover data-[pressed]:bg-brand-hover " +
    "data-[disabled]:bg-bg-disabled data-[disabled]:text-text-disabled",
  secondary:
    "border border-border bg-bg text-text data-[hovered]:bg-bg-hover data-[pressed]:bg-bg-pressed " +
    "data-[disabled]:text-text-disabled data-[disabled]:bg-bg",
  ghost: "text-text data-[hovered]:bg-bg-hover data-[pressed]:bg-bg-pressed data-[disabled]:text-text-disabled",
};

const SIZES = { lg: "h-8 px-3 font-semibold", md: "h-6 px-3 font-medium", sm: "h-6 px-2 font-medium" };

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <AriaButton {...props} className={`${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`} />;
}
