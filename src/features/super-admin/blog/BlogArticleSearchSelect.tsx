import { useEffect, useRef, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import { useBlogArticleSearch } from '@/queries/blogArticles'
import { useDebouncedValue } from '@/lib/useDebounce'

interface BlogArticleSearchSelectProps {
  value: string
  onChange: (id: string) => void
  id?: string
  placeholder?: string
}

/**
 * Broadcast's "opens a specific article" picker (2026-09-11).
 *
 * `SearchSelect` (components/SearchSelect.tsx) only filters an `options` array the caller already
 * has loaded in full — fine for the client/lead lists it was built for, wrong here: the article
 * list this used to be handed was `useBlogArticles()`'s first (unfiltered) page, so a sender could
 * only ever pick from the 20 most recent articles and had no way to reach anything published
 * earlier. This is the same combobox shape (same floating-fixed dropdown, same clear-button
 * pattern) but the options come from `useBlogArticleSearch`, a live server search keyed on what's
 * typed, rather than a local `.filter()` over a fixed list.
 */
export function BlogArticleSearchSelect({ value, onChange, id, placeholder = 'Search articles…' }: BlogArticleSearchSelectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const debouncedQuery = useDebouncedValue(query)

  const results = useBlogArticleSearch(open ? debouncedQuery.trim() : '')
  const options = results.data?.items ?? []
  const selected = options.find((a) => a.id === value)

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

  // Same reasoning as SearchSelect: `fixed` (not `absolute`) so the dropdown escapes an ancestor
  // Modal's `overflow-y-auto`, which this picker sits inside (SendBroadcastModal).
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

  function handleSelect(id: string) {
    onChange(id)
    setQuery('')
    setOpen(false)
  }

  const showClear = Boolean(value) && !open

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        id={id}
        value={open ? query : (selected?.title ?? '')}
        onChange={(e) => {
          setQuery(e.target.value)
          if (!open) setOpen(true)
        }}
        onFocus={() => {
          setOpen(true)
          setQuery('')
        }}
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
        autoComplete="off"
        className="block h-10 w-full rounded-md border border-border bg-surface pl-3 pr-9 text-body outline-none transition-colors focus:border-2 focus:border-primary"
      />
      {showClear ? (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear"
          title="Clear"
          className="absolute right-1.5 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-secondary hover:bg-background hover:text-text-primary"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary"
        />
      )}
      {open && rect && (
        <div
          style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width }}
          className="z-50 max-h-60 overflow-y-auto rounded-md border border-border bg-surface shadow-card"
        >
          {results.isLoading && <p className="p-sm text-body-sm text-text-secondary">Searching…</p>}
          {!results.isLoading && options.length === 0 && (
            <p className="p-sm text-body-sm text-text-secondary">No matches.</p>
          )}
          {options.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => handleSelect(a.id)}
              className="flex w-full items-center gap-sm px-sm py-xs text-left text-body-sm hover:bg-background"
            >
              <span className="min-w-0 flex-1 truncate text-text-primary">{a.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
