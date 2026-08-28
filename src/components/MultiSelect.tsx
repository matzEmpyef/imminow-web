import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { FieldLabel } from './FieldLabel'

interface MultiSelectProps {
  label: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
  // Shows a "+ Add "X"" row for whatever's typed when it doesn't match an existing option
  // (Combobox.tsx's free-text idiom, applied to multi-select) — for fields with no fixed
  // catalog, like Ads Manager's targeting study_level (user-requested, 2026-08-18).
  allowCustom?: boolean
  required?: boolean
  // Maps a stored value to display text, for catalogs whose wire values are slugs rather than
  // prose (study_level's 'bachelors'). Omitted, values render as-is, which is what every other
  // consumer wants.
  renderLabel?: (value: string) => string
}

// Chips + search-to-add, closed to a fixed `options` list (no free-text create, unlike
// Combobox.tsx) — built for Countries Served (user-requested: multiselect sourced from a
// backend list), but generic enough to reuse anywhere a fixed catalog needs multi-picking
// (flagged as likely for a future "colleges served" field). No portal: unlike Combobox.tsx,
// nothing renders this inside a Modal today, so a plain absolute dropdown doesn't get clipped —
// revisit with the same portal fix if that changes.
export function MultiSelect({ label, options, selected, onChange, allowCustom, required, renderLabel }: MultiSelectProps) {
  const display = renderLabel ?? ((value: string) => value)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const needle = search.toLowerCase()
  // Matches the label as well as the value, or typing "Bachelors" finds nothing when the
  // stored value is the slug 'bachelors'.
  const available = options.filter(
    (o) => !selected.includes(o) && (o.toLowerCase().includes(needle) || display(o).toLowerCase().includes(needle)),
  )
  const trimmedSearch = search.trim()
  const canAddCustom =
    allowCustom && trimmedSearch.length > 0 && !selected.some((o) => o.toLowerCase() === trimmedSearch.toLowerCase())

  function add(option: string) {
    onChange([...selected, option])
    setSearch('')
    inputRef.current?.focus()
  }

  function remove(option: string) {
    onChange(selected.filter((o) => o !== option))
  }

  return (
    <div ref={containerRef} className="relative flex flex-col gap-xs">
      <FieldLabel htmlFor={inputId} required={required}>
        {label}
      </FieldLabel>
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events -- the click is a mouse-convenience focus proxy into the real <input> below; keyboard users tab straight to the input, which owns all keyboard interaction */}
      <div
        onClick={() => {
          setOpen(true)
          inputRef.current?.focus()
        }}
        className="flex min-h-12 cursor-text flex-wrap items-center gap-xs rounded-lg border border-border bg-surface px-3 py-2 focus-within:border-2 focus-within:border-primary"
      >
        {selected.map((option) => (
          <span
            key={option}
            className="flex items-center gap-1 rounded-full bg-background px-sm py-1 text-caption text-text-primary"
          >
            {display(option)}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                remove(option)
              }}
              aria-label={`Remove ${display(option)}`}
              className="text-text-secondary hover:text-text-primary"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={inputId}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          placeholder={selected.length === 0 ? 'Search…' : ''}
          className="flex-1 border-none bg-transparent text-body text-text-primary outline-none"
          style={{ minWidth: '6rem' }}
        />
        <ChevronDown className="h-4 w-4 shrink-0 text-text-secondary" />
      </div>

      {open && (
        <div className="absolute top-full z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface py-xs shadow-card">
          {available.length === 0 && !canAddCustom && (
            <p className="px-md py-sm text-body-sm text-text-secondary">No matches.</p>
          )}
          {available.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => add(option)}
              className="block w-full px-md py-sm text-left text-body-sm text-text-primary hover:bg-background"
            >
              {display(option)}
            </button>
          ))}
          {canAddCustom && (
            <button
              type="button"
              onClick={() => add(trimmedSearch)}
              className={`block w-full px-md py-sm text-left text-body-sm text-primary hover:bg-background ${
                available.length > 0 ? 'border-t border-border' : ''
              }`}
            >
              + Add "{trimmedSearch}"
            </button>
          )}
        </div>
      )}
    </div>
  )
}
