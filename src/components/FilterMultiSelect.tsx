import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'

interface FilterMultiSelectProps {
  /** The dimension being filtered, e.g. "Tag". Shown on the trigger and announced as its name. */
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  /** How an option reads in the list — e.g. a country with its flag. Defaults to the raw value. */
  renderOption?: (value: string) => ReactNode
}

// A search box appears only once a list is long enough that scanning it is slower than typing.
const SEARCH_THRESHOLD = 8
// Wide enough for the longest country names beside a flag ("Bosnia and Herzegovina"), and for
// the search box to read as a real field rather than a sliver (user, 2026-09-10: "more width").
const PANEL_MIN_WIDTH = 288
// A consistent resting width, so Tag and Country read as a matched pair rather than two buttons
// sized by whatever their label happens to be.
const TRIGGER_MIN_WIDTH = '11rem'
// Keep the panel off the screen edge.
const VIEWPORT_MARGIN = 8

/**
 * A compact multi-select for a table's filter bar (user, 2026-09-10: "make tag and country
 * multi-select"). Picking several values means ANY of them — clients tagged VIP or Scholarship,
 * finalising in Canada or the UK — which is how a list of values in one dimension reads to people.
 *
 * Deliberately NOT used for the yes/no quick filters (My clients, Pending response…). Those
 * combine as AND and are FilterChips instead; folding them into a multi-select would make an AND
 * look like an OR, so picking two would read as "more rows" when it means fewer.
 *
 * Distinct from MultiSelect, which is a form field (label above, chips in the input). This is a
 * single trigger the height of the other filter controls that summarises its state when closed
 * ("Tag: VIP +1") and turns the brand colour once anything is picked, so a narrowed table never
 * reads as the whole list — the same signal FilterChip gives.
 *
 * The list is positioned `fixed` off the trigger's own rectangle, the same escape SearchSelect
 * uses, because the Table card clips overflow and an absolutely positioned list would be cut off.
 * It closes on scroll or resize rather than chasing the trigger, which keeps it simple and never
 * leaves it floating somewhere the trigger no longer is.
 */
export function FilterMultiSelect({ label, options, selected, onChange, renderOption }: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [rect, setRect] = useState<DOMRect | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const display = renderOption ?? ((value: string) => value)

  // Focus moves into the search box when the list opens, but only because the user just opened
  // it: a programmatic focus on their own action, not the page grabbing focus on load (which is
  // what the autofocus lint rule exists to stop).
  useEffect(() => {
    if (open) searchRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    const close = () => setOpen(false)
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggleOpen() {
    if (!open) {
      setRect(triggerRef.current?.getBoundingClientRect() ?? null)
      setQuery('')
    }
    setOpen(!open)
  }

  function toggleValue(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value])
  }

  const active = selected.length > 0
  const summary = !active ? label : `${label}: ${selected[0]}${selected.length > 1 ? ` +${selected.length - 1}` : ''}`
  const needle = query.trim().toLowerCase()
  const visible = needle ? options.filter((o) => o.toLowerCase().includes(needle)) : options
  // Wider than the trigger, so the panel is clamped to stay on screen: Country sits at the right of
  // the filter bar, and a panel anchored to its left edge would otherwise run off the viewport.
  const panelWidth = rect ? Math.max(rect.width, PANEL_MIN_WIDTH) : PANEL_MIN_WIDTH
  const panelLeft = rect
    ? Math.max(VIEWPORT_MARGIN, Math.min(rect.left, window.innerWidth - panelWidth - VIEWPORT_MARGIN))
    : 0

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={active ? `${label}, ${selected.length} selected` : label}
        onClick={toggleOpen}
        style={{ minWidth: TRIGGER_MIN_WIDTH }}
        className={`flex h-10 items-center justify-between gap-xs rounded-md border px-3 text-body-sm transition-colors ${
          active
            ? 'border-primary bg-primary/10 font-medium text-primary'
            : 'border-border bg-background text-text-primary hover:border-text-secondary'
        }`}
      >
        <span className="truncate" style={{ maxWidth: '12rem' }}>
          {summary}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && rect && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: rect.bottom + 4, left: panelLeft, width: panelWidth }}
          className="z-50 flex flex-col rounded-md border border-border bg-surface shadow-card"
        >
          {options.length > SEARCH_THRESHOLD && (
            <div className="border-b border-border p-sm">
              {/* The icon makes it read as a search field at a glance; the border lives on the
                  wrapper so focusing the input highlights the whole field, icon included. */}
              <div className="flex h-9 items-center gap-xs rounded-md border border-border bg-background px-sm focus-within:border-primary">
                <Search className="h-4 w-4 shrink-0 text-text-secondary" aria-hidden />
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={`Search ${label.toLowerCase()}…`}
                  aria-label={`Search ${label.toLowerCase()}`}
                  className="h-full min-w-0 flex-1 bg-transparent text-body-sm text-text-primary outline-none"
                />
              </div>
            </div>
          )}

          <div
            role="listbox"
            aria-multiselectable="true"
            aria-label={label}
            className="flex flex-col overflow-y-auto py-xs"
            style={{ maxHeight: '18rem' }}
          >
            {visible.length === 0 && (
              <p className="px-md py-sm text-body-sm text-text-secondary">No {label.toLowerCase()} matches.</p>
            )}
            {visible.map((option) => {
              const isSelected = selected.includes(option)
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => toggleValue(option)}
                  className="flex items-center gap-sm px-md py-sm text-left text-body-sm text-text-primary hover:bg-background"
                >
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                      isSelected ? 'border-primary bg-primary text-text-on-primary' : 'border-border bg-surface'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 truncate">{display(option)}</span>
                </button>
              )
            })}
          </div>

          <div className="flex items-center justify-between border-t border-border px-md py-sm">
            <span className="text-caption text-text-secondary">
              {active ? `${selected.length} selected` : `Any ${label.toLowerCase()}`}
            </span>
            <button
              type="button"
              disabled={!active}
              onClick={() => onChange([])}
              className="text-caption font-medium text-primary hover:underline disabled:cursor-not-allowed disabled:text-text-secondary disabled:no-underline"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </>
  )
}
