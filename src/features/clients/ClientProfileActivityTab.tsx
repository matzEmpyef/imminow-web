// Split out of ClientProfilePage.tsx (Phase 3 plan, Tier B1, 2026-09-03) — pure movement, no logic change.
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useClientActivity } from '@/queries/clients'
import { formatDateTime } from '@/lib/time'

export function ActivityTab({ clientId }: { clientId: string }) {
  const activity = useClientActivity(clientId)
  if (activity.isLoading) return <Skeleton className="h-24 rounded-lg" />
  if (activity.isError || !activity.data)
    return <ErrorState message="Could not load activity." onRetry={() => activity.refetch()} />
  if (activity.data.length === 0) {
    return (
      <Card>
        <p className="text-body text-text-secondary">No activity recorded yet.</p>
      </Card>
    )
  }
  return (
    <Card className="flex flex-col gap-sm">
      {activity.data.map((item) => (
        <div key={item.id} className="border-b border-border pb-sm last:border-0">
          <p className="text-body-sm text-text-primary">{item.description}</p>
          <p className="text-caption text-text-secondary">{formatDateTime(item.created_at)}</p>
        </div>
      ))}
    </Card>
  )
}
