// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03).
// Redesigned 2026-09-10 (user: "keep activities very simple and expect 100 entries there"): a
// compact timeline — one line per event with its time, grouped under Today / Yesterday / a date —
// that shows the newest 25 and loads older ones 25 at a time, so a long case stays readable.
import { useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClientActivity } from '@/queries/clients'
import { formatDate, formatTime } from '@/lib/time'

const PAGE = 25

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
  const activity = useClientActivity(clientId)
  const [shown, setShown] = useState(PAGE)

  if (activity.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (activity.isError || !activity.data)
    return <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />

  const items = [...activity.data].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
  if (items.length === 0) {
    return (
      <Card>
        <p className="text-body-sm text-text-secondary">No activity recorded yet.</p>
      </Card>
    )
  }

  const visible = items.slice(0, shown)
  const groups: { label: string; entries: typeof visible }[] = []
  for (const item of visible) {
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
          {items.length} {items.length === 1 ? 'event' : 'events'}
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

      {shown < items.length && (
        <div className="flex items-center justify-center gap-md border-t border-border pt-md">
          <span className="text-caption text-text-secondary">
            Showing {visible.length} of {items.length}
          </span>
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show older
          </Button>
        </div>
      )}
    </Card>
  )
}
