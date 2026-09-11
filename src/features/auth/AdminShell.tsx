import { useMemo, type ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Activity,
  BellRing,
  TrendingUp,
  BarChart3,
  Bell,
  Briefcase,
  Building2,
  CalendarClock,
  DollarSign,
  Gift,
  GraduationCap,
  History,
  Image,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  MessageSquareWarning,
  Newspaper,
  Percent,
  School,
  ShieldCheck,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Users,
  Video,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { SidebarShell, type SidebarSection, type SidebarSubLink } from '@/components/SidebarShell'
import { NotificationsDropdown } from '@/components/NotificationsDropdown'
import { useAuthStore } from '@/stores/authStore'
import { useAdminAttention } from '@/queries/adminDashboard'
import type { PlatformPermissionKey } from '@/features/auth/PlatformRoute'

// The page whose sidebar link carries the open-items counter (2026-09-10).
const NEEDS_ATTENTION_PATH = '/admin/needs-attention'

// Every page names the console permission flag that owns it (build reference 1.23 / user request
// #12); a Platform Staff account sees exactly the pages its flags cover — locked areas are hidden
// entirely, never greyed out (the 1.16 convention). Super Admin arrives with every flag true, so
// nothing filters for them. `PlatformRoute` + the server enforce the same flags — hiding a link is
// presentation, never the security boundary.

/** One page in a link's tab group. */
interface AdminTab {
  label: string
  path: string
  permission?: PlatformPermissionKey
  /** Shown to anyone holding at least one of these — for a page that summarises several areas. */
  anyPermission?: PlatformPermissionKey[]
  /** Used when a section's only link is flattened into one sidebar link per page. */
  icon?: LucideIcon
}

/**
 * One sidebar link. A link with several `tabs` is a GROUP (2026-09-10, user: "can we reduce the
 * menu item for super admin"): it shows once in the sidebar, and a tab strip above the page
 * switches between its pages. Every page keeps its own route, so bookmarks and deep links still
 * work, and each tab carries its own permission — a staffer sees only the tabs they may open, and
 * the link disappears when that is none of them.
 */
interface AdminLink {
  label: string
  icon: LucideIcon
  tabs: AdminTab[]
  /** Paths that belong to this link without being a tab (detail pages, old redirects). */
  alsoMatches?: string[]
}

interface AdminSection {
  key: string
  label: string
  icon: LucideIcon
  links: AdminLink[]
}

const startsWithAny = (pathname: string, prefixes: string[]) => prefixes.some((p) => pathname.startsWith(p))

// The platform console — Sentpo's own internal tooling (build reference 1.23), a distinct surface
// from AppShell (immiNow's consultancy-facing shell). Seven sections and 21 links since 2026-09-10
// (was eight sections and 29 links, twelve of them under one "Platform" heading).
const SECTIONS: AdminSection[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    links: [
      {
        label: 'Dashboard',
        icon: LayoutDashboard,
        // No permission on any of these (docs/PROGRESS.md §4 Step 4; Platform Pulse 2026-08-31) —
        // strategic overviews behind the bare requirePlatformAccount gate.
        tabs: [
          { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
          // Everything waiting on the platform team (2026-09-10) — its link shows a counter.
          { label: 'Needs attention', path: NEEDS_ATTENTION_PATH, icon: BellRing },
          { label: 'Supply & Demand', path: '/admin/supply-demand', icon: TrendingUp },
          { label: 'Platform Pulse', path: '/admin/platform-pulse', icon: Activity },
        ],
      },
    ],
  },
  {
    key: 'consultancies',
    label: 'Consultancies',
    icon: Building2,
    links: [
      {
        label: 'Manage Consultancies',
        icon: ListChecks,
        tabs: [
          { label: 'Consultancies', path: '/admin/consultancies', permission: 'consultancy_approval' },
          // A ranking of the same consultancies, so it sits beside them rather than on its own.
          { label: 'Performance League', path: '/admin/performance-league', permission: 'consultancy_approval' },
        ],
      },
      {
        label: 'Applicant Allocation',
        icon: Shuffle,
        tabs: [{ label: 'Applicant Allocation', path: '/admin/applicant-allocation', permission: 'applicant_allocation' }],
      },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    icon: GraduationCap,
    links: [
      {
        label: 'Colleges & Courses',
        icon: School,
        tabs: [
          { label: 'Colleges & Courses', path: '/admin/colleges', permission: 'catalog' },
          { label: 'Suggestions Review', path: '/admin/course-suggestions-review', permission: 'catalog' },
        ],
      },
      // The student's OWN school/college, not a destination — reference data staff curate, with
      // the mapping queue.
      {
        label: 'Institutions',
        icon: School,
        tabs: [{ label: 'Institutions', path: '/admin/institutions', permission: 'catalog' }],
      },
      {
        label: 'Settings',
        icon: SlidersHorizontal,
        tabs: [{ label: 'Settings', path: '/admin/settings', permission: 'catalog_settings' }],
        // Old paths that redirect here (folded in on 2026-09-07).
        alsoMatches: ['/admin/countries', '/admin/catalog-settings', '/admin/country-guides'],
      },
    ],
  },
  {
    // Advertising, Points & Coupons and Content were three sections of one to five links each
    // (until 2026-09-10) — all of it is reaching students, so it is one section now.
    key: 'marketing',
    label: 'Marketing',
    icon: Megaphone,
    links: [
      // One page of numbers for the whole section (Marketing review, 2026-09-11).
      {
        label: 'Overview',
        icon: BarChart3,
        tabs: [
          {
            label: 'Overview',
            path: '/admin/marketing',
            anyPermission: ['ads', 'points_coupons', 'events', 'jobs', 'blog'],
          },
        ],
      },
      { label: 'Ads', icon: Image, tabs: [{ label: 'Ads', path: '/admin/ads', permission: 'ads' }] },
      {
        label: 'Points & Coupons',
        icon: Gift,
        tabs: [
          { label: 'Earn Rules', path: '/admin/earn-rules', permission: 'points_coupons' },
          { label: 'Coupons', path: '/admin/coupons', permission: 'points_coupons' },
          { label: 'Redemption Partners', path: '/admin/redemption-partners', permission: 'points_coupons' },
        ],
      },
      {
        label: 'Events',
        icon: Video,
        tabs: [
          { label: 'Webinars', path: '/admin/webinars', permission: 'events' },
          { label: 'Quizzes', path: '/admin/quiz', permission: 'events' },
          { label: 'In-person Meetings', path: '/admin/physical-meetings', permission: 'events' },
        ],
      },
      { label: 'Jobs', icon: Briefcase, tabs: [{ label: 'Jobs', path: '/admin/jobs', permission: 'jobs' }] },
      { label: 'Blog', icon: Newspaper, tabs: [{ label: 'Blog', path: '/admin/blog', permission: 'blog' }] },
      // Moved here from Admin → Notifications (2026-09-11): a broadcast reaches students like
      // everything else in this section. Still gated on the `notifications` permission.
      {
        label: 'Broadcast',
        icon: BellRing,
        tabs: [{ label: 'Broadcast', path: '/admin/broadcast', permission: 'notifications' }],
      },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    icon: DollarSign,
    links: [
      // First, because it is the page Finance opens to see where the money stands.
      {
        label: 'Finance Dashboard',
        icon: BarChart3,
        tabs: [{ label: 'Finance Dashboard', path: '/admin/finance-dashboard', permission: 'finance' }],
      },
      {
        label: 'Commission Rates',
        icon: Percent,
        tabs: [{ label: 'Commission Rates', path: '/admin/commission-rates', permission: 'finance' }],
      },
      // Moved from Support → Cases (user, 2026-09-11): it is the payments team's chase list —
      // cases whose commission has not become due, sorted by money pending. Support staff keep it.
      {
        label: 'Follow-ups',
        icon: ListChecks,
        tabs: [{ label: 'Follow-ups', path: '/admin/case-followups', anyPermission: ['finance', 'support'] }],
      },
      {
        label: 'Freelancers',
        icon: Users,
        tabs: [
          { label: 'Freelancers', path: '/admin/freelancers', permission: 'freelancers' },
          { label: 'Payouts', path: '/admin/freelancer-payouts', permission: 'freelancers' },
        ],
        alsoMatches: ['/admin/freelancer-rates'],
      },
    ],
  },
  {
    key: 'support',
    label: 'Support',
    icon: LifeBuoy,
    links: [
      // One inbox for a case going wrong (2026-09-10). Complaints are the student's side and never
      // freeze anything; a dispute is the frozen case itself. Follow-ups moved to Finance on
      // 2026-09-11.
      {
        label: 'Cases',
        icon: MessageSquareWarning,
        tabs: [
          { label: 'Complaints', path: '/admin/complaints', permission: 'support' },
          { label: 'Disputes', path: '/admin/disputes', permission: 'support' },
        ],
        alsoMatches: ['/admin/applicants/'],
      },
      {
        label: 'Visit Requests',
        icon: CalendarClock,
        tabs: [{ label: 'Visit Requests', path: '/admin/visit-requests', permission: 'support' }],
      },
      {
        label: 'Support Tools',
        icon: Wrench,
        tabs: [{ label: 'Support Tools', path: '/admin/support-tools', permission: 'support_tools' }],
      },
    ],
  },
  {
    key: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    links: [
      // Two directories, never one (docs/PROGRESS.md §4 Step 3) — the Sentpo (student) and immiNow
      // (console) populations are never blended; they stay separate tabs with separate endpoints.
      {
        label: 'Team & Users',
        icon: Users,
        tabs: [
          { label: 'Platform Team', path: '/admin/platform-team', permission: 'team_management' },
          { label: 'Sentpo Users', path: '/admin/users/sentpo', permission: 'user_directory' },
          { label: 'immiNow Users', path: '/admin/users/imminow', permission: 'user_directory' },
        ],
      },
      {
        label: 'Notifications',
        icon: Bell,
        tabs: [
          { label: 'Channel Config', path: '/admin/notification-channel-config', permission: 'notifications' },
        ],
      },
      {
        label: 'App Config',
        icon: Smartphone,
        tabs: [{ label: 'App Config', path: '/admin/app-config', permission: 'app_config' }],
      },
      {
        label: 'Audit Log',
        icon: History,
        tabs: [{ label: 'Audit Log', path: '/admin/audit-log-platform', permission: 'audit_log' }],
      },
    ],
  },
]

type Permissions = Partial<Record<PlatformPermissionKey, boolean>>

function visibleTabs(link: AdminLink, permissions: Permissions): AdminTab[] {
  return link.tabs.filter((tab) =>
    tab.anyPermission
      ? tab.anyPermission.some((key) => permissions[key])
      : !tab.permission || permissions[tab.permission],
  )
}

function linkPaths(link: AdminLink, tabs: AdminTab[]): string[] {
  return [...tabs.map((t) => t.path), ...(link.alsoMatches ?? [])]
}

export function AdminShell({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((s) => s.user?.platform_permissions)
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin')
  const { pathname } = useLocation()
  // Open items across the viewer's queues — the red counter on the Needs attention link, shown on
  // every console page so work waiting is visible wherever someone is (2026-09-10).
  const attentionCount = useAdminAttention().data?.open_count ?? 0

  const sections = useMemo<SidebarSection[]>(() => {
    if (!permissions) return []
    return SECTIONS.flatMap((section) => {
      const sidebarLinks = section.links.flatMap((link): SidebarSubLink[] => {
        const tabs = visibleTabs(link, permissions)
        if (tabs.length === 0) return []
        // A section whose only link is a group (Dashboard) shows its pages as plain sidebar links —
        // a lone "Dashboard" link hid Supply & Demand and Platform Pulse behind a tab strip nobody
        // noticed (user, 2026-09-10: "there was Supply & Demand, Platform Pulse. where they went?").
        if (section.links.length === 1 && tabs.length > 1) {
          return tabs.map((tab) => ({
            label: tab.label,
            icon: tab.icon ?? link.icon,
            path: tab.path,
            matches: (p: string) => p.startsWith(tab.path),
            badge: tab.path === NEEDS_ATTENTION_PATH && attentionCount > 0 ? attentionCount : undefined,
          }))
        }
        const paths = linkPaths(link, tabs)
        return [
          {
            label: link.label,
            icon: link.icon,
            path: tabs[0].path,
            matches: (p: string) => startsWithAny(p, paths),
            // Every page in the group, listed under the link while you are in it.
            children: tabs.length > 1 ? tabs.map((tab) => ({ label: tab.label, path: tab.path })) : undefined,
          },
        ]
      })
      if (sidebarLinks.length === 0) return []
      const sectionPaths = section.links.flatMap((link) => linkPaths(link, link.tabs))
      // The section's own top-nav target must be a page the caller can actually open — a
      // support-tools-only staffer's Support section starts at Support Tools, not Cases.
      return [
        {
          key: section.key,
          label: section.label,
          icon: section.icon,
          path: sidebarLinks[0].path,
          matches: (p: string) => startsWithAny(p, sectionPaths),
          sidebarLinks,
        },
      ]
    })
  }, [permissions, attentionCount])

  // The tab strip for the group the current page belongs to — only when the caller can open more
  // than one of its pages; a group they see one page of is simply that page.
  const groupTabs = useMemo(() => {
    if (!permissions) return []
    for (const section of SECTIONS) {
      for (const link of section.links) {
        const tabs = visibleTabs(link, permissions)
        if (startsWithAny(pathname, linkPaths(link, tabs))) {
          // A flattened section already lists every page in the sidebar; no strip needed.
          return tabs.length > 1 && section.links.length > 1 ? tabs : []
        }
      }
    }
    return []
  }, [permissions, pathname])

  return (
    <SidebarShell
      sections={sections}
      roleBadge={isSuperAdmin ? 'Super Admin' : 'Platform Staff'}
      headerActions={<NotificationsDropdown />}
    >
      {groupTabs.length > 0 && (
        <nav aria-label="Pages in this section" className="mb-lg flex gap-xs overflow-x-auto border-b border-border">
          {groupTabs.map((tab) => {
            const active = pathname.startsWith(tab.path)
            return (
              <Link
                key={tab.path}
                to={tab.path}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                  active
                    ? 'border-primary font-medium text-primary'
                    : 'border-transparent text-text-secondary hover:text-text-primary'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      )}
      {children}
    </SidebarShell>
  )
}
