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
  text: TextInfo | null;
  mainComponentName: string | null; // INSTANCE only
  bound: Partial<Record<BindableField, string>>; // field -> variable id, only already-bound fields
  children: LayerNode[];
}

export type TypographyField = "fontFamily" | "fontStyle" | "fontSize" | "lineHeight" | "letterSpacing";
export const TYPOGRAPHY_FIELDS: TypographyField[] = ["fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing"];

export interface TextStyleValues {
  fontFamily: string;
  fontStyle: string;
  fontSize: number;
  lineHeight: { unit: "AUTO" } | { unit: "PIXELS" | "PERCENT"; value: number };
  letterSpacing: { unit: "PIXELS" | "PERCENT"; value: number };
}

export interface TextInfo {
  characters: string;
  fontSize: number;
  style?: TextStyleValues | null; // null = mixed styles in one layer
  bound?: Partial<Record<TypographyField, string>>; // typography field -> variable id
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
  boundVariableId?: string; // set on values already bound to a variable (VariantScan.boundUses)
}

export interface VariantScan {
  id: string; // variant (component) node id
  props: Record<string, string>; // e.g. { style: "primary", state: "hover", layout: "desktop" }
  root: LayerNode;
  uses: RawValueUse[];
  boundUses?: RawValueUse[]; // values already bound to a variable, re-checked in the tokens step
  missingBindings?: number; // bindings to deleted or unloadable variables, scanned as raw values
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
  values: Record<string, { number?: number; hex?: string; opacity?: number; string?: string }>; // by mode name
  aliasOf?: Record<string, string>; // direct alias target variable id by mode name, only modes that alias
  componentId?: string; // plugin data on components tokens this plugin created: the root they belong to
}

// A semantic variable as the review UI sees it; `light` for colors, `value` (desktop) for numbers.
export interface SemanticToken {
  id: string;
  name: string;
  collection: string;
  type: CatalogVariable["type"];
  light?: { hex: string; opacity: number };
  value?: number;
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
  source: "claude" | "rules";
  outsideVocabulary: boolean;
}

// Written by the Claude skill via the figma-console MCP onto the root node:
// root.setSharedPluginData(NAMING_NAMESPACE, NAMING_KEY, JSON.stringify(proposal)).
export const NAMING_NAMESPACE = "component_studio";
export const NAMING_KEY = "naming_proposal";

export interface StoredNamingProposal {
  version: 1;
  source: "claude";
  createdAt: string; // ISO
  rootId: string;
  rootName: string;
  structureHash: string;
  componentName: string | null;
  renames: Array<{
    indexPath: number[];
    nodeId: string;
    oldName: string;
    newName: string;
    reason: string;
    outsideVocabulary: boolean;
  }>;
}

// "rules" + claudeRequested: the checkbox was on but no valid Claude proposal was stored.
export type NamingSource =
  | { source: "claude"; createdAt: string }
  | { source: "rules"; claudeRequested: boolean };

export interface TokenProposal {
  key: string; // stable row id
  name: string; // components token name (user-editable)
  status: "new" | "existing";
  type: "COLOR" | "FLOAT";
  alias: Record<Mode, string | null>; // semantic variable id per mode (user-editable)
  candidates: string[]; // other semantic variable ids that fit, for the dropdown
  match: "exact" | "nearest" | "none" | "manual"; // manual = mapped to a token whose value differs, changes the look on purpose
  source: "match" | "claude" | "user";
  replaces: string; // display value, e.g. "#0059FF" or "16"
  uses: RawValueUse[]; // every place this token will be bound, across variants
  note: string | null;
  skip: boolean; // user-editable
  kind?: "wrap" | "alias-change" | "rebind" | "rename"; // wrap: bound straight to a semantic variable; alias-change: existing own token gets a new alias; rebind: moves bound uses to another token; rename: existing token renamed in place
  previousName?: string; // rename only: the token's current name
  previousAlias?: Record<Mode, string | null>; // alias-change only: the alias it has now
  pairOptions?: string[]; // text/icon: variable ids that pair with the surface (same-state default first, then intents)
}

