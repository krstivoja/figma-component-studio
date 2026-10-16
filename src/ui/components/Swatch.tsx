import type { CSSProperties } from "react";
import { swatchFill } from "../../tokenPicker";
import type { SemanticToken } from "../../types";

// The swatch is the one place literal colors appear: it shows the user's token value.
// Checkerboard squares use the theme's secondary/tertiary backgrounds so they read in both themes.
const CHECKER =
  "conic-gradient(var(--color-bg-tertiary) 25%, var(--color-bg) 0 50%, var(--color-bg-tertiary) 0 75%, var(--color-bg) 0)";

export function Swatch({ entry }: { entry: Pick<SemanticToken, "light"> | undefined }) {
  const fill = swatchFill(entry);
  let style: CSSProperties;
  if (fill.kind === "solid") style = { backgroundColor: fill.color };
  else if (fill.kind === "checker")
    style = { backgroundImage: `linear-gradient(${fill.color}, ${fill.color}), ${CHECKER}`, backgroundSize: "100% 100%, 6px 6px" };
  else
    style = {
      backgroundImage: "linear-gradient(135deg, transparent 45%, var(--color-text-tertiary) 45% 55%, transparent 55%)",
    };
  return (
    <span
      aria-hidden
      className="block size-3.5 shrink-0 rounded-[3px] bg-bg shadow-[inset_0_0_0_1px_var(--color-border)]"
      style={style}
    />
  );
}
