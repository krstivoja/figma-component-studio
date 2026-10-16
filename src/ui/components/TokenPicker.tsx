import { Check, ChevronDown, Search } from "lucide-react";
import { useMemo, useState, type KeyboardEvent } from "react";
import {
  Autocomplete,
  Button,
  Collection,
  Header,
  Input,
  Label,
  ListBox,
  ListBoxItem,
  ListBoxSection,
  Popover,
  SearchField,
  Select,
  SelectValue,
  type Key,
} from "react-aria-components";
import { filterGroups, formatValue, shortName, triggerText, type PickerGroup } from "../../tokenPicker";
import type { SemanticToken } from "../../types";
import { Swatch } from "./Swatch";

export interface TokenPickerProps {
  groups: PickerGroup[];
  value: string | null;
  entries: Map<string, SemanticToken>;
  label: string;
  labelVisible?: boolean;
  placeholder?: string;
  onChange: (id: string) => void;
  /** Marks the trigger so the review can move focus to it after a re-render. */
  focusKey?: string;
}

const TRIGGER =
  "flex h-6 w-full min-w-0 cursor-default items-center gap-1.5 rounded-control border border-border bg-bg pr-1 pl-1.5 text-left text-sm text-text outline-none " +
  "data-[hovered]:border-border-strong/40 data-[pressed]:border-border-selected data-[focus-visible]:border-border-selected " +
  "data-[focus-visible]:shadow-[inset_0_0_0_1px_var(--color-border-selected)]";

export function TokenPicker({
  groups,
  value,
  entries,
  label,
  labelVisible = false,
  placeholder = "Pick a token",
  onChange,
  focusKey,
}: TokenPickerProps) {
  const [isOpen, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const labels = useMemo(() => new Map(groups.flatMap((g) => g.options.map((o) => [o.id, o.label] as const))), [groups]);
  const sections = useMemo(() => filterGroups(groups, query).map((g) => ({ id: g.label, ...g })), [groups, query]);
  const entry = value === null ? undefined : entries.get(value);
  const name = value === null ? null : (entry?.name ?? labels.get(value) ?? value);

  const openChange = (open: boolean) => {
    setOpen(open);
    if (!open) setQuery("");
  };
  const select = (key: Key | null) => {
    if (key !== null && String(key) !== value) onChange(String(key));
  };
  // Typing on the closed trigger opens the search with that letter, instead of Select's type-to-select.
  const seedSearch = (e: KeyboardEvent) => {
    if (isOpen || e.key.length !== 1 || e.key === " " || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    setQuery(e.key);
    setOpen(true);
  };

  const closeOnKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" && e.key !== "Tab") return;
    e.preventDefault();
    e.stopPropagation();
    openChange(false);
  };

  return (
    <Select
      value={value}
      onChange={select}
      isOpen={isOpen}
      onOpenChange={openChange}
      placeholder={placeholder}
      className="flex min-w-0 flex-col gap-0.5"
    >
      <Label className={labelVisible ? "text-xs text-text-secondary" : "sr-only"}>{label}</Label>
      <div onKeyDownCapture={seedSearch} className="min-w-0">
        <Button className={TRIGGER} data-focus={focusKey}>
          {name !== null && entry?.type !== "FLOAT" ? <Swatch entry={entry} /> : null}
          <SelectValue title={name ?? undefined} className={`min-w-0 flex-1 truncate ${name === null ? "text-text-secondary" : ""}`}>
            {() => (name === null ? placeholder : triggerText(name, entry))}
          </SelectValue>
          <ChevronDown aria-hidden size={12} className="shrink-0 text-icon-secondary" />
        </Button>
      </div>
      <Popover
        placement="bottom start"
        offset={4}
        containerPadding={8}
        className="flex max-h-80 w-[max(var(--trigger-width),300px)] flex-col overflow-hidden rounded-popover border border-border bg-bg text-sm text-text shadow-[0_4px_16px_rgb(0_0_0/0.16)] outline-none"
      >
        {/* Escape closes at once (SearchField alone would first clear the query); Tab closes back to the trigger. */}
        <div className="flex min-h-0 flex-1 flex-col" onKeyDownCapture={closeOnKey}>
          <Autocomplete inputValue={query} onInputChange={setQuery}>
            <SearchField aria-label="Search tokens" autoFocus className="group relative m-1.5 flex items-center">
              <Search aria-hidden size={12} className="pointer-events-none absolute left-2 text-icon-secondary" />
              <Input
                placeholder="Search tokens"
                spellCheck={false}
                className="h-6 w-full min-w-0 rounded-control border border-border bg-bg-secondary pr-2 pl-6 text-sm text-text outline-none placeholder:text-text-tertiary data-[focused]:border-border-selected [&::-webkit-search-cancel-button]:hidden"
              />
            </SearchField>
            <ListBox
              items={sections}
              aria-label={label}
              renderEmptyState={() => <div className="px-3 pt-1 pb-2.5 text-text-secondary">No token matches</div>}
              className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-1.5 outline-none"
            >
              {(section) => (
                <ListBoxSection id={section.id}>
                  <Header className="px-1.5 pt-1.5 pb-0.5 text-xs font-medium text-text-secondary">{section.label}</Header>
                  <Collection items={section.options}>
                    {(o) => {
                      const e = entries.get(o.id);
                      const full = e?.name ?? o.label;
                      return (
                        <ListBoxItem
                          id={o.id}
                          textValue={full}
                          className="flex h-6 cursor-default items-center gap-1.5 rounded-control pr-2 pl-1 outline-none data-[focused]:bg-bg-selected data-[hovered]:bg-bg-hover data-[focused]:data-[hovered]:bg-bg-selected"
                        >
                          {({ isSelected }) => (
                            <>
                              <Check
                                aria-hidden
                                size={12}
                                strokeWidth={2.5}
                                className={`shrink-0 text-icon-brand ${isSelected ? "" : "invisible"}`}
                              />
                              {e?.type !== "FLOAT" ? <Swatch entry={e} /> : null}
                              <span title={full} className="min-w-0 flex-1 truncate">
                                {shortName(full)}
                              </span>
                              <span className="shrink-0 text-text-secondary tabular-nums">{formatValue(e)}</span>
                            </>
                          )}
                        </ListBoxItem>
                      );
                    }}
                  </Collection>
                </ListBoxSection>
              )}
            </ListBox>
          </Autocomplete>
        </div>
      </Popover>
    </Select>
  );
}
