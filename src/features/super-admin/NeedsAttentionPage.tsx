import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BellOff } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { StopPropagation } from '@/components/StopPropagation'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAdminAttention } from '@/queries/adminDashboard'
import { formatDate } from '@/lib/time'
import type { components } from '@/api/schema'

type AttentionItem = components['schemas']['AttentionItem']

const SNOOZE_KEY = 'sentpo-needs-attention-snoozed'
const SNOOZE_DAYS = 7

// Some queues' server-sent `link` is the bare list page — the filter that matches what this card
// counted lives only on the client. Keyed by item.key so a card always opens pre-filtered to the
// same rows it counted, not the page's unfiltered default. Queues whose target page is owned by
// another agent this session (Manage Consultancies, Sentpo Users) are left off this list — their
// server link is used as-is; `stuck_onboarding` and `never_billed` already carry their own filter
// from the server, so they need no entry here either.
const LINK_OVERRIDES: Record<string, string> = {
  courses_missing_requirements: '/admin/colleges?health=needs_details',
  institutions_unmapped: '/admin/institutions?tab=queue',
  disputes_open: '/admin/disputes?status=open',
  complaints_open: '/admin/complaints?status=unresolved',
  visit_requests: '/admin/visit-requests?status=pending',
  // case_followups / service_followups need no override: both pages already default to hiding
  // snoozed rows, the same "not snoozed" rule the count itself uses.
  payments_to_confirm: '/admin/finance-dashboard?tab=awaiting',
  default_rate_cases: '/admin/commission-rates?focus=default_rate',
  freelancer_payouts: '/admin/freelancer-payouts?tab=owed',
  blog_categories: '/admin/blog?tab=mappings&filter=new',
}

function linkFor(item: AttentionItem): string {
  return LINK_OVERRIDES[item.key] ?? item.link
}

interface SnoozeMap {
  [key: string]: string // ISO expiry
}

function readSnoozed(): SnoozeMap {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as SnoozeMap
    return typeof parsed === 'object' && parsed !== null ? parsed : {}
  } catch {
    return {}
  }
}

function writeSnoozed(map: SnoozeMap) {
  try {
    window.localStorage.setItem(SNOOZE_KEY, JSON.stringify(map))
  } catch {
    // Private browsing / storage disabled — snoozing just won't stick this session.
  }
}

