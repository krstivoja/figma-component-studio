export type VocabularyGroup =
  | "structure"
  | "layout"
  | "table"
  | "text"
  | "media"
  | "controls"
  | "status"
  | "decoration"
  | "navigation"
  | "overlays"
  | "slots";

// "text" names only fit TEXT layers, "frame" names only non-text layers.
export type VocabularyLayer = "text" | "frame" | "any";

export interface VocabularyEntry {
  name: string;
  group: VocabularyGroup;
  layer: VocabularyLayer;
  description: string;
  signal: string;
}

export const VOCABULARY_GROUPS: Array<{ id: VocabularyGroup; title: string }> = [
  { id: "structure", title: "Page and region structure" },
  { id: "layout", title: "Rows, columns, grids, lists" },
  { id: "table", title: "Table" },
  { id: "text", title: "Text" },
  { id: "media", title: "Icons and media" },
  { id: "controls", title: "Controls" },
  { id: "status", title: "Status and feedback" },
  { id: "decoration", title: "Decoration" },
  { id: "navigation", title: "Navigation" },
  { id: "overlays", title: "Dialogs and overlays" },
  { id: "slots", title: "Slots (camelCase + Slot, never auto-created)" },
];

type Row = [name: string, layer: VocabularyLayer, description: string, signal: string];

