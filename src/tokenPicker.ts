import type { SemanticToken } from "./types";

export interface PickerOption {
  id: string;
  label: string;
}

export interface PickerGroup {
  label: string;
  options: PickerOption[];
}

const FAMILIES = ["surface", "on-surface", "border"];
const FAMILY_ALIAS: Record<string, string> = { background: "surface", "on-background": "on-surface" };
const SURFACES = ["primary", "1", "2", "3", "subtle", "accent", "brand", "feedback"];
const FEEDBACK = ["info", "promo", "success", "warning", "error", "neutral", "loading"];
const STATES = ["enabled", "hover", "pressed", "disabled", "loading"];
const INTENTS = ["dimmed", "brand", "dark-brand", "dark brand", "darkBrand", "success", "warning", "error"];
const STEPS = [...STATES, ...INTENTS];
const TSHIRT = ["none", "4xs", "3xs", "2xs", "xs", "s", "m", "l", "xl", "2xl", "3xl", "4xl", "5xl", "full"];
const NUMERIC = /^-?\d+(\.\d+)?$/;

function segments(name: string): string[] {
  const parts = name.split("/");
  if (parts[0] === "color") parts.shift();
  if (parts.length) parts[0] = FAMILY_ALIAS[parts[0]] ?? parts[0];
  return parts;
}

function orderAt(parts: string[], i: number): string[] {
  if (i === 0) return FAMILIES;
  if (parts[0] !== "surface" && parts[0] !== "on-surface") return TSHIRT;
  if (i === 1) return SURFACES;
  if (i === 2 && parts[1] === "feedback") return FEEDBACK;
  return STEPS;
}

function compareSegment(a: string, b: string, order: string[]): number {
  for (const list of [order, TSHIRT]) {
    const ra = list.indexOf(a);
    const rb = list.indexOf(b);
    if (ra >= 0 && rb >= 0) return ra - rb;
    if (ra >= 0 || rb >= 0) return ra >= 0 ? -1 : 1;
  }
  if (NUMERIC.test(a) && NUMERIC.test(b)) return Number(a) - Number(b);
  return a.localeCompare(b);
}

// Ranks each segment by its meaning (surface, feedback kind, state, t-shirt size), never by catalog order.
export function compareTokenNames(a: string, b: string): number {
  const pa = segments(a);
  const pb = segments(b);
  for (let i = 0; i < Math.min(pa.length, pb.length); i++) {
    if (pa[i] === pb[i]) continue;
    return compareSegment(pa[i], pb[i], orderAt(pa, i));
  }
  return pa.length - pb.length || a.localeCompare(b);
}

export function sortByTokenName<T extends { name: string }>(list: T[]): T[] {
  return list.slice().sort((x, y) => compareTokenNames(x.name, y.name));
}

export function shortName(name: string): string {
  return name.startsWith("color/") ? name.slice("color/".length) : name;
}

