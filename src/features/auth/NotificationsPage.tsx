import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AppShell } from './AppShell'
import { AdminShell } from './AdminShell'
import { FreelancerShell } from './FreelancerShell'
import { AccountShell } from './AccountShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { FilterChip } from '@/components/FilterChip'
import { CursorPager } from '@/components/CursorPager'
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  type NotificationsFilters,
} from '@/queries/notifications'
import { useAuthStore } from '@/stores/authStore'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { timeAgo } from '@/lib/time'
import { safeDeepLink } from '@/lib/deepLinks'
import { useCursorPagination } from '@/lib/pagination'
import { useDebouncedValue } from '@/lib/useDebounce'
import { showToast } from '@/lib/toast'

const PAGE_SIZE = 20

export function NotificationsPage() {
  const [readFilter, setReadFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [searchInput, setSearchInput] = useState('')
  const search = useDebouncedValue(searchInput, 300)
  const { cursor, hasPrevious, next, previous, reset } = useCursorPagination()

  const filters: NotificationsFilters = {
    read: readFilter === 'all' ? undefined : readFilter === 'unread',
    search: search || undefined,
    cursor,
    limit: PAGE_SIZE,
  }
  const notifications = useNotifications(filters)
  const markRead = useMarkNotificationRead()
  const markAllRead = useMarkAllNotificationsRead()
  const role = useAuthStore((s) => s.user?.role)

  function changeReadFilter(next: 'all' | 'unread' | 'read') {
    setReadFilter(next)
    reset()
  }

  function changeSearch(value: string) {
    setSearchInput(value)
    reset()
  }

  const hasUnread = (notifications.data?.unread_count ?? 0) > 0

  function handleMarkAllRead() {
    markAllRead.mutate(undefined, {
      onSuccess: () => showToast('All notifications marked as read.'),
      onError: () => showToast('Could not mark all as read.', 'error'),
    })
  }
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
        <div className="flex flex-wrap items-center justify-between gap-sm">
          <h1 className="text-h1 text-text-primary">Notifications</h1>
          <Button
            variant="secondary"
            size="sm"
            disabled={!hasUnread}
            loading={markAllRead.isPending}
            onClick={handleMarkAllRead}
          >
            Mark all read
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-sm">
          <div className="w-full max-w-[24rem]">
            <TextField
              label="Search notifications…"
              value={searchInput}
              onChange={(e) => changeSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-xs">
            <FilterChip label="All" active={readFilter === 'all'} onChange={() => changeReadFilter('all')} />
            <FilterChip label="Unread" active={readFilter === 'unread'} onChange={() => changeReadFilter('unread')} />
            <FilterChip label="Read" active={readFilter === 'read'} onChange={() => changeReadFilter('read')} />
          </div>
        </div>

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
              {readFilter !== 'all' || search
                ? 'No notifications match this filter.'
                : "No notifications yet — you'll see updates about leads, clients, and plans here."}
            </p>
          </Card>
        )}

        {notifications.data && notifications.data.items.length > 0 && (
          <div className="flex flex-col gap-sm">
            {notifications.data.items.map((n) => (
              <Link
                key={n.id}
                // RT 6 / contract gate 9 K8 — only navigate to a route this console serves.
                to={safeDeepLink(n.deep_link, '#')}
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

        {notifications.data && (
          <CursorPager
            hasNext={Boolean(notifications.data.meta.next_cursor)}
            hasPrevious={hasPrevious}
            onNext={() => next(notifications.data!.meta.next_cursor!)}
            onPrevious={previous}
            total={notifications.data.meta.total ?? undefined}
            noun="notification"
          />
        )}
      </div>
    </Shell>
  )
}