const rows: Record<VocabularyGroup, Row[]> = {
  structure: [
    ["header", "frame", "top region of a component", "first child, above content, holds title/actions"],
    ["main", "frame", "primary content region", "largest child, between header and footer"],
    ["content", "frame", "body of a card, dialog, section", "middle child of header / content / footer"],
    ["footer", "frame", "bottom region", "last child, below content, holds actions/links"],
    ["aside", "frame", "secondary side region", "narrow sibling beside main/content"],
    ["section", "frame", "self-contained block with its own heading", "child of main, has heading + body"],
    ["container", "frame", "box that holds other layers, no layout role", "frame with children, fixed/max width"],
    ["wrapper", "frame", "layout element that sets orientation + gap", "auto-layout frame, only layout, no fill"],
    ["inner", "frame", "padding shell inside a container", "single child frame, padding set"],
    ["body", "frame", "main text/content area of a card or dialog", "frame below title, above actions"],
    ["group", "frame", "loose set of related layers", "non-auto-layout group of 2+"],
  ],
  layout: [
    ["row", "frame", "horizontal line of layers", "auto-layout horizontal, 2+ children"],
    ["column", "frame", "vertical stack inside a row layout", "auto-layout vertical, sibling of other columns"],
    ["stack", "frame", "vertical stack of same-kind items", "auto-layout vertical, repeated children"],
    ["grid", "frame", "2D wrap layout", "auto-layout wrap or grid mode"],
    ["list", "frame", "repeated items", "parent of 3+ same-shaped children"],
    ["item", "frame", "one of several same-shaped siblings", "3+ same-shaped siblings, outside a list"],
    ["list-item", "frame", "one entry in a list", "child of list, repeated"],
    ["row-group", "frame", "set of rows sharing a label", "rows nested under a heading row"],
    ["spacer", "frame", "empty flexible space", "empty frame, fill-container, no fill"],
    ["divider", "frame", "line separating siblings", "1px frame/line between siblings"],
  ],
  table: [
    ["table", "frame", "whole table", "frame with header row + 2+ rows"],
    ["table-header", "frame", "header row", "first row, text-only cells, emphasis fill"],
    ["table-body", "frame", "rows container", "frame holding the data rows"],
    ["table-row", "frame", "one data row", "horizontal, cells aligned to columns"],
    ["table-cell", "frame", "one cell", "child of a row, one text/icon/control"],
    ["header-cell", "frame", "one header cell", "child of table-header"],
    ["table-footer", "frame", "summary / pagination row", "last row, totals or pagination"],
  ],
  text: [
    ["label", "text", "main text of a control (named after its text property)", "TEXT layer, short, in button/input/checkbox"],
    ["title", "text", "primary heading of a card/dialog/section", "TEXT, largest font in the component"],
    ["sub headline", "text", "secondary heading", "TEXT, second largest font"],
    ["headline", "text", "prominent heading above a title", "TEXT, large, above title"],
    ["description", "text", "explanatory paragraph", "TEXT, multi-line, body size"],
    ["supporting text", "text", "helper line under a label/input", "TEXT, small, below label"],
    ["helper text", "text", "hint under a form field", "TEXT, small, below input"],
    ["error message", "text", "validation message", "TEXT, error color, below input"],
    ["input text", "text", "the typed or placeholder value of a field", "TEXT inside input"],
    ["placeholder", "text", "empty-state text of a field", "TEXT, subtle color, inside input"],
    ["number", "text", "numeric value (pagination, counters)", "TEXT, digits only"],
    ["caption", "text", "small text under media", "TEXT, smallest, below image"],
    ["text-content", "frame", "wrapper holding stacked text layers", "vertical wrapper with 2+ TEXT children"],
    ["value", "text", "value shown next to a label", "TEXT, right of label"],
  ],
  media: [
    ["icon", "frame", "single glyph (not wrapped)", "small vector/instance, <= 32px square"],
    ["icon-static", "frame", "the icon instance that exposes the swap", "nested icon component instance"],
    ["icon-wrapper", "frame", "holds left/right icons", "frame with 1-2 icon children"],
    ["left icon", "frame", "icon before the label", "icon left of label"],
    ["right icon", "frame", "icon after the label", "icon right of label"],
    ["image", "frame", "raster picture", "IMAGE fill rectangle/frame"],
    ["illustration", "frame", "decorative artwork", "large vector group"],
    ["avatar", "frame", "user picture or initials", "circle, image or 1-2 letters"],
    ["logo", "frame", "brand mark", "vector, in header/footer"],
    ["thumbnail", "frame", "small preview image", "small image in list/table row"],
    ["media", "frame", "image/video area of a card", "top region with image fill"],
  ],
  controls: [
    ["button", "frame", "clickable action", "instance of button, or frame with label + fill"],
    ["link", "text", "inline navigation text", "TEXT, underlined or brand color"],
    ["input", "frame", "text field", "frame with stroke + input text"],
    ["field", "frame", "label + input + helper as one unit", "vertical wrapper: label, input, helper"],
    ["checkbox", "frame", "box with check", "square, stroke, check icon"],
    ["radio", "frame", "circle with dot", "circle, stroke, inner dot"],
    ["toggle", "frame", "switch", "pill track + knob"],
    ["track", "frame", "rail of a toggle/slider/progress", "long pill, behind a knob/fill"],
    ["knob", "frame", "movable handle of a toggle", "circle on track"],
    ["fill", "frame", "filled part of a track or progress", "pill on top of track"],
    ["thumb", "frame", "draggable handle of a slider", "circle on track"],
    ["slider", "frame", "range control", "track + fill + thumb"],
    ["select", "frame", "dropdown field", "input + chevron icon"],
    ["menu", "frame", "list of choices", "vertical list of menu-item"],
    ["menu-item", "frame", "one choice", "row with label, optional icon"],
    ["tab", "frame", "one tab label", "child of tabs"],
    ["tabs", "frame", "row of switchable tabs", "horizontal row of tab"],
    ["chip", "frame", "compact selectable/removable tag", "pill with label (+ dismiss)"],
    ["dismiss", "frame", "close/remove control", "small icon button, right side"],
    ["actions", "frame", "group of buttons", "wrapper of 1+ button, usually in footer"],
  ],
  status: [
    ["badge", "frame", "small status or count", "pill/circle with short text"],
    ["status", "any", "state indicator dot or label", "small circle or short text with status color"],
    ["indicator", "frame", "position marker (steps, pager)", "small dot/bar in a repeated set"],
    ["progress", "frame", "progress bar", "track + fill"],
    ["spinner", "frame", "loading animation", "circle arc vector"],
    ["skeleton", "frame", "loading placeholder", "gray block replacing content"],
    ["notification", "frame", "message banner", "frame with icon + text + dismiss"],
    ["tooltip", "frame", "small hover label", "small frame, arrow, short text"],
  ],
  decoration: [
    ["background", "frame", "fill behind content", "rectangle/frame under siblings, fill only"],
    ["border", "frame", "outline only", "stroke-only frame"],
    ["overlay", "frame", "dimming layer", "semi-transparent fill over content"],
    ["shadow", "frame", "drop shadow carrier", "frame with effects only"],
    ["mask", "frame", "clipping shape", "layer used as mask"],
  ],
  navigation: [
    ["navbar", "frame", "navigation region", "horizontal row of nav-item"],
    ["nav-item", "frame", "one navigation entry", "child of navbar, icon + label"],
    ["breadcrumb", "frame", "path trail", "row of links with separators"],
    ["pagination", "frame", "page switcher", "row of number items + arrows"],
    ["page-indicator", "frame", "dots/bar showing page", "repeated indicator"],
    ["stepper", "frame", "progress through steps", "repeated step"],
    ["step", "frame", "one step", "child of stepper"],
  ],
  overlays: [
    ["dialog", "frame", "modal box", "centered frame over overlay"],
    ["sheet", "frame", "surface of a dialog/drawer", "frame holding header/content/footer"],
    ["drawer", "frame", "side or bottom panel", "frame attached to an edge"],
    ["popover", "frame", "floating panel", "small frame near a trigger"],
  ],
  slots: [
    ["contentSlot", "frame", "free content area", "never auto-created"],
    ["contentWrapperSlot", "frame", "free content wrapper", "never auto-created"],
    ["containerSlot", "frame", "free container", "never auto-created"],
    ["headerSlot", "frame", "free header area", "never auto-created"],
    ["footerSlot", "frame", "free footer area", "never auto-created"],
    ["actionsSlot", "frame", "free actions area", "never auto-created"],
    ["iconSlot", "frame", "free icon area", "never auto-created"],
    ["mediaSlot", "frame", "free media area", "never auto-created"],
    ["asideSlot", "frame", "free aside area", "never auto-created"],
  ],
};

export const VOCABULARY: VocabularyEntry[] = ([] as VocabularyEntry[]).concat(
  ...VOCABULARY_GROUPS.map(({ id }) =>
    rows[id].map(([name, layer, description, signal]) => ({ name, group: id, layer, description, signal })),
  ),
);

export const NEVER_USE: string[] = [
  "Figma defaults: Frame 123, Group 4, Rectangle 12, Ellipse, Vector, Line, Component 1",
  "Title Case or content-as-name: Content, Button Label, FOOTER (as a text layer)",
  "start / end side names (use left / right)",
  "Names containing the component name twice (link > link)",
];

const byName = new Map(VOCABULARY.map((e) => [e.name, e]));

export function vocabularyEntry(name: string): VocabularyEntry | undefined {
  return byName.get(name);
}
