import type { ReactNode } from "react";
import { Tab, TabList, TabPanel, Tabs as AriaTabs, type Key } from "react-aria-components";

export interface TabItem<K extends string> {
  id: K;
  label: string;
}

export interface TabsProps<K extends string> {
  /** Names the tab list for assistive tech. */
  label: string;
  items: TabItem<K>[];
  selectedKey: K;
  onSelectionChange: (key: K) => void;
  isDisabled?: boolean;
  /** Content of the selected tab; it fills the rest of the height. */
  children: ReactNode;
  className?: string;
}

// Figma UI3 tabs: text tabs on a full-width hairline, the selected one in full text color with a brand underline over the hairline.
const TAB =
  "relative flex h-8 cursor-default items-center px-2 text-sm font-medium whitespace-nowrap text-text-secondary outline-none " +
  "data-[hovered]:text-text data-[selected]:text-text data-[disabled]:not-data-[selected]:text-text-disabled " +
  "after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-transparent data-[selected]:after:bg-brand " +
  "data-[focus-visible]:rounded-control data-[focus-visible]:outline-solid data-[focus-visible]:outline-2 data-[focus-visible]:-outline-offset-4 data-[focus-visible]:outline-border-selected";

/** One panel follows the selected tab, so content is rendered only for it; arrow keys move between tabs. */
export function Tabs<K extends string>({ label, items, selectedKey, onSelectionChange, isDisabled, children, className = "" }: TabsProps<K>) {
  return (
    <AriaTabs
      selectedKey={selectedKey}
      onSelectionChange={(key: Key) => onSelectionChange(String(key) as K)}
      isDisabled={isDisabled}
      // Arrows only move focus, Enter or Space switches: a switch drops an open review, so it should never happen by browsing.
      keyboardActivation="manual"
      className={`flex min-h-0 flex-col ${className}`}
    >
      <TabList aria-label={label} className="flex shrink-0 border-b border-border px-1">
        {items.map((item) => (
          <Tab key={item.id} id={item.id} className={TAB}>
            {item.label}
          </Tab>
        ))}
      </TabList>
      <TabPanel id={selectedKey} className="flex min-h-0 flex-1 flex-col outline-none">
        {children}
      </TabPanel>
    </AriaTabs>
  );
}
