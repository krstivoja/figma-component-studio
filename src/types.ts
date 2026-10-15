// Shared contract for the component naming + tokens feature.
// Pure data only: no Figma API objects, so rules are unit-testable.

export type Mode = "desktop" | "mobile";

export type LayerKind =
  | "FRAME"
  | "TEXT"
  | "VECTOR"
  | "RECTANGLE"
  | "ELLIPSE"
  | "LINE"
  | "INSTANCE"
  | "COMPONENT"
  | "COMPONENT_SET"
  | "GROUP"
  | "OTHER";

export type BindableField =
  | "paddingLeft"
  | "paddingRight"
  | "paddingTop"
  | "paddingBottom"
  | "itemSpacing"
  | "counterAxisSpacing"
  | "topLeftRadius"
  | "topRightRadius"
  | "bottomLeftRadius"
  | "bottomRightRadius"
  | "strokeWeight"
  | "width"
  | "height"
  | "minWidth"
  | "maxWidth"
  | "minHeight"
  | "maxHeight"
  | "fills"
  | "strokes";

export interface SolidPaint {
  hex: string; // "#RRGGBB" uppercase
  opacity: number; // 0..1
  boundVariableId: string | null;
}

export type Sizing = "FIXED" | "HUG" | "FILL";

export interface LayerNode {
  id: string;
  name: string;
  kind: LayerKind;
  indexPath: number[]; // child indices from the variant root; [] is the root
  visible: boolean;
  width: number;
  height: number;
  layout: {
    mode: "NONE" | "HORIZONTAL" | "VERTICAL";
    wrap: boolean;
    spaceBetween: boolean;
    widthSizing: Sizing;
    heightSizing: Sizing;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    paddingBottom: number;
    itemSpacing: number;
    counterAxisSpacing: number;
  };
  fills: SolidPaint[];
  strokes: SolidPaint[];
  strokeWeight: number;
  corners: { tl: number; tr: number; bl: number; br: number };
  hasImageFill: boolean;
  isMask: boolean;
  text: { characters: string; fontSize: number } | null;
  mainComponentName: string | null; // INSTANCE only
  bound: Partial<Record<BindableField, string>>; // field -> variable id, only already-bound fields
  children: LayerNode[];
}

// One raw (unbound) value on one property of one layer in one variant.
export interface RawValueUse {
  variantId: string;
  indexPath: number[];
  layerName: string;
  field: BindableField;
  paintIndex: number | null; // index into the Figma node's real fills/strokes array (not LayerNode's solid-only list), else null
  kind: "number" | "color";
  number: number | null;
  hex: string | null;
  opacity: number | null;
  role: "background" | "text" | "icon" | "border" | "other"; // color role, from layer kind/position
}

export interface VariantScan {
  id: string; // variant (component) node id
  props: Record<string, string>; // e.g. { style: "primary", state: "hover", layout: "desktop" }
  root: LayerNode;
  uses: RawValueUse[];
}

export interface ComponentScan {
  id: string;
  name: string;
  kind: "COMPONENT" | "COMPONENT_SET" | "FRAME";
  variantProperties: Record<string, string[]>; // property -> all values
  variants: VariantScan[];
}

// Semantic variables the plugin may alias to. Aliases already resolved to final values.
export interface CatalogVariable {
  id: string;
  name: string;
  collection: string; // collection name: "color" | "dimensions" | "_global" | "components" | "typography" | other
  type: "COLOR" | "FLOAT" | "STRING" | "BOOLEAN";
  values: Record<string, { number?: number; hex?: string; opacity?: number }>; // by mode name
}

export interface Catalog {
  variables: CatalogVariable[];
  componentsCollectionId: string | null;
  componentsModes: Record<Mode, string | null>; // mode id of "desktop" / "mobile" in `components`
}

export interface LayerRename {
  indexPath: number[];
  oldName: string;
  newName: string;
  reason: string;
  skip: boolean;
}

export interface TokenProposal {
  key: string; // stable row id
  name: string; // components token name (user-editable)
  status: "new" | "existing";
  type: "COLOR" | "FLOAT";
  alias: Record<Mode, string | null>; // semantic variable id per mode (user-editable)
  candidates: string[]; // other semantic variable ids that fit, for the dropdown
  match: "exact" | "nearest" | "none";
  replaces: string; // display value, e.g. "#0059FF" or "16"
  uses: RawValueUse[]; // every place this token will be bound, across variants
  note: string | null;
  skip: boolean; // user-editable
}

export interface Proposal {
  componentId: string;
  componentName: string;
  newComponentName: string | null; // null = keep
  renames: LayerRename[];
  tokens: TokenProposal[];
  unmatched: Array<{ display: string; uses: RawValueUse[]; reason: string }>;
  warnings: string[];
}

export interface ApplyResult {
  renamed: number;
  tokensCreated: number;
  tokensReused: number;
  bound: number;
  skipped: string[]; // human-readable reasons
  snapshotDiff: string[]; // differences between before/after snapshots, empty = identical look
  audit: "PASS" | "skipped" | string[]; // "skipped" in the rename phase, raw values are expected there
}

export type Phase = "rename" | "tokens";

// Messages between plugin sandbox (code.ts) and UI iframe. Prefix keeps them apart from the Laya flow.
export type UiToPlugin =
  | { type: "component/scan"; phase: Phase }
  | { type: "component/apply"; proposal: Proposal }
  | { type: "component/cancel" };

export type PluginToUi =
  | {
      type: "component/proposal";
      phase: Phase;
      proposal: Proposal;
      semantic: Array<{ id: string; name: string; collection: string; type: CatalogVariable["type"] }>;
    }
  | { type: "component/applied"; phase: Phase; result: ApplyResult }
  | { type: "component/error"; message: string };
