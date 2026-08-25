import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLeads } from '@/queries/leads'
import { useClients } from '@/queries/clients'
import { useDebouncedValue } from '@/lib/useDebounce'

const MIN_QUERY_LENGTH = 2
const MAX_RESULTS_PER_GROUP = 5

// Build reference 1.22/2.2 — "a search bar fixed in the immiNow shell, available everywhere —
// typing a name, email, or phone shows matching Clients and Leads live, scoped to whatever the
// searcher already has access to." Reuses the existing /leads and /clients list endpoints (each
// gained a `search` param) rather than a dedicated combined endpoint, so results stay consistent
// with whatever those lists would show the same viewer.
export function GlobalSearch() {
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [query, setQuery] = useState('')
  const debouncedQuery = useDebouncedValue(query.trim())
  const [open, setOpen] = useState(false)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const searchActive = debouncedQuery.length >= MIN_QUERY_LENGTH
  const leads = useLeads({ search: debouncedQuery }, { enabled: searchActive })
  const clients = useClients({ search: debouncedQuery }, { enabled: searchActive })

  const leadResults = leads.data?.items.slice(0, MAX_RESULTS_PER_GROUP) ?? []
  const clientResults = clients.data?.items.slice(0, MAX_RESULTS_PER_GROUP) ?? []
  const isLoading = searchActive && (leads.isLoading || clients.isLoading)

  const results = [
    ...leadResults.map((lead) => ({
      key: lead.id,
      path: `/sales/leads/${lead.id}`,
      name: lead.name,
      subtitle: lead.email ?? lead.phone ?? '—',
      tag: 'Lead' as const,
    })),
    ...clientResults.map((client) => ({
      key: client.id,
      path: `/clients/${client.id}`,
      name: `${client.student.first_name} ${client.student.last_name}`,
      // File number shown alongside email (user-requested, 2026-08-15) — search-by-file-number
      // already works with no backend change needed, since GET /clients's `search` param already
      // matches file_number (added for Clients List's own search box).
      subtitle: [client.file_number, client.student.email].filter(Boolean).join(' · '),
      tag: 'Applicant' as const,
    })),
  ]
  const hasResults = results.length > 0

  function goTo(path: string) {
    navigate(path)
    setQuery('')
    setOpen(false)
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setOpen(false)
      e.currentTarget.blur()
    }
  }

  return (
    <div
      ref={containerRef}
      // `max-w-md` is unusable here — Tailwind v4's `@config` compat path resolves it from our
      // custom `spacing.md` (16px) instead of the real named max-width scale (confirmed via the
      // generated stylesheet: `.max-w-md { max-width: var(--space-md) }`), the same root cause
      // already reported once on the login page and patched around there rather than fixed.
      // Inline style sidesteps it directly instead of fighting Tailwind's config resolution.
      style={{ maxWidth: '34rem' }}
      className="relative flex-1"
    >
      <div className="relative">
        <svg
          viewBox="0 0 20 20"
          className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 fill-text-secondary"
        >
          <path d="M13.61 12.2a6.5 6.5 0 1 0-1.41 1.41l3.6 3.6a1 1 0 0 0 1.4-1.42l-3.59-3.59ZM3.5 8.5a5 5 0 1 1 10 0 5 5 0 0 1-10 0Z" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search leads and applicants…"
          aria-label="Search leads and applicants"
          className="h-11 w-full rounded-full border border-border bg-background pl-11 pr-4 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
        />
      </div>

      {open && searchActive && (
        <div className="absolute left-0 top-12 z-50 max-h-96 w-full overflow-y-auto rounded-lg border border-border bg-surface shadow-card">
          {isLoading && <p className="p-md text-body-sm text-text-secondary">Searching…</p>}

          {!isLoading && !hasResults && (
            <p className="p-md text-body-sm text-text-secondary">No matches for "{debouncedQuery}".</p>
          )}

          {!isLoading && hasResults && (
            <div className="py-xs">
              {results.map((result, i) => (
                <button
                  key={result.key}
                  onClick={() => goTo(result.path)}
                  className={`flex w-full items-center justify-between gap-md px-md py-sm text-left hover:bg-background ${
                    i > 0 ? 'border-t border-border' : ''
                  }`}
                >
                  <span className="flex min-w-0 flex-col items-start">
                    <span className="text-body-sm font-medium text-text-primary">{result.name}</span>
                    <span className="text-caption text-text-secondary">{result.subtitle}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                    {result.tag}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
