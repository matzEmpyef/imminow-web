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

// THE SERVER SENDS EACH QUEUE'S OWN PRE-FILTERED LINK (assumptions audit M35, product owner
// 2026-09-19). A `LINK_OVERRIDES` table lived here, mapping a count to whatever filter the author
// believed matched it — which is how "Courses missing entry requirements: 12" opened a COLLEGE
// filter listing 40 colleges. A link the page guesses can disagree with a count the server
// computed, and there is nothing on screen to say which is right; `item.link` cannot.

// A snooze is "I have seen these N and I am on them", not "hide this queue" (user question,
// 2026-09-18: "if I snooze for 7 days and a new item in same card comes up after 1 day, will I
// get to see it?"). So it remembers the count it was taken at: the card stays away while the
// queue holds that many or fewer, and comes straight back the moment new work lands — new work
// nobody has looked at must never be hidden by a decision made about older work.
interface SnoozeEntry {
  until: string // ISO expiry
  count: number // what the queue held when it was snoozed
}

interface SnoozeMap {
  [key: string]: SnoozeEntry
}

function readSnoozed(): SnoozeMap {
  try {
    const raw = window.localStorage.getItem(SNOOZE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed !== 'object' || parsed === null) return {}
    const map: SnoozeMap = {}
    for (const [key, value] of Object.entries(parsed)) {
      // Entries written before snoozes carried a count (v1 was a bare ISO string) are read as
      // "snoozed at 0", so they expire on their own date and any open work brings them back.
      if (typeof value === 'string') map[key] = { until: value, count: 0 }
      else if (value && typeof value === 'object' && typeof (value as SnoozeEntry).until === 'string') {
        const entry = value as SnoozeEntry
        map[key] = { until: entry.until, count: Number.isFinite(entry.count) ? entry.count : 0 }
      }
    }
    return map
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

  const isSnoozed = (item: AttentionItem) => {
    const entry = snoozed[item.key]
    if (!entry || new Date(entry.until).getTime() <= now) return false
    return item.count <= entry.count
  }

  function snoozeItem(item: AttentionItem) {
    const until = new Date(now + SNOOZE_DAYS * 86_400_000).toISOString()
    const next = { ...snoozed, [item.key]: { until, count: item.count } }
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
  // `low` queues (2026-09-18) are ones that may legitimately never empty — a course whose college
  // publishes no entry requirements sits there for good. They stay on the board, in the quiet
  // style and last among the open ones, but their `open_count` is always 0, so they never put a
  // number on the sidebar.
  //
  // The header's two numbers now come from the SAME field (assumptions audit M35, product owner
  // 2026-09-19): it used to pair the server's total with a count this page re-derived from
  // `count` and its own reading of `severity`, so a queue the server had excluded could still be
  // counted here as a queue with work.
  const open = items.filter((item) => item.open_count > 0)
  const rank = (item: AttentionItem) =>
    item.count === 0 ? 3 : item.severity === 'urgent' ? 0 : item.severity === 'low' ? 2 : 1
  const sorted = [...items].sort((a, b) => rank(a) - rank(b) || b.count - a.count)
  const total = attention.data.open_count

  // A handful of queues at most — no need to memoize a filter over them.
  const snoozedCount = sorted.filter((item) => isSnoozed(item)).length
  const visible = sorted.filter((item) => showSnoozed || !isSnoozed(item))

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
            const low = item.severity === 'low'
            const hot = item.count > 0 && !low
            const urgent = hot && item.severity === 'urgent'
            const snoozedUntil = snoozed[item.key]?.until
            const cardSnoozed = isSnoozed(item)
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
                  onClick={() => navigate(item.link)}
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
                  {low && item.count > 0 && (
                    <span className="text-caption text-text-secondary">
                      Low priority — worked when there is time, so it is left out of the sidebar count.
                    </span>
                  )}
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
                      onClick={() => snoozeItem(item)}
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
