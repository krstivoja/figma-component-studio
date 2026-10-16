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

  // src/types.ts
  var BRIDGE_PORT = 9240;

  // src/bridge.ts
  var TOOLS = [
    "studio_status",
    "studio_get_component",
    "studio_get_tokens",
    "studio_propose_names",
    "studio_propose_tokens"
  ];
  var RETRY_FIRST_MS = 3e3;
  var RETRY_MAX_MS = 1e4;
  var REPLACED_CLOSE_CODE = 4002;
  function isBridgeRequest(x) {
    if (!x || typeof x !== "object" || Array.isArray(x)) return false;
    const r = x;
    return typeof r.id === "string" && r.id !== "" && TOOLS.includes(r.tool) && "args" in r;
  }
  function parseBridgeFrame(data) {
    if (typeof data !== "string") return null;
    try {
      const parsed = JSON.parse(data);
      return isBridgeRequest(parsed) ? parsed : null;
    } catch (e) {
      return null;
    }
  }
  function nextRetryDelay(previous) {
    return previous === null ? RETRY_FIRST_MS : Math.min(RETRY_MAX_MS, previous * 2);
  }
  function startBridge(onStatus) {
    let ws = null;
    let delay = null;
    let stopped = false;
    window.addEventListener("message", (event) => {
      var _a;
      const msg = (_a = event.data) == null ? void 0 : _a.pluginMessage;
      if ((msg == null ? void 0 : msg.type) !== "bridge/response" || !msg.response) return;
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg.response));
    });
    const retry = () => {
      if (stopped) return;
      delay = nextRetryDelay(delay);
      setTimeout(connect, delay);
    };
    const connect = () => {
      let socket;
      try {
        socket = new WebSocket(`ws://localhost:${BRIDGE_PORT}`);
      } catch (e) {
        onStatus("disconnected");
        retry();
        return;
      }
      ws = socket;
      socket.onopen = () => {
        delay = null;
        onStatus("connected");
      };
      socket.onmessage = (event) => {
        const request = parseBridgeFrame(event.data);
        if (request) parent.postMessage({ pluginMessage: { type: "bridge/request", request } }, "*");
      };
      socket.onerror = () => onStatus("disconnected");
      socket.onclose = (event) => {
        if (ws === socket) ws = null;
        if (event.code === REPLACED_CLOSE_CODE) {
          stopped = true;
          onStatus("conflict");
          return;
        }
        onStatus("disconnected");
        retry();
      };
    };
    connect();
  }

  // src/tokenPicker.ts
  var FAMILIES = ["surface", "on-surface", "border"];
  var FAMILY_ALIAS = { background: "surface", "on-background": "on-surface" };
  var SURFACES = ["primary", "1", "2", "3", "subtle", "accent", "brand", "feedback"];
  var FEEDBACK = ["info", "promo", "success", "warning", "error", "neutral", "loading"];
  var STATES = ["enabled", "hover", "pressed", "disabled", "loading"];
  var INTENTS = ["dimmed", "brand", "dark-brand", "dark brand", "darkBrand", "success", "warning", "error"];
  var STEPS = [...STATES, ...INTENTS];
  var TSHIRT = ["none", "4xs", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "full"];
  var NUMERIC = /^-?\d+(\.\d+)?$/;
  function segments(name) {
    var _a;
    const parts = name.split("/");
    if (parts[0] === "color") parts.shift();
    if (parts.length) parts[0] = (_a = FAMILY_ALIAS[parts[0]]) != null ? _a : parts[0];
    return parts;
  }
  function orderAt(parts, i) {
    if (i === 0) return FAMILIES;
    if (parts[0] !== "surface" && parts[0] !== "on-surface") return TSHIRT;
    if (i === 1) return SURFACES;
    if (i === 2 && parts[1] === "feedback") return FEEDBACK;
    return STEPS;
  }
  function compareSegment(a, b, order) {
    for (const list of [order, TSHIRT]) {
      const ra = list.indexOf(a);
      const rb = list.indexOf(b);
      if (ra >= 0 && rb >= 0) return ra - rb;
      if (ra >= 0 || rb >= 0) return ra >= 0 ? -1 : 1;
    }
    if (NUMERIC.test(a) && NUMERIC.test(b)) return Number(a) - Number(b);
    return a.localeCompare(b);
  }
  function compareTokenNames(a, b) {
    const pa = segments(a);
    const pb = segments(b);
    for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
      if (pa[i] === pb[i]) continue;
      return compareSegment(pa[i], pb[i], orderAt(pa, i));
    }
    return pa.length - pb.length || a.localeCompare(b);
  }
  function sortByTokenName(list) {
    return list.slice().sort((x, y) => compareTokenNames(x.name, y.name));
  }
  function shortName(name) {
    return name.startsWith("color/") ? name.slice("color/".length) : name;
  }
  function matchesQuery(name, query) {
    const hay = name.toLowerCase();
    return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
  }
  function filterGroups(groups, query) {
    return groups.map((g) => ({ label: g.label, options: g.options.filter((o) => matchesQuery(o.label, query)) })).filter((g) => g.options.length > 0);
  }
  function formatNumber(n) {
    return String(Math.round(n * 100) / 100);
  }
  function formatValue(entry) {
    if (entry == null ? void 0 : entry.light) {
      const hex = entry.light.hex.toUpperCase();
      return entry.light.opacity < 1 ? `${hex} @${Math.round(entry.light.opacity * 100)}%` : hex;
    }
    return typeof (entry == null ? void 0 : entry.value) === "number" ? formatNumber(entry.value) : "";
  }
  function triggerText(name, entry) {
    const short = shortName(name);
    return (entry == null ? void 0 : entry.type) === "FLOAT" && typeof entry.value === "number" ? `${short} \xB7 ${formatNumber(entry.value)}` : short;
  }
  function moveActive(current, delta, count) {
    if (count === 0) return -1;
    if (current < 0) return delta > 0 ? 0 : count - 1;
    return Math.max(0, Math.min(count - 1, current + delta));
  }
  function initialActive(options, value) {
    const i = options.findIndex((o) => o.id === value);
    return i >= 0 ? i : options.length ? 0 : -1;
  }
  var HEX = /^#[0-9a-f]{6}$/i;
  function rgba(hex, opacity) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255}, ${Math.max(0, Math.min(1, opacity))})`;
  }
  function el(tag, className, text) {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== void 0) node.textContent = text;
    return node;
  }
  function icon(path, className) {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 12 12");
    svg.setAttribute("width", "12");
    svg.setAttribute("height", "12");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("class", className);
    const p = document.createElementNS(ns, "path");
    p.setAttribute("d", path);
    p.setAttribute("fill", "none");
    p.setAttribute("stroke", "currentColor");
    p.setAttribute("stroke-width", "1.5");
    p.setAttribute("stroke-linecap", "round");
    p.setAttribute("stroke-linejoin", "round");
    svg.appendChild(p);
    return svg;
  }
  var CHEVRON = "M3 4.5l3 3 3-3";
  var CHECK = "M2.5 6.5l2.5 2.5 4.5-5.5";
  function swatch(entry) {
    const s = el("span", "tp-swatch");
    s.setAttribute("aria-hidden", "true");
    const light = entry == null ? void 0 : entry.light;
    if (!light || !HEX.test(light.hex)) {
      s.classList.add("unknown");
      return s;
    }
    if (light.opacity < 1) {
      s.classList.add("checker");
      s.style.setProperty("--swatch", rgba(light.hex, light.opacity));
    } else {
      s.style.backgroundColor = light.hex;
    }
    return s;
  }
  var openPicker = null;
  var uid = 0;
  function closeTokenPicker() {
    openPicker == null ? void 0 : openPicker.close(false);
  }
  function createTokenPicker(cfg) {
    uid += 1;
    const base = `tp-${uid}`;
    const labels = new Map(cfg.groups.flatMap((g) => g.options.map((o) => [o.id, o.label])));
    let value = cfg.value;
    const trigger = el("button", "tp-trigger");
    trigger.type = "button";
    trigger.id = `${base}-trigger`;
    trigger.setAttribute("aria-haspopup", "listbox");
    trigger.setAttribute("aria-expanded", "false");
    const valueEl = el("span", "tp-value");
    valueEl.id = `${base}-value`;
    trigger.setAttribute("aria-labelledby", `${cfg.labelId} ${valueEl.id}`);
    const paint = () => {
      var _a, _b, _c;
      trigger.replaceChildren();
      if (value === null) {
        valueEl.textContent = (_a = cfg.placeholder) != null ? _a : "Pick a token";
        valueEl.classList.add("placeholder");
        trigger.title = "";
        trigger.append(valueEl, icon(CHEVRON, "tp-chevron"));
        return;
      }
      const entry = cfg.entries.get(value);
      const name = (_c = (_b = entry == null ? void 0 : entry.name) != null ? _b : labels.get(value)) != null ? _c : value;
      valueEl.classList.remove("placeholder");
      valueEl.textContent = triggerText(name, entry);
      trigger.title = name;
      if ((entry == null ? void 0 : entry.type) !== "FLOAT") trigger.append(swatch(entry));
      trigger.append(valueEl, icon(CHEVRON, "tp-chevron"));
    };
    paint();
    const open = (seed = "") => {
      var _a;
      openPicker == null ? void 0 : openPicker.close(false);
      const popup = el("div", "tp-popup");
      const search = el("input", "tp-search");
      search.type = "text";
      search.spellcheck = false;
      search.placeholder = "Search tokens";
      search.value = seed;
      search.setAttribute("role", "combobox");
      search.setAttribute("aria-expanded", "true");
      search.setAttribute("aria-autocomplete", "list");
      search.setAttribute("aria-label", "Search tokens");
      const list = el("div", "tp-list");
      list.id = `${base}-list`;
      list.setAttribute("role", "listbox");
      list.setAttribute("aria-labelledby", cfg.labelId);
      search.setAttribute("aria-controls", list.id);
      const empty = el("div", "tp-empty", "No token matches");
      popup.append(search, list, empty);
      let flat = [];
      let rows2 = [];
      let active = -1;
      const setActive = (i) => {
        var _a2;
        (_a2 = rows2[active]) == null ? void 0 : _a2.classList.remove("active");
        active = i;
        const row = rows2[active];
        if (!row) {
          search.removeAttribute("aria-activedescendant");
          return;
        }
        row.classList.add("active");
        search.setAttribute("aria-activedescendant", row.id);
        row.scrollIntoView({ block: "nearest" });
      };
      const renderList = () => {
        const groups = filterGroups(cfg.groups, search.value);
        list.replaceChildren();
        flat = groups.flatMap((g) => g.options);
        rows2 = [];
        groups.forEach((g, gi) => {
          var _a2, _b;
          const group = el("div", "tp-group");
          group.setAttribute("role", "group");
          const heading = el("div", "tp-group-label", g.label);
          heading.id = `${base}-g${gi}`;
          group.setAttribute("aria-labelledby", heading.id);
          group.appendChild(heading);
          for (const o of g.options) {
            const entry = cfg.entries.get(o.id);
            const index = rows2.length;
            const row = el("div", "tp-option");
            row.id = `${base}-o${index}`;
            row.setAttribute("role", "option");
            row.setAttribute("aria-selected", String(o.id === value));
            row.title = (_a2 = entry == null ? void 0 : entry.name) != null ? _a2 : o.label;
            const check = icon(CHECK, "tp-check");
            if (o.id !== value) check.style.visibility = "hidden";
            row.append(check);
            if ((entry == null ? void 0 : entry.type) !== "FLOAT") row.append(swatch(entry));
            row.append(el("span", "tp-name", shortName((_b = entry == null ? void 0 : entry.name) != null ? _b : o.label)), el("span", "tp-hex", formatValue(entry)));
            row.addEventListener("mousedown", (e) => e.preventDefault());
            row.addEventListener("mousemove", () => {
              if (active !== index) setActive(index);
            });
            row.addEventListener("click", () => pick(index));
            rows2.push(row);
            group.appendChild(row);
          }
          list.appendChild(group);
        });
        empty.hidden = flat.length > 0;
        active = -1;
        setActive(initialActive(flat, value));
      };
      const place = () => {
        const r = trigger.getBoundingClientRect();
        const margin = 8;
        const gap = 4;
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const width = Math.min(Math.max(r.width, 260), vw - 2 * margin);
        popup.style.width = `${width}px`;
        popup.style.left = `${Math.max(margin, Math.min(r.left, vw - width - margin))}px`;
        popup.style.maxHeight = "";
        popup.style.top = "";
        popup.style.bottom = "";
        const natural = Math.min(popup.scrollHeight, 320);
        const below = vh - r.bottom - gap - margin;
        const above = r.top - gap - margin;
        if (below >= natural || below >= above) {
          popup.style.top = `${r.bottom + gap}px`;
          popup.style.maxHeight = `${Math.min(320, below)}px`;
        } else {
          popup.style.bottom = `${vh - r.top + gap}px`;
          popup.style.maxHeight = `${Math.min(320, above)}px`;
        }
      };
      const onOutside = (e) => {
        const t = e.target;
        if (!popup.contains(t) && !trigger.contains(t)) close(false);
      };
      const onScroll = (e) => {
        if (!popup.contains(e.target)) close(false);
      };
      const onResize = () => close(false);
      const close = (returnFocus) => {
        popup.remove();
        trigger.setAttribute("aria-expanded", "false");
        document.removeEventListener("mousedown", onOutside, true);
        document.removeEventListener("scroll", onScroll, true);
        window.removeEventListener("resize", onResize);
        if (openPicker === handle) openPicker = null;
        if (returnFocus) trigger.focus();
      };
      const handle = { close };
      const pick = (i) => {
        const o = flat[i];
        if (!o) return;
        close(true);
        if (o.id === value) return;
        value = o.id;
        paint();
        cfg.onChange(o.id);
      };
      search.addEventListener("input", renderList);
      search.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          setActive(moveActive(active, e.key === "ArrowDown" ? 1 : -1, rows2.length));
        } else if (e.key === "Home" || e.key === "End") {
          if (!rows2.length) return;
          e.preventDefault();
          setActive(e.key === "Home" ? 0 : rows2.length - 1);
        } else if (e.key === "Enter") {
          e.preventDefault();
          pick(active);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        } else if (e.key === "Tab") {
          close(true);
        }
      });
      document.body.appendChild(popup);
      renderList();
      place();
      trigger.setAttribute("aria-expanded", "true");
      openPicker = handle;
      document.addEventListener("mousedown", onOutside, true);
      document.addEventListener("scroll", onScroll, true);
      window.addEventListener("resize", onResize);
      search.focus();
      search.setSelectionRange(seed.length, seed.length);
      (_a = rows2[active]) == null ? void 0 : _a.scrollIntoView({ block: "nearest" });
    };
    trigger.addEventListener("click", () => {
      if (trigger.getAttribute("aria-expanded") === "true") openPicker == null ? void 0 : openPicker.close(true);
      else open();
    });
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        open();
      } else if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        open(e.key);
      }
    });
    return trigger;
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

  // src/naming.ts
  var ALL_CAPS_COMPONENTS = /* @__PURE__ */ new Set(["HEADER", "MAIN", "FOOTER", "DIALOG"]);
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
  var KNOWN_TOKENS = new Set(
    [].concat(...[...VOCABULARY.map((e) => e.name), ...SYNONYMS.keys()].map((n) => n.toLowerCase().split(/[\s\-_/]+/)))
  );

  // src/tokenNames.ts
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

  // src/match.ts
  var GLOBAL = "_global";
  var TRANSPARENT = "color/transparent";
  var FAMILIES2 = {
    background: { prefixes: ["color/surface/", "color/background/primary"], preferred: "color/surface/" },
    text: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    icon: { prefixes: ["color/on-surface/", "color/on-background/"], preferred: "color/on-surface/" },
    border: { prefixes: ["color/border/"], preferred: "color/border/" },
    other: { prefixes: ["color/"], preferred: null }
  };
  var withTransparent = (role) => role === "border" || role === "other";
  function inRoleFamily(v, role) {
    if (v.collection === GLOBAL) return v.name === TRANSPARENT && withTransparent(role);
    return v.collection === "color" && inFamily(v.name, FAMILIES2[role].prefixes);
  }
  function inFamily(name, prefixes) {
    return prefixes.some((p) => p.endsWith("/") ? name.startsWith(p) : name === p);
  }

  // src/proposal.ts
  function ownTokenPrefix(componentName) {
    return buildTokenName({ component: componentName, category: "color", element: "x" }).slice(0, -"color/x".length);
  }

  // src/apply.ts
  var CATEGORY_ORDER = ["color", "spacing", "shape"];
  function componentPrefix(componentName) {
    var _a;
    return ownTokenPrefix((_a = normalizeComponentName(componentName)) != null ? _a : componentName);
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

  // src/review.ts
  var CATEGORIES = ["color", "spacing", "shape"];
  var COMPONENT_SEGMENT = /^_?[a-z0-9]+(?:[-_][a-z0-9]+)*$/;
  var SEGMENT = /^[a-z0-9][a-zA-Z0-9]*(?:-[a-z0-9][a-zA-Z0-9]*)*$/;
  function validateTokenName(name) {
    if (!name.trim()) return "Name is empty";
    if (name !== name.trim() || /\s/.test(name)) return "No spaces allowed";
    const parts = name.split("/");
    if (parts.some((p) => p === "")) return "Empty segment (check the slashes)";
    if (!COMPONENT_SEGMENT.test(parts[0])) return "Component segment must be lowercase-kebab";
    const bad = parts.slice(1).find((p) => !SEGMENT.test(p));
    if (bad) return `Segment "${bad}" must start lowercase (camelCase or kebab)`;
    const catIndex = parts.findIndex((p, i) => i > 0 && CATEGORIES.includes(p));
    if (catIndex === -1) return "Needs a category: color, spacing or shape";
    if (catIndex > 2) return "Category must follow the component or its part";
    if (parts.filter((p) => CATEGORIES.includes(p)).length > 1) return "Only one category segment allowed";
    if (catIndex === parts.length - 1) return "Needs a property after the category";
    return null;
  }
  function semanticType(t) {
    return t === "COLOR" ? "COLOR" : "FLOAT";
  }
  var FAMILY_LABELS = {
    background: "Fits background",
    text: "Fits text",
    icon: "Fits icon",
    border: "Fits border",
    other: ""
  };
  function familyGroups(u, semantic2, first) {
    var _a, _b, _c, _d;
    const want = semanticType(u.type);
    const role = (_b = (_a = u.uses[0]) == null ? void 0 : _a.role) != null ? _b : "other";
    const byId = new Map(semantic2.map((s) => [s.id, s]));
    const restricted = u.type === "COLOR" && role !== "other";
    const fits = (s) => s.type === want && (!restricted || inRoleFamily(s, role));
    const option = (s) => ({ id: s.id, label: s.name });
    const taken = /* @__PURE__ */ new Set();
    const groups = [];
    const add = (label, list) => {
      const fresh = list.filter((s) => !taken.has(s.id));
      fresh.forEach((s) => taken.add(s.id));
      if (fresh.length) groups.push({ label, options: fresh.map(option) });
    };
    const known = (ids) => ids.flatMap((id) => byId.has(id) ? [byId.get(id)] : []);
    for (const id of first) taken.add(id);
    add("Pairs with the surface", known((_c = u.pairOptions) != null ? _c : []).filter(fits));
    if (restricted) {
      add(FAMILY_LABELS[role], sortByTokenName(semantic2.filter(fits)));
      return groups;
    }
    const byCollection = /* @__PURE__ */ new Map();
    for (const s of semantic2) if (fits(s)) byCollection.set(s.collection, [...(_d = byCollection.get(s.collection)) != null ? _d : [], s]);
    for (const [label, list] of byCollection) add(label, sortByTokenName(list));
    return groups;
  }
  function aliasOptions(token, semantic2) {
    var _a, _b;
    const byId = new Map(semantic2.map((s) => [s.id, s]));
    const role = (_b = (_a = token.uses[0]) == null ? void 0 : _a.role) != null ? _b : "other";
    const suggested = [];
    for (const id of [token.alias.desktop, token.alias.mobile]) if (id && !suggested.includes(id)) suggested.push(id);
    for (const id of token.candidates) {
      const s = byId.get(id);
      const fits = !s || token.type !== "COLOR" || role === "other" || inRoleFamily(s, role);
      if (fits && !suggested.includes(id)) suggested.push(id);
    }
    const groups = [];
    if (suggested.length) {
      groups.push({
        label: "Suggested",
        options: suggested.map((id) => {
          var _a2, _b2;
          return { id, label: (_b2 = (_a2 = byId.get(id)) == null ? void 0 : _a2.name) != null ? _b2 : id };
        })
      });
    }
    return [...groups, ...familyGroups(token, semantic2, suggested)];
  }
  function unmatchedOptions(u, semantic2) {
    return familyGroups(u, semantic2, []);
  }
  function rawValue(u) {
    const prefix = `${u.tokenName}|`;
    return u.key.startsWith(prefix) ? u.key.slice(prefix.length) : u.display;
  }
  function adoptUnmatched(p, key, variableId, variableName) {
    const u = p.unmatched.find((x) => x.key === key);
    if (!u) return p;
    const value = rawValue(u);
    const adopted = {
      key: u.key,
      name: u.tokenName,
      status: "new",
      type: u.type,
      alias: { desktop: variableId, mobile: variableId },
      candidates: [],
      match: "manual",
      source: "user",
      replaces: value,
      uses: u.uses.slice(),
      note: `Changes the look: ${value} -> ${variableName}`,
      skip: false
    };
    return __spreadProps(__spreadValues({}, p), {
      tokens: [...p.tokens, adopted],
      unmatched: p.unmatched.filter((x) => x.key !== key)
    });
  }
  function undoAdopt(p, key, baseline2) {
    const t = p.tokens.find((x) => x.key === key);
    if (!t || t.source !== "user" || !baseline2.unmatched.some((u) => u.key === key)) return p;
    const keep = /* @__PURE__ */ new Set([...p.unmatched.map((u) => u.key), key]);
    return __spreadProps(__spreadValues({}, p), {
      tokens: p.tokens.filter((x) => x.key !== key),
      unmatched: baseline2.unmatched.filter((u) => keep.has(u.key))
    });
  }
  function touchesSurface(uses) {
    return uses.some((u) => u.kind === "color" && u.field === "fills" && u.role === "background");
  }
  function rawRow(u, semantic2) {
    const options = unmatchedOptions(u, semantic2);
    const s = u.suggestion;
    const offered = !!s && options.some((g) => g.options.some((o) => o.id === s.variableId));
    return {
      key: u.key,
      display: u.display,
      useCount: u.uses.length,
      reason: offered ? `${u.reason} ${s.reason}` : u.reason,
      options,
      selected: offered ? s.variableId : null,
      suggested: offered,
      surface: touchesSurface(u.uses)
    };
  }
  function suggestedKeys(p) {
    return p.unmatched.filter((u) => u.suggestion).map((u) => u.key);
  }
  function adoptAllSuggestions(p) {
    let next = p;
    for (const u of p.unmatched) {
      if (u.suggestion) next = adoptUnmatched(next, u.key, u.suggestion.variableId, u.suggestion.variableName);
    }
    return next;
  }
  function buildReviewModel(p, semantic2) {
    var _a, _b, _c, _d;
    const raw = [];
    const tokens = [];
    const names = new Map(semantic2.map((s) => [s.id, s.name]));
    const previousText = (prev) => {
      if (!prev) return null;
      const n = (id) => {
        var _a2;
        return id ? (_a2 = names.get(id)) != null ? _a2 : id : "none";
      };
      return prev.desktop === prev.mobile ? n(prev.desktop) : `${n(prev.desktop)} (desktop) / ${n(prev.mobile)} (mobile)`;
    };
    for (const t of creationOrder(p.tokens, p.componentName)) {
      if (t.match === "none") {
        raw.push({
          key: null,
          display: `${t.name} (${t.replaces})`,
          useCount: t.uses.length,
          reason: (_a = t.note) != null ? _a : "No semantic token matches this value",
          options: [],
          selected: null,
          suggested: false,
          surface: false
        });
        continue;
      }
      tokens.push({
        key: t.key,
        name: t.name,
        apply: !t.skip,
        status: t.status,
        match: t.match,
        source: t.source,
        splitModes: t.alias.desktop !== t.alias.mobile,
        aliasDesktop: t.alias.desktop,
        aliasMobile: t.alias.mobile,
        options: aliasOptions(t, semantic2),
        replaces: t.replaces,
        useCount: t.uses.length,
        note: t.note,
        kind: (_b = t.kind) != null ? _b : null,
        previousAlias: t.kind === "alias-change" ? previousText(t.previousAlias) : null,
        previousName: t.kind === "rename" ? (_c = t.previousName) != null ? _c : null : null,
        surface: touchesSurface(t.uses)
      });
    }
    for (const u of p.unmatched) raw.push(rawRow(u, semantic2));
    return {
      componentName: p.componentName,
      newComponentName: p.newComponentName,
      warnings: p.warnings.slice(),
      renames: p.renames.map((r, index) => ({
        index,
        depth: r.indexPath.length,
        oldName: r.oldName,
        newName: r.newName,
        reason: r.reason,
        apply: !r.skip,
        source: r.source,
        outsideVocabulary: r.outsideVocabulary
      })),
      tokens,
      typography: ((_d = p.typography) != null ? _d : []).map((t) => ({
        key: t.key,
        role: t.role,
        apply: !t.skip,
        match: t.match,
        layerCount: t.uses.length,
        bindings: Object.entries(t.bindings).map(([field, id]) => {
          var _a2;
          return { field, variable: (_a2 = names.get(id)) != null ? _a2 : id };
        }),
        note: t.note
      })),
      raw
    };
  }
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function formatLocalTime(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function namingBanner(naming2) {
    if (!naming2) return null;
    if (naming2.source === "claude") {
      return {
        tone: "claude",
        text: `Names proposed by Claude, ${formatLocalTime(naming2.createdAt)}. Rows marked Rules were filled in for layers Claude did not cover.`
      };
    }
    if (!naming2.claudeRequested) return null;
    return {
      tone: "warning",
      text: "No Claude proposal found on this component. Ask Claude Code to name it, then scan again. Showing rule-based names meanwhile."
    };
  }
  function collectProposal(original2, edits2) {
    const renameEdits = new Map(edits2.renames.map((e) => [e.index, e]));
    const tokenEdits = new Map(edits2.tokens.map((e) => [e.key, e]));
    return __spreadProps(__spreadValues(__spreadProps(__spreadValues({}, original2), {
      newComponentName: edits2.newComponentName === void 0 || original2.newComponentName === null ? original2.newComponentName : edits2.newComponentName,
      renames: original2.renames.map((r, i) => {
        const e = renameEdits.get(i);
        return __spreadValues(__spreadProps(__spreadValues({}, r), { indexPath: r.indexPath.slice() }), e ? { newName: e.newName, skip: !e.apply } : {});
      }),
      tokens: original2.tokens.map((t) => {
        const e = tokenEdits.get(t.key);
        const copy = __spreadProps(__spreadValues({}, t), { alias: __spreadValues({}, t.alias), candidates: t.candidates.slice(), uses: t.uses.slice() });
        if (e) {
          copy.name = e.name;
          copy.skip = !e.apply;
          copy.alias = { desktop: e.aliasDesktop, mobile: e.aliasMobile };
        }
        if (copy.match === "none") copy.skip = true;
        return copy;
      }),
      unmatched: original2.unmatched.map((u) => __spreadProps(__spreadValues({}, u), { uses: u.uses.slice() }))
    }), original2.typography ? {
      typography: original2.typography.map((t) => {
        var _a;
        const e = (_a = edits2.typography) == null ? void 0 : _a.find((x) => x.key === t.key);
        return __spreadProps(__spreadValues({}, t), { uses: t.uses.slice(), bindings: __spreadValues({}, t.bindings), skip: e ? !e.apply : t.skip });
      })
    } : {}), {
      warnings: original2.warnings.slice()
    });
  }
  function surfaceChoices(current) {
    return current.tokens.filter((t) => touchesSurface(t.uses) && t.match !== "none").map((t) => ({ key: t.key, apply: !t.skip, alias: __spreadValues({}, t.alias) }));
  }
  function mergeRepaired(previous, next) {
    var _a;
    let original2 = next;
    for (const t of previous.original.tokens) {
      if (t.source === "user" && next.unmatched.some((u) => u.key === t.key) && t.alias.desktop) {
        const adopted = adoptUnmatched(original2, t.key, t.alias.desktop, "");
        original2 = __spreadProps(__spreadValues({}, adopted), { tokens: adopted.tokens.map((x) => x.key === t.key ? __spreadProps(__spreadValues({}, x), { alias: __spreadValues({}, t.alias), note: t.note }) : x) });
      }
    }
    const before = new Map(previous.original.tokens.map((t) => [t.key, t]));
    const same = (a, b) => !!b && a.skip === b.skip && a.alias.desktop === b.alias.desktop && a.alias.mobile === b.alias.mobile && a.kind === b.kind;
    const tokens = original2.tokens.map((t) => {
      const kept = previous.edits.tokens.find((e) => e.key === t.key);
      return kept && same(t, before.get(t.key)) ? __spreadValues({}, kept) : { key: t.key, name: t.name, apply: !t.skip, aliasDesktop: t.alias.desktop, aliasMobile: t.alias.mobile };
    });
    const typography = ((_a = original2.typography) != null ? _a : []).map((t) => {
      var _a2, _b;
      return (_b = (_a2 = previous.edits.typography) == null ? void 0 : _a2.find((e) => e.key === t.key)) != null ? _b : { key: t.key, apply: !t.skip };
    });
    return { original: original2, edits: __spreadProps(__spreadValues({}, previous.edits), { tokens, typography }) };
  }
  function tokenErrors(p) {
    var _a, _b, _c;
    const errors = /* @__PURE__ */ new Map();
    const active = p.tokens.filter((t) => !t.skip && t.match !== "none");
    const byName2 = /* @__PURE__ */ new Map();
    for (const t of active) {
      const err = validateTokenName(t.name);
      if (err) errors.set(t.key, err);
      if (t.kind !== "rename" && (!t.alias.desktop || !t.alias.mobile)) errors.set(t.key, (_a = errors.get(t.key)) != null ? _a : "Pick an alias for every mode");
      const list = (_b = byName2.get(t.name)) != null ? _b : [];
      list.push(t);
      byName2.set(t.name, list);
    }
    for (const [name, list] of byName2) {
      const first = list[0];
      const conflict = list.some((t) => t.alias.desktop !== first.alias.desktop || t.alias.mobile !== first.alias.mobile);
      if (!conflict) continue;
      for (const t of list) errors.set(t.key, (_c = errors.get(t.key)) != null ? _c : `"${name}" is used with different aliases`);
    }
    return errors;
  }
  function renameErrors(p) {
    const errors = /* @__PURE__ */ new Map();
    p.renames.forEach((r, i) => {
      if (!r.skip && !r.newName.trim()) errors.set(i, "New name is empty");
    });
    return errors;
  }
  function findProblems(p) {
    var _a, _b;
    const problems = [];
    for (const [i, err] of renameErrors(p)) problems.push(`Rename "${p.renames[i].oldName}": ${err}`);
    const byKey = new Map(p.tokens.map((t) => [t.key, t]));
    for (const [key, err] of tokenErrors(p)) problems.push(`Token "${(_b = (_a = byKey.get(key)) == null ? void 0 : _a.name) != null ? _b : key}": ${err}`);
    if (p.newComponentName !== null && !p.newComponentName.trim()) problems.push("New component name is empty");
    return problems;
  }
  function countChecked(p) {
    var _a;
    return {
      renames: p.renames.filter((r) => !r.skip).length,
      tokens: p.tokens.filter((t) => !t.skip && t.match !== "none").length,
      typography: ((_a = p.typography) != null ? _a : []).filter((t) => !t.skip).length
    };
  }
  function stepTitle(phase2) {
    return phase2 === "rename" ? "Step 1: rename layers" : "Step 2: create tokens";
  }
  function summarizeResult(r, phase2) {
    var _a;
    const counts = phase2 === "rename" ? `${r.renamed} renamed` : `${r.tokensCreated} tokens created, ${r.tokensReused} reused, ${r.bound} bound` + (((_a = r.tokenRenames) == null ? void 0 : _a.length) ? `, ${r.tokenRenames.length} renamed` : "") + (r.aliasesChanged ? `, ${r.aliasesChanged} alias${r.aliasesChanged === 1 ? "" : "es"} changed` : "");
    return `${stepTitle(phase2)} applied. ${counts}`;
  }
  function renamedTokensText(r) {
    var _a;
    if (!((_a = r.tokenRenames) == null ? void 0 : _a.length)) return null;
    return r.tokenRenames.map((x) => `- ${x.from} -> ${x.to}`).join("\n");
  }
  function staleTokensText(r) {
    var _a;
    const n = (_a = r.staleTokenNames) != null ? _a : 0;
    if (n <= 0) return null;
    return n === 1 ? "1 token still uses the old names; step 2 will offer to rename it." : `${n} tokens still use the old names; step 2 will offer to rename them.`;
  }
  function auditView(audit) {
    if (audit === "PASS") return { kind: "pass", text: "Audit: PASS" };
    if (audit === "skipped") return { kind: "skipped", text: "Audit: not run in the rename step" };
    return { kind: "issues", text: "Audit issues", lines: audit };
  }
  function lookChangeView(result, applied) {
    var _a;
    if (!result.snapshotDiff.length) return { kind: "unchanged" };
    const intended = !!applied && (applied.tokens.some((t) => t.match === "manual" && !t.skip) || ((_a = applied.typography) != null ? _a : []).some((t) => t.match === "manual" && !t.skip));
    return { kind: intended ? "intended" : "loud", lines: result.snapshotDiff.slice() };
  }

  // src/ui.ts
  var scanRenameBtn = document.getElementById("scan-rename");
  var scanTokensBtn = document.getElementById("scan-tokens");
  var useClaudeCb = document.getElementById("use-claude");
  var stepTitleEl = document.getElementById("step-title");
  var statusEl = document.getElementById("status");
  var reviewEl = document.getElementById("review");
  var actionsEl = document.getElementById("review-actions");
  var countsEl = document.getElementById("counts");
  var applyBtn = document.getElementById("apply");
  var cancelBtn = document.getElementById("cancel");
  var resultEl = document.getElementById("result");
  var bridgeStatusEl = document.getElementById("bridge-status");
  var bridgeTextEl = document.getElementById("bridge-status-text");
  var storedBannerEl = document.getElementById("stored-banner");
  var storedTextEl = document.getElementById("stored-text");
  var storedLoadBtn = document.getElementById("stored-load");
  var baseline = null;
  var original = null;
  var semantic = [];
  var semanticById = /* @__PURE__ */ new Map();
  var naming = null;
  var lastApplied = null;
  var pendingStored = null;
  var focusAfterRender = null;
  var phase = "rename";
  var edits = { renames: [], tokens: [] };
  var busy = false;
  var uid2 = 0;
  var renameErrorEls = /* @__PURE__ */ new Map();
  var tokenErrorEls = /* @__PURE__ */ new Map();
  var USE_CLAUDE_KEY = "component-studio.useClaude";
  try {
    useClaudeCb.checked = localStorage.getItem(USE_CLAUDE_KEY) === "1";
  } catch (e) {
    useClaudeCb.checked = false;
  }
  function persistUseClaude() {
    try {
      localStorage.setItem(USE_CLAUDE_KEY, useClaudeCb.checked ? "1" : "0");
    } catch (e) {
    }
  }
  useClaudeCb.addEventListener("change", persistUseClaude);
  function send(msg) {
    parent.postMessage({ pluginMessage: msg }, "*");
  }
  function h(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    if (props.className) node.className = props.className;
    if (props.text !== void 0) node.textContent = props.text;
    for (const c of children) if (c) node.appendChild(c);
    return node;
  }
  function nextId(prefix) {
    uid2 += 1;
    return `${prefix}-${uid2}`;
  }
  function hiddenLabel(forId, text) {
    const label = h("label", { className: "sr-only", text });
    label.htmlFor = forId;
    return label;
  }
  function checkbox(checked, label, onChange) {
    const input = h("input");
    input.type = "checkbox";
    input.id = nextId("cb");
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    const wrap = h("span", {}, [hiddenLabel(input.id, label), input]);
    return { wrap, input };
  }
  function textInput(value, label, onInput) {
    const input = h("input");
    input.type = "text";
    input.id = nextId("tx");
    input.value = value;
    input.spellcheck = false;
    input.addEventListener("input", () => onInput(input.value));
    return { input, label: hiddenLabel(input.id, label) };
  }
  function aliasPicker(groups, value, label, onChange, labelVisible = true) {
    const labelEl = h("span", { className: labelVisible ? "picker-label" : "sr-only", text: label });
    labelEl.id = nextId("lbl");
    const trigger = createTokenPicker({ groups, value, entries: semanticById, labelId: labelEl.id, onChange });
    return { wrap: h("div", {}, [labelEl, trigger]), trigger };
  }
  function badge(text, variant = text, title) {
    const el2 = h("span", { className: `badge ${variant}`, text });
    if (title) el2.title = title;
    return el2;
  }
  function smallButton(text, label, onClick) {
    const btn = h("button", { className: "secondary small", text });
    btn.type = "button";
    btn.setAttribute("aria-label", label);
    btn.addEventListener("click", onClick);
    return btn;
  }
  var BRIDGE_LABELS = {
    connected: "Claude connected",
    disconnected: "Claude not connected",
    conflict: "Another Component Studio window is connected"
  };
  function showBridgeStatus(status) {
    bridgeStatusEl.className = `pill ${status}`;
    bridgeTextEl.textContent = BRIDGE_LABELS[status];
    bridgeStatusEl.title = status === "disconnected" ? "Run `claude` in the figma-component-studio folder; it connects automatically." : "";
  }
  function renderStoredBanner() {
    storedBannerEl.hidden = !pendingStored;
    if (!pendingStored) return;
    const what = pendingStored.phase === "rename" ? "Claude updated the layer names" : "Claude suggested tokens";
    storedTextEl.textContent = `${what} (${pendingStored.count})`;
    storedLoadBtn.disabled = busy;
  }
  function setStatus(text, isError = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle("error", isError);
  }
  function setBusy(value) {
    busy = value;
    scanRenameBtn.disabled = value;
    scanTokensBtn.disabled = value;
    useClaudeCb.disabled = value;
    cancelBtn.disabled = value;
    renderStoredBanner();
    refresh();
  }
  function clearReview() {
    closeTokenPicker();
    baseline = null;
    original = null;
    edits = { renames: [], tokens: [] };
    renameErrorEls.clear();
    tokenErrorEls.clear();
    reviewEl.replaceChildren();
    reviewEl.hidden = true;
    stepTitleEl.hidden = true;
    actionsEl.hidden = true;
  }
  function showFieldError(input, errorEl, err) {
    errorEl.textContent = err != null ? err : "";
    input.classList.toggle("invalid", !!err);
    input.setAttribute("aria-invalid", err ? "true" : "false");
  }
  function refresh() {
    if (!original) return;
    const current = collectProposal(original, edits);
    const rErr = renameErrors(current);
    const tErr = tokenErrors(current);
    for (const [i, els] of renameErrorEls) showFieldError(els.input, els.error, rErr.get(i));
    for (const [key, els] of tokenErrorEls) showFieldError(els.input, els.error, tErr.get(key));
    const counts = countChecked(current);
    const problems = findProblems(current);
    const nameChanged = current.newComponentName !== null && current.newComponentName !== current.componentName;
    countsEl.textContent = (phase === "rename" ? `${counts.renames} rename${counts.renames === 1 ? "" : "s"}` : `${counts.tokens} token${counts.tokens === 1 ? "" : "s"}` + (counts.typography ? ` \xB7 ${counts.typography} text style${counts.typography === 1 ? "" : "s"}` : "")) + (problems.length ? ` \xB7 ${problems.length} problem${problems.length === 1 ? "" : "s"} to fix` : "");
    applyBtn.disabled = busy || problems.length > 0 || counts.renames === 0 && counts.tokens === 0 && counts.typography === 0 && !nameChanged;
  }
  function renderHeader(model, naming2) {
    const frag = document.createDocumentFragment();
    const banner = phase === "rename" ? namingBanner(naming2) : null;
    if (banner) frag.appendChild(h("p", { className: `naming-banner ${banner.tone}`, text: banner.text }));
    frag.appendChild(h("h3", { text: `Component: ${model.componentName}` }));
    if (phase === "rename" && model.newComponentName !== null) {
      const { input } = textInput(model.newComponentName, "New component name", (v) => {
        edits.newComponentName = v;
        refresh();
      });
      const visible = h("label", { text: "New component name" });
      visible.htmlFor = input.id;
      frag.appendChild(h("div", { className: "name-field" }, [visible, input]));
    }
    if (model.warnings.length) {
      frag.appendChild(h("ul", { className: "warnings" }, model.warnings.map((w) => h("li", { text: w }))));
    }
    return frag;
  }
  function renderRenames(model) {
    if (!model.renames.length) return null;
    const showSource = model.renames.some((r) => r.source === "claude");
    const rows2 = model.renames.map((r) => {
      const tr = h("tr", { className: r.apply ? "" : "off" });
      const edit = edits.renames.find((e) => e.index === r.index);
      const cb = checkbox(r.apply, `Apply rename of ${r.oldName}`, (v) => {
        edit.apply = v;
        tr.className = v ? "" : "off";
        refresh();
      });
      const { input, label } = textInput(r.newName, `New name for ${r.oldName}`, (v) => {
        edit.newName = v;
        refresh();
      });
      const error = h("div", { className: "field-error" });
      renameErrorEls.set(r.index, { input, error });
      const indent = h("span", { className: "indent" });
      indent.style.width = `${r.depth * 10}px`;
      const source = showSource ? h("td", { className: "source" }, [badge(r.source === "claude" ? "Claude" : "Rules", r.source)]) : null;
      if (source && r.outsideVocabulary) {
        const warn = badge("not in vocabulary", "off-vocab");
        warn.title = "Claude used a name outside the vocabulary list; check it";
        source.append(document.createTextNode(" "), warn);
      }
      tr.append(
        h("td", {}, [cb.wrap]),
        h("td", { className: "nowrap" }, [indent, document.createTextNode(r.oldName)]),
        h("td", { className: "arrow", text: "\u2192" }),
        h("td", {}, [label, input, error]),
        ...source ? [source] : [],
        h("td", { className: "muted", text: r.reason })
      );
      return tr;
    });
    const columns = ["Apply", "Layer", "", "New name", ...showSource ? ["Source"] : [], "Reason"];
    const head = h("tr", {}, columns.map((t) => h("th", { text: t })));
    return h("section", {}, [
      h("h3", { text: "Layer renames" }),
      h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows2)])
    ]);
  }
  function renderTokens(model) {
    if (!model.tokens.length) return null;
    const rows2 = model.tokens.map((t) => {
      const tr = h("tr", { className: t.apply ? "" : "off" });
      const edit = edits.tokens.find((e) => e.key === t.key);
      const cb = checkbox(t.apply, `Apply token ${t.name}`, (v) => {
        edit.apply = v;
        tr.className = v ? "" : "off";
        refresh();
        if (t.surface) requestRepair();
      });
      const { input, label } = textInput(t.name, "Token name", (v) => {
        edit.name = v;
        refresh();
      });
      if (t.kind === "alias-change") {
        input.readOnly = true;
        input.title = "Existing token; only its alias changes.";
      }
      if (t.kind === "rename") {
        input.readOnly = true;
        input.title = "Existing token renamed in place; its bindings and alias stay.";
      }
      const error = h("div", { className: "field-error" });
      tokenErrorEls.set(t.key, { input, error });
      const alias = h("td", { className: "alias" });
      if (t.previousAlias) alias.append(h("div", { className: "was" }, [slashBreaks(`${t.previousAlias} \u2192`)]));
      if (t.kind === "rename") {
        const names = [t.aliasDesktop, t.aliasMobile].map((id) => {
          var _a, _b;
          return id ? (_b = (_a = semanticById.get(id)) == null ? void 0 : _a.name) != null ? _b : id : "raw value";
        });
        alias.append(h("span", { className: "muted" }, [slashBreaks(names[0] === names[1] ? names[0] : `${names[0]} / ${names[1]}`)]));
      } else if (t.splitModes) {
        alias.append(
          aliasPicker(t.options, t.aliasDesktop, "desktop", (v) => {
            edit.aliasDesktop = v;
            refresh();
            if (t.surface) requestRepair();
          }).wrap,
          aliasPicker(t.options, t.aliasMobile, "mobile", (v) => {
            edit.aliasMobile = v;
            refresh();
          }).wrap
        );
      } else {
        alias.append(
          aliasPicker(t.options, t.aliasDesktop, "both modes", (v) => {
            edit.aliasDesktop = v;
            edit.aliasMobile = v;
            refresh();
            if (t.surface) requestRepair();
          }).wrap
        );
      }
      const status = h("td", { className: "badges" }, [
        badge(t.status),
        t.kind === "wrap" ? badge("wrap", "wrap", "Bound straight to a semantic variable; wrapped in a component token and rebound.") : null,
        t.kind === "alias-change" ? badge("alias change", "alias-change", "Changes the alias of an existing token of this component; every use of it changes.") : null,
        t.kind === "rebind" ? badge("rebind", "rebind", "Moves bound layers to a token with the right name.") : null,
        t.kind === "rename" ? badge("rename", "rename", "Renames the existing token in place; nothing changes visually.") : null,
        t.match === "manual" ? badge("manual", "manual", "Mapped to a token with a different value; the component will look different.") : badge(t.match),
        t.source === "claude" ? badge("Claude", "claude") : null,
        t.source === "user" ? badge("You", "user") : null
      ]);
      if (t.source === "user" && (baseline == null ? void 0 : baseline.unmatched.some((u) => u.key === t.key))) {
        const undo = smallButton("Undo", `Undo token for ${t.name}, leave the value raw`, () => undoRow(t.key));
        undo.dataset.focus = `undo:${t.key}`;
        status.append(undo);
      }
      const was = t.previousName ? h("div", { className: "was-name" }, [slashBreaks(`${t.previousName} \u2192`)]) : null;
      tr.append(
        h("td", {}, [cb.wrap]),
        h("td", {}, [was, label, input, error, t.note ? h("div", { className: "muted", text: t.note }) : null]),
        status,
        alias,
        h("td", { text: t.replaces }),
        h("td", { text: String(t.useCount) })
      );
      return tr;
    });
    const head = h("tr", {}, ["Apply", "Token", "Status", "Alias", "Replaces", "Uses"].map((t) => h("th", { text: t })));
    const renames = model.tokens.filter((t) => t.kind === "rename");
    const allOn = renames.every((t) => t.apply);
    const toggle = renames.length >= 2 ? smallButton(allOn ? "Skip all renames" : "Rename all", allOn ? "Skip all token renames" : "Rename all tokens", () => setRenames(!allOn)) : null;
    return h("section", {}, [
      h("div", { className: "raw-head" }, [h("h3", { text: "Tokens" }), toggle]),
      h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows2)])
    ]);
  }
  function setRenames(apply) {
    if (!original) return;
    const keys = new Set(original.tokens.filter((t) => t.kind === "rename").map((t) => t.key));
    for (const e of edits.tokens) if (keys.has(e.key)) e.apply = apply;
    renderReview();
  }
  function renderTypography(model) {
    if (!model.typography.length) return null;
    const rows2 = model.typography.map((t) => {
      var _a;
      const tr = h("tr", { className: t.apply ? "" : "off" });
      const edit = (_a = edits.typography) == null ? void 0 : _a.find((e) => e.key === t.key);
      const cb = checkbox(t.apply, `Bind typography ${t.role}`, (v) => {
        if (edit) edit.apply = v;
        tr.className = v ? "" : "off";
        refresh();
      });
      const binds = h(
        "td",
        { className: "alias" },
        t.bindings.map((b) => h("div", {}, [h("span", { className: "muted", text: `${b.field}: ` }), slashBreaks(b.variable)]))
      );
      tr.append(
        h("td", {}, [cb.wrap]),
        h("td", {}, [h("strong", { text: t.role }), t.note ? h("div", { className: "muted", text: t.note }) : null]),
        h("td", { className: "badges" }, [
          t.match === "manual" ? badge("manual", "manual", "Closest role; the text will look different.") : badge("exact")
        ]),
        binds,
        h("td", { text: String(t.layerCount) })
      );
      return tr;
    });
    const head = h("tr", {}, ["Apply", "Role", "Status", "Binds", "Layers"].map((t) => h("th", { text: t })));
    return h("section", {}, [
      h("h3", { text: "Typography" }),
      h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows2)])
    ]);
  }
  function rawTokenCell(r) {
    const { key, display, options } = r;
    const cell = h("td", { className: "adopt" });
    if (!options.length) {
      cell.appendChild(h("span", { className: "muted", text: "No token of this type" }));
      return cell;
    }
    const names = new Map(options.flatMap((g) => g.options.map((o) => [o.id, o.label])));
    let chosen = r.selected;
    const use = smallButton("Use token", `Use the chosen token for ${display}`, () => {
      var _a;
      if (chosen) adoptRow(key, chosen, (_a = names.get(chosen)) != null ? _a : chosen, r.surface);
    });
    use.disabled = !chosen;
    const tag = r.suggested ? badge("Suggested", "suggested", "Role default from the rules. Nothing changes until you click Use token.") : null;
    const { wrap, trigger } = aliasPicker(
      options,
      r.selected,
      `Semantic token for ${display}`,
      (v) => {
        chosen = v;
        use.disabled = false;
        if (tag) tag.hidden = v !== r.selected;
      },
      false
    );
    trigger.dataset.focus = `raw:${key}`;
    cell.appendChild(h("div", { className: "adopt-row" }, [wrap, tag, use]));
    return cell;
  }
  function slashBreaks(text) {
    const frag = document.createDocumentFragment();
    text.split("/").forEach((part, i, all) => {
      frag.append(document.createTextNode(part + (i < all.length - 1 ? "/" : "")));
      if (i < all.length - 1) frag.append(document.createElement("wbr"));
    });
    return frag;
  }
  function renderRaw(model) {
    if (!model.raw.length) return null;
    const valueCell = (display) => {
      const m = /^(.*) \(([^()]*)\)$/.exec(display);
      if (!m) return h("td", { text: display });
      const token = h("span", { className: "raw-token" }, [slashBreaks(m[1])]);
      return h("td", {}, [h("span", { className: "raw-value", text: m[2] }), token]);
    };
    const rows2 = model.raw.map(
      (r) => h("tr", {}, [
        valueCell(r.display),
        h("td", { text: String(r.useCount) }),
        h("td", { className: "muted", text: r.reason }),
        r.key ? rawTokenCell(__spreadProps(__spreadValues({}, r), { key: r.key })) : h("td")
      ])
    );
    const head = h("tr", {}, ["Value", "Uses", "Reason", "Token"].map((t) => h("th", { text: t })));
    const suggestedCount = model.raw.filter((r) => r.key && r.suggested).length;
    const useAll = suggestedCount >= 2 ? smallButton("Use all suggestions", `Use the suggested token for all ${suggestedCount} values`, adoptAllRows) : null;
    return h("section", {}, [
      h("div", { className: "raw-head" }, [h("h3", { text: "No match, left raw" }), useAll]),
      h("table", {}, [h("thead", {}, [head]), h("tbody", {}, rows2)])
    ]);
  }
  function editedModel(p) {
    var _a;
    const model = buildReviewModel(p, semantic);
    if (edits.newComponentName !== void 0 && model.newComponentName !== null) model.newComponentName = edits.newComponentName;
    for (const r of model.renames) {
      const e = edits.renames.find((x) => x.index === r.index);
      if (e) Object.assign(r, { newName: e.newName, apply: e.apply });
    }
    for (const t of model.typography) {
      const e = (_a = edits.typography) == null ? void 0 : _a.find((x) => x.key === t.key);
      if (e) t.apply = e.apply;
    }
    for (const t of model.tokens) {
      const e = edits.tokens.find((x) => x.key === t.key);
      if (!e) continue;
      Object.assign(t, { name: e.name, apply: e.apply, aliasDesktop: e.aliasDesktop, aliasMobile: e.aliasMobile });
      t.splitModes = t.splitModes || e.aliasDesktop !== e.aliasMobile;
    }
    return model;
  }
  function trackAdopted(key) {
    const t = original == null ? void 0 : original.tokens.find((x) => x.key === key);
    if (t && !edits.tokens.some((e) => e.key === key)) {
      edits.tokens.push({ key, name: t.name, apply: true, aliasDesktop: t.alias.desktop, aliasMobile: t.alias.mobile });
    }
  }
  function adoptRow(key, variableId, variableName, surface) {
    if (!original) return;
    original = adoptUnmatched(original, key, variableId, variableName);
    trackAdopted(key);
    focusAfterRender = `undo:${key}`;
    renderReview();
    if (surface) requestRepair();
  }
  function adoptAllRows() {
    if (!original) return;
    const keys = suggestedKeys(original);
    const surface = original.unmatched.some((u) => keys.includes(u.key) && touchesSurface(u.uses));
    original = adoptAllSuggestions(original);
    keys.forEach(trackAdopted);
    if (keys.length) focusAfterRender = `undo:${keys[0]}`;
    renderReview();
    if (surface) requestRepair();
  }
  function undoRow(key) {
    var _a, _b;
    if (!original || !baseline) return;
    const surface = touchesSurface((_b = (_a = original.tokens.find((t) => t.key === key)) == null ? void 0 : _a.uses) != null ? _b : []);
    original = undoAdopt(original, key, baseline);
    edits.tokens = edits.tokens.filter((e) => e.key !== key);
    focusAfterRender = `raw:${key}`;
    renderReview();
    if (surface) requestRepair();
  }
  function requestRepair() {
    if (!original || busy || phase !== "tokens") return;
    setStatus("Re-pairing text with the changed surface\u2026");
    setBusy(true);
    send({ type: "component/scan", phase: "tokens", useClaude: useClaudeCb.checked, assume: surfaceChoices(collectProposal(original, edits)) });
  }
  function showRepaired(msg) {
    if (!original) return showProposal(msg);
    const merged = mergeRepaired({ original, edits }, msg.proposal);
    baseline = msg.proposal;
    original = merged.original;
    edits = merged.edits;
    semantic = msg.semantic;
    renderReview();
    setStatus("Text re-paired with the changed surface. Nothing is written until you click Apply.");
  }
  function showProposal(msg) {
    clearReview();
    resultEl.hidden = true;
    phase = msg.phase;
    baseline = msg.proposal;
    original = msg.proposal;
    semantic = msg.semantic;
    naming = msg.naming;
    const model = buildReviewModel(original, semantic);
    edits = {
      newComponentName: model.newComponentName,
      renames: model.renames.map((r) => ({ index: r.index, newName: r.newName, apply: r.apply })),
      tokens: model.tokens.map((t) => ({
        key: t.key,
        name: t.name,
        apply: t.apply,
        aliasDesktop: t.aliasDesktop,
        aliasMobile: t.aliasMobile
      })),
      typography: model.typography.map((t) => ({ key: t.key, apply: t.apply }))
    };
    renderReview();
    stepTitleEl.textContent = stepTitle(phase);
    stepTitleEl.hidden = false;
    reviewEl.hidden = false;
    actionsEl.hidden = false;
    reviewEl.scrollTop = 0;
    setStatus("Review the changes. Nothing is written until you click Apply.");
  }
  function renderReview() {
    if (!original) return;
    closeTokenPicker();
    semanticById = new Map(semantic.map((s) => [s.id, s]));
    const scrollTop = reviewEl.scrollTop;
    renameErrorEls.clear();
    tokenErrorEls.clear();
    reviewEl.replaceChildren();
    const model = editedModel(original);
    reviewEl.append(renderHeader(model, naming));
    const sections = phase === "rename" ? [renderRenames(model)] : [renderTokens(model), renderTypography(model), renderRaw(model)];
    for (const section of sections) {
      if (section) reviewEl.appendChild(section);
    }
    if (sections.every((s) => !s) && model.newComponentName === null) {
      const text = model.warnings.length > 0 ? "No rows to apply; check the warnings above." : phase === "rename" ? "Nothing to rename, all layer names follow the convention." : "Nothing to tokenize, every value is already bound to a token.";
      reviewEl.appendChild(h("p", { className: "muted", text }));
    }
    reviewEl.scrollTop = scrollTop;
    if (focusAfterRender) {
      const target = Array.from(reviewEl.querySelectorAll("[data-focus]")).find(
        (el2) => el2.dataset.focus === focusAfterRender
      );
      target == null ? void 0 : target.focus();
      focusAfterRender = null;
    }
    refresh();
  }
  function lineList(lines, className) {
    return h("ul", className ? { className } : {}, lines.map((l) => h("li", { text: l })));
  }
  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const area = h("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      let ok = false;
      try {
        ok = document.execCommand("copy");
      } catch (e2) {
        ok = false;
      }
      area.remove();
      return ok;
    }
  }
  function renamedTokensBlock(text) {
    const copy = smallButton("Copy", "Copy the renamed tokens list", async () => {
      const ok = await copyText(text);
      copy.textContent = ok ? "Copied" : "Copy failed";
      setTimeout(() => copy.textContent = "Copy", 1500);
    });
    return h("div", { className: "renamed-tokens" }, [
      h("div", { className: "raw-head" }, [h("strong", { text: "Renamed tokens" }), copy]),
      h("pre", { text })
    ]);
  }
  function showResult(result, applied) {
    clearReview();
    resultEl.replaceChildren();
    resultEl.appendChild(h("h3", { text: summarizeResult(result, applied) }));
    const stale = staleTokensText(result);
    if (stale) resultEl.appendChild(h("p", { text: stale }));
    const renamed = renamedTokensText(result);
    if (renamed) resultEl.appendChild(renamedTokensBlock(renamed));
    const look = lookChangeView(result, lastApplied);
    if (look.kind === "loud") {
      resultEl.appendChild(h("div", { className: "loud" }, [h("strong", { text: "Look changed" }), lineList(look.lines)]));
    } else if (look.kind === "intended") {
      resultEl.appendChild(
        h("div", { className: "intended" }, [
          h("strong", { text: "Intended look changes (values mapped to different tokens)" }),
          lineList(look.lines)
        ])
      );
    } else {
      resultEl.appendChild(h("p", { className: "pass", text: "Look unchanged" }));
    }
    const audit = auditView(result.audit);
    if (audit.kind === "issues") {
      resultEl.append(h("h3", { text: audit.text }), lineList(audit.lines));
    } else {
      resultEl.appendChild(h("p", { className: audit.kind === "pass" ? "pass" : "muted", text: audit.text }));
    }
    if (result.skipped.length) {
      resultEl.append(h("h3", { text: "Skipped" }), lineList(result.skipped));
    }
    resultEl.hidden = false;
    setStatus("Applied.");
  }
  function setPrimaryStep(next) {
    scanRenameBtn.classList.toggle("secondary", next !== "rename");
    scanTokensBtn.classList.toggle("secondary", next !== "tokens");
  }
  function scan(next) {
    setPrimaryStep(next);
    pendingStored = null;
    clearReview();
    resultEl.hidden = true;
    setStatus("Scanning component\u2026");
    setBusy(true);
    send({ type: "component/scan", phase: next, useClaude: useClaudeCb.checked });
  }
  scanRenameBtn.addEventListener("click", () => scan("rename"));
  scanTokensBtn.addEventListener("click", () => scan("tokens"));
  applyBtn.addEventListener("click", () => {
    if (!original || applyBtn.disabled) return;
    const proposal = collectProposal(original, edits);
    if (findProblems(proposal).length) return;
    lastApplied = proposal;
    setStatus("Applying\u2026");
    setBusy(true);
    send({ type: "component/apply", proposal });
  });
  cancelBtn.addEventListener("click", () => {
    send({ type: "component/cancel" });
    clearReview();
    setStatus("Cancelled. Nothing was changed.");
  });
  storedLoadBtn.addEventListener("click", () => {
    if (!pendingStored || busy) return;
    useClaudeCb.checked = true;
    persistUseClaude();
    scan(pendingStored.phase);
  });
  window.addEventListener("message", (event) => {
    var _a;
    const msg = (_a = event.data) == null ? void 0 : _a.pluginMessage;
    if (!msg || typeof msg.type !== "string") return;
    if (msg.type === "claude/proposal-stored") {
      pendingStored = { phase: msg.phase, count: msg.count };
      renderStoredBanner();
    } else if (msg.type === "component/proposal") {
      setBusy(false);
      if (msg.repaired) showRepaired(msg);
      else showProposal(msg);
    } else if (msg.type === "component/applied") {
      setBusy(false);
      showResult(msg.result, msg.phase);
      if (msg.phase === "rename") setPrimaryStep("tokens");
    } else if (msg.type === "component/error") {
      setBusy(false);
      setStatus(`Error: ${msg.message}`, true);
    }
  });
  showBridgeStatus("disconnected");
  startBridge(showBridgeStatus);
})();