// The platform team's to-do list, as its own Dashboard page (2026-09-10, user: "make Needs
// attention a new page in Dashboard, show a counter in side menu if there are any open item" —
// it had been a panel on the Overview). The server builds it and already limits it to the queues
// this viewer's permissions cover. Queues with work come first — urgent ones before the rest — and
// clear queues stay on the board, grey, so "nothing to do" is visible rather than a card that
// silently vanished. Every card opens the page where that queue is worked, pre-filtered to the same
// rows it counted (see LINK_OVERRIDES). A card can be snoozed for a week when it's a known,
// already-being-worked backlog — kept client-side in localStorage, never hidden from the total.
export function NeedsAttentionPage() {
  const navigate = useNavigate()
  const attention = useAdminAttention()
  const [snoozed, setSnoozed] = useState<SnoozeMap>(() => readSnoozed())
  const [showSnoozed, setShowSnoozed] = useState(false)
  const now = Date.now()

  const isSnoozed = (key: string) => {
    const until = snoozed[key]
    return Boolean(until && new Date(until).getTime() > now)
  }

  function snoozeItem(key: string) {
    const until = new Date(now + SNOOZE_DAYS * 86_400_000).toISOString()
    const next = { ...snoozed, [key]: until }
    setSnoozed(next)
    writeSnoozed(next)
  }

  function unsnoozeItem(key: string) {
    const next = { ...snoozed }
    delete next[key]
    setSnoozed(next)
    writeSnoozed(next)
  }

  if (attention.isLoading) {
    return (
      <AdminShell>
        <Skeleton className="h-64 rounded-lg" />
      </AdminShell>
    )
  }
  if (attention.isError || !attention.data) {
    return (
      <AdminShell>
        <ErrorState message="Could not load what needs attention." onRetry={() => attention.refetch()} />
      </AdminShell>
    )
  }

  const items = attention.data.items
  const open = items.filter((item) => item.count > 0)
  const rank = (item: AttentionItem) => (item.count > 0 ? (item.severity === 'urgent' ? 0 : 1) : 2)
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || b.count - a.count)
  const total = attention.data.open_count

  // A handful of queues at most — no need to memoize a filter over them.
  const snoozedCount = sorted.filter((item) => isSnoozed(item.key)).length
  const visible = sorted.filter((item) => showSnoozed || !isSnoozed(item.key))

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex flex-wrap items-start justify-between gap-md">
          <div>
            <h1 className="text-h1 text-text-primary">Needs attention</h1>
            <p className="mt-xs text-body-sm text-text-secondary">
              {items.length === 0
                ? 'None of your areas has a work queue.'
                : open.length === 0
                  ? 'All clear — nothing is waiting on you right now.'
                  : `${total} ${total === 1 ? 'item is' : 'items are'} waiting across ${open.length} ${open.length === 1 ? 'queue' : 'queues'}. Open a card to work it.`}
            </p>
          </div>
          {snoozedCount > 0 && (
            <button
              type="button"
              onClick={() => setShowSnoozed((v) => !v)}
              className={`flex shrink-0 items-center gap-xs rounded-full border px-md py-xs text-body-sm transition-colors ${
                showSnoozed
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface text-text-secondary hover:text-text-primary'
              }`}
            >
              <BellOff className="h-3.5 w-3.5" aria-hidden />
              {showSnoozed ? 'Hide snoozed' : `Snoozed (${snoozedCount})`}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => {
            const hot = item.count > 0
            const urgent = hot && item.severity === 'urgent'
            const snoozedUntil = snoozed[item.key]
            const cardSnoozed = isSnoozed(item.key)
            return (
              <div
                key={item.key}
                className={`relative flex flex-col items-start gap-xs rounded-lg border p-md text-left transition-colors ${
                  cardSnoozed
                    ? 'border-border bg-surface opacity-60'
                    : urgent
                      ? 'border-error bg-error/5'
                      : hot
                        ? 'border-warning bg-warning/5'
                        : 'border-border bg-surface'
                }`}
              >
                <button
                  type="button"
                  onClick={() => navigate(linkFor(item))}
                  className="flex w-full flex-col items-start gap-xs text-left hover:opacity-80"
                >
                  <span className="flex w-full items-start justify-between gap-sm">
                    <span className={`text-body-sm font-medium ${hot ? 'text-text-primary' : 'text-text-secondary'}`}>
                      {item.label}
                    </span>
                    <span
                      className={`text-h2 tabular-nums leading-none ${
                        urgent ? 'text-error' : hot ? 'text-warning' : 'text-text-secondary'
                      }`}
                    >
                      {item.count}
                    </span>
                  </span>
                  {item.hint && <span className="text-caption text-text-secondary">{item.hint}</span>}
                </button>
                <StopPropagation className="flex w-full items-center justify-between gap-sm pt-xs">
                  {cardSnoozed ? (
                    <>
                      <span className="text-caption text-text-secondary">
                        Snoozed until {snoozedUntil ? formatDate(snoozedUntil) : '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => unsnoozeItem(item.key)}
                        className="text-caption font-medium text-primary hover:underline"
                      >
                        Unsnooze
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => snoozeItem(item.key)}
                      className="text-caption text-text-secondary hover:text-text-primary hover:underline"
                    >
                      Snooze for 7 days
                    </button>
                  )}
                </StopPropagation>
              </div>
            )
          })}
        </div>
      </div>
    </AdminShell>
  )
}
