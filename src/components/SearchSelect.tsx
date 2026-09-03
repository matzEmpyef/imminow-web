import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'

export interface SearchSelectOption {
  id: string
  label: string
  sublabel?: string
  group?: string
}

interface SearchSelectProps {
  options: SearchSelectOption[]
  value: string
  onChange: (id: string) => void
  placeholder?: string
  id?: string
  disabled?: boolean
  // A floating label, rendered the way TextField and SelectField do it — for rows where this
  // sits beside them. Without it the caller supplies its own label ABOVE the control, which
  // adds a row the pill fields do not have and drops this column ~23px lower than its
  // neighbours. Omitted keeps the original compact shape, so existing call sites don't move.
  label?: string
}

// Generic type-to-filter replacement for a plain <select> (user-requested, 2026-08-15 —
// "Wherever there is a dropdown of clients or leads, we should be able type in client or leads
// name to search, as there could be long list"). Filters client-side over whatever `options` the
// caller already has loaded — every consumer already fetches the full client/lead list for its
// own dropdown, so no new server-side search endpoint was needed. `group` (e.g. "Applicant" vs
// "Lead") renders as a small trailing badge, mirroring GlobalSearch's own result tags, for
// callers that mix both kinds of records in one list (Activity's "Related client/lead").
export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  id,
  disabled,
  label,
}: SearchSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)

  const selected = options.find((o) => o.id === value)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // The dropdown is positioned via `position: fixed` off the input's own bounding rect rather
  // than `absolute` inside this component's own wrapper — a SearchSelect nested in a Modal (e.g.
  // Applicant Allocation's Allocate popup) sits inside Modal's `overflow-y-auto` body, which per
  // the CSS spec also clips the x-axis once y is non-`visible`; an `absolute` dropdown was
  // getting silently clipped by that ancestor whenever the Modal's content was short (found
  // 2026-08-18, user: "Allocate to Consultancy - dropdown not visible in popup"). `fixed`
  // positioning escapes ancestor `overflow` entirely, same reason a nested `<Modal>` already
  // renders correctly on top of its parent Modal without any z-index tricks.
  useEffect(() => {
    if (!open) return
    function updateRect() {
      const r = inputRef.current?.getBoundingClientRect()
      if (r) setRect({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  function handleSelect(option: SearchSelectOption) {
    onChange(option.id)
    setQuery('')
    setOpen(false)
  }

  // A value picked here previously had no way back to empty (found 2026-08-24, Course Finder:
  // "even though the ui say applicant or lead is optional but i am not able to remove the client
  // name") — every path that fires `onChange` passed a real option's id, and typing over the
  // text only edited the local filter query, which reverts to the selected label the moment focus
  // leaves. Fixed at the shared component, not the one call site, since every other consumer has
  // the identical gap.
  const showClear = Boolean(value) && !disabled && !open

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        // Keyboard pass, B7 (2026-09-03): the list only ever closed on an outside CLICK, so
        // tabbing to the next field left it hanging open over the form. It now closes when focus
        // leaves the component; focus moving onto one of its own options (a mouse press on a
        // button focuses it first) keeps it open so the click still lands.
        onBlur={(e) => {
          if (containerRef.current?.contains(e.relatedTarget as Node | null)) return
          setOpen(false)
          setQuery('')
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && open) {
            e.preventDefault()
            setOpen(false)
            setQuery('')
          }
        }}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        className={`w-full border border-border bg-surface text-body outline-none transition-colors focus:border-2 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 ${
          showClear ? 'pr-9' : ''
        } ${label ? 'h-12 rounded-full px-5' : 'h-10 rounded-md px-3'}`}
      />
      {showClear && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear"
          title="Clear"
          className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-background hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      {label && (
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-5 top-0 origin-left -translate-y-1/2 scale-[0.8] bg-surface px-xs text-body text-text-secondary"
        >
          {label}
        </label>
      )}
      {open && rect && (
        <div
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-surface shadow-card"
        >
          {filtered.length === 0 && <p className="p-sm text-body-sm text-text-secondary">No matches.</p>}
          {filtered.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => handleSelect(option)}
              className="flex w-full items-center justify-between gap-sm px-sm py-xs text-left text-body-sm hover:bg-background"
            >
              <span className="min-w-0 flex-1 truncate text-text-primary">
                {option.label}
                {option.sublabel && <span className="ml-xs text-caption text-text-secondary">{option.sublabel}</span>}
              </span>
              {option.group && (
                <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                  {option.group}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
