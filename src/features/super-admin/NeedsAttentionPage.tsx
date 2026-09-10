import { useNavigate } from 'react-router-dom'
import { AdminShell } from '@/features/auth/AdminShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAdminAttention } from '@/queries/adminDashboard'
import type { components } from '@/api/schema'

type AttentionItem = components['schemas']['AttentionItem']

// The platform team's to-do list, as its own Dashboard page (2026-09-10, user: "make Needs
// attention a new page in Dashboard, show a counter in side menu if there are any open item" —
// it had been a panel on the Overview). The server builds it and already limits it to the queues
// this viewer's permissions cover. Queues with work come first — urgent ones before the rest — and
// clear queues stay on the board, grey, so "nothing to do" is visible rather than a card that
// silently vanished. Every card opens the page where that queue is worked.
export function NeedsAttentionPage() {
  const navigate = useNavigate()
  const attention = useAdminAttention()

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

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
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

        <div className="grid grid-cols-1 gap-sm sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((item) => {
            const hot = item.count > 0
            const urgent = hot && item.severity === 'urgent'
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => navigate(item.link)}
                className={`flex flex-col items-start gap-xs rounded-lg border p-md text-left transition-colors hover:bg-background ${
                  urgent ? 'border-error bg-error/5' : hot ? 'border-warning bg-warning/5' : 'border-border bg-surface'
                }`}
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
            )
          })}
        </div>
      </div>
    </AdminShell>
  )
}
