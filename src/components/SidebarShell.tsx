import { useEffect, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronsLeft, ChevronsRight, CircleHelp, LogOut, type LucideIcon } from 'lucide-react'
import { BRAND_LOGO } from '@/lib/brand'
import { useAuthStore } from '@/stores/authStore'
import { Drawer } from './Drawer'
import { getHelpTopic } from '@/lib/helpContent'

export interface SidebarSubLink {
  label: string
  path: string
  icon: LucideIcon
  hidden?: boolean
  // Small count pill after the label (user-requested, 2026-08-19 — "show number of activities
  // that need action today as a counter in Activities side menu"), same red-badge treatment
  // NotificationsDropdown's own unread count already uses. Omitted or 0 renders nothing.
  badge?: number
}

export interface SidebarSection {
  key: string
  label: string
  path: string
  icon: LucideIcon
  matches: (pathname: string) => boolean
  sidebarLinks?: SidebarSubLink[]
}

interface SidebarShellProps {
  sections: SidebarSection[]
  roleBadge?: string
  search?: ReactNode
  headerActions?: ReactNode
  children: ReactNode
}

// Shared light chrome for every role inside immiNow (consultancy staff, Super Admin, Freelancer)
// — one primitive so a visual change here propagates everywhere instead of being patched
// per-shell. The sidebar spans the full window height with the logo pinned at its top and the
// account/logout footer pinned at its bottom; it's contextual — showing only the active
// section's sub-pages, swapping when a different header item is selected. The header (to the
// right of the sidebar) carries the search box, then the main section nav (Dashboard, Sales,
// Clients, Administration, ...), then any role-specific header actions.
export function SidebarShell({ sections, roleBadge, search, headerActions, children }: SidebarShellProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const clear = useAuthStore((s) => s.clear)
  // Defaults collapsed on narrow viewports (< 1100px) so the 256px rail doesn't eat a squeezed
  // window — this is a desktop console, but a half-screen window shouldn't be unusable. The
  // media-query listener only moves the default as the window crosses the threshold; the user's
  // own toggle still wins until the next crossing.
  const [collapsed, setCollapsed] = useState(() => window.matchMedia('(max-width: 1100px)').matches)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)')
    const onChange = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  function handleLogout() {
    clear()
    navigate('/login')
  }

  const activeSection = sections.find((s) => s.matches(location.pathname)) ?? sections[0]
  const activeLinks = (activeSection?.sidebarLinks ?? []).filter((l) => !l.hidden)
  const helpTopic = getHelpTopic(location.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside
        // `width` alone is silently ignored on this flex child (confirmed via direct DOM
        // mutation); `max-width` + `min-width` reliably clamp it instead. No CSS transition on
        // these — an animated width change never settles to its end value in a backgrounded/
        // non-composited tab (confirmed the same way), which would leave the layout stuck
        // mid-animation; not worth chasing for a collapse toggle.
        style={{
          minWidth: collapsed ? '76px' : '256px',
          maxWidth: collapsed ? '76px' : '256px',
        }}
        className="flex h-full shrink-0 flex-col overflow-hidden border-r border-border bg-surface"
      >
        <div
          style={{ gridTemplateColumns: '1fr auto 1fr' }}
          className="grid h-20 shrink-0 items-center border-b border-border px-sm"
        >
          <span />
          {/* Collapsed shows the square favicon, expanded shows the wordmark (user, 2026-08-23:
              "use favicon for collapsible sidebar logo"). The wordmark is ~3.8:1 and cannot fit a
              76px rail, which is why this used to render NOTHING when collapsed — leaving the
              sidebar with no brand mark at all. */}
          <img
            src={collapsed ? '/favicon.ico' : BRAND_LOGO}
            alt="immiNow"
            className={collapsed ? 'h-7 w-7 justify-self-center' : 'h-8 w-auto justify-self-center'}
          />
          <button
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            style={collapsed ? { justifySelf: 'end' } : undefined}
            className="flex h-8 w-8 items-center justify-center justify-self-end rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
          </button>
        </div>

        {roleBadge && !collapsed && (
          <div className="shrink-0 px-md pb-sm pt-sm text-center">
            <span className="inline-flex rounded-full bg-primary-subtle px-sm py-0.5 text-caption font-medium text-primary">
              {roleBadge}
            </span>
          </div>
        )}

        <nav className="sidebar-nav-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-sm pb-sm pt-md">
          {activeLinks.map((link) => {
            const LinkIcon = link.icon
            const linkActive = location.pathname === link.path
            return (
              <Link
                key={link.path}
                to={link.path}
                title={collapsed ? link.label : undefined}
                className={`flex items-center gap-sm rounded-md px-sm py-sm text-body-sm font-medium transition-colors ${
                  linkActive
                    ? 'bg-primary-subtle text-primary'
                    : 'text-text-secondary hover:bg-primary-subtle hover:text-primary'
                }`}
              >
                <LinkIcon className={`h-5 w-5 shrink-0 ${linkActive ? 'text-primary' : 'text-text-secondary'}`} />
                {!collapsed && <span className="min-w-0 flex-1 truncate">{link.label}</span>}
                {!collapsed && Boolean(link.badge) && (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-error px-1 text-caption font-medium leading-none text-text-on-primary">
                    {link.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="shrink-0 border-t border-border p-sm">
          <div className={`flex items-center gap-sm rounded-md ${collapsed ? 'justify-center' : ''}`}>
            <Link
              to="/account"
              title="My Account"
              className={`flex min-w-0 flex-1 items-center gap-sm rounded-md px-sm py-sm hover:bg-background ${collapsed ? 'justify-center' : ''}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-body-sm font-medium text-primary">
                {user ? user.first_name.charAt(0).toUpperCase() : '?'}
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-medium text-text-primary">
                    {user ? `${user.first_name} ${user.last_name}` : 'Account'}
                  </p>
                  <p className="truncate text-caption text-text-secondary">{user?.email}</p>
                </div>
              )}
            </Link>
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-20 shrink-0 items-center gap-md border-b border-border bg-surface px-lg">
          {search && <div className="min-w-0 flex-1">{search}</div>}

          <nav className="flex shrink-0 items-center gap-sm overflow-x-auto">
            {sections.map((section) => {
              const SectionIcon = section.icon
              const isActive = section.key === activeSection?.key
              return (
                <Link
                  key={section.key}
                  to={section.path}
                  className={`flex shrink-0 flex-col items-center justify-center rounded-sm px-md py-3 text-body-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-subtle text-primary'
                      : 'text-text-secondary hover:bg-primary-subtle hover:text-primary'
                  }`}
                >
                  <SectionIcon className={`h-4 w-4 shrink-0 ${isActive ? 'text-primary' : 'text-text-secondary'}`} />
                  <span className="whitespace-nowrap">{section.label}</span>
                </Link>
              )
            })}
          </nav>

          <div className="ml-auto flex shrink-0 items-center gap-md">
            {helpTopic && (
              <button
                onClick={() => setHelpOpen(true)}
                aria-label="Help"
                title="Help"
                className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
              >
                <CircleHelp className="h-5 w-5" />
              </button>
            )}
            {headerActions}
            {/* Moved from the sidebar footer (user, 2026-08-28: "move logout to right top
                corner, next to notification") — also fixes a real gap: the footer button
                disappeared entirely whenever the sidebar was collapsed. */}
            <button
              onClick={handleLogout}
              aria-label="Log out"
              title="Log out"
              className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* overflow-x-auto: any page content wider than a squeezed window scrolls inside the
            main column instead of pushing the whole shell sideways. */}
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-auto px-lg py-xl">{children}</main>
      </div>

      {helpTopic && (
        <Drawer open={helpOpen} onClose={() => setHelpOpen(false)} title={helpTopic.title}>
          <div className="flex flex-col gap-md">
            {helpTopic.body.map((paragraph, i) => (
              <p key={i} className="text-body-sm text-text-secondary">
                {paragraph}
              </p>
            ))}
          </div>
        </Drawer>
      )}
    </div>
  )
}
