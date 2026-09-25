// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Redesigned 2026-09-10 (user: "keep activities very simple and expect 100 entries there"): a
// compact timeline — one line per event with its time, grouped under Today / Yesterday / a date.
// Paged since contract gate 7 (Wave 3 plan §7 item 3) — the local "Show older" (25 at a time, over
// a fully-loaded list) is now the console's own Previous/Next paging against the server, newest
// first per the contract, same as it read before.
import { Card } from '@/components/Card'
import { CursorPager } from '@/components/CursorPager'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClientActivity } from '@/queries/clients'
import { useCursorPagination } from '@/lib/pagination'
import { formatDate, formatTime } from '@/lib/time'

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86_400_000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return formatDate(d)
}

export function ActivityTab({ clientId }: { clientId: string }) {
  const paging = useCursorPagination()
  const activity = useClientActivity(clientId, { cursor: paging.cursor, limit: 20 })

  if (activity.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (activity.isError || !activity.data)
    return <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />

  // Already newest first off the server (contract gate 7) — the client-side sort this tab used
  // to need against the old unpaged read is gone with it.
  const items = activity.data.items
  if (items.length === 0 && !paging.hasPrevious) {
    return (
      <Card>
        <p className="text-body-sm text-text-secondary">No activity recorded yet.</p>
      </Card>
    )
  }

  const groups: { label: string; entries: typeof items }[] = []
  for (const item of items) {
    const label = dayLabel(item.created_at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.entries.push(item)
    else groups.push({ label, entries: [item] })
  }

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex items-baseline justify-between gap-md">
        <h2 className="text-h3 text-text-primary">Activity</h2>
        <span className="text-body-sm tabular-nums text-text-secondary">
          {activity.data.meta.total} {activity.data.meta.total === 1 ? 'event' : 'events'}
        </span>
      </div>

      <div className="flex flex-col gap-md">
        {groups.map((group) => (
          <section key={group.label} className="flex flex-col">
            <h3 className="sticky top-0 bg-surface pb-xs text-caption font-medium uppercase tracking-wide text-text-secondary">
              {group.label}
            </h3>
            <ol className="flex flex-col border-l border-border">
              {group.entries.map((item) => (
                <li key={item.id} className="relative flex items-baseline gap-md py-xs pl-md">
                  <span className="absolute -left-[3px] top-2.5 h-1.5 w-1.5 rounded-full bg-text-secondary" aria-hidden />
                  <span className="w-14 shrink-0 text-caption tabular-nums text-text-secondary">{formatTime(item.created_at)}</span>
                  <span className="min-w-0 flex-1 text-body-sm text-text-primary">{item.description}</span>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <CursorPager
        hasNext={Boolean(activity.data.meta.next_cursor)}
        hasPrevious={paging.hasPrevious}
        onNext={() => activity.data?.meta.next_cursor && paging.next(activity.data.meta.next_cursor)}
        onPrevious={paging.previous}
        noun="event"
        className="-mx-lg -mb-lg"
      />
    </Card>
  )
}
