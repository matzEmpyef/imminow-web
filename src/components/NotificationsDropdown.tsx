import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useMarkNotificationRead, useNotifications, useUnreadCount } from '@/queries/notifications'
import { relativeTime } from '@/lib/time'

const MAX_VISIBLE = 5

// The bell no longer navigates anywhere on click — it opens a dropdown of the most recent
// notifications, with a link at the bottom to the full list (`/notifications`).
//
// The badge number and the preview rows are fetched separately (2026-08-31): the badge needs only
// `GET /notifications/unread-count` and stays live regardless of whether the dropdown is open,
// while the preview rows are the paginated inbox's first page and are only worth fetching once the
// dropdown is actually opened — no point paying for twenty rows on every page just to render a bell.
export function NotificationsDropdown() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { data: unreadCount } = useUnreadCount()
  const { data } = useNotifications({ enabled: open })
  const markRead = useMarkNotificationRead()
  const items = data?.items.slice(0, MAX_VISIBLE) ?? []

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {Boolean(unreadCount) && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 text-caption font-medium leading-none text-text-on-primary">
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{ maxWidth: '22rem' }}
          className="absolute right-0 top-10 z-50 w-80 overflow-hidden rounded-lg border border-border bg-surface shadow-card"
        >
          <div className="border-b border-border px-md py-sm">
            <p className="text-body-sm font-semibold text-text-primary">Notifications</p>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {items.length === 0 && <p className="p-md text-body-sm text-text-secondary">No notifications yet.</p>}

            {items.map((n) => (
              <Link
                key={n.id}
                to={n.deep_link ?? '/notifications'}
                onClick={() => {
                  if (!n.read) markRead.mutate(n.id)
                  setOpen(false)
                }}
                className={`block px-md py-sm hover:bg-background ${!n.read ? 'bg-unread-bg' : ''}`}
              >
                <p className="truncate text-body-sm font-medium text-text-primary">{n.title}</p>
                <p className="truncate text-caption text-text-secondary">{n.body}</p>
                <p className="mt-0.5 text-caption text-text-secondary">{relativeTime(n.created_at!)}</p>
              </Link>
            ))}
          </div>

          <Link
            to="/notifications"
            onClick={() => setOpen(false)}
            className="block border-t border-border px-md py-sm text-center text-body-sm font-medium text-primary hover:bg-background"
          >
            Show all notifications
          </Link>
        </div>
      )}
    </div>
  )
}
