import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type UIEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, X } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useDebouncedValue } from '@/lib/useDebounce'
import { useServerSearch, type ServerSearchSource } from '@/lib/useServerSearch'
import type { SearchSelectOption } from './SearchSelect'

interface ServerSearchSelectProps<T> {
  source: ServerSearchSource<T>
  value: string
  /** `row` is the chosen record itself (undefined when cleared), so callers need no second lookup. */
  onChange: (id: string, row: T | undefined) => void
  /** Rows the server returns but this picker must not offer (already added, the caller's own account). */
  exclude?: (row: T) => boolean
  /** The current value's display, when the caller already holds it; skips the by-id request. */
  selectedOption?: SearchSelectOption | null
  placeholder?: string
  id?: string
  disabled?: boolean
  // Same three as SearchSelect: a floating label like TextField/SelectField, its tomato `*`, and a
  // screen-reader name for a control with no visible label.
  label?: string
  required?: boolean
  ariaLabel?: string
  emptyText?: string
}

/**
 * The searchable dropdown for lists too long to load (review F-038). SearchSelect filters whatever
 * one page its caller loaded, so record 101 of a list could never be picked. This one asks the
 * server as the user types (debounced), pages on with the list's cursor when the end of the
 * results is reached, and keeps showing a saved value that is not among the loaded results.
 *
 * Same look as SearchSelect. Unlike it, this is a real combobox for the keyboard and for screen
 * readers: Arrow keys move through the options, Enter chooses, Escape closes, and focus never
 * leaves the input.
 */
