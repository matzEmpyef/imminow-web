import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'

interface ComboboxProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: string[]
  required?: boolean
}

// Looks like a normal select (same pill shape/floating label as TextField, plus a chevron) but
// stays free text underneath — typing something not in `options` and pressing Enter (or clicking
// the "+ Add" row) just uses that value, since there's no separate "manage categories" list to
// maintain; the option set is always just whatever's already in use elsewhere.
//
// The options panel renders through a portal into document.body as `position: fixed`, not as an
// `absolute` child here — a plain absolute child gets clipped by the first `overflow-y-auto`
// ancestor (e.g. Modal.tsx's scrollable body), which cut the panel off mid-row when this field
// sits low inside a Modal. The click-outside check has to know about both the portaled panel and
// this field's own container, since they're no longer the same DOM subtree.
export function Combobox({ label, value, onChange, options, required }: ComboboxProps) {
  const fieldId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [focused, setFocused] = useState(false)
  const [draft, setDraft] = useState(value)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node
      const insideField = containerRef.current?.contains(target)
      const insideDropdown = dropdownRef.current?.contains(target)
      if (!insideField && !insideDropdown) {
        setOpen(false)
        setFocused(false)
        setDraft(value)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open, value])

  const trimmedDraft = draft.trim()
  const filtered = options.filter((o) => o.toLowerCase().includes(trimmedDraft.toLowerCase()))
  const exactMatch = options.some((o) => o.toLowerCase() === trimmedDraft.toLowerCase())

  function updateCoords() {
    const rect = containerRef.current?.getBoundingClientRect()
    if (rect) setCoords({ top: rect.bottom + 4, left: rect.left, width: rect.width })
  }

  function select(v: string) {
    onChange(v)
    setDraft(v)
    setOpen(false)
    setFocused(false)
  }

  function handleFocus(e: FocusEvent<HTMLInputElement>) {
    setFocused(true)
    setOpen(true)
    updateCoords()
    e.currentTarget.select()
  }

  function commitDraft() {
    if (trimmedDraft) onChange(trimmedDraft)
    setOpen(false)
    setFocused(false)
  }

  const floated = focused || Boolean(draft)

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={fieldId}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setOpen(true)
            updateCoords()
          }}
          onFocus={handleFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              commitDraft()
            }
            if (e.key === 'Escape') {
              setOpen(false)
              setFocused(false)
              setDraft(value)
            }
          }}
          required={required}
          autoComplete="off"
          className="h-12 w-full rounded-full border bg-surface pl-5 pr-11 text-body text-text-primary outline-none transition-colors focus:border-2 focus:border-primary border-border"
        />
        <label
          htmlFor={fieldId}
          className={`pointer-events-none absolute left-5 origin-left -translate-y-1/2 bg-surface px-1 text-body transition-all ${
            floated ? 'top-0 scale-[0.8]' : 'top-1/2 scale-100'
          } ${focused ? 'text-primary' : 'text-text-secondary'}`}
        >
          {label}
          {required && <span className="text-required"> *</span>}
        </label>
        <ChevronDown className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
      </div>

      {open &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width }}
            className="z-50 max-h-56 overflow-y-auto rounded-lg border border-border bg-surface py-xs shadow-card"
          >
            {filtered.length === 0 && !trimmedDraft && (
              <p className="px-md py-sm text-body-sm text-text-secondary">No categories yet.</p>
            )}
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => select(option)}
                className="block w-full px-md py-sm text-left text-body-sm text-text-primary hover:bg-background"
              >
                {option}
              </button>
            ))}
            {!exactMatch && trimmedDraft && (
              <button
                type="button"
                onClick={() => select(trimmedDraft)}
                className={`block w-full px-md py-sm text-left text-body-sm text-primary hover:bg-background ${
                  filtered.length > 0 ? 'border-t border-border' : ''
                }`}
              >
                + Add "{trimmedDraft}"
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  )
}
