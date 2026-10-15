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

  // src/apply.ts
  var MODES = ["desktop", "mobile"];
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
    return MODES.every((mode) => {
      const modeId = modeIds[mode];
      if (!modeId) return false;
      const v = valuesByMode[modeId];
      return !!v && v.type === "VARIABLE_ALIAS" && v.id === alias[mode];
    });
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
  async function resolveToken(token, collection, existing, catalog, out) {
    const label = `Token "${token.name}"`;
    const found = existing.get(token.name);
    if (found) {
      if (found.resolvedType !== token.type) {
        out.skipped.push(`${label}: existing variable is ${found.resolvedType}, expected ${token.type}.`);
        return null;
      }
      if (token.status === "new" && !aliasesMatch(found.valuesByMode, catalog.componentsModes, token.alias)) {
        out.skipped.push(`${label}: a variable with this name already exists with different aliases; not overwritten.`);
        return null;
      }
      out.tokensReused++;
      return found;
    }
    if (token.status === "existing") {
      out.skipped.push(`${label}: marked existing but not found in the components collection.`);
      return null;
    }
    for (const mode of MODES) {
      if (!catalog.componentsModes[mode]) {
        out.skipped.push(`${label}: components collection has no "${mode}" mode.`);
        return null;
      }
      const aliasId = token.alias[mode];
      if (!aliasId) {
        out.skipped.push(`${label}: no ${mode} alias chosen.`);
        return null;
      }
      const target = await figma.variables.getVariableByIdAsync(aliasId);
      if (!target) {
        out.skipped.push(`${label}: ${mode} alias variable ${aliasId} not found.`);
        return null;
      }
      if (target.resolvedType !== token.type) {
        out.skipped.push(`${label}: ${mode} alias "${target.name}" is ${target.resolvedType}, expected ${token.type}.`);
        return null;
      }
    }
    const variable = figma.variables.createVariable(token.name, collection, token.type);
    variable.setPluginData("createdBy", CREATED_BY);
    try {
      for (const mode of MODES) {
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
  async function bindUse(use, variable, variants, tokenName, out) {
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
      const paint = paints2[use.paintIndex];
      if (!paintMatches(use, paint)) {
        out.skipped.push(`${where}: paint no longer matches ${use.hex}.`);
        return;
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
    const actual = node[use.field];
    if (!numberMatches(use.number, actual)) {
      out.skipped.push(`${where}: value is ${String(actual)}, expected ${use.number}.`);
      return;
    }
    node.setBoundVariable(use.field, variable);
    out.bound++;
  }
  function errorText(e) {
    return e instanceof Error ? e.message : String(e);
  }
  async function applyProposal(proposal, catalog) {
    const out = { renamed: 0, tokensCreated: 0, tokensReused: 0, bound: 0, skipped: [] };
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
      const tokens = proposal.tokens.filter((t) => !t.skip);
      if (tokens.length === 0) return out;
      if (!catalog.componentsCollectionId) {
        out.skipped.push("No components collection in this file; tokens not created. Add it, then run again.");
        return out;
      }
      const collection = await figma.variables.getVariableCollectionByIdAsync(catalog.componentsCollectionId);
      if (!collection) {
        out.skipped.push(`Components collection ${catalog.componentsCollectionId} not found; tokens not created.`);
        return out;
      }
      const existing = /* @__PURE__ */ new Map();
      for (const id of collection.variableIds) {
        const v = await figma.variables.getVariableByIdAsync(id);
        if (v) existing.set(v.name, v);
      }
      const byId2 = new Map(variants.map((v) => [v.id, v]));
      for (const token of tokens) {
        try {
          const variable = await resolveToken(token, collection, existing, catalog, out);
          if (!variable) continue;
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
    } catch (e) {
      out.skipped.push(`Apply stopped early: ${errorText(e)}. Counts above reflect what was done before the stop.`);
    }
    return out;
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
        const ctx = { parent, siblings, index, isRootChild: parent === root, rootName: root.name, parentName };
        const rename2 = evaluate(node, ctx);
        if (rename2) out.push(rename2);
        if (node.kind !== "INSTANCE" && !isIconGlyph(node)) visit(node, rename2 ? rename2.newName : node.name);
      });
    };
    visit(root, root.name);
    return out;
  }
  function evaluate(node, ctx) {
    const current = node.name;
    if (SLOT_NAME.test(current)) return null;
    const byParent = parentRule(node, ctx);
    if (byParent) return byParent.name === current ? null : rename(node, byParent);
    if (fitsVocabulary(node, current) && !isUnnamed(node, ctx)) return null;
    let pick = null;
    if (!isUnnamed(node, ctx)) {
      const fixed = current.trim().toLowerCase().replace(/\bstart\b/g, "left").replace(/\bend\b/g, "right");
      if (fixed !== current && fitsVocabulary(node, fixed)) {
        pick = { name: fixed, reason: `name is a vocabulary name with wrong casing or side -> ${fixed}` };
      }
    }
    pick = pick != null ? pick : propose(node, ctx);
    if (!pick || pick.name === current) return null;
    return rename(node, pick);
  }
  function rename(node, pick) {
    return { indexPath: node.indexPath, oldName: node.name, newName: pick.name, reason: pick.reason, skip: false };
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
  function isUnnamed(node, ctx) {
    const name = node.name.trim();
    if (name === "" || isDefaultFigmaName(name) || name === ctx.rootName) return true;
    return node.text !== null && node.text.characters.trim().startsWith(name);
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
  function resolveValue(v, mode, fallbacks) {
    if (mode && v.values[mode]) return v.values[mode];
    for (const f of fallbacks) if (v.values[f]) return v.values[f];
    const keys = Object.keys(v.values).sort();
    return keys.length ? v.values[keys[0]] : void 0;
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
    background: { prefixes: ["color/surface/", "color/background/"], preferred: "color/surface/" },
    text: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    icon: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    border: { prefixes: ["color/border/"], preferred: "color/border/" },
    other: { prefixes: ["color/"], preferred: null }
  };
  function colorFamily(role) {
    return FAMILIES[role].prefixes;
  }
  function matchColor(hex, opacity, role, catalog, mode) {
    var _a, _b;
    const family = FAMILIES[role];
    const vars = catalog.variables.filter(
      (v) => v.type === "COLOR" && (v.collection === "color" && family.prefixes.some((p) => v.name.startsWith(p)) || v.collection === GLOBAL && v.name === TRANSPARENT)
    );
    const fit = (v) => {
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
      const f = fit(a.variable) - fit(b.variable);
      if (f !== 0) return f;
      return a.variable.name < b.variable.name ? -1 : a.variable.name > b.variable.name ? 1 : 0;
    });
  }

  // src/proposal.ts
  var MODES2 = ["desktop", "mobile"];
  var LAYOUT = "layout";
  var SIZE = "size";
  var STATE = "state";
  var NUMBER_TOLERANCE_ABS = 2;
  var NUMBER_TOLERANCE_REL = 0.25;
  var COLOR_TOLERANCE = 32;
  var MAX_NEAREST_CANDIDATES = 3;
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
    if (segs.length > 1 && TOKEN_STATES.includes(segs[segs.length - 1])) segs.pop();
    return segs.join("/");
  }
  function buildProposal(scan, catalog, renames, componentName) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const warnings = [];
    const renameMap = /* @__PURE__ */ new Map();
    for (const r of renames) if (!r.skip) renameMap.set(pathKey(r.indexPath), r.newName);
    const items = collectItems(scan, renameMap);
    splitColorConflicts(items);
    const axes = orderedAxes(scan);
    const hasLayout = LAYOUT in scan.variantProperties || scan.variants.some((v) => LAYOUT in v.props);
    const names = nameItems(items, axes, componentName);
    const byName2 = /* @__PURE__ */ new Map();
    for (const i of items) {
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
    const surfaceByVariant = /* @__PURE__ */ new Map();
    const ordered = [
      ...groups.filter((g) => g.items[0].use.role === "background" && g.items[0].category === "color"),
      ...groups.filter((g) => !(g.items[0].use.role === "background" && g.items[0].category === "color"))
    ];
    const results = /* @__PURE__ */ new Map();
    const unmatched = [];
    for (const g of ordered) {
      const desktopItems = g.items.filter((i) => !isMobile(i));
      const mobileItems = g.items.filter(isMobile);
      const dSample = (_c = desktopItems[0]) != null ? _c : mobileItems[0];
      const mSample = (_d = mobileItems[0]) != null ? _d : dSample;
      const ctx = tieContext(g.items, surfaceByVariant);
      const dRes = resolve(dSample, "desktop", catalog, ctx);
      const mRes = mSample === dSample ? resolve(dSample, "mobile", catalog, ctx) : resolve(mSample, "mobile", catalog, ctx);
      if (dSample.category === "color" && dSample.use.role === "background" && dRes.alias) {
        const aliasName = (_f = (_e = dRes.target) == null ? void 0 : _e.name) != null ? _f : "";
        const rest = surfaceRest(aliasName);
        if (rest) {
          for (const i of g.items) {
            const existing2 = surfaceByVariant.get(i.variant.id);
            if (!existing2 || i.use.indexPath.length === 0) surfaceByVariant.set(i.variant.id, rest);
          }
        }
      }
      const notes = [];
      const slotNotes = [...new Set(g.items.map((i) => i.slotNote).filter((n) => !!n))].sort();
      notes.push(...slotNotes);
      if (dRes.note) notes.push(dRes.note);
      if (mSample !== dSample && mRes.note && mRes.note !== dRes.note) notes.push(`Mobile: ${mRes.note}`);
      const replaces = mSample !== dSample && mSample.valueKey !== dSample.valueKey ? `${dSample.display} (desktop) / ${mSample.display} (mobile)` : dSample.display;
      if (mSample === dSample || mSample.valueKey === dSample.valueKey) {
        const step = (_h = (_g = dRes.target) == null ? void 0 : _g.name) != null ? _h : "the same value";
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
      const existing = catalog.variables.find((v) => v.collection === "components" && v.name === g.name);
      const type = dSample.category === "color" ? "COLOR" : "FLOAT";
      if (existing) checkExisting(existing, g.name, type, { desktop: dRes, mobile: mRes }, { desktop: dSample, mobile: mSample }, warnings);
      if (match === "none") {
        const reason = [dRes.reason, mSample !== dSample && mRes.reason !== dRes.reason ? mRes.reason : null].filter((r) => !!r).join(" ");
        unmatched.push({ display: replaces, uses, reason: reason || "No matching semantic token." });
      }
      results.set(g, {
        key: `${g.name}|${replaces}`,
        name: g.name,
        status: existing ? "existing" : "new",
        type,
        alias,
        candidates,
        match,
        replaces,
        uses,
        note: notes.length ? notes.join(" ") : null,
        skip: false
      });
    }
    const tokens = groups.map((g) => results.get(g)).sort((a, b) => cmp(a.name, b.name) || cmp(a.key, b.key));
    unmatched.sort((a, b) => cmp(a.display, b.display) || cmp(a.reason, b.reason));
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
  function isMobile(i) {
    var _a;
    return ((_a = i.variant.props[LAYOUT]) != null ? _a : "").toLowerCase() === "mobile";
  }
  function collectItems(scan, renameMap) {
    var _a, _b, _c, _d, _e, _f;
    const items = [];
    const layerNameOf = (u) => {
      var _a2;
      return (_a2 = renameMap.get(pathKey(u.indexPath))) != null ? _a2 : u.layerName;
    };
    const partOf = (u) => u.indexPath.length === 0 ? void 0 : toSegment(layerNameOf(u)) || void 0;
    const paddingForms = /* @__PURE__ */ new Map();
    const cornerForms = /* @__PURE__ */ new Map();
    const visible2 = [];
    for (const variant of scan.variants) {
      for (const use of variant.uses) {
        const { node, hidden } = locate(variant.root, use.indexPath);
        if (hidden) continue;
        if (use.kind === "number" && (use.number === null || use.number === 0)) continue;
        if (use.kind === "color" && !use.hex) continue;
        visible2.push({ use, variant, node });
        const pk = (_a = partOf(use)) != null ? _a : "";
        if (PADDING_FIELDS.has(use.field)) {
          const lay = node == null ? void 0 : node.layout;
          const form = lay ? paddingForm(lay.paddingLeft, lay.paddingRight, lay.paddingTop, lay.paddingBottom) : 4;
          paddingForms.set(pk, Math.max((_b = paddingForms.get(pk)) != null ? _b : 1, form));
        }
        if (CORNER_FIELDS.has(use.field)) {
          const set = (_c = cornerForms.get(pk)) != null ? _c : /* @__PURE__ */ new Set();
          set.add(node ? cornerForm(node.corners) : "corners");
          cornerForms.set(pk, set);
        }
      }
    }
    for (const { use, variant } of visible2) {
      const layerName = layerNameOf(use);
      const part = partOf(use);
      const pk = part != null ? part : "";
      if (use.kind === "color") {
        const opacity = (_d = use.opacity) != null ? _d : 1;
        items.push({
          use,
          variant,
          layerName,
          category: "color",
          element: use.role === "other" ? toSegment(layerName) || "fill" : use.role,
          valueKey: `${normalizeHex(use.hex)}@${opacity}`,
          display: displayColor(use.hex, opacity)
        });
        continue;
      }
      const n = use.number;
      const base = { use, variant, layerName, part, valueKey: String(n), display: displayNumber(n) };
      if (PADDING_FIELDS.has(use.field)) {
        items.push(__spreadProps(__spreadValues({}, base), { category: "spacing", group: "padding", property: paddingProperty(use.field, (_e = paddingForms.get(pk)) != null ? _e : 4) }));
      } else if (use.field === "itemSpacing" || use.field === "counterAxisSpacing") {
        items.push(__spreadProps(__spreadValues({}, base), { category: "spacing", group: "gap", property: "gap" }));
      } else if (CORNER_FIELDS.has(use.field)) {
        const form = mergeCornerForms((_f = cornerForms.get(pk)) != null ? _f : /* @__PURE__ */ new Set(["corners"]));
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
      if (i.category !== "color" || !conflicted.has(slotKey(i))) continue;
      const named = toSegment(i.layerName);
      if (named && named !== i.element) {
        i.slotNote = `Several ${i.element} colors in one variant; element named after layer "${i.layerName}".`;
        i.element = named;
      }
    }
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
  function tieContext(items, surfaceByVariant) {
    const states = new Set(items.map((i) => {
      var _a;
      return normalizeState((_a = i.variant.props[STATE]) != null ? _a : "");
    }));
    const surfaces = /* @__PURE__ */ new Set();
    for (const i of items) {
      if (i.use.role !== "text" && i.use.role !== "icon") continue;
      const s = surfaceByVariant.get(i.variant.id);
      if (s) surfaces.add(s);
    }
    const state = states.size === 1 ? [...states][0] || null : null;
    return { state, surface: surfaces.size === 1 ? [...surfaces][0] : null };
  }
  function tieScore(v, ctx) {
    let score = 0;
    if (ctx.surface) {
      const p = `color/on-surface/${ctx.surface}`;
      if (v.name === p || v.name.startsWith(`${p}/`)) score += 2;
    }
    if (ctx.state && v.name.split("/").pop() === ctx.state) score += 1;
    return score;
  }
  function resolve(item, mode, catalog, ctx) {
    var _a;
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
      const ranked = exact.map((c, idx) => ({ c, idx, score: tieScore(c.variable, ctx) })).sort((a, b) => {
        const fa = item.category === "color" ? preferredFit(a.c.variable, item.use.role) : 0;
        const fb = item.category === "color" ? preferredFit(b.c.variable, item.use.role) : 0;
        return fa - fb || b.score - a.score || a.idx - b.idx;
      }).map((r) => r.c);
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
        reason: `No ${family} step close to ${item.display}; nearest is ${best.variable.name} (${target}).`,
        target: null
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
    for (const mode of MODES2) {
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
    const uses = [];
    const insideControl = root.height <= CONTROL_MAX_HEIGHT;
    const walk = (layer, isRoot) => {
      if (!layer.visible) return;
      const base = { variantId, indexPath: layer.indexPath, layerName: layer.name };
      const pushNumber = (field, value) => {
        if (!(value > 0) || layer.bound[field]) return;
        uses.push(__spreadProps(__spreadValues({}, base), { field, paintIndex: null, kind: "number", number: value, hex: null, opacity: null, role: "other" }));
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
          if (p.boundVariableId) return;
          uses.push(__spreadProps(__spreadValues({}, base), {
            field,
            paintIndex: real ? real[i] : i,
            kind: "color",
            number: null,
            hex: p.hex,
            opacity: p.opacity,
            role: field === "strokes" ? "border" : fillRole
          }));
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
  function num(node, key) {
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
    return Math.max(0, ...STROKE_SIDES.map((k) => num(node, k)));
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
  function textOf(node) {
    let fontSize = 0;
    if (typeof node.fontSize === "number") fontSize = node.fontSize;
    else {
      const seg = node.getStyledTextSegments(["fontSize"])[0];
      if (seg) fontSize = seg.fontSize;
    }
    return { characters: node.characters, fontSize };
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
        paddingLeft: num(node, "paddingLeft"),
        paddingRight: num(node, "paddingRight"),
        paddingTop: num(node, "paddingTop"),
        paddingBottom: num(node, "paddingBottom"),
        itemSpacing: num(node, "itemSpacing"),
        counterAxisSpacing: typeof counter === "number" ? counter : 0
      },
      fills: fills.paints,
      strokes: strokes.paints,
      strokeWeight: strokeWeightOf(node),
      corners: {
        tl: num(node, "topLeftRadius"),
        tr: num(node, "topRightRadius"),
        bl: num(node, "bottomLeftRadius"),
        br: num(node, "bottomRightRadius")
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
  async function scanComponent(node) {
    const isSet = node.type === "COMPONENT_SET";
    const components = isSet ? node.children.filter((c) => c.type === "COMPONENT") : [node];
    const variants = [];
    for (const comp of components) {
      const paintIndexes = /* @__PURE__ */ new Map();
      const root = await buildLayer(comp, [], paintIndexes);
      variants.push({
        id: comp.id,
        props: comp.type === "COMPONENT" ? variantPropsOf(comp, isSet) : {},
        root,
        uses: collectUses(comp.id, root, paintIndexes)
      });
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
    for (const col of collections) {
      const vars = await Promise.all(col.variableIds.map(getVariable));
      for (const v of vars) {
        if (!v || !isCatalogType(v.resolvedType)) continue;
        const values = {};
        for (const mode of col.modes) {
          const value = await resolve2(v, mode.name, mode.modeId);
          if (typeof value === "number") values[mode.name] = { number: value };
          else if (isRgb(value)) values[mode.name] = { hex: toHex(value), opacity: "a" in value ? value.a : 1 };
          else values[mode.name] = {};
        }
        variables.push({ id: v.id, name: v.name, collection: col.name, type: v.resolvedType, values });
      }
    }
    const components = (_a = collections.find((c) => c.name.trim().toLowerCase() === "components")) != null ? _a : null;
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
  var show = (v) => v === void 0 ? "none" : Array.isArray(v) ? `[${v.join(", ")}]` : String(v);
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
        if (JSON.stringify(x) !== JSON.stringify(y)) lines.push(`${next.path} \u203A ${f}: ${show(x)} -> ${show(y)}`);
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
        p = figma.variables.getVariableByIdAsync(id).catch(() => null);
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
      const col = v ? (_a = colName.get(v.variableCollectionId)) != null ? _a : "library" : "missing";
      if (col !== want) issues.push(`${n.name} \u203A ${field}: bound to ${col}/${v == null ? void 0 : v.name}, should be ${want}`);
    };
    const walk = async (n) => {
      var _a;
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
            await check(n, k, Array.isArray(a) ? a[0] : a, "typography");
          }
        }
      }
      if ("children" in n && n.type !== "INSTANCE") for (const c of n.children) await walk(c);
    };
    await walk(root);
    return issues.length ? issues : "PASS";
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
  function errorText2(e) {
    return e instanceof Error ? e.message : String(e);
  }
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
  async function scanForRename(node) {
    const scan = await scanComponent(node);
    return {
      componentId: scan.id,
      componentName: scan.name,
      newComponentName: normalizeComponentName(scan.name),
      renames: proposeLayerNames(scan.variants[0].root),
      tokens: [],
      unmatched: [],
      warnings: []
    };
  }
  async function scanForTokens(node, catalog) {
    const scan = await scanComponent(node);
    const normalized = normalizeComponentName(scan.name);
    const proposal = buildProposal(scan, catalog, [], normalized != null ? normalized : scan.name);
    const warnings = [...proposal.warnings];
    const pendingRenames = proposeLayerNames(scan.variants[0].root).length;
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
  async function handleScan(phase) {
    const node = selectedRoot();
    const catalog = phase === "tokens" ? await loadCatalog() : EMPTY_CATALOG;
    const proposal = phase === "rename" ? await scanForRename(node) : await scanForTokens(node, catalog);
    pending = { phase, componentId: proposal.componentId, catalog };
    const semantic = catalog.variables.filter((v) => v.collection !== "components").map((v) => ({ id: v.id, name: v.name, collection: v.collection, type: v.type }));
    post({ type: "component/proposal", phase, proposal, semantic });
  }
  async function handleApply(proposal) {
    if (!pending || pending.componentId !== proposal.componentId) {
      throw new Error("This review is out of date. Scan the component again.");
    }
    const { phase, catalog } = pending;
    const before = await takeSnapshot(proposal.componentId);
    const outcome = await applyProposal(proposal, catalog);
    const after = await takeSnapshot(proposal.componentId);
    const audit = phase === "tokens" ? await auditComponent(proposal.componentId) : "skipped";
    const result = __spreadProps(__spreadValues({}, outcome), { snapshotDiff: diffSnapshots(before, after), audit });
    pending = null;
    post({ type: "component/applied", phase, result });
    if (result.snapshotDiff.length > 0) {
      figma.notify("The component looks different after apply. Check the result, undo with Cmd+Z if needed.", {
        error: true
      });
    }
  }
  figma.ui.onmessage = async (msg) => {
    try {
      if (msg.type === "component/scan") await handleScan(msg.phase);
      else if (msg.type === "component/apply") await handleApply(msg.proposal);
      else if (msg.type === "component/cancel") pending = null;
    } catch (e) {
      post({ type: "component/error", message: errorText2(e) });
    }
  };
})();