export function ServerSearchSelect<T>({
  source,
  value,
  onChange,
  exclude,
  selectedOption,
  placeholder = 'Search…',
  id,
  disabled,
  label,
  required,
  ariaLabel,
  emptyText = 'No matches.',
}: ServerSearchSelectProps<T>) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [activeIndex, setActiveIndex] = useState(-1)
  // The row chosen here, kept so its label survives the results moving on to another term.
  const [picked, setPicked] = useState<T | null>(null)

  const debounced = useDebouncedValue(query)
  // Between a keystroke and the debounce the list still holds the previous term's rows. They are
  // hidden until the answer for what is typed NOW arrives, so Enter cannot choose from them.
  const settling = query.trim() !== debounced.trim()
  const results = useServerSearch(source, debounced, open && !disabled)
  const { entries, hasMore, isLoadingMore, loadMore } = results
  const visible = useMemo(() => (exclude ? entries.filter((e) => !exclude(e.row)) : entries), [entries, exclude])
  const loading = settling || results.isLoading
  const options = loading || results.isError ? [] : visible

  const pickedOption = picked ? source.toOption(picked) : null
  const known =
    selectedOption ??
    (pickedOption?.id === value ? pickedOption : null) ??
    entries.find((e) => e.option.id === value)?.option ??
    null
  const { fetchById } = source
  const byId = useQuery({
    queryKey: [...source.queryKey, 'selected', value],
    queryFn: ({ signal }) => fetchById!(value, signal),
    enabled: isAuthed && Boolean(value) && !known && Boolean(fetchById),
    staleTime: 5 * 60 * 1000,
  })
  const selected = known ?? (byId.data ? source.toOption(byId.data) : null)

  function close() {
    setOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) close()
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // `fixed` off the input's own rectangle, for SearchSelect's reason: an `absolute` list is
  // clipped by a Modal's scrolling body.
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

  // A page whose every row is excluded would read as "No matches" with more still on the server.
  useEffect(() => {
    if (open && !loading && !results.isError && visible.length === 0 && hasMore && !isLoadingMore) loadMore()
  })

  const activeId = activeIndex >= 0 && activeIndex < options.length ? `${listId}-opt-${activeIndex}` : undefined
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView?.({ block: 'nearest' })
  }, [activeId])

  function choose(entry: { row: T; option: SearchSelectOption }) {
    setPicked(entry.row)
    onChange(entry.option.id, entry.row)
    close()
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      // Walking past the last loaded option is the keyboard's way of scrolling to the end.
      if (activeIndex >= options.length - 1) loadMore()
      setActiveIndex((i) => Math.min(i + 1, options.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && open) {
      // Never the form's submit while the list is open: Enter here means "this option".
      e.preventDefault()
      const entry = options[activeIndex]
      if (entry) choose(entry)
    } else if (e.key === 'Escape' && open) {
      e.preventDefault()
      close()
    }
  }

  function handleScroll(e: UIEvent<HTMLDivElement>) {
    const el = e.currentTarget
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48) loadMore()
  }

  const showClear = Boolean(value) && !disabled && !open

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        aria-required={required || undefined}
        value={open ? query : (selected?.label ?? '')}
        onChange={(e) => {
          setQuery(e.target.value)
          setActiveIndex(-1)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
        // Closes when focus leaves the component. The options are not focusable (a press on one
        // keeps focus in the input), so only the Retry and Load more buttons can take it.
        onBlur={(e) => {
          if (containerRef.current?.contains(e.relatedTarget as Node | null)) return
          close()
        }}
        onKeyDown={handleKeyDown}
        placeholder={value && !selected && byId.isLoading ? 'Loading…' : placeholder}
        disabled={disabled}
        autoComplete="off"
        className={`block w-full border border-border bg-surface text-body outline-none transition-colors focus:border-2 focus:border-primary disabled:cursor-not-allowed disabled:opacity-50 ${
          label ? 'h-12 rounded-full pl-5 pr-11' : 'h-10 rounded-md pl-3 pr-9'
        }`}
      />
      {showClear ? (
        <button
          type="button"
          onClick={() => {
            setPicked(null)
            onChange('', undefined)
          }}
          aria-label="Clear"
          title="Clear"
          className={`absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-background hover:text-text-primary ${
            label ? 'right-3' : 'right-1.5'
          }`}
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <ChevronDown
          aria-hidden
          className={`pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary ${
            label ? 'right-4' : 'right-3'
          }`}
        />
      )}
      {label && (
        <label
          htmlFor={id}
          className="pointer-events-none absolute left-5 top-0 origin-left -translate-y-1/2 scale-[0.8] bg-surface px-xs text-body text-text-secondary"
        >
          {label}
          {required && <span className="text-required"> *</span>}
        </label>
      )}
      {open && rect && (
        <div
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-surface shadow-card"
          onScroll={handleScroll}
        >
          {/* Read out as it changes: a screen-reader user hears that a search is running or found nothing. */}
          <div role="status" aria-live="polite">
            {loading && <p className="p-sm text-body-sm text-text-secondary">Searching…</p>}
            {!loading && !results.isError && options.length === 0 && !hasMore && (
              <p className="p-sm text-body-sm text-text-secondary">{emptyText}</p>
            )}
          </div>
          {!loading && results.isError && (
            <div role="alert" className="flex items-center justify-between gap-sm p-sm">
              <p className="text-body-sm text-error">Could not load results.</p>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={results.retry}
                className="text-body-sm font-medium text-primary hover:underline"
              >
                Retry
              </button>
            </div>
          )}
          <div role="listbox" id={listId} aria-label={label ?? ariaLabel ?? placeholder}>
            {options.map((entry, index) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- an option never holds focus: the combobox input owns the keyboard (Arrow keys, Enter) and names the active option through aria-activedescendant
              <div
                key={entry.option.id}
                id={`${listId}-opt-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={entry.option.id === value}
                // Keeps focus in the input, so the press does not close the list before the click lands.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(entry)}
                onMouseEnter={() => setActiveIndex(index)}
                className={`flex w-full cursor-pointer items-center justify-between gap-sm px-sm py-xs text-left text-body-sm ${
                  index === activeIndex ? 'bg-background' : ''
                }`}
              >
                <span className="min-w-0 flex-1 truncate text-text-primary">
                  {entry.option.label}
                  {entry.option.sublabel && (
                    <span className="ml-xs text-caption text-text-secondary">{entry.option.sublabel}</span>
                  )}
                </span>
                {entry.option.group && (
                  <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                    {entry.option.group}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* Scrolling to the end loads the next page; the button is the same thing for a list too
              short to scroll and for anyone not using a wheel. */}
          {!loading && !results.isError && hasMore && options.length > 0 && (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={loadMore}
              disabled={isLoadingMore}
              className="block w-full px-sm py-xs text-left text-body-sm font-medium text-primary hover:bg-background disabled:text-text-secondary"
            >
              {isLoadingMore ? 'Loading more…' : 'Load more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
