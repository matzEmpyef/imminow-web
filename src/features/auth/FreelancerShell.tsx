import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { LogOut, UserRound } from 'lucide-react'
import { BRAND_LOGO } from '@/lib/brand'
import { useAuthStore } from '@/stores/authStore'
import { useLogout } from '@/lib/useLogout'
import { NotificationsDropdown } from '@/components/NotificationsDropdown'

/**
 * A small dropdown of who's signed in, opening onto "My Account" and "Sign out" — the same two
 * things SidebarShell's footer avatar link and header logout icon offered separately. Combined
 * into one control here (user, 2026-09-12: "no need for the main menu since it's one page") since
 * there's no sidebar footer left to carry the avatar link on its own.
 */
function AccountMenu() {
  const user = useAuthStore((s) => s.user)
  const logout = useLogout()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className="flex h-10 items-center gap-sm rounded-md px-xs hover:bg-background"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-body-sm font-medium text-primary">
          {user ? user.first_name.charAt(0).toUpperCase() : '?'}
        </span>
        {/* Narrow screens condense to the avatar alone (spec item 13) — the name/email pair is the
            first thing to go, the icon stays so the control is still findable. */}
        <span className="hidden min-w-0 flex-col items-start sm:flex">
          <span className="max-w-[10rem] truncate text-body-sm font-medium text-text-primary">
            {user ? `${user.first_name} ${user.last_name}` : 'Account'}
          </span>
          {user?.email && <span className="max-w-[10rem] truncate text-caption text-text-secondary">{user.email}</span>}
        </span>
      </button>

      {open && (
        <div
          role="menu"
          style={{ minWidth: '12rem' }}
          className="absolute right-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-surface shadow-card"
        >
          <Link
            to="/account"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-sm px-md py-sm text-body-sm text-text-primary hover:bg-background"
          >
            <UserRound className="h-4 w-4 text-text-secondary" aria-hidden />
            My Account
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false)
              logout()
            }}
            className="flex w-full items-center gap-sm px-md py-sm text-left text-body-sm text-text-primary hover:bg-background"
          >
            <LogOut className="h-4 w-4 text-text-secondary" aria-hidden />
            Sign out
          </button>
        </div>
      )}
    </div>
  )
}

// The Freelancer role's own scoped view inside immiNow (build reference 1.19) — "same app, same
// backend, its own scoped view — not a separate frontend to build or deploy." A single page
// (Freelancer Dashboard), so there is nothing for a sidebar to navigate between (user, 2026-09-12:
// "the UI looks very bad and there's no need for the main menu since it's one page"). This is a
// slim top bar instead of SidebarShell's full rail+header chrome: logo, a "Freelancer" label, and
// on the right the same NotificationsDropdown the other shells use plus an AccountMenu that folds
// together what SidebarShell split across its footer avatar link and header logout icon — nothing
// the sidebar offered (My Account, sign-out, notifications) is lost, it's just not spread across a
// rail with one destination on it.
export function FreelancerShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <header className="flex h-16 shrink-0 items-center gap-md border-b border-border bg-surface px-lg">
        <img src={BRAND_LOGO} alt="immiNow" className="h-7 w-auto" />
        <span className="rounded-full bg-primary-subtle px-sm py-0.5 text-caption font-medium text-primary">
          Freelancer
        </span>
        <div className="ml-auto flex items-center gap-sm">
          <NotificationsDropdown />
          <AccountMenu />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-auto px-lg py-xl">
        {/* Centered max-width column (spec item 1) rather than the sidebar shells' full-bleed
            main — an inline style, not a max-w-[Nrem] class: this project's Tailwind v4 setup
            resolves the named max-w-* scale from the spacing tokens instead of real max-widths
            (see tailwind.config.ts), and GlobalSearch.tsx/Modal.tsx already sidestep the same
            landmine the same way. */}
        <div style={{ maxWidth: '75rem' }} className="mx-auto w-full">
          {children}
        </div>
      </main>
    </div>
  )
}