export function matchesQuery(name: string, query: string): boolean {
  const hay = name.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function filterGroups(groups: PickerGroup[], query: string): PickerGroup[] {
  return groups
    .map((g) => ({ label: g.label, options: g.options.filter((o) => matchesQuery(o.label, query)) }))
    .filter((g) => g.options.length > 0);
}

function formatNumber(n: number): string {
  return String(Math.round(n * 100) / 100);
}

export function formatValue(entry: Pick<SemanticToken, "light" | "value"> | undefined): string {
  if (entry?.light) {
    const hex = entry.light.hex.toUpperCase();
    return entry.light.opacity < 1 ? `${hex} @${Math.round(entry.light.opacity * 100)}%` : hex;
  }
  return typeof entry?.value === "number" ? formatNumber(entry.value) : "";
}

export function triggerText(name: string, entry: Pick<SemanticToken, "type" | "value"> | undefined): string {
  const short = shortName(name);
  return entry?.type === "FLOAT" && typeof entry.value === "number" ? `${short} · ${formatNumber(entry.value)}` : short;
}

export function moveActive(current: number, delta: number, count: number): number {
  if (count === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : count - 1;
  return Math.max(0, Math.min(count - 1, current + delta));
}

export function initialActive(options: PickerOption[], value: string | null): number {
  const i = options.findIndex((o) => o.id === value);
  return i >= 0 ? i : options.length ? 0 : -1;
}

const HEX = /^#[0-9a-f]{6}$/i;

function rgba(hex: string, opacity: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${Math.max(0, Math.min(1, opacity))})`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function icon(path: string, className: string): SVGSVGElement {
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

const CHEVRON = "M3 4.5l3 3 3-3";
const CHECK = "M2.5 6.5l2.5 2.5 4.5-5.5";

function swatch(entry: SemanticToken | undefined): HTMLElement {
  const s = el("span", "tp-swatch");
  s.setAttribute("aria-hidden", "true");
  const light = entry?.light;
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

export interface TokenPickerConfig {
  groups: PickerGroup[];
  value: string | null;
  entries: Map<string, SemanticToken>;
  labelId: string;
  placeholder?: string;
  onChange: (id: string) => void;
}

let openPicker: { close: (returnFocus: boolean) => void } | null = null;
let uid = 0;

export function closeTokenPicker(): void {
  openPicker?.close(false);
}

export function createTokenPicker(cfg: TokenPickerConfig): HTMLButtonElement {
  uid += 1;
  const base = `tp-${uid}`;
  const labels = new Map(cfg.groups.flatMap((g) => g.options.map((o) => [o.id, o.label] as const)));
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
    trigger.replaceChildren();
    if (value === null) {
      valueEl.textContent = cfg.placeholder ?? "Pick a token";
      valueEl.classList.add("placeholder");
      trigger.title = "";
      trigger.append(valueEl, icon(CHEVRON, "tp-chevron"));
      return;
    }
    const entry = cfg.entries.get(value);
    const name = entry?.name ?? labels.get(value) ?? value;
    valueEl.classList.remove("placeholder");
    valueEl.textContent = triggerText(name, entry);
    trigger.title = name;
    if (entry?.type !== "FLOAT") trigger.append(swatch(entry));
    trigger.append(valueEl, icon(CHEVRON, "tp-chevron"));
  };
  paint();

  const open = (seed = "") => {
    openPicker?.close(false);
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

    let flat: PickerOption[] = [];
    let rows: HTMLElement[] = [];
    let active = -1;

    const setActive = (i: number) => {
      rows[active]?.classList.remove("active");
      active = i;
      const row = rows[active];
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
      rows = [];
      groups.forEach((g, gi) => {
        const group = el("div", "tp-group");
        group.setAttribute("role", "group");
        const heading = el("div", "tp-group-label", g.label);
        heading.id = `${base}-g${gi}`;
        group.setAttribute("aria-labelledby", heading.id);
        group.appendChild(heading);
        for (const o of g.options) {
          const entry = cfg.entries.get(o.id);
          const index = rows.length;
          const row = el("div", "tp-option");
          row.id = `${base}-o${index}`;
          row.setAttribute("role", "option");
          row.setAttribute("aria-selected", String(o.id === value));
          row.title = entry?.name ?? o.label;
          const check = icon(CHECK, "tp-check");
          if (o.id !== value) check.style.visibility = "hidden";
          row.append(check);
          if (entry?.type !== "FLOAT") row.append(swatch(entry));
          row.append(el("span", "tp-name", shortName(entry?.name ?? o.label)), el("span", "tp-hex", formatValue(entry)));
          row.addEventListener("mousedown", (e) => e.preventDefault());
          row.addEventListener("mousemove", () => {
            if (active !== index) setActive(index);
          });
          row.addEventListener("click", () => pick(index));
          rows.push(row);
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

    const onOutside = (e: Event) => {
      const t = e.target as Node;
      if (!popup.contains(t) && !trigger.contains(t)) close(false);
    };
    const onScroll = (e: Event) => {
      if (!popup.contains(e.target as Node)) close(false);
    };
    const onResize = () => close(false);

    const close = (returnFocus: boolean) => {
      popup.remove();
      trigger.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", onOutside, true);
      document.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      if (openPicker === handle) openPicker = null;
      if (returnFocus) trigger.focus();
    };
    const handle = { close };

    const pick = (i: number) => {
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
        setActive(moveActive(active, e.key === "ArrowDown" ? 1 : -1, rows.length));
      } else if (e.key === "Home" || e.key === "End") {
        if (!rows.length) return;
        e.preventDefault();
        setActive(e.key === "Home" ? 0 : rows.length - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        pick(active);
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close(true);
      } else if (e.key === "Tab") {
        // Focus moves on from the trigger, as if the popup had never opened.
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
    rows[active]?.scrollIntoView({ block: "nearest" });
  };

  trigger.addEventListener("click", () => {
    if (trigger.getAttribute("aria-expanded") === "true") openPicker?.close(true);
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