export interface TypographyUse {
  variantId: string;
  indexPath: number[];
  layerName: string;
  fields: TypographyField[]; // unbound fields this row binds
  expect: TextStyleValues; // layer values at scan time
}

export interface TypographyProposal {
  key: string; // `typography|<role>/<size>|<match>`
  role: string; // e.g. "label/s"
  match: "exact" | "manual";
  bindings: Partial<Record<TypographyField, string>>; // variable id per field
  uses: TypographyUse[];
  note: string | null;
  skip: boolean;
}

export interface RowChoice {
  key: string;
  apply: boolean;
  alias: Record<Mode, string | null>;
}

export interface UnmatchedValue {
  key: string; // `${tokenName}|${value}`, stable across scans of the same layers
  tokenName: string; // the components token name it would get
  type: "COLOR" | "FLOAT";
  display: string;
  uses: RawValueUse[];
  reason: string;
  suggestion: { variableId: string; variableName: string; reason: string } | null; // role default from the rules
  pairOptions?: string[]; // text/icon: variable ids that pair with the surface
}

export interface Proposal {
  componentId: string;
  componentName: string;
  newComponentName: string | null; // null = keep
  renames: LayerRename[];
  tokens: TokenProposal[];
  unmatched: UnmatchedValue[];
  typography?: TypographyProposal[];
  warnings: string[];
}

export const TOKENS_KEY = "token_proposal";
export const COMPONENT_ID_KEY = "componentId";

export interface StoredTokenSuggestions {
  version: 1;
  source: "claude";
  createdAt: string;
  rootId: string;
  structureHash: string;
  suggestions: Array<{ key: string; variableId: string; variableName: string; reason: string }>; // key = UnmatchedValue.key or TokenProposal.key
}

// Claude Code <-> plugin connection: MCP server in mcp/ listens here, plugin UI connects.
export const BRIDGE_PORT = 9240;

export type StudioToolName =
  | "studio_status"
  | "studio_get_component"
  | "studio_get_tokens"
  | "studio_propose_names"
  | "studio_propose_tokens";

export interface BridgeRequest {
  id: string;
  tool: StudioToolName;
  args: unknown;
}

export type BridgeResponse =
  | { id: string; ok: true; result: unknown; image?: { mimeType: "image/png"; base64: string } }
  | { id: string; ok: false; error: string };

export type BridgeStatus = "connected" | "disconnected" | "conflict";

export interface ApplyResult {
  renamed: number;
  tokensCreated: number;
  tokensReused: number;
  bound: number;
  aliasesChanged?: number;
  tokenRenames?: Array<{ from: string; to: string }>;
  staleTokenNames?: number;
  skipped: string[]; // human-readable reasons
  snapshotDiff: string[]; // differences between before/after snapshots, empty = identical look
  audit: "PASS" | "skipped" | string[]; // "skipped" in the rename phase, raw values are expected there
}

export type Phase = "rename" | "tokens";

// Messages between plugin sandbox (code.ts) and UI iframe. Prefix keeps them apart from the Laya flow.
export type UiToPlugin =
  | { type: "component/scan"; phase: Phase; useClaude: boolean; assume?: RowChoice[] }
  | { type: "component/apply"; proposal: Proposal }
  | { type: "component/cancel" }
  | { type: "bridge/request"; request: BridgeRequest };

export type PluginToUi =
  | {
      type: "component/proposal";
      phase: Phase;
      naming: NamingSource | null; // null in the tokens phase
      proposal: Proposal;
      semantic: SemanticToken[];
      repaired?: boolean; // answer to a scan with `assume`: keep the review's edits
    }
  | { type: "component/applied"; phase: Phase; result: ApplyResult }
  | { type: "component/error"; message: string }
  | { type: "bridge/response"; response: BridgeResponse }
  | { type: "claude/proposal-stored"; phase: Phase; count: number };
