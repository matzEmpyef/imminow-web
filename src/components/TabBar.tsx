import type { ReactNode } from 'react'

export interface TabBarItem<K extends string> {
  key: K
  label: string
  /** Extra content after the label, e.g. a count badge. */
  badge?: ReactNode
}

/**
 * The underlined tab strip used by the page-level tabs (review F-311). One component so every strip
 * tells a screen reader which tab is selected (`role="tablist"` / `role="tab"` / `aria-selected`) and
 * every tab button declares `type="button"`. Same look as the strips it replaced.
 */
export function TabBar<K extends string>({
  tabs,
  active,
  onChange,
  ariaLabel,
}: {
  tabs: readonly TabBarItem<K>[]
  active: K
  onChange: (key: K) => void
  ariaLabel: string
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-xs overflow-x-auto border-b border-border">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
          className={`flex shrink-0 items-center gap-xs border-b-2 px-md py-sm text-body-sm ${
            active === tab.key ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
          }`}
        >
          {tab.label}
          {tab.badge}
        </button>
      ))}
    </div>
  )
}
