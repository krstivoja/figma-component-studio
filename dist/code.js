"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __defProps = Object.defineProperties;
  var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };
  var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
  var __objRest = (source, exclude) => {
    var target = {};
    for (var prop in source)
      if (__hasOwnProp.call(source, prop) && exclude.indexOf(prop) < 0)
        target[prop] = source[prop];
    if (source != null && __getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(source)) {
        if (exclude.indexOf(prop) < 0 && __propIsEnum.call(source, prop))
          target[prop] = source[prop];
      }
    return target;
  };

  // src/variables.ts
  async function getLiveVariable(id) {
    const v = await figma.variables.getVariableByIdAsync(id).catch(() => null);
    if (!v) return null;
    if (v.remote) return v;
    const col = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId).catch(() => null);
    return col && col.variableIds.includes(v.id) ? v : null;
  }

  // src/vocabulary.ts
  var VOCABULARY_GROUPS = [
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
    { id: "slots", title: "Slots (camelCase + Slot, never auto-created)" }
  ];
  var rows = {
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
      ["group", "frame", "loose set of related layers", "non-auto-layout group of 2+"]
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
      ["divider", "frame", "line separating siblings", "1px frame/line between siblings"]
    ],
    table: [
      ["table", "frame", "whole table", "frame with header row + 2+ rows"],
      ["table-header", "frame", "header row", "first row, text-only cells, emphasis fill"],
      ["table-body", "frame", "rows container", "frame holding the data rows"],
      ["table-row", "frame", "one data row", "horizontal, cells aligned to columns"],
      ["table-cell", "frame", "one cell", "child of a row, one text/icon/control"],
      ["header-cell", "frame", "one header cell", "child of table-header"],
      ["table-footer", "frame", "summary / pagination row", "last row, totals or pagination"]
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
      ["value", "text", "value shown next to a label", "TEXT, right of label"]
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
      ["media", "frame", "image/video area of a card", "top region with image fill"]
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
      ["actions", "frame", "group of buttons", "wrapper of 1+ button, usually in footer"]
    ],
    status: [
      ["badge", "frame", "small status or count", "pill/circle with short text"],
      ["status", "any", "state indicator dot or label", "small circle or short text with status color"],
      ["indicator", "frame", "position marker (steps, pager)", "small dot/bar in a repeated set"],
      ["progress", "frame", "progress bar", "track + fill"],
      ["spinner", "frame", "loading animation", "circle arc vector"],
      ["skeleton", "frame", "loading placeholder", "gray block replacing content"],
      ["notification", "frame", "message banner", "frame with icon + text + dismiss"],
      ["tooltip", "frame", "small hover label", "small frame, arrow, short text"]
    ],
    decoration: [
      ["background", "frame", "fill behind content", "rectangle/frame under siblings, fill only"],
      ["border", "frame", "outline only", "stroke-only frame"],
      ["overlay", "frame", "dimming layer", "semi-transparent fill over content"],
      ["shadow", "frame", "drop shadow carrier", "frame with effects only"],
      ["mask", "frame", "clipping shape", "layer used as mask"]
    ],
    navigation: [
      ["navbar", "frame", "navigation region", "horizontal row of nav-item"],
      ["nav-item", "frame", "one navigation entry", "child of navbar, icon + label"],
      ["breadcrumb", "frame", "path trail", "row of links with separators"],
      ["pagination", "frame", "page switcher", "row of number items + arrows"],
      ["page-indicator", "frame", "dots/bar showing page", "repeated indicator"],
      ["stepper", "frame", "progress through steps", "repeated step"],
      ["step", "frame", "one step", "child of stepper"]
    ],
    overlays: [
      ["dialog", "frame", "modal box", "centered frame over overlay"],
      ["sheet", "frame", "surface of a dialog/drawer", "frame holding header/content/footer"],
      ["drawer", "frame", "side or bottom panel", "frame attached to an edge"],
      ["popover", "frame", "floating panel", "small frame near a trigger"]
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
      ["asideSlot", "frame", "free aside area", "never auto-created"]
    ]
  };
  var VOCABULARY = [].concat(
    ...VOCABULARY_GROUPS.map(
      ({ id }) => rows[id].map(([name, layer, description, signal]) => ({ name, group: id, layer, description, signal }))
    )
  );
  var byName = new Map(VOCABULARY.map((e) => [e.name, e]));
  function vocabularyEntry(name) {
    return byName.get(name);
  }
  var SYNONYMS = /* @__PURE__ */ new Map([
    ["nav", "navbar"],
    ["navigation", "navbar"],
    ["nav-bar", "navbar"],
    ["navigation-item", "nav-item"],
    ["nav item", "nav-item"],
    ["ul", "list"],
    ["items", "list"],
    ["li", "list-item"],
    ["btn", "button"],
    ["img", "image"],
    ["picture", "image"],
    ["heading", "title"],
    ["desc", "description"]
  ]);
  function synonymOf(name) {
    return SYNONYMS.get(name.trim().toLowerCase());
  }

  // src/naming.ts
  var DEFAULT_NAME = /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Arrow|Component|Instance|Text|Image|Section|Slice|Union|Subtract|Intersect|Exclude|Boolean|Auto layout|Container)( \d+)?$/;
  var SLOT_NAME = /^[a-z][A-Za-z0-9]*Slot$/;
  var ALL_CAPS_COMPONENTS = /* @__PURE__ */ new Set(["HEADER", "MAIN", "FOOTER", "DIALOG"]);
  var RAW_SHAPES = /* @__PURE__ */ new Set(["VECTOR", "RECTANGLE", "ELLIPSE", "LINE", "OTHER", "GROUP"]);
  var CONTAINERS = /* @__PURE__ */ new Set(["FRAME", "GROUP", "COMPONENT"]);
  var ICON_MAX = 32;
  function isDefaultFigmaName(name) {
    return DEFAULT_NAME.test(name.trim());
  }
  function normalizeComponentName(name) {
    const trimmed = name.trim();
    if (ALL_CAPS_COMPONENTS.has(trimmed)) return trimmed === name ? null : trimmed;
    let next;
    if (/^icon[_ ]/i.test(trimmed)) {
      next = kebab(trimmed).replace(/-/g, "_");
    } else {
      next = trimmed.split("/").map((part) => {
        const p = part.trim();
        const priv = p.startsWith("_");
        return (priv ? "_" : "") + kebab(priv ? p.slice(1) : p);
      }).join("/");
    }
    return next === name ? null : next;
  }
  function kebab(s) {
    return s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1-$2").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  function proposeLayerNames(root) {
    const out = [];
    const visit = (parent, parentName) => {
      const siblings = visible(parent);
      siblings.forEach((node, index) => {
        var _a;
        const ctx = { parent, siblings, index, isRootChild: parent === root, rootName: root.name, parentName };
        const rename2 = evaluate(node, ctx);
        if (rename2) out.push(rename2);
        const name = rename2 ? rename2.newName : (_a = synonymOf(node.name)) != null ? _a : node.name;
        if (node.kind !== "INSTANCE" && !isIconGlyph(node)) visit(node, name);
      });
    };
    visit(root, root.name);
    return out;
  }
  function evaluate(node, ctx) {
    var _a;
    const current = node.name;
    if (SLOT_NAME.test(current)) return null;
    if (isUnnamed(node, ctx.rootName)) {
      const pick2 = (_a = parentRule(node, ctx)) != null ? _a : propose(node, ctx);
      return pick2 && pick2.name !== current ? rename(node, pick2) : null;
    }
    const meaning = synonymOf(current);
    if (meaning) {
      if (!fitsVocabulary(node, meaning)) return null;
      return rename(node, { name: meaning, reason: `synonym of ${meaning}, vocabulary name suggested` }, true);
    }
    const fixed = current.trim().toLowerCase().replace(/\bstart\b/g, "left").replace(/\bend\b/g, "right");
    if (!vocabularyEntry(fixed)) return null;
    const byParent = parentRule(node, ctx);
    if (byParent) return byParent.name === current ? null : rename(node, byParent);
    if (fixed !== current && fitsVocabulary(node, fixed)) {
      return rename(node, { name: fixed, reason: `name is a vocabulary name with wrong casing or side -> ${fixed}` });
    }
    return null;
  }
  function rename(node, pick2, skip = false) {
    return { indexPath: node.indexPath, oldName: node.name, newName: pick2.name, reason: pick2.reason, skip, source: "rules", outsideVocabulary: false };
  }
  var CHILD_NAME = {
    table: "table-row",
    "table-body": "table-row",
    "table-row": "table-cell",
    "table-header": "header-cell",
    list: "list-item",
    stack: "item",
    grid: "item",
    tabs: "tab",
    navbar: "nav-item",
    menu: "menu-item",
    stepper: "step",
    actions: "button"
  };
  function parentRule(node, ctx) {
    const parent = ctx.parentName.trim().toLowerCase();
    const target = CHILD_NAME[parent];
    if (!target) return null;
    const why = `child of ${parent} -> `;
    if (node.kind === "TEXT") {
      return parent === "table-row" || parent === "table-header" ? { name: "label", reason: `${why}label` } : null;
    }
    const entry = node.kind === "INSTANCE" || CONTAINERS.has(node.kind) && visible(node).length > 0;
    if (!entry) return null;
    if (target === "table-row" && ctx.index === 0 && isHeaderRow(ctx.siblings)) {
      return { name: "table-header", reason: `first child of ${parent} has its own fill -> table-header` };
    }
    return { name: target, reason: `${why}${target}` };
  }
  function isHeaderRow(rows2) {
    const own = (n) => n.fills.filter((f) => f.opacity > 0).map((f) => f.hex);
    const first = own(rows2[0]);
    if (rows2.length < 2 || first.length === 0) return false;
    return rows2.slice(1).every((r) => !own(r).some((hex) => first.includes(hex)));
  }
  function fitsVocabulary(node, name) {
    const entry = vocabularyEntry(name);
    if (!entry) return false;
    if (entry.layer === "any") return true;
    return entry.layer === "text" === (node.kind === "TEXT");
  }
  function isUnnamed(layer, componentName) {
    const name = layer.name.trim();
    if (name === "" || isDefaultFigmaName(name) || name === componentName || looksLikeRandomTyping(name)) return true;
    return layer.text !== null && layer.text.characters.trim().startsWith(name);
  }
  var KNOWN_TOKENS = new Set(
    [].concat(...[...VOCABULARY.map((e) => e.name), ...SYNONYMS.keys()].map((n) => n.toLowerCase().split(/[\s\-_/]+/)))
  );
  function looksLikeRandomTyping(name) {
    const tokens = name.toLowerCase().replace(/[0-9]/g, "").split(/[\s\-_/]+/).filter((t) => t.length >= 3);
    return tokens.length > 0 && tokens.every(isMash);
  }
  function isMash(token) {
    if (KNOWN_TOKENS.has(token)) return false;
    if (!/[aeiouy]/.test(token)) return true;
    if (/(.)\1\1/.test(token)) return true;
    const seen = /* @__PURE__ */ new Set();
    for (let i = 0; i < token.length - 1; i++) {
      const pair = token.slice(i, i + 2);
      if (seen.has(pair)) return true;
      seen.add(pair);
    }
    return false;
  }
  function propose(node, ctx) {
    if (node.kind === "TEXT") return proposeText(node, ctx);
    if (node.kind === "INSTANCE") return proposeInstance(node, ctx);
    return proposeShapeOrFrame(node, ctx);
  }
  function proposeText(node, ctx) {
    var _a, _b;
    if (ctx.siblings.length === 1) return { name: "label", reason: "only child of its wrapper is this TEXT -> label" };
    if (isButtonLike(ctx.parent)) return { name: "label", reason: "TEXT inside a button-like frame -> label" };
    const size = (_b = (_a = node.text) == null ? void 0 : _a.fontSize) != null ? _b : 0;
    const peers = ctx.siblings.filter((s) => s !== node).map(peerFontSize).filter((n) => n !== null);
    if (peers.length === 0) return { name: "label", reason: "only TEXT at this level -> label" };
    const all = [size, ...peers];
    const max = Math.max(...all);
    const min = Math.min(...all);
    if (max > min && size === max) return { name: "title", reason: `largest font (${size}) among sibling texts -> title` };
    if (max > min && size === min) {
      return { name: "supporting text", reason: `loose TEXT smaller (${size}) than the other texts (${max}) -> supporting text` };
    }
    return { name: "label", reason: "TEXT neither largest nor smallest among siblings -> label" };
  }
  function peerFontSize(s) {
    var _a, _b, _c, _d;
    if (s.kind === "TEXT") return (_b = (_a = s.text) == null ? void 0 : _a.fontSize) != null ? _b : null;
    const only = singleTextChild(s);
    return only ? (_d = (_c = only.text) == null ? void 0 : _c.fontSize) != null ? _d : null : null;
  }
  function proposeInstance(node, ctx) {
    var _a;
    const main = (_a = node.mainComponentName) != null ? _a : "";
    if (/^icon/i.test(main) && !vocabularyEntry(main)) return iconPick(node, ctx, `instance of ${main}`);
    const base = kebab(main.split("/")[0].replace(/^_/, ""));
    const entry = vocabularyEntry(base);
    if (entry && entry.layer !== "text") return { name: base, reason: `instance of ${main} -> ${base}` };
    if (isIconish(node)) return iconPick(node, ctx, `small square instance (${node.width}px)`);
    return null;
  }
  function proposeShapeOrFrame(node, ctx) {
    const kids = visible(node);
    const thin = Math.min(node.width, node.height) <= 1 && Math.max(node.width, node.height) > 1;
    if (node.isMask) return { name: "mask", reason: "layer is used as a mask -> mask" };
    if (node.kind === "LINE" || thin && kids.length === 0) return { name: "divider", reason: "1px line between siblings -> divider" };
    if (node.hasImageFill) {
      const circle = node.kind === "ELLIPSE" || node.width === node.height && node.corners.tl >= node.width / 2;
      return circle ? { name: "avatar", reason: "circle with image fill -> avatar" } : { name: "image", reason: "image fill -> image" };
    }
    if (isIconGlyph(node)) return iconPick(node, ctx, `small square ${node.kind.toLowerCase()} (${node.width}px)`);
    if (CONTAINERS.has(node.kind) && kids.length > 0 && kids.length <= 2 && kids.every(isIconish)) {
      return { name: "icon-wrapper", reason: `frame holding ${kids.length} icon(s) -> icon-wrapper` };
    }
    if (kids.length === 0) return proposeDecoration(node, ctx);
    if (!CONTAINERS.has(node.kind)) return null;
    const region = regionPick(ctx);
    if (region) return region;
    const group = sameShapedGroup(node, ctx);
    if (singleTextChild(node)) {
      if (group.length >= 3) {
        return { name: "item", reason: `only child is one TEXT, ${group.length} same-shaped siblings -> item${listHint(node, ctx, group)}` };
      }
      return { name: "text-content", reason: "only child is one TEXT, no repeated siblings -> text-content" };
    }
    if (kids.every(isButtonish)) return { name: "actions", reason: `holds only buttons (${kids.length}) -> actions` };
    if (isButtonLike(node)) return { name: "button", reason: "padded frame with fill, one TEXT and icons -> button" };
    if (kids.length >= 2 && kids.every((k) => k.kind === "TEXT") && node.layout.mode !== "HORIZONTAL") {
      return { name: "text-content", reason: `stacks ${kids.length} TEXT layers -> text-content` };
    }
    if (kids.length >= 3 && kids.every((k) => signature(k) === signature(kids[0]))) {
      return { name: "list", reason: `parent of ${kids.length} same-shaped children -> list` };
    }
    if (node.layout.wrap) return { name: "grid", reason: "auto-layout with wrap -> grid" };
    if (kids.length === 1 && CONTAINERS.has(kids[0].kind) && hasPadding(node)) {
      return { name: "inner", reason: "single child frame with padding -> inner" };
    }
    if (group.length >= 3) {
      return { name: "item", reason: `${group.length} same-shaped siblings -> item${listHint(node, ctx, group)}` };
    }
    return genericPick(node, ctx, kids);
  }
  function genericPick(node, ctx, kids) {
    const mode = node.layout.mode;
    if (node.kind === "GROUP" && kids.length >= 2) return { name: "group", reason: "non-auto-layout group of 2+ layers -> group" };
    if (mode === "HORIZONTAL" && kids.length >= 2) return { name: "row", reason: `horizontal auto-layout with ${kids.length} children -> row` };
    if (mode === "VERTICAL" && ctx.parent.layout.mode === "HORIZONTAL") {
      const columns = ctx.siblings.filter((s) => CONTAINERS.has(s.kind) && s.layout.mode === "VERTICAL");
      if (columns.length >= 2) return { name: "column", reason: "vertical frame beside other vertical frames in a row -> column" };
    }
    if (mode !== "NONE" && !hasPaint(node)) return { name: "wrapper", reason: "auto-layout frame with no fill or stroke -> wrapper" };
    return { name: "container", reason: "frame with children and a fill or no layout -> container" };
  }
  function proposeDecoration(node, ctx) {
    const fills = node.fills.length > 0;
    const strokes = node.strokes.length > 0 && node.strokeWeight > 0;
    const last = ctx.index === ctx.siblings.length - 1;
    const coversParent = node.width === ctx.parent.width && node.height === ctx.parent.height;
    if (node.kind === "FRAME" && !fills && !strokes) {
      const fill = node.layout.widthSizing === "FILL" || node.layout.heightSizing === "FILL";
      return fill ? { name: "spacer", reason: "empty fill-container frame with no fill -> spacer" } : null;
    }
    if (strokes && !fills) return { name: "border", reason: "stroke-only layer -> border" };
    if (!fills || strokes || ctx.siblings.length < 2) return null;
    const translucent = node.fills.every((f) => f.opacity > 0 && f.opacity < 1);
    if (translucent && last && (coversParent || ctx.parent.layout.mode === "NONE")) {
      return { name: "overlay", reason: "semi-transparent fill on top of siblings -> overlay" };
    }
    if (ctx.index === 0 && (coversParent || ctx.parent.layout.mode === "NONE")) {
      return { name: "background", reason: "fill-only layer under its siblings -> background" };
    }
    return null;
  }
  function regionPick(ctx) {
    const s = ctx.siblings;
    if (ctx.parent.layout.mode !== "VERTICAL" || s.length !== 3) return null;
    if (!s.every((n) => CONTAINERS.has(n.kind) && visible(n).length > 0)) return null;
    if (new Set(s.map(signature)).size !== 3) return null;
    const [first, middle, last] = s;
    if (middle.height < Math.max(first.height, last.height)) return null;
    if (!hasDescendant(first, (n) => n.kind === "TEXT")) return null;
    const names = ["header", "content", "footer"];
    const why = ["first", "middle and tallest", "last"];
    return {
      name: names[ctx.index],
      reason: `${why[ctx.index]} of 3 stacked regions -> ${names[ctx.index]}`
    };
  }
  function iconPick(node, ctx, signal) {
    if (ctx.parentName === "icon-wrapper") {
      const icons = ctx.siblings.filter(isIconish);
      const label = ctx.siblings.findIndex((s) => s.kind === "TEXT");
      let side = null;
      if (label >= 0) side = ctx.index < label ? "left" : "right";
      else if (icons.length === 2) side = icons[0] === node ? "left" : "right";
      if (side) return { name: `${side} icon`, reason: `${signal}, ${side} of the label inside icon-wrapper -> ${side} icon` };
    }
    return { name: "icon", reason: `${signal} -> icon` };
  }
  function listHint(node, ctx, group) {
    const parentIsList = !ctx.isRootChild && group.length === ctx.siblings.length;
    if (parentIsList || group[0] !== node) return "";
    return " (hint: these could be wrapped in a list; not done, regrouping changes the tree)";
  }
  function sameShapedGroup(node, ctx) {
    const sig = signature(node);
    return ctx.siblings.filter((s) => signature(s) === sig);
  }
  function signature(n) {
    var _a, _b, _c;
    const l = n.layout;
    const w = l.widthSizing === "FIXED" ? `${l.widthSizing}:${n.width}` : l.widthSizing;
    const h = l.heightSizing === "FIXED" ? `${l.heightSizing}:${n.height}` : l.heightSizing;
    const own = [n.kind, l.mode, l.wrap, w, h, (_b = (_a = n.text) == null ? void 0 : _a.fontSize) != null ? _b : "", (_c = n.mainComponentName) != null ? _c : ""].join("|");
    if (n.kind === "INSTANCE") return own;
    return `${own}[${visible(n).map(signature).join(",")}]`;
  }
  function visible(n) {
    return n.children.filter((c) => c.visible);
  }
  function singleTextChild(n) {
    if (!CONTAINERS.has(n.kind)) return null;
    const kids = visible(n);
    return kids.length === 1 && kids[0].kind === "TEXT" ? kids[0] : null;
  }
  function isIconish(n) {
    var _a;
    if (n.kind === "INSTANCE" && /^icon/i.test((_a = n.mainComponentName) != null ? _a : "")) return true;
    if (!["VECTOR", "INSTANCE", "FRAME", "GROUP", "COMPONENT"].includes(n.kind)) return false;
    const square = n.width > 0 && n.width <= ICON_MAX && n.height <= ICON_MAX && Math.abs(n.width - n.height) <= 1;
    return square && !hasDescendant(n, (d) => d.kind === "TEXT");
  }
  function isIconGlyph(n) {
    return n.kind !== "INSTANCE" && isIconish(n) && visible(n).every((c) => RAW_SHAPES.has(c.kind));
  }
  function isButtonish(n) {
    var _a;
    if (n.kind === "INSTANCE") return /^_?button/i.test((_a = n.mainComponentName) != null ? _a : "");
    return isButtonLike(n);
  }
  function isButtonLike(n) {
    if (!CONTAINERS.has(n.kind) || !hasPaint(n) || !hasPadding(n) || n.layout.mode !== "HORIZONTAL") return false;
    const kids = visible(n);
    const texts = kids.filter((k) => k.kind === "TEXT");
    return texts.length === 1 && kids.every((k) => k.kind === "TEXT" || isIconish(k));
  }
  function hasPaint(n) {
    return n.fills.length > 0 || n.strokes.length > 0 && n.strokeWeight > 0;
  }
  function hasPadding(n) {
    const l = n.layout;
    return l.paddingLeft + l.paddingRight + l.paddingTop + l.paddingBottom > 0;
  }
  function hasDescendant(n, test) {
    return visible(n).some((c) => test(c) || c.kind !== "INSTANCE" && hasDescendant(c, test));
  }

  // src/tokenNames.ts
  var TOKEN_STATES = [
    "enabled",
    "hover",
    "pressed",
    "focus",
    "disabled",
    "loading",
    "selected",
    "visited",
    "error",
    "active",
    "inactive"
  ];
  var CATEGORIES = ["color", "spacing", "shape"];
  var SPACING_PROPERTIES = [
    "padding",
    "paddingX",
    "paddingY",
    "paddingTop",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "gap"
  ];
  var SHAPE_PROPERTIES = [
    "cornerRadius",
    "stroke",
    "shadowY",
    "elevation",
    "height",
    "width",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight",
    "diameter",
    "size",
    "sizeX",
    "sizeY"
  ];
  var SIDES = ["Top", "Bottom", "Left", "Right", "TopLeft", "TopRight", "BottomLeft", "BottomRight"];
  var KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
  var PREFIX_SEGMENT = /^_?[a-z0-9]+(-[a-z0-9]+)*$/;
  function toSegment(raw) {
    return raw.trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  }
  function componentSegments(component) {
    return component.split("/").map((s) => {
      const lead = s.trim().startsWith("_") ? "_" : "";
      return lead + toSegment(s);
    }).filter((s) => s.length > 0 && s !== "_");
  }
  function normalizeState(state) {
    const s = toSegment(state);
    if (s === "focused") return "focus";
    if (s === "default") return "enabled";
    return s;
  }
  function buildTokenName(p) {
    const segs = componentSegments(p.component);
    if (segs.length === 0) throw new Error("Token name needs a component");
    if (p.part) segs.push(toSegment(p.part));
    segs.push(p.category);
    if (p.category === "color") {
      if (!p.element) throw new Error("Color token needs an element");
      if (p.variant) segs.push(toSegment(p.variant));
      segs.push(toSegment(p.element));
      if (p.state) segs.push(normalizeState(p.state));
    } else {
      if (!p.property) throw new Error(`${p.category} token needs a property`);
      if (p.sizeVariant) segs.push(toSegment(p.sizeVariant));
      segs.push(p.property);
      if (p.category === "shape" && p.state) segs.push(normalizeState(p.state));
    }
    return segs.filter((s) => s.length > 0).join("/");
  }
  function isState(s) {
    return TOKEN_STATES.includes(s);
  }
  function isSpacingProperty(s) {
    return SPACING_PROPERTIES.includes(s) || /^[a-z][a-zA-Z0-9]*Gap$/.test(s);
  }
  function isShapeProperty(s) {
    if (SHAPE_PROPERTIES.includes(s)) return true;
    return ["cornerRadius", "stroke"].some((base) => SIDES.some((side) => s === base + side));
  }
  function validTail(category, tail) {
    if (category === "color") {
      if (tail.length < 1 || tail.length > 3) return false;
      if (!tail.every((s) => KEBAB.test(s))) return false;
      return tail.length < 3 || isState(tail[2]);
    }
    if (category === "spacing") {
      if (tail.length === 1) return isSpacingProperty(tail[0]);
      if (tail.length === 2) return KEBAB.test(tail[0]) && isSpacingProperty(tail[1]);
      return false;
    }
    if (tail.length === 1) return isShapeProperty(tail[0]);
    if (tail.length === 2) {
      if (isShapeProperty(tail[0]) && isState(tail[1])) return true;
      return KEBAB.test(tail[0]) && isShapeProperty(tail[1]);
    }
    if (tail.length === 3) return KEBAB.test(tail[0]) && isShapeProperty(tail[1]) && isState(tail[2]);
    return false;
  }
  function isValidComponentTokenName(name) {
    if (typeof name !== "string" || name.length === 0 || /\s/.test(name)) return false;
    const segs = name.split("/");
    if (segs.some((s) => s.length === 0)) return false;
    for (let i = 1; i <= 3 && i < segs.length; i++) {
      if (!CATEGORIES.includes(segs[i])) continue;
      const prefix = segs.slice(0, i);
      if (!prefix.every((s) => PREFIX_SEGMENT.test(s))) return false;
      return validTail(segs[i], segs.slice(i + 1));
    }
    return false;
  }
  function paddingProperties(l, r, t, b) {
    if (l === r && r === t && t === b) {
      return [{ property: "padding", value: l, sides: ["left", "right", "top", "bottom"] }];
    }
    if (l === r && t === b) {
      return [
        { property: "paddingX", value: l, sides: ["left", "right"] },
        { property: "paddingY", value: t, sides: ["top", "bottom"] }
      ];
    }
    return [
      { property: "paddingLeft", value: l, sides: ["left"] },
      { property: "paddingRight", value: r, sides: ["right"] },
      { property: "paddingTop", value: t, sides: ["top"] },
      { property: "paddingBottom", value: b, sides: ["bottom"] }
    ];
  }

  // src/match.ts
  var GLOBAL = "_global";
  var TRANSPARENT = "color/transparent";
  var modeKey = (s) => s.trim().toLowerCase();
  function findMode(keys, mode) {
    if (!mode) return void 0;
    const want = modeKey(mode);
    return keys.find((k) => modeKey(k) === want);
  }
  function pickMode(keys, mode, fallbacks) {
    for (const m of [mode, ...fallbacks]) {
      const hit = findMode(keys, m);
      if (hit !== void 0) return hit;
    }
    return keys[0];
  }
  function resolveValue(v, mode, fallbacks) {
    const key = pickMode(Object.keys(v.values), mode, fallbacks);
    return key === void 0 ? void 0 : v.values[key];
  }
  var PREFERRED_MODES = [
    { collection: "color", modes: ["light"], fallbacks: [], noun: "colors" },
    { collection: "dimensions", modes: ["desktop", "mobile"], fallbacks: ["desktop"], noun: "values" },
    { collection: GLOBAL, modes: ["global"], fallbacks: [], noun: "values" }
  ];
  function modeWarnings(catalog) {
    const warnings = [];
    for (const { collection, modes, fallbacks, noun } of PREFERRED_MODES) {
      const keys = [];
      for (const v of catalog.variables) {
        if (v.collection !== collection) continue;
        for (const k of Object.keys(v.values)) if (!keys.includes(k)) keys.push(k);
      }
      if (keys.length === 0) continue;
      const missing = modes.filter((m) => findMode(keys, m) === void 0);
      if (missing.length === 0) continue;
      const used = [...new Set(missing.map((m) => pickMode(keys, m, fallbacks)))];
      warnings.push(
        `Collection "${collection}" has no ${missing.map((m) => `"${m}"`).join(" or ")} mode (modes: ${keys.join(", ")}); ${noun} were compared against ${used.map((u) => `"${u}"`).join(", ")}.`
      );
    }
    return warnings;
  }
  function byDistanceThenName(a, b) {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.variable.name < b.variable.name ? -1 : a.variable.name > b.variable.name ? 1 : 0;
  }
  function numberCandidates(value, vars, mode, fallbacks) {
    var _a;
    const out = [];
    for (const variable of vars) {
      const n = (_a = resolveValue(variable, mode, fallbacks)) == null ? void 0 : _a.number;
      if (typeof n !== "number") continue;
      const distance = Math.abs(n - value);
      out.push({ variable, exact: distance === 0, distance });
    }
    return out.sort(byDistanceThenName);
  }
  function inGroup(v, group) {
    return v.name.startsWith(`${group}/`) || v.name.startsWith(`dimensions/${group}/`);
  }
  function matchNumber(value, group, catalog, mode) {
    const dims = catalog.variables.filter(
      (v) => v.collection === "dimensions" && v.type === "FLOAT" && inGroup(v, group)
    );
    const primary = numberCandidates(value, dims, mode, ["desktop"]);
    if (group !== "size" || primary.some((c) => c.exact)) return primary;
    const metrics = catalog.variables.filter(
      (v) => v.collection === GLOBAL && v.type === "FLOAT" && v.name.startsWith("metrics/")
    );
    const fallback = numberCandidates(value, metrics, mode, ["global"]);
    return [...primary, ...fallback].sort((a, b) => {
      const d = byDistanceThenName(a, b);
      if (a.exact === b.exact && a.distance === b.distance) {
        const ac = a.variable.collection === "dimensions" ? 0 : 1;
        const bc = b.variable.collection === "dimensions" ? 0 : 1;
        if (ac !== bc) return ac - bc;
      }
      return d;
    });
  }
  function normalizeHex(hex) {
    const h = hex.trim().replace(/^#/, "").toUpperCase();
    return `#${h}`;
  }
  function rgb(hex) {
    const h = normalizeHex(hex).slice(1);
    if (!/^[0-9A-F]{6}$/.test(h)) return null;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function colorDistance(hexA, opA, hexB, opB) {
    if (opA === 0 && opB === 0) return 0;
    const a = rgb(hexA);
    const b = rgb(hexB);
    if (!a || !b) return Number.POSITIVE_INFINITY;
    const d = Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
    return d + Math.abs(opA - opB) * 255;
  }
  var FAMILIES = {
    background: { prefixes: ["color/surface/", "color/background/primary"], preferred: "color/surface/" },
    text: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    icon: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    border: { prefixes: ["color/border/"], preferred: "color/border/" },
    other: { prefixes: ["color/"], preferred: null }
  };
  var withTransparent = (role) => role === "border" || role === "other";
  function inRoleFamily(v, role) {
    if (v.collection === GLOBAL) return v.name === TRANSPARENT && withTransparent(role);
    return v.collection === "color" && inFamily(v.name, FAMILIES[role].prefixes);
  }
  function inFamily(name, prefixes) {
    return prefixes.some((p) => p.endsWith("/") ? name.startsWith(p) : name === p);
  }
  function preferEnabled(cands, preferred) {
    const rank = (c) => c.variable.name === preferred ? 0 : c.variable.name.split("/").pop() === "enabled" ? 1 : 2;
    return cands.map((c, i) => ({ c, i })).sort((a, b) => Number(b.c.exact) - Number(a.c.exact) || a.c.distance - b.c.distance || rank(a.c) - rank(b.c) || a.i - b.i).map((x) => x.c);
  }
  function colorFamily(role) {
    return FAMILIES[role].prefixes;
  }
  function matchColor(hex, opacity, role, catalog, mode) {
    var _a, _b;
    const family = FAMILIES[role];
    const vars = catalog.variables.filter(
      (v) => v.type === "COLOR" && (v.collection === "color" && inFamily(v.name, family.prefixes) || v.collection === GLOBAL && v.name === TRANSPARENT && withTransparent(role))
    );
    const fit2 = (v) => {
      if (v.collection === GLOBAL) return role === "border" ? 0 : 1;
      if (family.preferred && v.name.startsWith(family.preferred)) return 0;
      return 1;
    };
    const out = [];
    for (const variable of vars) {
      const value = resolveValue(variable, mode != null ? mode : "light", variable.collection === GLOBAL ? ["global"] : ["light"]);
      if (!(value == null ? void 0 : value.hex)) continue;
      const distance = colorDistance(hex, opacity, value.hex, (_a = value.opacity) != null ? _a : 1);
      if (!Number.isFinite(distance)) continue;
      if (variable.collection === GLOBAL && opacity !== 0 && ((_b = value.opacity) != null ? _b : 1) === 0) continue;
      out.push({ variable, exact: distance === 0, distance });
    }
    return out.sort((a, b) => {
      if (a.exact !== b.exact) return a.exact ? -1 : 1;
      if (a.distance !== b.distance) return a.distance - b.distance;
      const f = fit2(a.variable) - fit2(b.variable);
      if (f !== 0) return f;
      return a.variable.name < b.variable.name ? -1 : a.variable.name > b.variable.name ? 1 : 0;
    });
  }

  // src/types.ts
  var TYPOGRAPHY_FIELDS = ["fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing"];
  var NAMING_NAMESPACE = "component_studio";
  var NAMING_KEY = "naming_proposal";
  var TOKENS_KEY = "token_proposal";
  var COMPONENT_ID_KEY = "componentId";

  // src/typography.ts
  var TOLERANCE = 0.01;
  var SIZE_NAME = /^font\/size\/([^/]+)\/([^/]+)$/;
  var norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  function rolesOf(catalog) {
    const typo = catalog.variables.filter((v) => v.collection.trim().toLowerCase() === "typography");
    const byName2 = new Map(typo.map((v) => [v.name, v]));
    const roles = [];
    for (const v of typo) {
      const m = SIZE_NAME.exec(v.name);
      if (!m || v.type !== "FLOAT") continue;
      const [, role, size] = m;
      roles.push({
        role: `${role}/${size}`,
        vars: {
          fontFamily: byName2.get(`font/family/${role}`),
          fontSize: v,
          lineHeight: byName2.get(`line-height/${role}/${size}`),
          letterSpacing: byName2.get(`letter-spacing/${role}/${size}`)
        },
        weights: typo.filter((w) => w.type === "STRING" && w.name.startsWith("font/weight/") && w.name.endsWith(`/${role}`) && w.name.split("/").length === 4)
      });
    }
    return roles.sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
  }
  var str = (v, mode) => {
    var _a;
    return v ? (_a = resolveValue(v, mode, ["desktop"])) == null ? void 0 : _a.string : void 0;
  };
  var num = (v, mode) => {
    var _a;
    return v ? (_a = resolveValue(v, mode, ["desktop"])) == null ? void 0 : _a.number : void 0;
  };
  function px(m, fontSize) {
    if (m.unit === "AUTO" || m.value === void 0) return null;
    return m.unit === "PERCENT" ? m.value * fontSize / 100 : m.value;
  }
  function show(field, s) {
    if (field === "fontFamily") return s.fontFamily;
    if (field === "fontStyle") return s.fontStyle;
    if (field === "fontSize") return String(s.fontSize);
    const n = px(field === "lineHeight" ? s.lineHeight : s.letterSpacing, s.fontSize);
    return n === null ? "auto" : String(Math.round(n * 100) / 100);
  }
  function fit(role, style, mode) {
    var _a;
    const family = str(role.vars.fontFamily, mode);
    const weight = (_a = role.weights.find((w) => norm(w.name.split("/")[2]) === norm(style.fontFamily))) != null ? _a : role.weights.find((w) => family !== void 0 && norm(w.name.split("/")[2]) === norm(family));
    const vars = __spreadProps(__spreadValues({}, role.vars), { fontStyle: weight });
    const diffs = [];
    let score = 0;
    let exact = true;
    for (const field of TYPOGRAPHY_FIELDS) {
      if (field === "lineHeight" && style.lineHeight.unit === "AUTO") continue;
      const v = vars[field];
      let have;
      let same;
      if (field === "fontFamily" || field === "fontStyle") {
        have = str(v, mode);
        same = have === (field === "fontFamily" ? style.fontFamily : style.fontStyle);
      } else {
        have = num(v, mode);
        const want = field === "fontSize" ? style.fontSize : px(field === "lineHeight" ? style.lineHeight : style.letterSpacing, style.fontSize);
        same = typeof have === "number" && want !== null && Math.abs(have - want) < TOLERANCE;
      }
      if (same) score++;
      else {
        exact = false;
        diffs.push(v ? `${field} ${show(field, style)} -> ${have != null ? have : "?"}` : `no ${field} variable`);
      }
    }
    const size = num(role.vars.fontSize, mode);
    return { role, vars, exact, score, diffs, distance: typeof size === "number" ? Math.abs(size - style.fontSize) : Infinity };
  }
  function pick(fits, layerName) {
    var _a;
    const named = toSegment(layerName);
    const prefers = (f) => f.role.role.split("/")[0] === named ? 0 : 1;
    const exact = fits.filter((f) => f.exact).sort((a, b) => prefers(a) - prefers(b));
    if (exact.length) return exact[0];
    return (_a = [...fits].sort((a, b) => b.score - a.score || prefers(a) - prefers(b) || a.distance - b.distance)[0]) != null ? _a : null;
  }
  function proposeTypography(scan, catalog, warnings) {
    var _a, _b;
    const roles = rolesOf(catalog);
    if (!roles.length) return [];
    const found = [];
    const mixed = /* @__PURE__ */ new Set();
    let autoLine = false;
    for (const variant of scan.variants) {
      const mode = ((_a = variant.props.layout) != null ? _a : "").toLowerCase() === "mobile" ? "mobile" : "desktop";
      const walk = (layer) => {
        var _a2;
        if (!layer.visible) return;
        layer.children.forEach(walk);
        if (layer.kind !== "TEXT" || !layer.text) return;
        const style = layer.text.style;
        if (style === void 0) return;
        if (style === null) {
          mixed.add(layer.name);
          return;
        }
        const fits = roles.map((r) => fit(r, style, mode));
        const best = pick(fits, layer.name);
        if (!best) return;
        const bound = (_a2 = layer.text.bound) != null ? _a2 : {};
        const fields = TYPOGRAPHY_FIELDS.filter(
          (f) => !bound[f] && !!best.vars[f] && !(f === "lineHeight" && style.lineHeight.unit === "AUTO")
        );
        if (!fields.length) return;
        if (style.lineHeight.unit === "AUTO" && !bound.lineHeight) autoLine = true;
        const twins = best.exact ? fits.filter((f) => f.exact && f !== best).map((f) => f.role.role) : [];
        found.push({ fit: best, twins, use: { variantId: variant.id, indexPath: layer.indexPath, layerName: layer.name, fields, expect: style } });
      };
      walk(variant.root);
    }
    for (const name of [...mixed].sort()) warnings.push(`"${name}": mixed text styles in one layer; typography not bound.`);
    const groups = /* @__PURE__ */ new Map();
    for (const f of found) {
      const key = `typography|${f.fit.role.role}|${f.fit.exact ? "exact" : "manual"}`;
      groups.set(key, [...(_b = groups.get(key)) != null ? _b : [], f]);
    }
    const rows2 = [];
    for (const [key, list] of groups) {
      const { fit: best } = list[0];
      const bindings = {};
      for (const field of TYPOGRAPHY_FIELDS) if (list.some((f) => f.use.fields.includes(field))) bindings[field] = best.vars[field].id;
      const notes = [];
      if (best.exact) {
        notes.push(`Matches ${best.role.role}.`);
        const twins = [...new Set(list.flatMap((f) => f.twins))];
        if (twins.length) notes.push(`Same values as ${twins.join(", ")}.`);
      } else {
        const diffs = [...new Set(list.flatMap((f) => f.fit.diffs))];
        notes.push(`No role matches all values; closest is ${best.role.role} (${diffs.join(", ")}); changes the look.`);
      }
      const auto = list.some((f) => f.use.expect.lineHeight.unit === "AUTO");
      if (auto && autoLine) notes.push("Line height is auto and no typography variable represents auto; left unbound.");
      rows2.push({
        key,
        role: best.role.role,
        match: best.exact ? "exact" : "manual",
        bindings,
        uses: list.map((f) => f.use),
        note: notes.join(" "),
        skip: !best.exact
      });
    }
    return rows2.sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
  }

  // src/proposal.ts
  var MODES = ["desktop", "mobile"];
  var LAYOUT = "layout";
  var SIZE = "size";
  var STATE = "state";
  var NUMBER_TOLERANCE_ABS = 2;
  var NUMBER_TOLERANCE_REL = 0.25;
  var COLOR_TOLERANCE = 32;
  var MAX_NEAREST_CANDIDATES = 3;
  var PILL_RADIUS = 999;
  var NO_OVERRIDES = { layers: /* @__PURE__ */ new Map(), tokens: /* @__PURE__ */ new Map() };
  var fillKey = (variantId, path) => `${variantId}|${pathKey(path)}`;
  var PADDING_FIELDS = /* @__PURE__ */ new Set(["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"]);
  var CORNER_FIELDS = /* @__PURE__ */ new Set(["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"]);
  var SIZE_FIELDS = /* @__PURE__ */ new Set(["width", "height", "minWidth", "maxWidth", "minHeight", "maxHeight"]);
  var pathKey = (p) => p.join(".");
  function cmp(a, b) {
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function locate(root, path) {
    let node = root;
    let hidden = !root.visible;
    for (const i of path) {
      const next = node.children[i];
      if (!next) return { node: null, hidden };
      node = next;
      if (!node.visible) hidden = true;
    }
    return { node, hidden };
  }
  function isConformantComponentName(name) {
    return /^[A-Z]+(-[A-Z]+)*$/.test(name) || /^_?[a-z0-9]+(-[a-z0-9]+)*(\/[a-z0-9]+(-[a-z0-9]+)*)*$/.test(name) || /^icon(_[a-z0-9]+)+$/.test(name);
  }
  function axisSegment(axis, value) {
    const v = value.trim().toLowerCase();
    if (axis === "value") return v === "false" ? "unchecked" : v === "true" || v === "mixed" ? "checked" : toSegment(v);
    if (axis === "active" && (v === "true" || v === "false")) return v === "true" ? "active" : "inactive";
    if (v === "true") return toSegment(axis);
    if (v === "false") return `not-${toSegment(axis)}`;
    return toSegment(v);
  }
  function sortUses(uses) {
    return [...uses].sort(
      (a, b) => {
        var _a, _b;
        return cmp(a.variantId, b.variantId) || cmp(pathKey(a.indexPath), pathKey(b.indexPath)) || cmp(a.field, b.field) || ((_a = a.paintIndex) != null ? _a : -1) - ((_b = b.paintIndex) != null ? _b : -1);
      }
    );
  }
  function paddingForm(l, r, t, b) {
    return paddingProperties(l, r, t, b).length;
  }
  function cornerForm(c) {
    if (c.tl === c.tr && c.tr === c.bl && c.bl === c.br) return "all";
    if (c.tl === c.tr && c.bl === c.br) return "tb";
    if (c.tl === c.bl && c.tr === c.br) return "lr";
    return "corners";
  }
  function mergeCornerForms(forms) {
    if (forms.has("corners") || forms.has("tb") && forms.has("lr")) return "corners";
    if (forms.has("tb")) return "tb";
    if (forms.has("lr")) return "lr";
    return "all";
  }
  function paddingProperty(field, form) {
    if (form === 1) return "padding";
    if (form === 2) return field === "paddingLeft" || field === "paddingRight" ? "paddingX" : "paddingY";
    return field;
  }
  function cornerProperty(field, form) {
    const top = field.startsWith("top");
    const left = field.includes("Left");
    if (form === "all") return "cornerRadius";
    if (form === "tb") return top ? "cornerRadiusTop" : "cornerRadiusBottom";
    if (form === "lr") return left ? "cornerRadiusLeft" : "cornerRadiusRight";
    return `cornerRadius${top ? "Top" : "Bottom"}${left ? "Left" : "Right"}`;
  }
  function displayNumber(n) {
    return String(n);
  }
  function displayColor(hex, opacity) {
    const h = normalizeHex(hex);
    return opacity === 1 ? h : `${h} @ ${opacity}`;
  }
  function slotKey(i) {
    var _a, _b, _c;
    return `${(_a = i.part) != null ? _a : ""}|${i.category}|${(_c = (_b = i.element) != null ? _b : i.property) != null ? _c : ""}`;
  }
  function surfaceRest(name) {
    const prefix = "color/surface/";
    if (!name.startsWith(prefix)) return null;
    const segs = name.slice(prefix.length).split("/");
    if (segs[0] === "feedback") return segs.slice(0, 2).join("/");
    if (segs.length > 1 && TOKEN_STATES.includes(segs[segs.length - 1])) segs.pop();
    return segs.join("/");
  }
  function ownTokenPrefix(componentName) {
    return buildTokenName({ component: componentName, category: "color", element: "x" }).slice(0, -"color/x".length);
  }
  function buildProposal(scan, catalog, renames, componentName, assume = [], otherComponents = []) {
    const owner = { rootId: scan.id, foreign: foreignPrefixes(otherComponents, componentName) };
    const first = buildOnce(scan, catalog, renames, componentName, NO_OVERRIDES, owner);
    const overrides = surfaceOverrides(first, catalog, assume);
    const result = overrides.layers.size || overrides.tokens.size ? buildOnce(scan, catalog, renames, componentName, overrides, owner) : first;
    const warnings = result.warnings.slice();
    const typography = proposeTypography(scan, catalog, warnings);
    return __spreadProps(__spreadValues({}, result), { typography, warnings });
  }
  var TOKEN_RENAME_NOTE = "No visible change. Renaming tokens can break developers' code.";
  function countTokenRenames(scan, catalog, componentName, otherComponents = []) {
    return buildProposal(scan, catalog, [], componentName, [], otherComponents).tokens.filter((t) => t.kind === "rename").length;
  }
  function foreignPrefixes(otherComponents, componentName) {
    var _a;
    const own = ownTokenPrefix(componentName);
    const out = /* @__PURE__ */ new Set();
    for (const n of otherComponents) {
      if (!/[a-z0-9]/i.test(n)) continue;
      const p = ownTokenPrefix((_a = normalizeComponentName(n)) != null ? _a : n);
      if (p !== own) out.add(p);
    }
    return [...out];
  }
  function belongsTo(token, owner) {
    if (token.componentId) return token.componentId === owner.rootId;
    return !owner.foreign.some((p) => token.name.startsWith(p));
  }
  function isSurface(v) {
    return v.collection === "color" && (v.name === PAGE || surfaceRest(v.name) !== null);
  }
  function surfaceOverrides(p, catalog, assume) {
    var _a;
    const choices = new Map(assume.map((c) => [c.key, c]));
    const out = { layers: /* @__PURE__ */ new Map(), tokens: /* @__PURE__ */ new Map() };
    const consider = (uses, alias, apply, aliasChangeOf) => {
      const target = apply && alias.desktop ? catalog.variables.find((v) => v.id === alias.desktop) : void 0;
      if (!target || !isSurface(target)) return;
      for (const u of uses) if (u.kind === "color" && u.field === "fills" && u.role === "background") out.layers.set(fillKey(u.variantId, u.indexPath), target.id);
      const token = aliasChangeOf ? catalog.variables.find((v) => v.collection === "components" && v.name === aliasChangeOf) : void 0;
      if (token) out.tokens.set(token.id, target.id);
    };
    for (const t of p.tokens) {
      const c = choices.get(t.key);
      consider(t.uses, (_a = c == null ? void 0 : c.alias) != null ? _a : t.alias, c ? c.apply : !t.skip, t.kind === "alias-change" ? t.name : null);
    }
    for (const u of p.unmatched) {
      const c = choices.get(u.key);
      if (c) consider(u.uses, c.alias, c.apply, null);
    }
    return out;
  }
  function buildOnce(scan, catalog, renames, componentName, overrides, owner) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k;
    const warnings = modeWarnings(catalog);
    const renameMap = /* @__PURE__ */ new Map();
    for (const r of renames) if (!r.skip) renameMap.set(pathKey(r.indexPath), r.newName);
    const items = collectItems(scan, renameMap, catalog, overrides);
    splitColorConflicts(items);
    const axes = orderedAxes(scan);
    const hasLayout = LAYOUT in scan.variantProperties || scan.variants.some((v) => LAYOUT in v.props);
    const names = nameItems(items, axes, componentName);
    const prefix = ownTokenPrefix(componentName);
    const viaComponents = items.filter((i) => {
      var _a2;
      return ((_a2 = i.bound) == null ? void 0 : _a2.collection) === "components";
    });
    const regular = items.filter((i) => {
      var _a2;
      return ((_a2 = i.bound) == null ? void 0 : _a2.collection) !== "components";
    });
    const byName2 = /* @__PURE__ */ new Map();
    for (const i of regular) {
      const n = names.get(i);
      const list = (_a = byName2.get(n)) != null ? _a : [];
      list.push(i);
      byName2.set(n, list);
    }
    const groups = [];
    for (const [name, list] of byName2) {
      const desktop = new Set(list.filter((i) => !isMobile(i)).map((i) => i.valueKey));
      const mobile = new Set(list.filter(isMobile).map((i) => i.valueKey));
      if (desktop.size <= 1 && mobile.size <= 1) {
        groups.push({ name, items: list });
        continue;
      }
      const values = [...new Set(list.map((i) => i.display))].sort();
      warnings.push(
        `Token name "${name}" maps to different values (${values.join(", ")}); rename one row before applying.`
      );
      const byValue = /* @__PURE__ */ new Map();
      for (const i of list) byValue.set(i.valueKey, [...(_b = byValue.get(i.valueKey)) != null ? _b : [], i]);
      for (const sub of byValue.values()) groups.push({ name, items: sub });
    }
    groups.sort((a, b) => cmp(a.name, b.name) || cmp(a.items[0].valueKey, b.items[0].valueKey));
    const results = /* @__PURE__ */ new Map();
    const unmatched = [];
    const retargets = [];
    for (const g of groups) {
      const desktopItems = g.items.filter((i) => !isMobile(i));
      const mobileItems = g.items.filter(isMobile);
      const dSample = (_c = desktopItems[0]) != null ? _c : mobileItems[0];
      const mSample = (_d = mobileItems[0]) != null ? _d : dSample;
      const ctx = tieContext(g.items);
      const dRes = resolve(dSample, "desktop", catalog, ctx);
      const mRes = mSample === dSample ? resolve(dSample, "mobile", catalog, ctx) : resolve(mSample, "mobile", catalog, ctx);
      const notes = [];
      const slotNotes = [...new Set(g.items.map((i) => i.slotNote).filter((n) => !!n))].sort();
      notes.push(...slotNotes);
      if (dRes.note) notes.push(dRes.note);
      if (mSample !== dSample && mRes.note && mRes.note !== dRes.note) notes.push(`Mobile: ${mRes.note}`);
      const replaces = mSample !== dSample && mSample.valueKey !== dSample.valueKey ? `${dSample.display} (desktop) / ${mSample.display} (mobile)` : dSample.display;
      if (mSample === dSample || mSample.valueKey === dSample.valueKey) {
        const step = (_f = (_e = dRes.target) == null ? void 0 : _e.name) != null ? _f : "the same value";
        if (!hasLayout) notes.push(`No layout variant: desktop and mobile both alias ${step}.`);
        else if (mobileItems.length === 0) notes.push(`No mobile variant with this value: desktop and mobile both alias ${step}.`);
        else if (desktopItems.length === 0) notes.push(`Only mobile variants use this value: desktop and mobile both alias ${step}.`);
        else notes.push(`Same value in desktop and mobile variants: both modes alias ${step}.`);
      }
      const matchRank = { exact: 0, nearest: 1, none: 2 };
      const match = matchRank[dRes.match] >= matchRank[mRes.match] ? dRes.match : mRes.match;
      const alias = { desktop: dRes.alias, mobile: mRes.alias };
      const candidates = [.../* @__PURE__ */ new Set([...dRes.candidates, ...mRes.candidates])].filter(
        (id) => id !== alias.desktop && id !== alias.mobile
      );
      const uses = sortUses(g.items.map((i) => i.use));
      const wrap = g.items.some((i) => i.bound);
      const pairFix = (_g = dRes.pairFix) != null ? _g : mRes.pairFix;
      const fixLook = !!(dRes.fixLook || mRes.fixLook);
      const existing = catalog.variables.find((v) => v.collection === "components" && v.name === g.name);
      const type = dSample.category === "color" ? "COLOR" : "FLOAT";
      const retarget = !!existing && existing.type === type && !!existing.aliasOf && !sameAlias(currentAlias(existing), alias);
      if (existing && !retarget) checkExisting(existing, g.name, type, { desktop: dRes, mobile: mRes }, { desktop: dSample, mobile: mSample }, warnings);
      const key = `${g.name}|${replaces}`;
      if (match === "none") {
        const suggestion = (_i = (_h = dRes.suggestion) != null ? _h : mRes.suggestion) != null ? _i : null;
        const reason = [dRes.reason, mRes.reason !== dRes.reason ? mRes.reason : null].filter((r) => !!r).join(" ");
        unmatched.push({
          key,
          tokenName: g.name,
          type,
          display: `${g.name} (${replaces})`,
          uses,
          reason: reason || "No matching semantic token.",
          suggestion
        });
        continue;
      }
      if (pairFix) notes.unshift(pairFix);
      else if (wrap) notes.unshift(`Bound directly to ${shortName((_k = (_j = dSample.bound) == null ? void 0 : _j.name) != null ? _k : replaces)}; wrapped in a component token, look unchanged.`);
      const row = __spreadValues({
        key,
        name: g.name,
        status: existing ? "existing" : "new",
        type,
        alias,
        candidates,
        match: pairFix ? fixLook ? "manual" : "exact" : match,
        source: "match",
        replaces,
        uses,
        note: notes.length ? notes.join(" ") : null,
        skip: false
      }, wrap ? { kind: "wrap" } : {});
      results.set(g, row);
      if (retarget) retargets.push({ row, existing, sample: dSample });
    }
    const claimed = new Map(groups.map((g) => [g.name, describeItem(g.items[0])]));
    const recheck = recheckComponentTokens(viaComponents, names, claimed, catalog, prefix, owner, warnings);
    for (const { row, existing, sample } of retargets) toAliasChange(row, existing, sample, viaComponents, recheck.moved, catalog);
    warnUnusedTokens(catalog, prefix, viaComponents, warnings);
    const tokens = [...results.values(), ...recheck.rows].sort((a, b) => cmp(a.name, b.name) || cmp(a.key, b.key));
    unmatched.sort((a, b) => cmp(a.display, b.display) || cmp(a.reason, b.reason));
    const itemOf = new Map(items.map((i) => [i.use, i]));
    for (const row of [...tokens, ...unmatched]) {
      const sample = row.uses.map((u) => itemOf.get(u)).find((i) => i && isTextOrIcon(i));
      if (sample) row.pairOptions = pairIds(surfacePair(sample), catalog);
    }
    return {
      componentId: scan.id,
      componentName: scan.name,
      newComponentName: componentName === scan.name && isConformantComponentName(scan.name) ? null : componentName,
      renames,
      tokens,
      unmatched,
      warnings
    };
  }
  function currentAlias(v) {
    var _a;
    const keys = Object.keys((_a = v.aliasOf) != null ? _a : {});
    const at = (mode) => {
      var _a2;
      const k = (_a2 = findMode(keys, mode)) != null ? _a2 : keys[0];
      return k === void 0 ? null : v.aliasOf[k];
    };
    return { desktop: at("desktop"), mobile: at("mobile") };
  }
  function sameAlias(a, b) {
    return a.desktop === b.desktop && a.mobile === b.mobile;
  }
  function semanticOf(v, catalog, mode = "desktop") {
    let current = v;
    for (let depth = 0; current && depth < 16; depth++) {
      if (current.collection !== "components") return current;
      const next = currentAlias(current)[mode];
      current = next ? catalog.variables.find((x) => x.id === next) : void 0;
    }
    return null;
  }
  function surfaceLabel(v) {
    const rest = surfaceRest(v.name);
    return rest ? `surface ${rest}` : shortName(v.name);
  }
  function describeItem(i) {
    if (isRootFill(i)) return "component frame fill";
    if (i.use.kind === "number") return `"${i.layerName}" ${i.use.field}`;
    return `"${i.layerName}" ${i.use.field === "strokes" ? "border" : i.use.role === "background" ? "fill" : i.use.role}`;
  }
  function layerList(list) {
    return [...new Set(list.map((i) => i.layerName))].join(", ");
  }
  function familyCheck(item, semantic, catalog) {
    var _a, _b, _c;
    const role = item.use.role;
    if (item.use.kind !== "color" || role === "other" || !semantic) return null;
    if (semantic.collection !== "color" && !inRoleFamily(semantic, "border")) return null;
    const hex = item.use.hex;
    const opacity = (_a = item.use.opacity) != null ? _a : 1;
    if (role === "text" || role === "icon") {
      const pair = surfacePair(item);
      if (semantic.collection === "color" && allowedIn(semantic.name, pair)) return { role, pair, fix: null, same: true };
      const hit2 = pairedText(pair, hex, opacity, role, catalog);
      return { role, pair, fix: (_b = hit2 == null ? void 0 : hit2.variable) != null ? _b : null, same: !!(hit2 == null ? void 0 : hit2.exact) };
    }
    if (inRoleFamily(semantic, role)) return { role, fix: null, same: true };
    const hit = familyMember(role, hex, opacity, catalog);
    return { role, fix: (_c = hit == null ? void 0 : hit.variable) != null ? _c : null, same: !!(hit == null ? void 0 : hit.exact) };
  }
  function whyInvalid(v, role, pair) {
    return pair && inRoleFamily(v, role) ? `which does not pair with ${pair.label}` : `which is not a ${role} color`;
  }
  function fixSentence(role, fix, same, pair) {
    if (pair) {
      const where = pair.closestTo ? `${pair.label} (closest to ${pair.closestTo})` : pair.label;
      return `${role === "text" ? "Text" : "Icons"} on ${where} ${role === "text" ? "uses" : "use"} ${shortName(fix.name)}`;
    }
    return `${same ? "Same value as" : `Closest ${role} is`} ${shortName(fix.name)} (${lightText(fix)})`;
  }
  function fixGoal(c) {
    return c.pair ? `to pair with ${c.pair.label}` : `to fit the ${c.role} colors`;
  }
  function lookText(same) {
    return same ? "look unchanged" : "changes the look";
  }
  function resolveBound(item, bound, catalog) {
    const check = familyCheck(item, bound, catalog);
    const exact = { match: "exact", candidates: [], note: null, reason: null };
    if (check == null ? void 0 : check.fix) {
      return __spreadProps(__spreadValues({}, exact), {
        alias: check.fix.id,
        target: check.fix,
        pairFix: `Bound directly to ${shortName(bound.name)}, ${whyInvalid(bound, check.role, check.pair)}. ${fixSentence(check.role, check.fix, check.same, check.pair)}; ${lookText(check.same)}.`,
        fixLook: !check.same
      });
    }
    return __spreadProps(__spreadValues({}, exact), { alias: bound.id, target: bound });
  }
  function recheckComponentTokens(via, names, claimed, catalog, prefix, owner, warnings) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const rows2 = [];
    const moved = /* @__PURE__ */ new Map();
    const byToken = /* @__PURE__ */ new Map();
    for (const i of via) byToken.set(i.bound.id, [...(_a = byToken.get(i.bound.id)) != null ? _a : [], i]);
    const renameTargets = /* @__PURE__ */ new Set();
    for (const list of byToken.values()) {
      const token = list[0].bound;
      const now = currentAlias(token);
      const semantic = semanticOf(token, catalog);
      const byExpected = /* @__PURE__ */ new Map();
      for (const i of list) byExpected.set(names.get(i), [...(_b = byExpected.get(names.get(i))) != null ? _b : [], i]);
      let name = token.name;
      const agreed = byExpected.size === 1 ? [...byExpected.keys()][0] : null;
      if (agreed && agreed !== token.name && !claimed.has(token.name) && belongsTo(token, owner)) {
        const taken = catalog.variables.some((v) => v.collection === "components" && v.name === agreed);
        if (!taken && !claimed.has(agreed) && !renameTargets.has(agreed)) {
          renameTargets.add(agreed);
          rows2.push(renameRow(token, agreed, list));
          name = agreed;
        } else if (taken) {
          rows2.push(
            ownRow(agreed, token, list, now, catalog, {
              manual: false,
              checked: true,
              note: `${token.name} should be named ${agreed}, which already exists; ${layerList(list)} moves to it.`
            })
          );
          continue;
        }
      }
      const own = name.startsWith(prefix);
      const stay = [];
      for (const [expected, sub] of byExpected) {
        const sample2 = sub[0];
        const check = familyCheck(sample2, semantic, catalog);
        const fix2 = (_c = check == null ? void 0 : check.fix) != null ? _c : null;
        const fixAlias = fix2 ? { desktop: fix2.id, mobile: fix2.id } : now;
        const changes = !!fix2 && !check.same;
        if (expected !== name && own && claimed.has(name)) {
          rows2.push(
            ownRow(expected, token, sub, fixAlias, catalog, {
              manual: changes,
              checked: true,
              note: fix2 ? `${layerList(sub)} uses ${token.name}, the name for the ${claimed.get(name)}; moves to its own token aliasing ${shortName(fix2.name)} ${fixGoal(check)}; ${lookText(!changes)}.` : `${layerList(sub)} uses ${token.name}, the name for the ${claimed.get(name)}; moves to its own token with the same alias, look unchanged.`
            })
          );
          moved.set(token.id, { items: [...(_e = (_d = moved.get(token.id)) == null ? void 0 : _d.items) != null ? _e : [], ...sub], to: expected });
          continue;
        }
        if (expected !== name && own && byExpected.size > 1 && isTextOrIcon(sample2)) {
          rows2.push(
            ownRow(expected, token, sub, fixAlias, catalog, {
              manual: changes,
              checked: true,
              note: fix2 ? `${layerList(sub)} sits on ${check.pair.label}, unlike the other layers on ${token.name}; moves to its own token aliasing ${shortName(fix2.name)}; ${lookText(!changes)}.` : `${layerList(sub)} sits on another surface than the other layers on ${token.name}; moves to its own token with the same alias, look unchanged.`
            })
          );
          continue;
        }
        if (expected !== name && own && sample2.category !== "color" && propertySplit(name, expected, [...byExpected.keys()])) {
          const fields = [...new Set(sub.map((i) => i.use.field))].join(", ");
          rows2.push(
            ownRow(expected, token, sub, now, catalog, {
              manual: false,
              checked: true,
              note: `${layerList(sub)} ${fields} now ${lastSegment(expected)}; the other uses stay on ${token.name}. Own token with the same alias, look unchanged.`
            })
          );
          continue;
        }
        if (expected !== name && own) {
          warnings.push(
            `"${token.name}": Token name does not follow the pattern (${describeItem(sample2)} should be ${expected}); not renamed automatically.`
          );
        }
        if (!own && fix2) {
          rows2.push(
            ownRow(expected, token, sub, fixAlias, catalog, {
              manual: changes,
              checked: true,
              note: `${layerList(sub)} uses ${token.name} from another component, ${whyInvalid(semantic, check.role, check.pair)}. New own token aliasing ${shortName(fix2.name)} ${fixGoal(check)}; ${lookText(!changes)}.`
            })
          );
          continue;
        }
        if (own) stay.push(...sub);
      }
      const checks = stay.flatMap((i) => {
        const c2 = familyCheck(i, semantic, catalog);
        return c2 ? [{ i, c: c2 }] : [];
      });
      const byPair = /* @__PURE__ */ new Map();
      for (const x of checks) {
        const k = (_g = (_f = x.c.pair) == null ? void 0 : _f.key) != null ? _g : x.c.role;
        byPair.set(k, [...(_h = byPair.get(k)) != null ? _h : [], x]);
      }
      const pairGroups = [...byPair.values()];
      const keep = (_i = pairGroups.find((g) => !g[0].c.fix)) != null ? _i : pairGroups[0];
      const leaving = /* @__PURE__ */ new Set();
      for (const g of pairGroups) {
        const { i, c: c2 } = g[0];
        if (g === keep || !c2.pair) continue;
        const name2 = surfaceVariantName(names.get(i), c2.pair);
        const alias = c2.fix ? { desktop: c2.fix.id, mobile: c2.fix.id } : now;
        const changes = !!c2.fix && !c2.same;
        g.forEach((x) => leaving.add(x.i));
        rows2.push(
          ownRow(name2, token, g.map((x) => x.i), alias, catalog, {
            manual: changes,
            checked: true,
            note: `${layerList(g.map((x) => x.i))} sits on ${c2.pair.label}, unlike the other layers on ${token.name}; moves to its own token${c2.fix ? ` aliasing ${shortName(c2.fix.name)}; ${lookText(!changes)}.` : " with the same alias, look unchanged."}`
          })
        );
      }
      const fixes = (keep != null ? keep : []).filter((x) => x.c.fix);
      if (!fixes.length) continue;
      const { i: sample, c } = fixes[0];
      const fix = c.fix;
      const where = c.pair ? `${sample.use.role === "text" ? "Text now sits" : "Icons now sit"} on ${c.pair.label}; restores the surface pairing and` : `${shortName(semantic.name)} is not a ${c.role} color; ${fixSentence(c.role, fix, c.same, void 0)};`;
      rows2.push({
        key: `${name}|alias`,
        name,
        status: "existing",
        type: token.type === "FLOAT" ? "FLOAT" : "COLOR",
        alias: { desktop: fix.id, mobile: fix.id },
        candidates: [],
        match: c.same ? "exact" : "manual",
        source: "match",
        replaces: displayColor(sample.use.hex, (_j = sample.use.opacity) != null ? _j : 1),
        uses: sortUses(stay.filter((i) => !leaving.has(i)).map((i) => i.use)),
        note: `${where} ${c.same ? "keeps the look" : "changes every use of this token"}.`,
        skip: false,
        kind: "alias-change",
        previousAlias: now
      });
    }
    return { rows: rows2, moved };
  }
  function lastSegment(name) {
    return name.slice(name.lastIndexOf("/") + 1);
  }
  function propertySplit(name, expected, all) {
    const kept = lastSegment(name);
    return lastSegment(expected) !== kept && all.some((k) => k !== expected && lastSegment(k) === kept);
  }
  function renameRow(token, name, items) {
    return {
      key: `${token.name}|rename`,
      name,
      previousName: token.name,
      status: "existing",
      type: token.type === "FLOAT" ? "FLOAT" : "COLOR",
      alias: currentAlias(token),
      candidates: [],
      match: "exact",
      source: "match",
      replaces: token.name,
      uses: sortUses(items.map((i) => i.use)),
      note: TOKEN_RENAME_NOTE,
      skip: false,
      kind: "rename"
    };
  }
  function ownRow(name, from, items, alias, catalog, opts) {
    const existing = catalog.variables.find((v) => v.collection === "components" && v.name === name);
    if ((existing == null ? void 0 : existing.aliasOf) && !sameAlias(currentAlias(existing), alias)) {
      const was = catalog.variables.find((v) => v.id === currentAlias(existing).desktop);
      return {
        key: `${name}|${from.name}`,
        name,
        status: "existing",
        type: from.type === "FLOAT" ? "FLOAT" : "COLOR",
        alias,
        candidates: [],
        match: "manual",
        source: "match",
        replaces: from.name,
        uses: sortUses(items.map((i) => i.use)),
        note: `${opts.note} ${name} already exists and aliases ${was ? shortName(was.name) : "another token"}; changes every use of this token.`,
        skip: true,
        kind: "alias-change",
        previousAlias: currentAlias(existing)
      };
    }
    return {
      key: `${name}|${from.name}`,
      name,
      status: existing ? "existing" : "new",
      type: from.type === "FLOAT" ? "FLOAT" : "COLOR",
      alias,
      candidates: [],
      match: opts.manual ? "manual" : "exact",
      source: "match",
      replaces: from.name,
      uses: sortUses(items.map((i) => i.use)),
      note: opts.note,
      skip: opts.checked ? false : opts.manual,
      kind: "rebind"
    };
  }
  function toAliasChange(row, existing, sample, via, moved, catalog) {
    const nameOf = (id) => {
      var _a;
      return (_a = catalog.variables.find((v) => v.id === id)) != null ? _a : null;
    };
    const before = nameOf(currentAlias(existing).desktop);
    const after = nameOf(row.alias.desktop);
    const users = via.filter((i) => i.bound.id === existing.id);
    const what = isRootFill(sample) ? "Root frame fill" : describeItem(sample);
    const parts = [
      `${what} ${sample.bound ? `is bound directly to ${shortName(sample.bound.name)}` : `is ${row.replaces}`}. ${row.name} already exists and aliases ${before ? shortName(before.name) : "another token"}`
    ];
    parts[0] += users.length ? `; currently used by ${layerList(users)}; it would turn ${after ? surfaceLabel(after) : "the new alias"}.` : ".";
    const m = moved.get(existing.id);
    if (m) parts.push(`${layerList(m.items)} moves to ${m.to} in its own row; keep that row ticked, or ${layerList(m.items)} turns ${after ? surfaceLabel(after) : "the new alias"} too.`);
    const othersAffected = users.filter((u) => !(m == null ? void 0 : m.items.includes(u)));
    const alreadyShown = row.uses.every((u) => u.boundVariableId === row.alias.desktop && u.boundVariableId === row.alias.mobile);
    const invisible = othersAffected.length === 0 && alreadyShown;
    parts.push(invisible ? "No visible change." : "Changes every use of this token.");
    Object.assign(row, {
      status: "existing",
      match: invisible ? "exact" : "manual",
      skip: !invisible,
      kind: "alias-change",
      previousAlias: currentAlias(existing),
      note: parts.join(" ")
    });
  }
  function warnUnusedTokens(catalog, prefix, via, warnings) {
    const used = new Set(via.map((i) => i.bound.id));
    const component = prefix.slice(0, -1).split("/").pop();
    for (const v of catalog.variables) {
      if (v.collection !== "components" || !v.name.startsWith(prefix) || used.has(v.id)) continue;
      if (v.name === `${prefix}color/${component}`) {
        warnings.push(
          `"${v.name}": Token name does not follow the pattern (component frame fill should be ${prefix}color/background); not renamed automatically.`
        );
      } else if (!isValidComponentTokenName(v.name)) {
        warnings.push(`"${v.name}": Token name does not follow the pattern; not renamed automatically.`);
      }
    }
  }
  function isMobile(i) {
    var _a;
    return ((_a = i.variant.props[LAYOUT]) != null ? _a : "").toLowerCase() === "mobile";
  }
  function collectItems(scan, renameMap, catalog, overrides) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j;
    const items = [];
    const layerNameOf = (u) => {
      var _a2;
      return (_a2 = renameMap.get(pathKey(u.indexPath))) != null ? _a2 : u.layerName;
    };
    const partOf = (u) => u.indexPath.length === 0 ? void 0 : toSegment(layerNameOf(u)) || void 0;
    const paddingForms = /* @__PURE__ */ new Map();
    const cornerForms = /* @__PURE__ */ new Map();
    const visible2 = [];
    const byId2 = new Map(catalog.variables.map((v) => [v.id, v]));
    for (const variant of scan.variants) {
      for (const use of [...variant.uses, ...(_a = variant.boundUses) != null ? _a : []]) {
        const { node, hidden } = locate(variant.root, use.indexPath);
        if (hidden) continue;
        const bound = use.boundVariableId ? byId2.get(use.boundVariableId) : void 0;
        if (use.boundVariableId && !bound) continue;
        if (use.kind === "number" && (use.number === null || use.number === 0)) continue;
        if (use.kind === "color" && !use.hex) continue;
        visible2.push({ use, variant, node, bound });
        const pk = (_b = partOf(use)) != null ? _b : "";
        if (PADDING_FIELDS.has(use.field)) {
          const lay = node == null ? void 0 : node.layout;
          const form = lay ? paddingForm(lay.paddingLeft, lay.paddingRight, lay.paddingTop, lay.paddingBottom) : 4;
          paddingForms.set(pk, Math.max((_c = paddingForms.get(pk)) != null ? _c : 1, form));
        }
        if (CORNER_FIELDS.has(use.field)) {
          const set = (_d = cornerForms.get(pk)) != null ? _d : /* @__PURE__ */ new Set();
          set.add(node ? cornerForm(node.corners) : "corners");
          cornerForms.set(pk, set);
        }
      }
    }
    for (const { use, variant, bound } of visible2) {
      const layerName = layerNameOf(use);
      const part = partOf(use);
      const pk = part != null ? part : "";
      const boundKey = bound ? { valueKey: `var:${bound.id}`, display: bound.name, bound } : null;
      if (use.kind === "color") {
        const opacity = (_e = use.opacity) != null ? _e : 1;
        const surface = use.role === "text" || use.role === "icon" ? locateSurface(variant, use.indexPath, catalog, overrides) : void 0;
        const owner = (surface == null ? void 0 : surface.ownerPath.length) ? surface.ownerPath : null;
        const ownerName = owner ? (_h = (_g = renameMap.get(pathKey(owner))) != null ? _g : (_f = locate(variant.root, owner).node) == null ? void 0 : _f.name) != null ? _h : "" : "";
        items.push(__spreadValues({
          use,
          variant,
          layerName,
          category: "color",
          part: use.role === "background" ? part : owner ? toSegment(ownerName) || void 0 : void 0,
          surface,
          element: use.role === "other" ? toSegment(layerName) || "fill" : use.role,
          valueKey: `${normalizeHex(use.hex)}@${opacity}`,
          display: displayColor(use.hex, opacity)
        }, boundKey));
        continue;
      }
      const n = use.number;
      const base = __spreadValues({ use, variant, layerName, part, valueKey: String(n), display: displayNumber(n) }, boundKey);
      if (PADDING_FIELDS.has(use.field)) {
        items.push(__spreadProps(__spreadValues({}, base), { category: "spacing", group: "padding", property: paddingProperty(use.field, (_i = paddingForms.get(pk)) != null ? _i : 4) }));
      } else if (use.field === "itemSpacing" || use.field === "counterAxisSpacing") {
        items.push(__spreadProps(__spreadValues({}, base), { category: "spacing", group: "gap", property: "gap" }));
      } else if (CORNER_FIELDS.has(use.field)) {
        const form = mergeCornerForms((_j = cornerForms.get(pk)) != null ? _j : /* @__PURE__ */ new Set(["corners"]));
        items.push(__spreadProps(__spreadValues({}, base), { category: "shape", group: "corner-radius", property: cornerProperty(use.field, form) }));
      } else if (use.field === "strokeWeight") {
        items.push(__spreadProps(__spreadValues({}, base), { category: "shape", group: "stroke", property: "stroke" }));
      } else if (SIZE_FIELDS.has(use.field)) {
        items.push(__spreadProps(__spreadValues({}, base), { category: "shape", group: "size", property: use.field }));
      }
    }
    return items;
  }
  function splitColorConflicts(items) {
    var _a, _b;
    const perSlot = /* @__PURE__ */ new Map();
    for (const i of items) {
      if (i.category !== "color") continue;
      const s = slotKey(i);
      const byVariant = (_a = perSlot.get(s)) != null ? _a : /* @__PURE__ */ new Map();
      const set = (_b = byVariant.get(i.variant.id)) != null ? _b : /* @__PURE__ */ new Set();
      set.add(i.valueKey);
      byVariant.set(i.variant.id, set);
      perSlot.set(s, byVariant);
    }
    const conflicted = /* @__PURE__ */ new Set();
    for (const [s, byVariant] of perSlot) if ([...byVariant.values()].some((v) => v.size > 1)) conflicted.add(s);
    for (const i of items) {
      if (i.category !== "color" || !conflicted.has(slotKey(i)) || isRootFill(i)) continue;
      const named = toSegment(i.layerName);
      if (named && named !== i.element) {
        i.slotNote = `Several ${i.element} colors in one variant; element named after layer "${i.layerName}".`;
        i.element = named;
      }
    }
  }
  function isRootFill(i) {
    return i.use.indexPath.length === 0 && i.use.field === "fills";
  }
  function orderedAxes(scan) {
    const keys = new Set(Object.keys(scan.variantProperties));
    const extra = /* @__PURE__ */ new Set();
    for (const v of scan.variants) for (const k of Object.keys(v.props)) if (!keys.has(k)) extra.add(k);
    return [...Object.keys(scan.variantProperties), ...[...extra].sort()].filter((k) => k !== LAYOUT);
  }
  function axisVaries(items, axis) {
    var _a, _b, _c;
    const groups = /* @__PURE__ */ new Map();
    for (const i of items) {
      const props = i.variant.props;
      const other = Object.keys(props).filter((k) => k !== axis).sort().map((k) => `${k}=${props[k]}`).join("&");
      const g = (_a = groups.get(other)) != null ? _a : /* @__PURE__ */ new Map();
      const val = (_b = props[axis]) != null ? _b : "";
      const set = (_c = g.get(val)) != null ? _c : /* @__PURE__ */ new Set();
      set.add(i.valueKey);
      g.set(val, set);
      groups.set(other, g);
    }
    for (const g of groups.values()) {
      if (g.size < 2) continue;
      const sigs = new Set([...g.values()].map((s) => [...s].sort().join(",")));
      if (sigs.size > 1) return true;
    }
    return false;
  }
  function nameItems(items, axes, componentName) {
    var _a, _b;
    const bySlot = /* @__PURE__ */ new Map();
    for (const i of items) bySlot.set(slotKey(i), [...(_a = bySlot.get(slotKey(i))) != null ? _a : [], i]);
    const names = /* @__PURE__ */ new Map();
    for (const slotItems of bySlot.values()) {
      const varying = axes.filter((a) => axisVaries(slotItems, a));
      const styleAxes = varying.filter((a) => a !== SIZE && a !== STATE);
      const sizeVaries = varying.includes(SIZE);
      const stateVaries = varying.includes(STATE);
      const category = slotItems[0].category;
      const misplaced = [];
      if (category === "color" && sizeVaries) misplaced.push(SIZE);
      if (category !== "color") misplaced.push(...styleAxes);
      if (category === "spacing" && stateVaries) misplaced.push(STATE);
      const slotNote = misplaced.length ? `Value changes by ${misplaced.join(", ")}, which has no own slot in the pattern; added to the ${category === "color" ? "variant" : "size-variant"} segment. Review the name.` : void 0;
      for (const i of slotItems) {
        const props = i.variant.props;
        const seg = (a) => {
          var _a2;
          return axisSegment(a, (_a2 = props[a]) != null ? _a2 : "");
        };
        const modifier = [...styleAxes.map(seg), ...sizeVaries ? [seg(SIZE)] : []];
        if (category === "spacing" && stateVaries) modifier.push(normalizeState((_b = props[STATE]) != null ? _b : ""));
        const joined = modifier.filter(Boolean).join("-") || void 0;
        const state = stateVaries && category !== "spacing" ? props[STATE] || void 0 : void 0;
        if (slotNote) i.slotNote = i.slotNote ? `${i.slotNote} ${slotNote}` : slotNote;
        names.set(
          i,
          buildTokenName({
            component: componentName,
            part: i.part,
            category,
            variant: category === "color" ? joined : void 0,
            sizeVariant: category !== "color" ? joined : void 0,
            element: i.element,
            property: i.property,
            state
          })
        );
      }
    }
    return names;
  }
  function tieContext(items) {
    const states = new Set(items.map((i) => {
      var _a;
      return normalizeState((_a = i.variant.props[STATE]) != null ? _a : "");
    }));
    return { state: states.size === 1 ? [...states][0] || null : null };
  }
  function tieScore(v, ctx) {
    return ctx.state && v.name.split("/").pop() === ctx.state ? 1 : 0;
  }
  function rankExact(exact, item, ctx) {
    return exact.map((c, idx) => ({ c, idx, score: tieScore(c.variable, ctx) })).sort((a, b) => {
      const fa = item.category === "color" ? preferredFit(a.c.variable, item.use.role) : 0;
      const fb = item.category === "color" ? preferredFit(b.c.variable, item.use.role) : 0;
      return fa - fb || b.score - a.score || enabledRank(a.c.variable) - enabledRank(b.c.variable) || a.idx - b.idx;
    }).map((r) => r.c);
  }
  function enabledRank(v) {
    return v.name.split("/").pop() === "enabled" ? 0 : 1;
  }
  function isPill(item) {
    const r = item.use.number;
    if (r >= PILL_RADIUS) return true;
    const node = locate(item.variant.root, item.use.indexPath).node;
    const side = node ? Math.min(node.width, node.height) : 0;
    return side > 0 && r >= side / 2;
  }
  function resolve(item, mode, catalog, ctx) {
    var _a;
    if (item.bound) return resolveBound(item, item.bound, catalog);
    if (item.group === "corner-radius" && isPill(item)) {
      const cands2 = matchNumber(item.use.number, "corner-radius", catalog, mode);
      const full = cands2.find((c) => c.variable.name.split("/").pop() === "full");
      if (full) {
        return {
          alias: full.variable.id,
          match: "exact",
          candidates: cands2.filter((c) => c !== full).slice(0, MAX_NEAREST_CANDIDATES).map((c) => c.variable.id),
          note: `pill radius -> ${full.variable.name}`,
          reason: null,
          target: full.variable
        };
      }
    }
    if (item.category === "color" && item.use.role !== "other") return resolveRoleColor(item, catalog, ctx);
    let cands;
    let family;
    if (item.category === "color") {
      cands = matchColor(item.use.hex, (_a = item.use.opacity) != null ? _a : 1, item.use.role, catalog);
      family = colorFamily(item.use.role).map((p) => `${p}*`).join(" / ");
    } else {
      cands = matchNumber(item.use.number, item.group, catalog, mode);
      family = item.group === "size" ? "size/* or metrics/*" : `${item.group}/*`;
    }
    if (cands.length === 0) {
      return {
        alias: null,
        match: "none",
        candidates: [],
        note: null,
        reason: `No ${family} variables in the catalog for ${item.display}.`,
        target: null
      };
    }
    const exact = cands.filter((c) => c.exact);
    const nearest = cands.filter((c) => !c.exact).slice(0, MAX_NEAREST_CANDIDATES);
    if (exact.length > 0) {
      const ranked = rankExact(exact, item, ctx);
      return {
        alias: ranked[0].variable.id,
        match: "exact",
        candidates: [...ranked.slice(1), ...nearest].map((c) => c.variable.id),
        note: null,
        reason: null,
        target: ranked[0].variable
      };
    }
    const best = cands[0];
    const reasonable = item.category === "color" ? best.distance <= COLOR_TOLERANCE : best.distance <= Math.max(NUMBER_TOLERANCE_ABS, Math.abs(item.use.number) * NUMBER_TOLERANCE_REL);
    const target = valueText(best.variable, item, mode);
    if (!reasonable) {
      return {
        alias: null,
        match: "none",
        candidates: nearest.map((c) => c.variable.id),
        note: null,
        reason: item.category === "color" ? `No ${family} step close to ${item.display}; nearest is ${best.variable.name} (${target}).` : `No ${family} step close to ${item.display}.`,
        target: null,
        suggestion: item.category === "color" ? null : { variableId: best.variable.id, variableName: best.variable.name, reason: `Nearest is ${best.variable.name} (${target}).` }
      };
    }
    return {
      alias: best.variable.id,
      match: "nearest",
      candidates: nearest.slice(1).map((c) => c.variable.id),
      note: `No exact match for ${item.display}; nearest is ${best.variable.name} (${target}, off by ${formatDistance(best.distance)}). Confirm or pick another.`,
      reason: null,
      target: best.variable
    };
  }
  var PAGE = "color/background/primary";
  var PAGE_TEXT = "color/on-background/primary";
  var INTENTS = ["dimmed", "brand", "dark brand", "success", "warning", "error"];
  var PAGE_INTENTS = ["brand", "dark brand", "success", "warning", "error", "disabled"];
  var INTENT_STATES = ["enabled", "hover", "pressed"];
  function allowedIn(name, pair) {
    return pair.defaults.includes(name) || pair.intents.includes(name);
  }
  function pairIds(pair, catalog) {
    const names = [...pair.defaults, ...pair.intents];
    return names.flatMap((n) => catalog.variables.filter((v) => v.collection === "color" && v.type === "COLOR" && v.name === n).map((v) => v.id));
  }
  function pairedText(pair, hex, opacity, role, catalog) {
    const exact = matchColor(hex, opacity, role, catalog).filter((c) => c.exact && c.variable.collection === "color" && allowedIn(c.variable.name, pair));
    const hit = preferEnabled(exact, pair.defaultName)[0];
    if (hit) return { variable: hit.variable, exact: true };
    const def = defaultVariable(pair, catalog);
    return def ? { variable: def, exact: false } : null;
  }
  function defaultVariable(pair, catalog) {
    for (const name of pair.defaults) {
      const v = catalog.variables.find((x) => x.collection === "color" && x.type === "COLOR" && x.name === name);
      if (v) return v;
    }
    return void 0;
  }
  function familyMember(role, hex, opacity, catalog) {
    const best = preferEnabled(matchColor(hex, opacity, role, catalog).filter((c) => inRoleFamily(c.variable, role)))[0];
    return best ? { variable: best.variable, exact: best.exact } : null;
  }
  function shortName(name) {
    return name.startsWith("color/") ? name.slice("color/".length) : name;
  }
  function lightText(v) {
    var _a;
    const val = resolveValue(v, "light", v.collection === "_global" ? ["global"] : []);
    return (val == null ? void 0 : val.hex) ? displayColor(val.hex, (_a = val.opacity) != null ? _a : 1) : "?";
  }
  function suggestionOf(v, reason) {
    return { variableId: v.id, variableName: v.name, reason };
  }
  function pairFor(surface, closestTo) {
    if (!surface || surface.name === PAGE) {
      return {
        key: "page",
        label: surface ? "background/primary" : "the page",
        defaultName: PAGE_TEXT,
        defaults: [PAGE_TEXT],
        intents: PAGE_INTENTS.map((i) => `color/on-background/${i}`),
        closestTo: surface ? closestTo : null
      };
    }
    const rest = surfaceRest(surface.name);
    const base = `color/on-surface/${rest}`;
    const state = surface.name.length > `color/surface/${rest}`.length ? surface.name.slice(`color/surface/${rest}/`.length) : null;
    const intents = rest.startsWith("feedback/") || state && !INTENT_STATES.includes(state) ? [] : INTENTS.map((i) => `${base}/${i}`);
    return {
      key: surface.name,
      label: `surface ${rest}${state && state !== "enabled" ? ` ${state}` : ""}`,
      defaultName: state ? `${base}/${state}` : base,
      defaults: state ? [`${base}/${state}`] : [base, `${base}/enabled`],
      intents,
      closestTo
    };
  }
  function surfacePair(item) {
    var _a, _b;
    return (_b = (_a = item.surface) == null ? void 0 : _a.pair) != null ? _b : pairFor(null, null);
  }
  function locateSurface(variant, path, catalog, overrides) {
    var _a, _b;
    const byId2 = (id) => id ? catalog.variables.find((v) => v.id === id) : void 0;
    for (let depth = path.length - 1; depth >= 0; depth--) {
      const ownerPath = path.slice(0, depth);
      const node = locate(variant.root, ownerPath).node;
      const fill = node ? [...node.fills].reverse().find((f) => f.opacity > 0) : void 0;
      if (!fill) continue;
      const override = byId2((_a = overrides.layers.get(fillKey(variant.id, ownerPath))) != null ? _a : fill.boundVariableId ? overrides.tokens.get(fill.boundVariableId) : void 0);
      if (override) return { pair: pairFor(override, null), ownerPath };
      const boundVar = byId2((_b = fill.boundVariableId) != null ? _b : void 0);
      const bound = boundVar ? semanticOf(boundVar, catalog) : null;
      if (bound && (bound.name === PAGE || surfaceRest(bound.name))) return { pair: pairFor(bound, null), ownerPath };
      const best = preferEnabled(matchColor(fill.hex, fill.opacity, "background", catalog).filter((c) => c.variable.collection === "color"))[0];
      if (!best) return { pair: pairFor(null, null), ownerPath };
      return { pair: pairFor(best.variable, best.exact ? null : displayColor(fill.hex, fill.opacity)), ownerPath };
    }
    return { pair: pairFor(null, null), ownerPath: [] };
  }
  function isTextOrIcon(i) {
    return i.use.kind === "color" && (i.use.role === "text" || i.use.role === "icon");
  }
  function surfaceVariantName(name, pair) {
    const seg = (pair.key === "page" ? "on-background" : shortName(pair.defaultName).replace(/\/enabled$/, "")).split(/[/ ]/).join("-");
    return name.replace("/color/", `/color/${seg}/`);
  }
  function noExactReason(item, catalog) {
    var _a;
    const anyExact = matchColor(item.use.hex, (_a = item.use.opacity) != null ? _a : 1, "other", catalog).some((c) => c.exact);
    return anyExact ? `No ${item.use.role} color token is ${item.display}.` : `No color token is ${item.display}.`;
  }
  function resolveRoleColor(item, catalog, ctx) {
    var _a;
    const role = item.use.role;
    const hex = item.use.hex;
    const opacity = (_a = item.use.opacity) != null ? _a : 1;
    const all = matchColor(hex, opacity, role, catalog);
    const none = (reason2, suggestion, candidates) => ({
      alias: null,
      match: "none",
      candidates: candidates.slice(0, MAX_NEAREST_CANDIDATES).map((c) => c.variable.id),
      note: null,
      reason: reason2,
      target: null,
      suggestion
    });
    const pair = role === "text" || role === "icon" ? surfacePair(item) : void 0;
    const valid = all.filter((c) => pair ? c.variable.collection === "color" && allowedIn(c.variable.name, pair) : inRoleFamily(c.variable, role));
    const exact = valid.filter((c) => c.exact);
    if (exact.length > 0) {
      const ranked = pair ? preferEnabled(exact, pair.defaultName) : rankExact(exact, item, ctx);
      return {
        alias: ranked[0].variable.id,
        match: "exact",
        candidates: [...ranked.slice(1), ...valid.filter((c) => !c.exact).slice(0, MAX_NEAREST_CANDIDATES)].map((c) => c.variable.id),
        note: null,
        reason: null,
        target: ranked[0].variable
      };
    }
    const fix = pair ? pairedText(pair, hex, opacity, role, catalog) : familyMember(role, hex, opacity, catalog);
    const misused = matchColor(hex, opacity, "other", catalog).find((c) => c.exact && c.variable.collection === "color");
    if (misused && fix && !(pair == null ? void 0 : pair.closestTo)) {
      return {
        alias: fix.variable.id,
        match: "exact",
        candidates: [],
        note: null,
        reason: null,
        target: fix.variable,
        pairFix: `Same value as ${shortName(misused.variable.name)}, ${whyInvalid(misused.variable, role, pair)}. ${fixSentence(role, fix.variable, false, pair)}; changes the look.`,
        fixLook: true
      };
    }
    const reason = noExactReason(item, catalog);
    const familyCands = valid.filter((c) => c.variable.collection === "color");
    if (pair) {
      if (!fix) return none(`${reason} No ${shortName(pair.defaultName)} variable for text on ${pair.label}.`, null, []);
      return none(reason, suggestionOf(fix.variable, `${fixSentence(role, fix.variable, false, pair)} (${lightText(fix.variable)}).`), familyCands);
    }
    if (role === "border") {
      const medium = catalog.variables.find((v) => v.collection === "color" && v.type === "COLOR" && v.name === "color/border/medium");
      return none(reason, medium ? suggestionOf(medium, `Borders default to ${shortName(medium.name)} (${lightText(medium)}).`) : null, familyCands);
    }
    return none(
      reason,
      fix ? suggestionOf(fix.variable, `Closest background is ${shortName(fix.variable.name)} (${lightText(fix.variable)}).`) : null,
      familyCands
    );
  }
  function preferredFit(v, role) {
    const preferred = role === "background" ? "color/surface/" : role === "text" || role === "icon" ? "color/on-surface/" : role === "border" ? "color/border/" : null;
    if (role === "border" && v.collection === "_global") return 0;
    if (!preferred) return 0;
    return v.name.startsWith(preferred) ? 0 : 1;
  }
  function formatDistance(d) {
    return Number.isInteger(d) ? String(d) : d.toFixed(2);
  }
  function valueText(v, item, mode) {
    var _a;
    if (item.category === "color") {
      const val2 = resolveValue(v, "light", v.collection === "_global" ? ["global"] : []);
      return (val2 == null ? void 0 : val2.hex) ? displayColor(val2.hex, (_a = val2.opacity) != null ? _a : 1) : "?";
    }
    const val = resolveValue(v, mode, ["desktop", "global"]);
    return typeof (val == null ? void 0 : val.number) === "number" ? displayNumber(val.number) : "?";
  }
  function checkExisting(existing, name, type, res, samples, warnings) {
    var _a, _b, _c, _d, _e, _f;
    if (existing.type !== type) {
      warnings.push(`Existing token "${name}" is ${existing.type}, but this row needs ${type}; it is reused, not changed.`);
      return;
    }
    for (const mode of MODES) {
      const current = resolveValue(existing, mode, ["desktop"]);
      if (!current) continue;
      const target = res[mode].target;
      const sample = samples[mode];
      let wantText;
      let same;
      if (type === "COLOR") {
        const want = target ? resolveValue(target, "light", target.collection === "_global" ? ["global"] : []) : { hex: sample.use.hex, opacity: (_a = sample.use.opacity) != null ? _a : 1 };
        if (!(want == null ? void 0 : want.hex) || !current.hex) continue;
        same = normalizeHex(want.hex) === normalizeHex(current.hex) && ((_b = want.opacity) != null ? _b : 1) === ((_c = current.opacity) != null ? _c : 1);
        wantText = displayColor(want.hex, (_d = want.opacity) != null ? _d : 1);
      } else {
        const want = target ? (_e = resolveValue(target, mode, ["desktop", "global"])) == null ? void 0 : _e.number : sample.use.number;
        if (typeof want !== "number" || typeof current.number !== "number") continue;
        same = want === current.number;
        wantText = displayNumber(want);
      }
      if (!same) {
        const have = type === "COLOR" ? displayColor(current.hex, (_f = current.opacity) != null ? _f : 1) : displayNumber(current.number);
        warnings.push(
          `Existing token "${name}" resolves to ${have} in ${mode}, but this component needs ${wantText}; it is reused as is, not overwritten.`
        );
      }
    }
  }

  // src/scan.ts
  var KINDS = [
    "FRAME",
    "TEXT",
    "VECTOR",
    "RECTANGLE",
    "ELLIPSE",
    "LINE",
    "INSTANCE",
    "COMPONENT",
    "COMPONENT_SET",
    "GROUP"
  ];
  var VECTOR_KINDS = ["VECTOR", "ELLIPSE", "LINE"];
  var BOX_KINDS = ["FRAME", "RECTANGLE", "COMPONENT", "COMPONENT_SET", "INSTANCE"];
  var ICON_MAX2 = 32;
  var CONTROL_MAX_HEIGHT = 64;
  var ALIAS_DEPTH_CAP = 16;
  var NUMBER_FIELDS = [
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "counterAxisSpacing",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
    "strokeWeight",
    "width",
    "height",
    "minWidth",
    "maxWidth",
    "minHeight",
    "maxHeight"
  ];
  var STROKE_SIDES = ["strokeTopWeight", "strokeRightWeight", "strokeBottomWeight", "strokeLeftWeight"];
  function toHex(c) {
    const ch = (x) => Math.max(0, Math.min(255, Math.round(x * 255))).toString(16).padStart(2, "0");
    return ("#" + ch(c.r) + ch(c.g) + ch(c.b)).toUpperCase();
  }
  function detectColorRole(kind, ctx) {
    if (kind === "TEXT") return "text";
    if (ctx.isIconLike) return "icon";
    if (VECTOR_KINDS.includes(kind)) return ctx.isInsideControl ? "icon" : "other";
    if (BOX_KINDS.includes(kind)) return "background";
    return "other";
  }
  function parseVariantName(name) {
    const props = {};
    for (const part of name.split(",")) {
      const eq = part.indexOf("=");
      if (eq < 0) continue;
      const key = part.slice(0, eq).trim();
      if (key) props[key] = part.slice(eq + 1).trim();
    }
    return props;
  }
  function aggregateVariantProperties(list) {
    const out = {};
    for (const props of list) {
      for (const [k, v] of Object.entries(props)) {
        const values = out[k] || (out[k] = []);
        if (!values.includes(v)) values.push(v);
      }
    }
    return out;
  }
  function isIconLike(layer) {
    if (/icon/i.test(layer.name)) return true;
    if (layer.width > ICON_MAX2 || layer.height > ICON_MAX2) return false;
    if (VECTOR_KINDS.includes(layer.kind)) return true;
    if (layer.kind === "INSTANCE") return true;
    return (layer.kind === "FRAME" || layer.kind === "GROUP") && layer.children.length > 0 && layer.children.every((c) => VECTOR_KINDS.includes(c.kind) || c.kind === "GROUP");
  }
  function collectUses(variantId, root, paintIndexes = /* @__PURE__ */ new Map()) {
    return walkUses(variantId, root, paintIndexes, false);
  }
  function collectBoundUses(variantId, root, paintIndexes = /* @__PURE__ */ new Map()) {
    return walkUses(variantId, root, paintIndexes, true);
  }
  function walkUses(variantId, root, paintIndexes, bound) {
    const uses = [];
    const insideControl = root.height <= CONTROL_MAX_HEIGHT;
    const walk = (layer, isRoot) => {
      if (!layer.visible) return;
      const base = { variantId, indexPath: layer.indexPath, layerName: layer.name };
      const pushNumber = (field, value) => {
        const id = layer.bound[field];
        if (!(value > 0) || !!id !== bound) return;
        uses.push(__spreadValues(__spreadProps(__spreadValues({}, base), {
          field,
          paintIndex: null,
          kind: "number",
          number: value,
          hex: null,
          opacity: null,
          role: "other"
        }), id ? { boundVariableId: id } : {}));
      };
      const l = layer.layout;
      if (l.mode !== "NONE") {
        pushNumber("paddingLeft", l.paddingLeft);
        pushNumber("paddingRight", l.paddingRight);
        pushNumber("paddingTop", l.paddingTop);
        pushNumber("paddingBottom", l.paddingBottom);
        if (!l.spaceBetween) pushNumber("itemSpacing", l.itemSpacing);
        if (l.wrap) pushNumber("counterAxisSpacing", l.counterAxisSpacing);
      }
      pushNumber("topLeftRadius", layer.corners.tl);
      pushNumber("topRightRadius", layer.corners.tr);
      pushNumber("bottomLeftRadius", layer.corners.bl);
      pushNumber("bottomRightRadius", layer.corners.br);
      if (layer.strokes.length > 0) pushNumber("strokeWeight", layer.strokeWeight);
      if (!isRoot) {
        if (l.widthSizing === "FIXED") pushNumber("width", layer.width);
        if (l.heightSizing === "FIXED") pushNumber("height", layer.height);
      }
      const idx = paintIndexes.get(layer.id);
      const fillRole = detectColorRole(layer.kind, { isIconLike: isIconLike(layer), isInsideControl: insideControl });
      const pushPaints = (field, paints2, real) => {
        paints2.forEach((p, i) => {
          if (!!p.boundVariableId !== bound) return;
          uses.push(__spreadValues(__spreadProps(__spreadValues({}, base), {
            field,
            paintIndex: real ? real[i] : i,
            kind: "color",
            number: null,
            hex: p.hex,
            opacity: p.opacity,
            role: field === "strokes" ? "border" : fillRole
          }), p.boundVariableId ? { boundVariableId: p.boundVariableId } : {}));
        });
      };
      pushPaints("fills", layer.fills, idx == null ? void 0 : idx.fills);
      pushPaints("strokes", layer.strokes, idx == null ? void 0 : idx.strokes);
      for (const c of layer.children) walk(c, false);
    };
    walk(root, true);
    return uses;
  }
  function kindOf(type) {
    return KINDS.includes(type) ? type : "OTHER";
  }
  function num2(node, key) {
    const v = node[key];
    return typeof v === "number" ? v : 0;
  }
  function sizing(node, key) {
    try {
      const v = node[key];
      return v === "HUG" || v === "FILL" ? v : "FIXED";
    } catch (e) {
      return "FIXED";
    }
  }
  function solidPaints(value) {
    const paints2 = [];
    const indexes = [];
    let hasImage = false;
    if (!Array.isArray(value)) return { paints: paints2, indexes, hasImage };
    value.forEach((p, i) => {
      var _a, _b, _c, _d;
      if (p.visible === false) return;
      if (p.type === "IMAGE") hasImage = true;
      if (p.type !== "SOLID") return;
      paints2.push({
        hex: toHex(p.color),
        opacity: (_a = p.opacity) != null ? _a : 1,
        boundVariableId: (_d = (_c = (_b = p.boundVariables) == null ? void 0 : _b.color) == null ? void 0 : _c.id) != null ? _d : null
      });
      indexes.push(i);
    });
    return { paints: paints2, indexes, hasImage };
  }
  function strokeWeightOf(node) {
    const w = node.strokeWeight;
    if (typeof w === "number") return w;
    return Math.max(0, ...STROKE_SIDES.map((k) => num2(node, k)));
  }
  function boundOf(node) {
    const raw = "boundVariables" in node ? node.boundVariables : void 0;
    const bound = {};
    if (!raw) return bound;
    const idOf = (a) => {
      const alias = Array.isArray(a) ? a[0] : a;
      return alias && typeof alias === "object" && typeof alias.id === "string" ? alias.id : void 0;
    };
    for (const f of NUMBER_FIELDS) {
      const id = idOf(raw[f]);
      if (id) bound[f] = id;
    }
    if (!bound.strokeWeight) {
      const side = STROKE_SIDES.map((k) => idOf(raw[k])).find(Boolean);
      if (side) bound.strokeWeight = side;
    }
    for (const f of ["fills", "strokes"]) {
      const id = idOf(raw[f]);
      if (id) bound[f] = id;
    }
    return bound;
  }
  async function mainComponentName(node) {
    const main = await node.getMainComponentAsync();
    if (!main) return null;
    return main.parent && main.parent.type === "COMPONENT_SET" ? main.parent.name : main.name;
  }
  function textStyleOf(node) {
    const { fontName, fontSize, lineHeight, letterSpacing } = node;
    if (fontName === figma.mixed || fontSize === figma.mixed || lineHeight === figma.mixed || letterSpacing === figma.mixed) return null;
    return {
      fontFamily: fontName.family,
      fontStyle: fontName.style,
      fontSize,
      lineHeight: lineHeight.unit === "AUTO" ? { unit: "AUTO" } : { unit: lineHeight.unit, value: lineHeight.value },
      letterSpacing: { unit: letterSpacing.unit, value: letterSpacing.value }
    };
  }
  function textBoundOf(node) {
    var _a;
    const raw = (_a = node.boundVariables) != null ? _a : {};
    const bound = {};
    for (const f of TYPOGRAPHY_FIELDS) {
      const a = raw[f];
      const alias = Array.isArray(a) ? a[0] : a;
      const id = alias && typeof alias === "object" ? alias.id : void 0;
      if (typeof id === "string") bound[f] = id;
    }
    return bound;
  }
  function textOf(node) {
    let fontSize = 0;
    if (typeof node.fontSize === "number") fontSize = node.fontSize;
    else {
      const seg = node.getStyledTextSegments(["fontSize"])[0];
      if (seg) fontSize = seg.fontSize;
    }
    return { characters: node.characters, fontSize, style: textStyleOf(node), bound: textBoundOf(node) };
  }
  async function buildLayer(node, indexPath, paintIndexes) {
    const kind = kindOf(node.type);
    const bag = node;
    const fills = solidPaints(bag.fills);
    const strokes = solidPaints(bag.strokes);
    paintIndexes.set(node.id, { fills: fills.indexes, strokes: strokes.indexes });
    const layoutMode = bag.layoutMode;
    const counter = bag.counterAxisSpacing;
    const children = [];
    if (node.type !== "INSTANCE" && "children" in node) {
      for (let i = 0; i < node.children.length; i++) {
        children.push(await buildLayer(node.children[i], [...indexPath, i], paintIndexes));
      }
    }
    return {
      id: node.id,
      name: node.name,
      kind,
      indexPath,
      visible: node.visible,
      width: node.width,
      height: node.height,
      layout: {
        mode: layoutMode === "HORIZONTAL" || layoutMode === "VERTICAL" ? layoutMode : "NONE",
        wrap: bag.layoutWrap === "WRAP",
        spaceBetween: bag.primaryAxisAlignItems === "SPACE_BETWEEN",
        widthSizing: sizing(node, "layoutSizingHorizontal"),
        heightSizing: sizing(node, "layoutSizingVertical"),
        paddingLeft: num2(node, "paddingLeft"),
        paddingRight: num2(node, "paddingRight"),
        paddingTop: num2(node, "paddingTop"),
        paddingBottom: num2(node, "paddingBottom"),
        itemSpacing: num2(node, "itemSpacing"),
        counterAxisSpacing: typeof counter === "number" ? counter : 0
      },
      fills: fills.paints,
      strokes: strokes.paints,
      strokeWeight: strokeWeightOf(node),
      corners: {
        tl: num2(node, "topLeftRadius"),
        tr: num2(node, "topRightRadius"),
        bl: num2(node, "bottomLeftRadius"),
        br: num2(node, "bottomRightRadius")
      },
      hasImageFill: fills.hasImage,
      isMask: bag.isMask === true,
      text: node.type === "TEXT" ? textOf(node) : null,
      mainComponentName: node.type === "INSTANCE" ? await mainComponentName(node) : null,
      bound: boundOf(node),
      children
    };
  }
  function variantPropsOf(node, inSet) {
    if (!inSet) return {};
    try {
      if (node.variantProperties) return __spreadValues({}, node.variantProperties);
    } catch (e) {
    }
    return parseVariantName(node.name);
  }
  function classifyBinding(id, isLive2) {
    if (!id) return "none";
    return isLive2(id) ? "live" : "missing";
  }
  function boundIds(layer, out = /* @__PURE__ */ new Set()) {
    var _a, _b;
    for (const p of [...layer.fills, ...layer.strokes]) if (p.boundVariableId) out.add(p.boundVariableId);
    for (const id of Object.values(layer.bound)) if (id) out.add(id);
    for (const id of Object.values((_b = (_a = layer.text) == null ? void 0 : _a.bound) != null ? _b : {})) if (id) out.add(id);
    for (const c of layer.children) boundIds(c, out);
    return out;
  }
  function stripMissingBindings(layer, isLive2) {
    var _a, _b;
    let count = 0;
    for (const p of [...layer.fills, ...layer.strokes]) {
      if (classifyBinding(p.boundVariableId, isLive2) !== "missing") continue;
      p.boundVariableId = null;
      count++;
    }
    for (const [field, id] of Object.entries(layer.bound)) {
      if (classifyBinding(id, isLive2) !== "missing") continue;
      delete layer.bound[field];
      if (field !== "fills" && field !== "strokes") count++;
    }
    const textBound = (_b = (_a = layer.text) == null ? void 0 : _a.bound) != null ? _b : {};
    for (const [field, id] of Object.entries(textBound)) {
      if (classifyBinding(id, isLive2) === "missing") delete textBound[field];
    }
    for (const c of layer.children) count += stripMissingBindings(c, isLive2);
    return count;
  }
  async function liveVariableIds(ids) {
    const live = /* @__PURE__ */ new Set();
    await Promise.all(
      [...ids].map(async (id) => {
        if (await getLiveVariable(id)) live.add(id);
      })
    );
    return live;
  }
  async function scanComponent(node) {
    const isSet = node.type === "COMPONENT_SET";
    const components = isSet ? node.children.filter((c) => c.type === "COMPONENT") : [node];
    const variants = [];
    for (const comp of components) {
      const paintIndexes = /* @__PURE__ */ new Map();
      const root = await buildLayer(comp, [], paintIndexes);
      const live = await liveVariableIds(boundIds(root));
      const missingBindings = stripMissingBindings(root, (id) => live.has(id));
      variants.push(__spreadValues({
        id: comp.id,
        props: comp.type === "COMPONENT" ? variantPropsOf(comp, isSet) : {},
        root,
        uses: collectUses(comp.id, root, paintIndexes),
        boundUses: collectBoundUses(comp.id, root, paintIndexes)
      }, missingBindings ? { missingBindings } : {}));
    }
    return {
      id: node.id,
      name: node.name,
      kind: node.type,
      variantProperties: aggregateVariantProperties(variants.map((v) => v.props)),
      variants
    };
  }
  function isAlias(v) {
    return !!v && typeof v === "object" && v.type === "VARIABLE_ALIAS";
  }
  function isRgb(v) {
    return !!v && typeof v === "object" && typeof v.r === "number";
  }
  function isCatalogType(t) {
    return t === "COLOR" || t === "FLOAT" || t === "STRING" || t === "BOOLEAN";
  }
  async function loadCatalog() {
    var _a;
    const collections = await figma.variables.getLocalVariableCollectionsAsync();
    const collectionCache = new Map(collections.map((c) => [c.id, c]));
    const variableCache = /* @__PURE__ */ new Map();
    const getVariable = (id) => {
      let p = variableCache.get(id);
      if (!p) {
        p = figma.variables.getVariableByIdAsync(id).catch(() => null);
        variableCache.set(id, p);
      }
      return p;
    };
    const getCollection = async (id) => {
      var _a2;
      if (!collectionCache.has(id)) {
        collectionCache.set(id, await figma.variables.getVariableCollectionByIdAsync(id).catch(() => null));
      }
      return (_a2 = collectionCache.get(id)) != null ? _a2 : null;
    };
    const resolve2 = async (variable, modeName, modeId2) => {
      const seen = /* @__PURE__ */ new Set();
      let current = variable;
      let currentModeId = modeId2;
      for (let depth = 0; current && depth < ALIAS_DEPTH_CAP; depth++) {
        if (seen.has(current.id)) return null;
        seen.add(current.id);
        const value = current.valuesByMode[currentModeId];
        if (value === void 0) return null;
        if (!isAlias(value)) return value;
        const next = await getVariable(value.id);
        if (!next) return null;
        const col = await getCollection(next.variableCollectionId);
        if (!col) return null;
        const same = col.modes.find((m) => m.name.toLowerCase() === modeName.toLowerCase());
        currentModeId = same ? same.modeId : col.defaultModeId;
        current = next;
      }
      return null;
    };
    const variables = [];
    const isComponents = (c) => c.name.trim().toLowerCase() === "components";
    for (const col of collections) {
      const vars = await Promise.all(col.variableIds.map(getVariable));
      for (const v of vars) {
        if (!v || !isCatalogType(v.resolvedType)) continue;
        const values = {};
        for (const mode of col.modes) {
          const value = await resolve2(v, mode.name, mode.modeId);
          if (typeof value === "number") values[mode.name] = { number: value };
          else if (typeof value === "string") values[mode.name] = { string: value };
          else if (isRgb(value)) values[mode.name] = { hex: toHex(value), opacity: "a" in value ? value.a : 1 };
          else values[mode.name] = {};
        }
        const aliasOf = {};
        for (const mode of col.modes) {
          const raw = v.valuesByMode[mode.modeId];
          if (isAlias(raw)) aliasOf[mode.name] = raw.id;
        }
        const componentId = isComponents(col) ? v.getPluginData(COMPONENT_ID_KEY) : "";
        variables.push(__spreadValues(__spreadValues({
          id: v.id,
          name: v.name,
          collection: col.name,
          type: v.resolvedType,
          values
        }, Object.keys(aliasOf).length ? { aliasOf } : {}), componentId ? { componentId } : {}));
      }
    }
    const components = (_a = collections.find(isComponents)) != null ? _a : null;
    const modeId = (name) => {
      var _a2, _b;
      return (_b = (_a2 = components == null ? void 0 : components.modes.find((m) => m.name.trim().toLowerCase() === name)) == null ? void 0 : _a2.modeId) != null ? _b : null;
    };
    return {
      variables,
      componentsCollectionId: components ? components.id : null,
      componentsModes: { desktop: modeId("desktop"), mobile: modeId("mobile") }
    };
  }

  // src/apply.ts
  var MODES2 = ["desktop", "mobile"];
  var CREATED_BY = "component-studio";
  function scopesFor(token) {
    const segments = token.name.split("/").map((s) => s.toLowerCase());
    const category = segments.findIndex((s) => s === "color" || s === "spacing" || s === "shape");
    const searched = category >= 0 ? segments.slice(category + 1) : segments;
    if (token.type === "COLOR") {
      for (const s of searched) {
        if (s === "background") return ["FRAME_FILL", "SHAPE_FILL"];
        if (s === "text" || s === "icon") return ["TEXT_FILL", "SHAPE_FILL"];
        if (s === "border") return ["STROKE_COLOR"];
        if (s.startsWith("shadow")) return ["EFFECT_COLOR"];
      }
      return ["ALL_SCOPES"];
    }
    for (const s of searched) {
      if (s.startsWith("padding") || s.startsWith("gap") || s.endsWith("spacing")) return ["GAP"];
      if (s.startsWith("cornerradius") || s.startsWith("radius")) return ["CORNER_RADIUS"];
      if (s.startsWith("stroke")) return ["STROKE_FLOAT"];
      if (s.startsWith("shadow")) return ["EFFECT_FLOAT"];
      if (/^(min|max)?(width|height)$/.test(s) || s === "diameter" || s === "size") return ["WIDTH_HEIGHT"];
    }
    return ["ALL_SCOPES"];
  }
  function hexFromRgb(c) {
    return "#" + [c.r, c.g, c.b].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
  }
  function numberMatches(expected, actual) {
    return expected !== null && typeof actual === "number" && Math.abs(actual - expected) < 0.01;
  }
  function paintMatches(use, paint) {
    var _a, _b, _c;
    if (!paint || paint.type !== "SOLID" || !paint.color || ((_a = paint.boundVariables) == null ? void 0 : _a.color)) return false;
    if (use.hex === null || hexFromRgb(paint.color) !== use.hex.toUpperCase()) return false;
    return Math.abs(((_b = paint.opacity) != null ? _b : 1) - ((_c = use.opacity) != null ? _c : 1)) < 5e-3;
  }
  function aliasesMatch(valuesByMode, modeIds, alias) {
    return MODES2.every((mode) => {
      const modeId = modeIds[mode];
      if (!modeId) return false;
      const v = valuesByMode[modeId];
      return !!v && v.type === "VARIABLE_ALIAS" && v.id === alias[mode];
    });
  }
  var CATEGORY_ORDER = ["color", "spacing", "shape"];
  function componentPrefix(componentName) {
    var _a;
    return ownTokenPrefix((_a = normalizeComponentName(componentName)) != null ? _a : componentName);
  }
  function mayChangeAlias(tokenName, componentName) {
    const prefix = componentPrefix(componentName);
    return tokenName.startsWith(prefix) && tokenName.length > prefix.length;
  }
  function comparePaths(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
    return a.length - b.length;
  }
  function creationOrder(tokens, componentName) {
    const prefix = componentPrefix(componentName);
    const keyOf = (t) => {
      var _a;
      const rest = t.name.startsWith(prefix) ? t.name.slice(prefix.length).split("/") : null;
      const cat = rest ? rest.findIndex((s) => CATEGORY_ORDER.includes(s)) : -1;
      if (!rest || cat < 0) return { depth: Number.MAX_SAFE_INTEGER, layer: [], category: 0 };
      const paths = t.uses.map((u) => u.indexPath).sort(comparePaths);
      return {
        depth: cat,
        layer: cat === 0 ? [] : (_a = paths[0]) != null ? _a : [Number.MAX_SAFE_INTEGER],
        category: CATEGORY_ORDER.indexOf(rest[cat])
      };
    };
    const keys = new Map(tokens.map((t) => [t, keyOf(t)]));
    return [...tokens].sort((a, b) => {
      const x = keys.get(a);
      const y = keys.get(b);
      return x.depth - y.depth || comparePaths(x.layer, y.layer) || x.category - y.category || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
    });
  }
  function withoutBinding(paint) {
    const _a = paint, { boundVariables: _drop } = _a, rest = __objRest(_a, ["boundVariables"]);
    return rest;
  }
  function describeUse(use) {
    return `"${use.layerName}" ${use.field} (variant ${use.variantId}, path [${use.indexPath.join(",")}])`;
  }
  function nodeAtPath(root, path) {
    let node = root;
    for (const i of path) {
      if (!("children" in node)) return null;
      const next = node.children[i];
      if (!next) return null;
      node = next;
    }
    return node;
  }
  async function loadFontsFor(node) {
    if (node.hasMissingFont) return "missing font";
    const fonts = node.fontName === figma.mixed ? node.getRangeAllFontNames(0, node.characters.length) : [node.fontName];
    for (const font of fonts) {
      try {
        await figma.loadFontAsync(font);
      } catch (e) {
        return `font ${font.family} ${font.style} not available`;
      }
    }
    return null;
  }
  function renameLayers(proposal, variants, out) {
    for (const rename2 of proposal.renames) {
      if (rename2.skip) continue;
      for (const variant of variants) {
        try {
          const node = nodeAtPath(variant, rename2.indexPath);
          if (!node) {
            out.skipped.push(`Rename "${rename2.oldName}" -> "${rename2.newName}": no layer at [${rename2.indexPath.join(",")}] in "${variant.name}".`);
            continue;
          }
          if (node.name === rename2.newName) continue;
          if (node.name !== rename2.oldName) {
            out.skipped.push(`Rename "${rename2.oldName}" -> "${rename2.newName}": layer in "${variant.name}" is named "${node.name}".`);
            continue;
          }
          node.name = rename2.newName;
          out.renamed++;
        } catch (e) {
          out.skipped.push(`Rename "${rename2.oldName}" in "${variant.name}" failed: ${errorText(e)}`);
        }
      }
    }
  }
  async function resolveToken(token, collection, existing, catalog, componentId, out) {
    const label = `Token "${token.name}"`;
    const found = existing.get(token.name);
    if (found) {
      if (found.resolvedType !== token.type) {
        out.skipped.push(`${label}: existing variable is ${found.resolvedType}, expected ${token.type}.`);
        return null;
      }
      const aliased = Object.values(found.valuesByMode).some((v) => (v == null ? void 0 : v.type) === "VARIABLE_ALIAS");
      const matches = aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias);
      if (token.status === "new" && !matches) {
        out.skipped.push(`${label}: a variable with this name already exists with different aliases; not overwritten.`);
        return null;
      }
      if (token.kind !== "alias-change" && aliased && !matches) {
        out.skipped.push(`${label}: it aliases something else than this row; not rebound. Scan again.`);
        return null;
      }
      out.tokensReused++;
      return found;
    }
    if (token.status === "existing") {
      out.skipped.push(`${label}: marked existing but not found in the components collection.`);
      return null;
    }
    for (const mode of MODES2) {
      if (!catalog.componentsModes[mode]) {
        out.skipped.push(`${label}: components collection has no "${mode}" mode.`);
        return null;
      }
      const aliasId2 = token.alias[mode];
      if (!aliasId2) {
        out.skipped.push(`${label}: no ${mode} alias chosen.`);
        return null;
      }
      const target = await figma.variables.getVariableByIdAsync(aliasId2);
      if (!target) {
        out.skipped.push(`${label}: ${mode} alias variable ${aliasId2} not found.`);
        return null;
      }
      if (target.resolvedType !== token.type) {
        out.skipped.push(`${label}: ${mode} alias "${target.name}" is ${target.resolvedType}, expected ${token.type}.`);
        return null;
      }
    }
    const variable = figma.variables.createVariable(token.name, collection, token.type);
    variable.setPluginData("createdBy", CREATED_BY);
    variable.setPluginData(COMPONENT_ID_KEY, componentId);
    try {
      for (const mode of MODES2) {
        variable.setValueForMode(catalog.componentsModes[mode], { type: "VARIABLE_ALIAS", id: token.alias[mode] });
      }
      variable.scopes = scopesFor(token);
    } catch (e) {
      out.skipped.push(`${label}: created but not fully set up (${errorText(e)}); check it in the components collection.`);
      out.tokensCreated++;
      return null;
    }
    existing.set(token.name, variable);
    out.tokensCreated++;
    return variable;
  }
  function renameToken(token, existing, out) {
    var _a;
    const from = (_a = token.previousName) != null ? _a : "";
    const label = `Rename token "${from}" -> "${token.name}"`;
    const found = existing.get(from);
    if (!found) {
      out.skipped.push(`${label}: not found in the components collection; scan again.`);
      return;
    }
    if (existing.has(token.name)) {
      out.skipped.push(`${label}: a token with the new name already exists; scan again.`);
      return;
    }
    found.name = token.name;
    existing.delete(from);
    existing.set(token.name, found);
    out.tokenRenames.push({ from, to: token.name });
  }
  async function changeAlias(token, found, collection, catalog, componentName, out) {
    const label = `Alias change "${token.name}"`;
    if (!mayChangeAlias(token.name, componentName)) {
      out.skipped.push(`${label}: not a token of this component; left unchanged.`);
      return false;
    }
    if (aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias)) return true;
    if (!token.previousAlias || !aliasesMatch(found.valuesByMode, catalog.componentsModes, token.previousAlias)) {
      out.skipped.push(`${label}: its alias changed since the scan; scan again.`);
      return false;
    }
    for (const mode of MODES2) {
      const target = token.alias[mode] ? await figma.variables.getVariableByIdAsync(token.alias[mode]) : null;
      if (!target || target.resolvedType !== found.resolvedType || target.variableCollectionId === collection.id) {
        out.skipped.push(`${label}: ${mode} alias is missing, of another type or a components token.`);
        return false;
      }
    }
    for (const mode of MODES2) {
      found.setValueForMode(catalog.componentsModes[mode], { type: "VARIABLE_ALIAS", id: token.alias[mode] });
    }
    out.aliasesChanged++;
    return true;
  }
  function aliasId(a) {
    const x = Array.isArray(a) ? a[0] : a;
    return x && typeof x === "object" && typeof x.id === "string" ? x.id : void 0;
  }
  async function isLive(id) {
    return !!await getLiveVariable(id);
  }
  async function bindUse(use, variable, variants, tokenName, out) {
    var _a, _b;
    const where = `Bind "${tokenName}" to ${describeUse(use)}`;
    const variant = variants.get(use.variantId);
    const node = variant ? nodeAtPath(variant, use.indexPath) : null;
    if (!node) {
      out.skipped.push(`${where}: layer not found.`);
      return;
    }
    if (node.type === "TEXT") {
      const fontProblem = await loadFontsFor(node);
      if (fontProblem) {
        out.skipped.push(`${where}: ${fontProblem}.`);
        return;
      }
    }
    if (use.kind === "color") {
      if (use.field !== "fills" && use.field !== "strokes") {
        out.skipped.push(`${where}: color use on unsupported field.`);
        return;
      }
      const current = node[use.field];
      if (!Array.isArray(current) || use.paintIndex === null) {
        out.skipped.push(`${where}: paints are mixed or missing.`);
        return;
      }
      const paints2 = [...current];
      let paint = paints2[use.paintIndex];
      const boundNow2 = aliasId((_a = paint == null ? void 0 : paint.boundVariables) == null ? void 0 : _a.color);
      if (use.boundVariableId) {
        if (boundNow2 === variable.id) return;
        if (boundNow2 !== use.boundVariableId) {
          out.skipped.push(`${where}: its binding changed since the scan.`);
          return;
        }
      } else {
        if (paint && boundNow2) {
          if (await isLive(boundNow2)) {
            out.skipped.push(`${where}: paint is already bound to another variable.`);
            return;
          }
          paint = withoutBinding(paint);
        }
        if (!paintMatches(use, paint)) {
          out.skipped.push(`${where}: paint no longer matches ${use.hex}.`);
          return;
        }
      }
      paints2[use.paintIndex] = figma.variables.setBoundVariableForPaint(paint, "color", variable);
      if (use.field === "fills") node.fills = paints2;
      else node.strokes = paints2;
      out.bound++;
      return;
    }
    if (!(use.field in node)) {
      out.skipped.push(`${where}: layer has no ${use.field}.`);
      return;
    }
    const field = use.field;
    const boundNow = aliasId((_b = "boundVariables" in node ? node.boundVariables : void 0) == null ? void 0 : _b[field]);
    if (use.boundVariableId) {
      if (boundNow === variable.id) return;
      if (boundNow !== use.boundVariableId) {
        out.skipped.push(`${where}: its binding changed since the scan.`);
        return;
      }
    } else {
      if (boundNow && await isLive(boundNow)) {
        out.skipped.push(`${where}: already bound to another variable.`);
        return;
      }
      const actual = node[use.field];
      if (!numberMatches(use.number, actual)) {
        out.skipped.push(`${where}: value is ${String(actual)}, expected ${use.number}.`);
        return;
      }
    }
    try {
      node.setBoundVariable(field, variable);
    } catch (e) {
      if (!boundNow) throw e;
      node.setBoundVariable(field, null);
      node.setBoundVariable(field, variable);
    }
    out.bound++;
  }
  function sameStyle(a, b) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  async function bindTypography(row, variants, out) {
    const vars = /* @__PURE__ */ new Map();
    for (const id of new Set(Object.values(row.bindings))) {
      const v = id ? await getLiveVariable(id) : null;
      if (!v) {
        out.skipped.push(`Typography ${row.role}: variable ${id} not found.`);
        return;
      }
      vars.set(id, v);
    }
    const stringValue = (id) => {
      var _a, _b;
      const value = id ? Object.values((_b = (_a = vars.get(id)) == null ? void 0 : _a.valuesByMode) != null ? _b : {})[0] : void 0;
      return typeof value === "string" ? value : void 0;
    };
    for (const use of row.uses) {
      const where = `Typography ${row.role} on "${use.layerName}" (variant ${use.variantId}, path [${use.indexPath.join(",")}])`;
      const variant = variants.get(use.variantId);
      const node = variant ? nodeAtPath(variant, use.indexPath) : null;
      if (!node || node.type !== "TEXT") {
        out.skipped.push(`${where}: text layer not found.`);
        continue;
      }
      const style = textStyleOf(node);
      if (!style) {
        out.skipped.push(`${where}: mixed text styles in one layer.`);
        continue;
      }
      if (!sameStyle(style, use.expect)) {
        out.skipped.push(`${where}: text style changed since the scan.`);
        continue;
      }
      const fontProblem = await loadFontsFor(node);
      if (fontProblem) {
        out.skipped.push(`${where}: ${fontProblem}.`);
        continue;
      }
      const family = use.fields.includes("fontFamily") ? stringValue(row.bindings.fontFamily) : style.fontFamily;
      const weight = use.fields.includes("fontStyle") ? stringValue(row.bindings.fontStyle) : style.fontStyle;
      try {
        await figma.loadFontAsync({ family: family != null ? family : style.fontFamily, style: weight != null ? weight : style.fontStyle });
      } catch (e) {
        out.skipped.push(`${where}: font ${family} ${weight} not available.`);
        continue;
      }
      for (const field of use.fields) {
        const variable = vars.get(row.bindings[field]);
        if (!variable) continue;
        try {
          node.setBoundVariable(field, variable);
          out.bound++;
        } catch (e) {
          out.skipped.push(`${where}: ${field} failed: ${errorText(e)}`);
        }
      }
    }
  }
  function errorText(e) {
    return e instanceof Error ? e.message : String(e);
  }
  async function applyProposal(proposal, catalog) {
    var _a;
    const out = { renamed: 0, tokensCreated: 0, tokensReused: 0, bound: 0, aliasesChanged: 0, tokenRenames: [], skipped: [] };
    try {
      const root = await figma.getNodeByIdAsync(proposal.componentId);
      if (!root || root.type !== "COMPONENT" && root.type !== "COMPONENT_SET" && root.type !== "FRAME") {
        out.skipped.push(`Component ${proposal.componentId} not found; nothing applied.`);
        return out;
      }
      const variants = root.type === "COMPONENT_SET" ? root.children.filter((c) => c.type === "COMPONENT") : [root];
      if (proposal.newComponentName !== null && proposal.newComponentName !== root.name) {
        try {
          root.name = proposal.newComponentName;
          out.renamed++;
        } catch (e) {
          out.skipped.push(`Rename component to "${proposal.newComponentName}" failed: ${errorText(e)}`);
        }
      }
      renameLayers(proposal, variants, out);
      const byId2 = new Map(variants.map((v) => [v.id, v]));
      await applyTokens(proposal, catalog, byId2, out);
      for (const row of (_a = proposal.typography) != null ? _a : []) {
        if (row.skip) continue;
        try {
          await bindTypography(row, byId2, out);
        } catch (e) {
          out.skipped.push(`Typography ${row.role} failed: ${errorText(e)}`);
        }
      }
    } catch (e) {
      out.skipped.push(`Apply stopped early: ${errorText(e)}. Counts above reflect what was done before the stop.`);
    }
    return out;
  }
  async function applyTokens(proposal, catalog, byId2, out) {
    const checked = proposal.tokens.filter((t) => !t.skip);
    const renames = checked.filter((t) => t.kind === "rename");
    const tokens = [
      ...creationOrder(checked.filter((t) => t.kind !== "alias-change" && t.kind !== "rename"), proposal.componentName),
      ...checked.filter((t) => t.kind === "alias-change")
    ];
    if (tokens.length === 0 && renames.length === 0) return;
    if (!catalog.componentsCollectionId) {
      out.skipped.push("No components collection in this file; tokens not created. Add it, then run again.");
      return;
    }
    const collection = await figma.variables.getVariableCollectionByIdAsync(catalog.componentsCollectionId);
    if (!collection) {
      out.skipped.push(`Components collection ${catalog.componentsCollectionId} not found; tokens not created.`);
      return;
    }
    const existing = /* @__PURE__ */ new Map();
    for (const id of collection.variableIds) {
      const v = await figma.variables.getVariableByIdAsync(id);
      if (v) existing.set(v.name, v);
    }
    for (const token of renames) {
      try {
        renameToken(token, existing, out);
      } catch (e) {
        out.skipped.push(`Rename token "${token.previousName}" failed: ${errorText(e)}`);
      }
    }
    for (const token of tokens) {
      try {
        const variable = await resolveToken(token, collection, existing, catalog, proposal.componentId, out);
        if (!variable) continue;
        if (token.kind === "alias-change" && !await changeAlias(token, variable, collection, catalog, proposal.componentName, out)) continue;
        for (const use of token.uses) {
          try {
            await bindUse(use, variable, byId2, token.name, out);
          } catch (e) {
            out.skipped.push(`Bind "${token.name}" to ${describeUse(use)} failed: ${errorText(e)}`);
          }
        }
      } catch (e) {
        out.skipped.push(`Token "${token.name}" failed: ${errorText(e)}`);
      }
    }
  }

  // src/tokenPicker.ts
  var STATES = ["enabled", "hover", "pressed", "disabled", "loading"];
  var INTENTS2 = ["dimmed", "brand", "dark-brand", "dark brand", "darkBrand", "success", "warning", "error"];
  var STEPS = [...STATES, ...INTENTS2];

  // src/review.ts
  function lookChangeView(result, applied) {
    var _a;
    if (!result.snapshotDiff.length) return { kind: "unchanged" };
    const intended = !!applied && (applied.tokens.some((t) => t.match === "manual" && !t.skip) || ((_a = applied.typography) != null ? _a : []).some((t) => t.match === "manual" && !t.skip));
    return { kind: intended ? "intended" : "loud", lines: result.snapshotDiff.slice() };
  }

  // src/snapshot.ts
  var KEYS = [
    "width",
    "height",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "paddingBottom",
    "itemSpacing",
    "topLeftRadius",
    "topRightRadius",
    "bottomLeftRadius",
    "bottomRightRadius",
    "strokeWeight",
    "fontSize"
  ];
  var PAD = ["paddingLeft", "paddingRight", "paddingTop", "paddingBottom"];
  var RAD = ["topLeftRadius", "topRightRadius", "bottomLeftRadius", "bottomRightRadius"];
  var TXT = ["fontFamily", "fontStyle", "fontSize", "lineHeight", "letterSpacing"];
  var round = (x) => Math.round(x * 100) / 100;
  function paints(value) {
    if (!Array.isArray(value)) return void 0;
    return value.filter((p) => p.visible !== false && p.type === "SOLID").map((p) => toHex(p.color) + (p.opacity !== void 0 && p.opacity < 1 ? "@" + round(p.opacity) : ""));
  }
  async function rootNode(rootId) {
    const node = await figma.getNodeByIdAsync(rootId);
    if (!node || node.type === "DOCUMENT" || node.type === "PAGE") throw new Error(`Node ${rootId} not found`);
    return node;
  }
  async function takeSnapshot(rootId) {
    const root = await rootNode(rootId);
    const out = {};
    const walk = (n, path) => {
      const p = path ? path + " > " + n.name : n.name;
      const bag = n;
      const s = {};
      for (const k of KEYS) {
        const v = bag[k];
        if (typeof v === "number") s[k] = round(v);
      }
      s.fills = paints(bag.fills);
      s.strokes = paints(bag.strokes);
      if (n.type === "TEXT") {
        const style = textStyleOf(n);
        s.font = style ? `${style.fontFamily} ${style.fontStyle}` : "mixed";
        if (style) {
          const px2 = (m) => round(m.unit === "PERCENT" ? m.value * style.fontSize / 100 : m.value);
          s.lineHeight = style.lineHeight.unit === "AUTO" ? "auto" : px2(style.lineHeight);
          s.letterSpacing = px2(style.letterSpacing);
        }
      }
      out[n.id + " " + p] = s;
      if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) walk(c, p);
    };
    walk(root, "");
    return out;
  }
  function byId(snap) {
    const map = /* @__PURE__ */ new Map();
    for (const [key, fields] of Object.entries(snap)) {
      const sp = key.indexOf(" ");
      const id = sp < 0 ? key : key.slice(0, sp);
      map.set(id, { path: sp < 0 ? "" : key.slice(sp + 1), fields });
    }
    return map;
  }
  var show2 = (v) => v === void 0 ? "none" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v);
  function diffSnapshots(before, after) {
    const a = byId(before);
    const b = byId(after);
    const lines = [];
    for (const [id, prev] of a) {
      const next = b.get(id);
      if (!next) {
        lines.push(`${prev.path}: layer removed`);
        continue;
      }
      const fields = /* @__PURE__ */ new Set([...Object.keys(prev.fields), ...Object.keys(next.fields)]);
      for (const f of fields) {
        const x = prev.fields[f];
        const y = next.fields[f];
        if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${next.path} \u203A ${f}: ${show2(x)} -> ${show2(y)}`);
      }
    }
    for (const [id, next] of b) if (!a.has(id)) lines.push(`${next.path}: layer added`);
    return lines;
  }
  async function auditComponent(rootId) {
    const root = await rootNode(rootId);
    const cols = await figma.variables.getLocalVariableCollectionsAsync();
    const colName = new Map(cols.map((c) => [c.id, c.name]));
    const varCache = /* @__PURE__ */ new Map();
    const getVar = (id) => {
      let p = varCache.get(id);
      if (!p) {
        p = getLiveVariable(id);
        varCache.set(id, p);
      }
      return p;
    };
    const issues = [];
    const check = async (n, field, alias, want) => {
      var _a;
      const id = alias && typeof alias === "object" ? alias.id : void 0;
      if (typeof id !== "string") {
        issues.push(`${n.name} \u203A ${field}: raw value`);
        return;
      }
      const v = await getVar(id);
      if (!v) {
        issues.push(`${n.name} \u203A ${field}: bound to a deleted variable (raw value)`);
        return;
      }
      const col = (_a = colName.get(v.variableCollectionId)) != null ? _a : "library";
      if (col !== want) issues.push(`${n.name} \u203A ${field}: bound to ${col}/${v.name}, should be ${want}`);
    };
    const walk = async (n) => {
      var _a, _b;
      if (n.type !== "COMPONENT_SET") {
        const bag = n;
        const b = "boundVariables" in n && n.boundVariables || {};
        const auto = typeof bag.layoutMode === "string" && bag.layoutMode !== "NONE";
        const pos = (k) => typeof bag[k] === "number" && bag[k] > 0;
        if (auto) {
          for (const k of PAD) if (pos(k)) await check(n, k, b[k], "components");
        }
        if (auto && pos("itemSpacing") && bag.primaryAxisAlignItems !== "SPACE_BETWEEN")
          await check(n, "itemSpacing", b.itemSpacing, "components");
        for (const k of RAD) if (pos(k)) await check(n, k, b[k], "components");
        const strokes = bag.strokes;
        const hasStroke = Array.isArray(strokes) && strokes.some((s) => s.visible !== false);
        if (hasStroke && pos("strokeWeight")) await check(n, "strokeWeight", b.strokeWeight, "components");
        for (const key of ["fills", "strokes"]) {
          const list = bag[key];
          if (!Array.isArray(list)) continue;
          for (const p of list) {
            if (p.visible !== false && p.type === "SOLID") await check(n, key, (_a = p.boundVariables) == null ? void 0 : _a.color, "components");
          }
        }
        if (n.type === "TEXT") {
          for (const k of TXT) {
            const a = b[k];
            if (k === "lineHeight" && !(Array.isArray(a) ? a[0] : a) && ((_b = bag.lineHeight) == null ? void 0 : _b.unit) === "AUTO") continue;
            await check(n, k, Array.isArray(a) ? a[0] : a, "typography");
          }
        }
      }
      if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) await walk(c);
    };
    await walk(root);
    return issues.length ? issues : "PASS";
  }

  // src/storedProposal.ts
  function parseStoredProposal(raw, ctx) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ignored: "Stored Claude proposal is not valid JSON; using rules." };
    }
    if (!data || typeof data !== "object") return { ignored: "Stored Claude proposal is not an object; using rules." };
    if (data.version !== 1) return { ignored: `Stored Claude proposal has unsupported version ${String(data.version)}; using rules.` };
    if (data.rootId !== ctx.rootId) return { ignored: "Stored Claude proposal belongs to a different layer; using rules." };
    if (!Array.isArray(data.renames)) return { ignored: "Stored Claude proposal has no renames list; using rules." };
    const warnings = [];
    if (data.structureHash !== ctx.hash) {
      warnings.push("Layers changed since Claude proposed these names; changed rows are unchecked.");
    }
    const renames = [];
    for (const r of data.renames) {
      const indexPath = Array.isArray(r == null ? void 0 : r.indexPath) ? r.indexPath : [];
      const oldName = typeof (r == null ? void 0 : r.oldName) === "string" ? r.oldName : "";
      const newName = typeof (r == null ? void 0 : r.newName) === "string" ? r.newName.trim() : "";
      if (newName === "") {
        warnings.push(`Claude proposed an empty name for "${oldName}" at [${indexPath.join(",")}]; row dropped.`);
        continue;
      }
      if (newName === oldName) continue;
      const reason = typeof r.reason === "string" ? r.reason : "";
      const layer = layerAt(ctx.reference, indexPath);
      let stale = null;
      if (!layer) stale = `Stale: no layer at [${indexPath.join(",")}] any more.`;
      else if (layer.name !== oldName) stale = `Stale: layer is now named "${layer.name}", not "${oldName}".`;
      renames.push({
        indexPath,
        oldName,
        newName,
        reason: stale ? `${stale} ${reason}`.trim() : reason,
        skip: stale !== null,
        source: "claude",
        outsideVocabulary: r.outsideVocabulary === true
      });
    }
    return {
      renames,
      componentName: typeof data.componentName === "string" && data.componentName.trim() !== "" ? data.componentName.trim() : null,
      naming: { source: "claude", createdAt: typeof data.createdAt === "string" ? data.createdAt : "" },
      warnings
    };
  }
  function layerAt(root, indexPath) {
    let n = root;
    for (const i of indexPath) {
      n = n == null ? void 0 : n.children[i];
      if (!n) return null;
    }
    return n;
  }
  function mergeRenames(claude, rules, reference) {
    const covered = new Set(claude.map((r) => r.indexPath.join(".")));
    const fills = (r) => {
      if (covered.has(r.indexPath.join("."))) return false;
      if (!reference) return true;
      const layer = layerAt(reference, r.indexPath);
      return layer !== null && isUnnamed(layer, reference.name);
    };
    const merged = [...claude, ...rules.filter(fills)];
    return merged.sort((a, b) => comparePaths2(a.indexPath, b.indexPath));
  }
  function comparePaths2(a, b) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] - b[i];
    }
    return a.length - b.length;
  }
  function parseStoredTokenSuggestions(raw, ctx) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch (e) {
      return { ignored: "Stored Claude token suggestions are not valid JSON; ignored." };
    }
    if (!data || typeof data !== "object") return { ignored: "Stored Claude token suggestions are not an object; ignored." };
    if (data.version !== 1) return { ignored: `Stored Claude token suggestions have unsupported version ${String(data.version)}; ignored.` };
    if (data.rootId !== ctx.rootId) return { ignored: "Stored Claude token suggestions belong to a different layer; ignored." };
    if (!Array.isArray(data.suggestions)) return { ignored: "Stored Claude token suggestions have no suggestions list; ignored." };
    const warnings = [];
    if (data.structureHash !== ctx.hash) warnings.push("Layers changed since Claude suggested these tokens; check the Claude rows.");
    const suggestions = [];
    for (const s of data.suggestions) {
      if (!s || typeof s.key !== "string" || typeof s.variableId !== "string" || s.key === "" || s.variableId === "") {
        warnings.push("A stored Claude token suggestion has no key or variable; dropped.");
        continue;
      }
      suggestions.push({
        key: s.key,
        variableId: s.variableId,
        variableName: typeof s.variableName === "string" ? s.variableName : "",
        reason: typeof s.reason === "string" ? s.reason : ""
      });
    }
    return { suggestions, warnings };
  }
  function isAliasTarget(v) {
    if (v.collection === "color" || v.collection === "dimensions") return true;
    return v.collection === "_global" && (v.name === "color/transparent" || v.name.startsWith("metrics/"));
  }
  function aliasTargetProblem(catalog, variableId, type, role) {
    const v = catalog.variables.find((x) => x.id === variableId);
    if (!v) return `Variable ${variableId} is not in this file.`;
    if (!isAliasTarget(v)) return `${v.name} (${v.collection}) is not a semantic variable a token may alias.`;
    if (v.type !== type) return `${v.name} is ${v.type}, the value needs ${type}.`;
    if (type === "COLOR" && role && role !== "other" && !inRoleFamily(v, role)) return `${v.name} is not a ${role} color.`;
    return null;
  }
  function replacesOf(key, tokenName) {
    return key.startsWith(`${tokenName}|`) ? key.slice(tokenName.length + 1) : key;
  }
  function sameAsRaw(v, uses) {
    if (uses.length === 0) return false;
    if (v.type === "COLOR") {
      const val = resolveValue(v, "light", ["global"]);
      if (!(val == null ? void 0 : val.hex)) return false;
      return uses.every(
        (u) => {
          var _a, _b;
          return u.hex !== null && normalizeHex(u.hex) === normalizeHex(val.hex) && ((_a = u.opacity) != null ? _a : 1) === ((_b = val.opacity) != null ? _b : 1);
        }
      );
    }
    const numbers = ["desktop", "mobile"].map((m) => {
      var _a;
      return (_a = resolveValue(v, m, ["desktop", "global"])) == null ? void 0 : _a.number;
    }).filter((n) => typeof n === "number");
    return uses.every((u) => u.number !== null && numbers.includes(u.number));
  }
  function byNameThenKey(a, b) {
    return a.name < b.name ? -1 : a.name > b.name ? 1 : a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  }
  function applyTokenSuggestions(proposal, suggestions, catalog) {
    var _a;
    const warnings = [...proposal.warnings];
    let tokens = proposal.tokens.slice();
    let unmatched = proposal.unmatched.slice();
    const seen = /* @__PURE__ */ new Set();
    for (const s of suggestions) {
      if (seen.has(s.key)) {
        warnings.push(`Claude suggested more than one token for "${s.key}"; only the first is used.`);
        continue;
      }
      seen.add(s.key);
      const value = unmatched.find((u) => u.key === s.key);
      const token = value ? void 0 : tokens.find((t2) => t2.key === s.key);
      if (!value && !token) {
        warnings.push(`Claude suggested a token for "${s.key}", which is no longer a value of this component; ignored.`);
        continue;
      }
      const type = (value != null ? value : token).type;
      const problem = aliasTargetProblem(catalog, s.variableId, type, (_a = (value != null ? value : token).uses[0]) == null ? void 0 : _a.role);
      if (problem) {
        warnings.push(`Claude suggestion for "${s.key}" ignored: ${problem}`);
        continue;
      }
      const variable = catalog.variables.find((v) => v.id === s.variableId);
      const alias = { desktop: variable.id, mobile: variable.id };
      const note = s.reason || null;
      if (value) {
        const existing = catalog.variables.find((v) => v.collection === "components" && v.name === value.tokenName);
        const previous2 = (existing == null ? void 0 : existing.aliasOf) ? currentAlias(existing) : null;
        const retarget = !!previous2 && (previous2.desktop !== alias.desktop || previous2.mobile !== alias.mobile);
        unmatched = unmatched.filter((u) => u !== value);
        tokens.push(__spreadValues({
          key: value.key,
          name: value.tokenName,
          status: existing ? "existing" : "new",
          type,
          alias,
          candidates: [],
          match: "manual",
          source: "claude",
          replaces: replacesOf(value.key, value.tokenName),
          uses: value.uses,
          note: retarget ? `${note != null ? note : ""} ${value.tokenName} already exists with another alias; changes every use of this token.`.trim() : note,
          skip: retarget
        }, retarget ? { kind: "alias-change", previousAlias: previous2 } : {}));
        continue;
      }
      const t = token;
      const previous = [t.alias.desktop, t.alias.mobile].filter((id) => id !== null && id !== variable.id);
      tokens = tokens.map(
        (x) => x === t ? __spreadProps(__spreadValues({}, t), {
          alias,
          candidates: [.../* @__PURE__ */ new Set([...previous, ...t.candidates])].filter((id) => id !== variable.id),
          match: sameAsRaw(variable, t.uses) ? "exact" : "manual",
          source: "claude",
          note
        }) : x
      );
    }
    return __spreadProps(__spreadValues({}, proposal), { tokens: tokens.sort(byNameThenKey), unmatched, warnings });
  }

  // src/structureHash.ts
  function structureHash(root) {
    const lines = [];
    const walk = (n, path) => {
      lines.push(path.join(".") + "|" + n.type + "|" + (path.length ? n.name : ""));
      if (n.children && n.type !== "INSTANCE") n.children.forEach((c, i) => walk(c, [...path, i]));
    };
    walk(root, []);
    const s = lines.join("\n");
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33 ^ s.charCodeAt(i)) >>> 0;
    return h.toString(16);
  }

  // src/studioTools.ts
  var MAX_DEPTH = 6;
  var MAX_NEIGHBOURS = 15;
  var MAX_TEXT = 80;
  var MAX_IMAGE_SIDE = 1600;
  var SELECTION_CHANGED = "The selection changed; ask again after selecting the component.";
  function isTopLevel(node) {
    var _a, _b;
    return ((_a = node.parent) == null ? void 0 : _a.type) === "PAGE" || ((_b = node.parent) == null ? void 0 : _b.type) === "SECTION";
  }
  function selectedRoot() {
    var _a;
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
      throw new Error("Select one component, component set or top-level frame (or any layer inside it).");
    }
    let node = selection[0];
    let topFrame = null;
    while (node && node.type !== "PAGE" && node.type !== "DOCUMENT") {
      if (node.type === "COMPONENT_SET") return node;
      if (node.type === "COMPONENT") return ((_a = node.parent) == null ? void 0 : _a.type) === "COMPONENT_SET" ? node.parent : node;
      if (node.type === "FRAME" && isTopLevel(node)) topFrame = node;
      node = node.parent;
    }
    if (topFrame) return topFrame;
    throw new Error("The selection is not inside a component or a top-level frame.");
  }
  function referenceVariant(root) {
    if (root.type !== "COMPONENT_SET") return root;
    const first = root.children.find((c) => c.type === "COMPONENT");
    if (!first) throw new Error("The component set has no variants.");
    return first;
  }
  async function otherComponentNames(root) {
    var _a, _b;
    await figma.loadAllPagesAsync();
    const names = /* @__PURE__ */ new Set();
    for (const n of figma.root.findAllWithCriteria({ types: ["COMPONENT_SET", "COMPONENT"] })) {
      if (n.id === root.id || ((_a = n.parent) == null ? void 0 : _a.id) === root.id) continue;
      if (n.type === "COMPONENT" && ((_b = n.parent) == null ? void 0 : _b.type) === "COMPONENT_SET") continue;
      names.add(n.name);
    }
    return [...names];
  }
  async function staleTokenCount(node) {
    var _a;
    const scan = await scanComponent(node);
    return countTokenRenames(scan, await loadCatalog(), (_a = normalizeComponentName(scan.name)) != null ? _a : scan.name, await otherComponentNames(node));
  }
  async function scanForTokens(node, catalog, assume = []) {
    const scan = await scanComponent(node);
    const normalized = normalizeComponentName(scan.name);
    const proposal = buildProposal(scan, catalog, [], normalized != null ? normalized : scan.name, assume, await otherComponentNames(node));
    const warnings = [...proposal.warnings];
    const pendingRenames = proposeLayerNames(scan.variants[0].root).filter((r) => !r.skip).length;
    if (pendingRenames > 0) {
      warnings.unshift(
        `${pendingRenames} layer${pendingRenames === 1 ? "" : "s"} still need a better name. Run "1. Rename layers" first, token names are built from layer names.`
      );
    }
    if (normalized !== null) {
      warnings.unshift(`Component name "${scan.name}" does not follow the convention; tokens use "${normalized}". Rename it in step 1.`);
    }
    if (catalog.componentsCollectionId === null) {
      warnings.unshift('No "components" variable collection in this file. Tokens cannot be created until it exists.');
    }
    return __spreadProps(__spreadValues({}, proposal), { newComponentName: null, renames: [], warnings });
  }
  function nameClass(layer, rootName) {
    if (isUnnamed(layer, rootName)) return "unnamed";
    const name = layer.name.trim();
    return vocabularyEntry(name) || vocabularyEntry(name.toLowerCase()) ? "vocabulary" : "deliberate";
  }
  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function layoutText(l) {
    if (l.mode === "NONE") return void 0;
    const pad = [l.paddingTop, l.paddingRight, l.paddingBottom, l.paddingLeft].map(round2).join("/");
    const gap = l.spaceBetween ? "space-between" : `gap ${round2(l.itemSpacing)}`;
    return `${l.mode}${l.wrap ? " wrap" : ""} ${gap} pad ${pad} w:${l.widthSizing} h:${l.heightSizing}`;
  }
  function hexWithAlpha(hex, opacity) {
    if (opacity >= 1) return hex;
    const a = Math.round(Math.max(0, opacity) * 255).toString(16).padStart(2, "0").toUpperCase();
    return `${hex}${a}`;
  }
  function summarizeLayers(reference, rawType, maxDepth = MAX_DEPTH) {
    const out = [];
    const walk = (n) => {
      var _a;
      const row = {
        path: n.indexPath.join("."),
        indexPath: n.indexPath,
        id: n.id,
        type: (_a = rawType(n.id)) != null ? _a : n.kind,
        name: n.name,
        visible: n.visible,
        size: [round2(n.width), round2(n.height)]
      };
      const layout = layoutText(n.layout);
      if (layout) row.layout = layout;
      if (n.text) {
        row.text = n.text.characters.slice(0, MAX_TEXT);
        row.fontSize = n.text.fontSize;
      }
      if (n.fills.length > 0) row.fills = n.fills.map((f) => hexWithAlpha(f.hex, f.opacity));
      if (n.mainComponentName) row.mainComponent = n.mainComponentName;
      if (n.indexPath.length > 0) row.nameClass = nameClass(n, reference.name);
      out.push(row);
      if (n.indexPath.length < maxDepth) n.children.forEach(walk);
    };
    walk(reference);
    return out;
  }
  function layerAtPath(root, indexPath) {
    let n = root;
    for (const i of indexPath) {
      n = n == null ? void 0 : n.children[i];
      if (!n) return null;
    }
    return n;
  }
  function validateRenames(reference, raw) {
    const renames = [];
    const staleRows = [];
    if (!Array.isArray(raw)) return { renames, staleRows: [{ indexPath: null, oldName: null, problem: "renames is not a list." }] };
    for (const r of raw) {
      const indexPath = r == null ? void 0 : r.indexPath;
      const oldName = r == null ? void 0 : r.oldName;
      const reject = (problem) => staleRows.push({ indexPath: indexPath != null ? indexPath : null, oldName: oldName != null ? oldName : null, problem });
      if (!Array.isArray(indexPath) || !indexPath.every((i) => Number.isInteger(i) && i >= 0)) {
        reject("indexPath is not a list of child indexes.");
        continue;
      }
      const newName = typeof r.newName === "string" ? r.newName.trim() : "";
      if (newName === "") {
        reject("newName is empty.");
        continue;
      }
      const layer = layerAtPath(reference, indexPath);
      if (!layer) {
        reject(`No layer at [${indexPath.join(",")}] in the reference variant.`);
        continue;
      }
      if (layer.name !== oldName) {
        reject(`Layer at [${indexPath.join(",")}] is named "${layer.name}", not "${String(oldName)}".`);
        continue;
      }
      renames.push({
        indexPath,
        nodeId: layer.id,
        oldName: layer.name,
        newName,
        reason: typeof r.reason === "string" ? r.reason : "",
        outsideVocabulary: r.outsideVocabulary === true
      });
    }
    return { renames, staleRows };
  }
  function validateTokenSuggestions(proposal, catalog, raw) {
    var _a;
    const suggestions = [];
    const rejected = [];
    if (!Array.isArray(raw)) return { suggestions, rejected: [{ key: null, variableId: null, reason: "suggestions is not a list." }] };
    const types = /* @__PURE__ */ new Map();
    const roles = /* @__PURE__ */ new Map();
    for (const r of [...proposal.unmatched, ...proposal.tokens]) {
      types.set(r.key, r.type);
      roles.set(r.key, (_a = r.uses[0]) == null ? void 0 : _a.role);
    }
    const seen = /* @__PURE__ */ new Set();
    for (const s of raw) {
      const key = s == null ? void 0 : s.key;
      const variableId = s == null ? void 0 : s.variableId;
      const reject = (reason) => rejected.push({ key: key != null ? key : null, variableId: variableId != null ? variableId : null, reason });
      if (typeof key !== "string" || typeof variableId !== "string") {
        reject("key and variableId must be strings.");
        continue;
      }
      const type = types.get(key);
      if (!type) {
        reject("Unknown key; use a key from studio_get_tokens (tokens or unmatched).");
        continue;
      }
      if (seen.has(key)) {
        reject("Duplicate key; only the first suggestion is kept.");
        continue;
      }
      const problem = aliasTargetProblem(catalog, variableId, type, roles.get(key));
      if (problem) {
        reject(problem);
        continue;
      }
      seen.add(key);
      const variable = catalog.variables.find((v) => v.id === variableId);
      suggestions.push({ key, variableId, variableName: variable.name, reason: typeof s.reason === "string" ? s.reason : "" });
    }
    return { suggestions, rejected };
  }
  function valueOf(v, mode, fallbacks) {
    var _a;
    const val = resolveValue(v, mode, fallbacks);
    if (!val) return void 0;
    if (v.type === "COLOR") return val.hex ? hexWithAlpha(val.hex, (_a = val.opacity) != null ? _a : 1) : void 0;
    return typeof val.number === "number" ? val.number : void 0;
  }
  function tokensPayload(proposal, catalog) {
    const nameOf = (id) => {
      var _a, _b;
      return id ? (_b = (_a = catalog.variables.find((v) => v.id === id)) == null ? void 0 : _a.name) != null ? _b : id : null;
    };
    const dedupeUses = (uses) => {
      const seen = /* @__PURE__ */ new Set();
      const out = [];
      for (const u of uses) {
        const k = `${u.layerName}|${u.field}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push({ layerName: u.layerName, field: u.field });
      }
      return out;
    };
    const semantic = catalog.variables.filter((v) => isAliasTarget(v) && (v.type === "COLOR" || v.type === "FLOAT")).map((v) => {
      const row = {
        id: v.id,
        name: v.name,
        collection: v.collection,
        type: v.type
      };
      if (v.type === "COLOR") {
        row.light = valueOf(v, "light", ["global"]);
        row.dark = valueOf(v, "dark", ["global"]);
      } else {
        row.desktop = valueOf(v, "desktop", ["global"]);
        row.mobile = valueOf(v, "mobile", ["desktop", "global"]);
      }
      return row;
    });
    return {
      componentName: proposal.componentName,
      tokens: proposal.tokens.map((t) => __spreadValues(__spreadValues({
        key: t.key,
        name: t.name,
        match: t.match,
        source: t.source,
        replaces: t.replaces,
        aliasDesktop: nameOf(t.alias.desktop),
        aliasMobile: nameOf(t.alias.mobile),
        note: t.note
      }, t.kind ? { kind: t.kind } : {}), t.previousAlias ? { previousAliasDesktop: nameOf(t.previousAlias.desktop), previousAliasMobile: nameOf(t.previousAlias.mobile) } : {})),
      unmatched: proposal.unmatched.map((u) => ({
        key: u.key,
        tokenName: u.tokenName,
        type: u.type,
        display: u.display,
        reason: u.reason,
        suggestion: u.suggestion,
        uses: dedupeUses(u.uses)
      })),
      semantic,
      warnings: proposal.warnings
    };
  }
  function imageScale(width, height) {
    const longest = Math.max(width, height);
    return longest > MAX_IMAGE_SIDE ? MAX_IMAGE_SIDE / longest : 1;
  }
  function rawTypes(root) {
    const types = /* @__PURE__ */ new Map();
    const walk = (n) => {
      types.set(n.id, n.type);
      if (n.type !== "INSTANCE" && "children" in n) n.children.forEach(walk);
    };
    walk(root);
    return types;
  }
  async function referenceLayers(root) {
    const variant = referenceVariant(root);
    const scan = await scanComponent(variant);
    return { variant, tree: scan.variants[0].root };
  }
  function rootFor(rootId) {
    const root = selectedRoot();
    if (root.id !== rootId) throw new Error(SELECTION_CHANGED);
    return root;
  }
  function status() {
    const base = { fileName: figma.root.name, page: figma.currentPage.name };
    try {
      const root = selectedRoot();
      return __spreadProps(__spreadValues({}, base), { selection: { rootId: root.id, rootName: root.name, rootType: root.type } });
    } catch (e) {
      return __spreadProps(__spreadValues({}, base), { selection: null, selectionError: errorText2(e) });
    }
  }
  async function getComponent(id) {
    const root = selectedRoot();
    const { variant, tree } = await referenceLayers(root);
    const types = rawTypes(variant);
    const variantProperties = root.type === "COMPONENT_SET" ? aggregateVariantProperties(root.children.filter((c) => c.type === "COMPONENT").map((c) => parseVariantName(c.name))) : {};
    const parent = root.parent;
    const neighbours = parent && "children" in parent ? parent.children.filter((c) => c.id !== root.id).slice(0, MAX_NEIGHBOURS).map((c) => `${c.type}: ${c.name}`) : [];
    const result = {
      rootId: root.id,
      rootName: root.name,
      rootType: root.type,
      referenceVariantId: variant.id,
      variantProperties,
      structureHash: structureHash(variant),
      placement: {
        page: figma.currentPage.name,
        parent: parent && parent.type !== "PAGE" && parent.type !== "DOCUMENT" ? { type: parent.type, name: parent.name } : null,
        neighbours
      },
      layers: summarizeLayers(tree, (nodeId) => types.get(nodeId))
    };
    try {
      const bytes = await root.exportAsync({ format: "PNG", constraint: { type: "SCALE", value: imageScale(root.width, root.height) } });
      return { id, ok: true, result, image: { mimeType: "image/png", base64: figma.base64Encode(bytes) } };
    } catch (e) {
      return { id, ok: true, result: __spreadProps(__spreadValues({}, result), { imageError: errorText2(e) }) };
    }
  }
  async function getTokens() {
    const root = selectedRoot();
    const catalog = await loadCatalog();
    return tokensPayload(await scanForTokens(root, catalog), catalog);
  }
  async function proposeNames(args) {
    const root = rootFor(args.rootId);
    const { variant, tree } = await referenceLayers(root);
    const { renames, staleRows } = validateRenames(tree, args.renames);
    const componentName = typeof args.componentName === "string" && args.componentName.trim() !== "" ? args.componentName.trim() : null;
    const stored = {
      version: 1,
      source: "claude",
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      rootId: root.id,
      rootName: root.name,
      structureHash: structureHash(variant),
      componentName,
      renames
    };
    root.setSharedPluginData(NAMING_NAMESPACE, NAMING_KEY, JSON.stringify(stored));
    figma.ui.postMessage({ type: "claude/proposal-stored", phase: "rename", count: renames.length });
    return { stored: renames.length, staleRows };
  }
  async function proposeTokens(args) {
    const root = rootFor(args.rootId);
    const catalog = await loadCatalog();
    const proposal = await scanForTokens(root, catalog);
    const { suggestions, rejected } = validateTokenSuggestions(proposal, catalog, args.suggestions);
    if (suggestions.length > 0) {
      const stored = {
        version: 1,
        source: "claude",
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        rootId: root.id,
        structureHash: structureHash(referenceVariant(root)),
        suggestions
      };
      root.setSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY, JSON.stringify(stored));
      figma.ui.postMessage({ type: "claude/proposal-stored", phase: "tokens", count: suggestions.length });
    }
    return { stored: suggestions.length, rejected };
  }
  function errorText2(e) {
    return e instanceof Error ? e.message : String(e);
  }
  async function handleBridgeRequest(req) {
    const id = typeof (req == null ? void 0 : req.id) === "string" ? req.id : "";
    try {
      const args = req.args && typeof req.args === "object" ? req.args : {};
      switch (req.tool) {
        case "studio_status":
          return { id, ok: true, result: status() };
        case "studio_get_component":
          return await getComponent(id);
        case "studio_get_tokens":
          return { id, ok: true, result: await getTokens() };
        case "studio_propose_names":
          return { id, ok: true, result: await proposeNames(args) };
        case "studio_propose_tokens":
          return { id, ok: true, result: await proposeTokens(args) };
        default:
          return { id, ok: false, error: `Unknown tool ${String(req.tool)}.` };
      }
    } catch (e) {
      return { id, ok: false, error: errorText2(e) };
    }
  }

  // src/code.ts
  var EMPTY_CATALOG = {
    variables: [],
    componentsCollectionId: null,
    componentsModes: { desktop: null, mobile: null }
  };
  var pending = null;
  figma.showUI(__html__, { width: 720, height: 640, title: "Component Studio" });
  function post(msg) {
    figma.ui.postMessage(msg);
  }
  function errorText3(e) {
    return e instanceof Error ? e.message : String(e);
  }
  async function scanForRename(node, useClaude) {
    var _a;
    const scan = await scanComponent(node);
    const reference = scan.variants[0].root;
    const rules = proposeLayerNames(reference);
    const proposal = {
      componentId: scan.id,
      componentName: scan.name,
      newComponentName: normalizeComponentName(scan.name),
      renames: rules,
      tokens: [],
      unmatched: [],
      warnings: []
    };
    if (!useClaude) return { proposal, naming: { source: "rules", claudeRequested: false } };
    const raw = node.getSharedPluginData(NAMING_NAMESPACE, NAMING_KEY);
    if (raw === "") return { proposal, naming: { source: "rules", claudeRequested: true } };
    const parsed = parseStoredProposal(raw, { rootId: node.id, hash: structureHash(referenceVariant(node)), reference });
    if ("ignored" in parsed) {
      return { proposal: __spreadProps(__spreadValues({}, proposal), { warnings: [parsed.ignored] }), naming: { source: "rules", claudeRequested: true } };
    }
    return {
      proposal: __spreadProps(__spreadValues({}, proposal), {
        newComponentName: (_a = parsed.componentName) != null ? _a : proposal.newComponentName,
        renames: mergeRenames(parsed.renames, rules, reference),
        warnings: parsed.warnings
      }),
      naming: parsed.naming
    };
  }
  async function scanTokensWithClaude(node, catalog, useClaude, assume) {
    const proposal = await scanForTokens(node, catalog, assume);
    if (!useClaude) return { proposal, usedClaude: false };
    const raw = node.getSharedPluginData(NAMING_NAMESPACE, TOKENS_KEY);
    if (raw === "") return { proposal, usedClaude: false };
    const parsed = parseStoredTokenSuggestions(raw, { rootId: node.id, hash: structureHash(referenceVariant(node)) });
    if ("ignored" in parsed) return { proposal: __spreadProps(__spreadValues({}, proposal), { warnings: [...proposal.warnings, parsed.ignored] }), usedClaude: false };
    const applied = applyTokenSuggestions(__spreadProps(__spreadValues({}, proposal), { warnings: [...proposal.warnings, ...parsed.warnings] }), parsed.suggestions, catalog);
    return { proposal: applied, usedClaude: true };
  }
  async function handleScan(phase, useClaude, assume) {
    const node = selectedRoot();
    const catalog = phase === "tokens" ? await loadCatalog() : EMPTY_CATALOG;
    let proposal;
    let naming = null;
    let usedClaude;
    if (phase === "rename") {
      ({ proposal, naming } = await scanForRename(node, useClaude));
      usedClaude = naming.source === "claude";
    } else {
      ({ proposal, usedClaude } = await scanTokensWithClaude(node, catalog, useClaude, assume != null ? assume : []));
    }
    pending = { phase, componentId: proposal.componentId, catalog, usedClaude };
    const semantic = catalog.variables.filter((v) => v.collection !== "components").map(semanticToken);
    post(__spreadValues({ type: "component/proposal", phase, naming, proposal, semantic }, assume ? { repaired: true } : {}));
  }
  function semanticToken(v) {
    var _a;
    const base = { id: v.id, name: v.name, collection: v.collection, type: v.type };
    if (v.type === "COLOR") {
      const r = resolveValue(v, "light", ["global"]);
      if (r == null ? void 0 : r.hex) base.light = { hex: r.hex, opacity: (_a = r.opacity) != null ? _a : 1 };
    } else if (v.type === "FLOAT") {
      const r = resolveValue(v, "desktop", ["global"]);
      if (typeof (r == null ? void 0 : r.number) === "number") base.value = r.number;
    }
    return base;
  }
  async function handleApply(proposal) {
    if (!pending || pending.componentId !== proposal.componentId) {
      throw new Error("This review is out of date. Scan the component again.");
    }
    const { phase, catalog, usedClaude } = pending;
    const before = await takeSnapshot(proposal.componentId);
    const outcome = await applyProposal(proposal, catalog);
    if (usedClaude) await clearStoredProposal(proposal.componentId, phase === "rename" ? NAMING_KEY : TOKENS_KEY);
    const after = await takeSnapshot(proposal.componentId);
    const audit = phase === "tokens" ? await auditComponent(proposal.componentId) : "skipped";
    const staleTokenNames = phase === "rename" ? await staleTokensAfterRename(proposal.componentId) : 0;
    const result = __spreadValues(__spreadProps(__spreadValues({}, outcome), { snapshotDiff: diffSnapshots(before, after), audit }), staleTokenNames ? { staleTokenNames } : {});
    pending = null;
    post({ type: "component/applied", phase, result });
    if (lookChangeView(result, proposal).kind === "loud") {
      figma.notify("The component looks different after apply. Check the result, undo with Cmd+Z if needed.", {
        error: true
      });
    }
  }
  async function staleTokensAfterRename(rootId) {
    const root = await figma.getNodeByIdAsync(rootId);
    if (!root || root.type !== "COMPONENT" && root.type !== "COMPONENT_SET" && root.type !== "FRAME") return 0;
    try {
      return await staleTokenCount(root);
    } catch (e) {
      return 0;
    }
  }
  async function clearStoredProposal(rootId, key) {
    const root = await figma.getNodeByIdAsync(rootId);
    if (root && "setSharedPluginData" in root) root.setSharedPluginData(NAMING_NAMESPACE, key, "");
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "component/scan") await handleScan(msg.phase, msg.useClaude, msg.assume);
      else if (msg.type === "component/apply") await handleApply(msg.proposal);
      else if (msg.type === "component/cancel") pending = null;
      else if (msg.type === "bridge/request") post({ type: "bridge/response", response: await handleBridgeRequest(msg.request) });
    } catch (e) {
      post({ type: "component/error", message: errorText3(e) });
    }
  };
})();
