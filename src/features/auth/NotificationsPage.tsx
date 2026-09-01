import { Link } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AdminShell } from './AdminShell'
import { FreelancerShell } from './FreelancerShell'
import { AccountShell } from './AccountShell'
import { Card } from '@/components/Card'
import { useMarkNotificationRead, useNotifications } from '@/queries/notifications'
import { useAuthStore } from '@/stores/authStore'
import { ErrorState, Skeleton } from '@/components/QueryState'

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  return `${Math.floor(hours / 24)}d ago`
}

export function NotificationsPage() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationRead()
  const role = useAuthStore((s) => s.user?.role)
  // M12 fix (frontend review, 1 Sep 2026): this used to send `platform_staff` into the
  // consultancy shell (only `super_admin` got AdminShell) and never accounted for Freelancer at
  // all — every platform/freelancer role now gets its own shell here, same as everywhere else.
  const Shell =
    role === 'super_admin' || role === 'platform_staff'
      ? AdminShell
      : role === 'freelancer'
        ? FreelancerShell
        : role === 'student'
          ? AccountShell
          : AppShell

  return (
    <Shell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Notifications</h1>

        {notifications.isLoading && (
          <div className="flex flex-col gap-sm">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 rounded-md" />
            ))}
          </div>
        )}

        {notifications.isError && (
          <ErrorState message="Could not load notifications." onRetry={() => notifications.refetch()} />
        )}

        {notifications.data && notifications.data.items.length === 0 && (
          <Card>
            <p className="text-body text-text-secondary">
              No notifications yet — you'll see updates about leads, clients, and plans here.
            </p>
          </Card>
        )}

        {notifications.data && notifications.data.items.length > 0 && (
          <div className="flex flex-col gap-sm">
            {notifications.data.items.map((n) => (
              <Link
                key={n.id}
                to={n.deep_link ?? '#'}
                onClick={() => !n.read && markRead.mutate(n.id)}
                className="block"
              >
                <Card
                  className={`flex items-start justify-between gap-md transition-colors hover:bg-background ${
                    n.read ? '' : 'bg-unread-bg'
                  }`}
                >
                  <div>
                    <p className="text-body font-medium text-text-primary">{n.title}</p>
                    <p className="text-body-sm text-text-secondary">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-caption text-text-secondary">{timeAgo(n.created_at!)}</span>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </Shell>
  )
}
