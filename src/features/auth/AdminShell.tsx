import type { ReactNode } from 'react'
import {
  Award,
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarClock,
  ClipboardCheck,
  DollarSign,
  Gift,
  GraduationCap,
  Globe,
  Handshake,
  HelpCircle,
  History,
  Image,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  MapPin,
  Megaphone,
  MessageSquareWarning,
  Newspaper,
  Percent,
  Radio,
  School,
  Shuffle,
  Smartphone,
  Ticket,
  TrendingUp,
  User,
  Users,
  Video,
  SlidersHorizontal,
} from 'lucide-react'
import { useMemo } from 'react'
import { SidebarShell, type SidebarSection } from '@/components/SidebarShell'
import { NotificationsDropdown } from '@/components/NotificationsDropdown'
import { useAuthStore } from '@/stores/authStore'
import type { PlatformPermissionKey } from '@/features/auth/PlatformRoute'

// Every sidebar link names the console permission flag that owns it (build reference 1.23 /
// user request #12); a Platform Staff account sees exactly the links its flags cover — locked
// areas are hidden entirely, never greyed out (the 1.16 convention). Super Admin arrives with
// every flag true, so nothing filters for them. `PlatformRoute` + the server enforce the same
// flags — hiding a link is presentation, never the security boundary.
type AdminLink = SidebarSection['sidebarLinks'] extends (infer L)[] | undefined
  ? L & { permission?: PlatformPermissionKey }
  : never

type AdminSection = Omit<SidebarSection, 'sidebarLinks'> & { sidebarLinks: AdminLink[] }

// The platform console — Sentpo's own internal tooling (build reference 1.23), a distinct
// surface from AppShell (which is immiNow's consultancy-facing shell). Only sections with real,
// built pages appear here, same "only show what's built" rule as AppShell — Waves 5a/5b/5c
// together cover every section below; Wave 6 (Freelancer) has its own separate shell.
const SECTIONS: AdminSection[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/admin/dashboard',
    icon: LayoutDashboard,
    matches: (p) => p.startsWith('/admin/dashboard') || p.startsWith('/admin/supply-demand'),
    sidebarLinks: [
      { label: 'Overview', path: '/admin/dashboard', icon: LayoutDashboard },
      // No `permission` (docs/PROGRESS.md §4 Step 4) — gated server-side to requirePlatformAccount,
      // the same broad "any platform account" gate Overview itself uses, not one of the eight
      // console permission flags: this is a strategic landing-page overview, not an operational area.
      { label: 'Supply & Demand', path: '/admin/supply-demand', icon: TrendingUp },
    ],
  },
  {
    key: 'consultancies',
    label: 'Consultancy Management',
    path: '/admin/consultancies',
    icon: Building2,
    matches: (p) =>
      p.startsWith('/admin/consultancies') ||
      p.startsWith('/admin/applicant-allocation') ||
      p.startsWith('/admin/performance-league'),
    sidebarLinks: [
      {
        label: 'Manage Consultancies',
        path: '/admin/consultancies',
        permission: 'consultancy_approval',
        icon: ListChecks,
      },
      {
        label: 'Applicant Allocation',
        path: '/admin/applicant-allocation',
        permission: 'consultancy_approval',
        icon: Shuffle,
      },
      {
        label: 'Performance League',
        path: '/admin/performance-league',
        permission: 'consultancy_approval',
        icon: Award,
      },
    ],
  },
  {
    key: 'catalog',
    label: 'Catalog',
    path: '/admin/colleges',
    icon: GraduationCap,
    matches: (p) =>
      p.startsWith('/admin/colleges') ||
      p.startsWith('/admin/course-suggestions-review') ||
      p.startsWith('/admin/countries') ||
      p.startsWith('/admin/institutions') ||
      p.startsWith('/admin/country-guides') ||
      p.startsWith('/admin/catalog-settings'),
    sidebarLinks: [
      { label: 'Colleges & Courses', path: '/admin/colleges', permission: 'catalog', icon: School },
      {
        label: 'Course Suggestions Review',
        path: '/admin/course-suggestions-review',
        permission: 'catalog',
        icon: ClipboardCheck,
      },
      { label: 'Countries', path: '/admin/countries', permission: 'catalog', icon: Globe },
      // The student's OWN school/college, not a destination — sits under Catalog because it is
      // reference data staff curate, and carries the mapping queue.
      { label: 'Institutions', path: '/admin/institutions', permission: 'catalog', icon: School },
      { label: 'Country Guides', path: '/admin/country-guides', permission: 'catalog', icon: BookOpen },
      { label: 'Catalog Settings', path: '/admin/catalog-settings', permission: 'catalog', icon: SlidersHorizontal },
    ],
  },
  {
    key: 'advertising',
    label: 'Advertising',
    path: '/admin/ads',
    icon: Megaphone,
    matches: (p) => p.startsWith('/admin/ads'),
    sidebarLinks: [{ label: 'Ads Manager', path: '/admin/ads', permission: 'ads', icon: Image }],
  },
  {
    key: 'points-coupons',
    label: 'Points & Coupons',
    path: '/admin/earn-rules',
    icon: Gift,
    matches: (p) =>
      p.startsWith('/admin/earn-rules') || p.startsWith('/admin/coupons') || p.startsWith('/admin/redemption-partners'),
    sidebarLinks: [
      { label: 'Earn Rules', path: '/admin/earn-rules', permission: 'points_coupons', icon: Award },
      { label: 'Coupons', path: '/admin/coupons', permission: 'points_coupons', icon: Ticket },
      {
        label: 'Redemption Partners',
        path: '/admin/redemption-partners',
        permission: 'points_coupons',
        icon: Handshake,
      },
    ],
  },
  {
    key: 'content',
    label: 'Content',
    path: '/admin/webinars',
    icon: BookOpen,
    matches: (p) =>
      p.startsWith('/admin/webinars') ||
      p.startsWith('/admin/quiz') ||
      p.startsWith('/admin/physical-meetings') ||
      p.startsWith('/admin/jobs') ||
      p.startsWith('/admin/blog'),
    sidebarLinks: [
      { label: 'Webinars', path: '/admin/webinars', permission: 'content', icon: Video },
      { label: 'Quiz', path: '/admin/quiz', permission: 'content', icon: HelpCircle },
      { label: 'In-person Meetings', path: '/admin/physical-meetings', permission: 'content', icon: MapPin },
      { label: 'Jobs', path: '/admin/jobs', permission: 'content', icon: Briefcase },
      { label: 'Blog', path: '/admin/blog', permission: 'content', icon: Newspaper },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    path: '/admin/commission-rates',
    icon: DollarSign,
    matches: (p) =>
      p.startsWith('/admin/commission-rates') ||
      p.startsWith('/admin/freelancers') ||
      // Redirects to /admin/freelancers; kept so the section stays highlighted mid-redirect.
      p.startsWith('/admin/freelancer-rates') ||
      p.startsWith('/admin/freelancer-payouts') ||
      p.startsWith('/admin/finance-dashboard'),
    sidebarLinks: [
      { label: 'Commission Rates', path: '/admin/commission-rates', permission: 'finance', icon: Percent },
      { label: 'Freelancers', path: '/admin/freelancers', permission: 'finance', icon: Users },
      { label: 'Freelancer Payouts', path: '/admin/freelancer-payouts', permission: 'finance', icon: DollarSign },
      { label: 'Finance Dashboard', path: '/admin/finance-dashboard', permission: 'finance', icon: BarChart3 },
    ],
  },
  {
    key: 'platform',
    label: 'Platform',
    path: '/admin/support-tools',
    icon: LifeBuoy,
    matches: (p) =>
      p.startsWith('/admin/support-tools') ||
      p.startsWith('/admin/complaints') ||
      p.startsWith('/admin/platform-team') ||
      p.startsWith('/admin/notification-channel-config') ||
      p.startsWith('/admin/app-config') ||
      p.startsWith('/admin/broadcast') ||
      p.startsWith('/admin/audit-log-platform') ||
      p.startsWith('/admin/visit-requests') ||
      p.startsWith('/admin/users/'),
    sidebarLinks: [
      { label: 'Support Tools', path: '/admin/support-tools', permission: 'support', icon: LifeBuoy },
      { label: 'Complaints', path: '/admin/complaints', permission: 'support', icon: MessageSquareWarning },
      { label: 'Visit Requests', path: '/admin/visit-requests', permission: 'support', icon: CalendarClock },
      {
        label: 'Platform Team',
        path: '/admin/platform-team',
        permission: 'platform_staff_administration',
        icon: Users,
      },
      // Two directories, never one (docs/PROGRESS.md §4 Step 3) — the Sentpo (student) and
      // immiNow (console) populations are never blended in one screen, mirroring the two
      // separate GET endpoints behind them.
      {
        label: 'Sentpo Users',
        path: '/admin/users/sentpo',
        permission: 'platform_staff_administration',
        icon: User,
      },
      {
        label: 'immiNow Users',
        path: '/admin/users/imminow',
        permission: 'platform_staff_administration',
        icon: Users,
      },
      {
        label: 'Notification Channel Config',
        path: '/admin/notification-channel-config',
        permission: 'platform_staff_administration',
        icon: Bell,
      },
      {
        label: 'App Config',
        path: '/admin/app-config',
        permission: 'platform_staff_administration',
        icon: Smartphone,
      },
      { label: 'Broadcast', path: '/admin/broadcast', permission: 'platform_staff_administration', icon: Radio },
      {
        label: 'Audit Log',
        path: '/admin/audit-log-platform',
        permission: 'platform_staff_administration',
        icon: History,
      },
    ],
  },
]

export function AdminShell({ children }: { children: ReactNode }) {
  const permissions = useAuthStore((s) => s.user?.platform_permissions)
  const isSuperAdmin = useAuthStore((s) => s.user?.role === 'super_admin')

  const sections = useMemo<SidebarSection[]>(() => {
    if (!permissions) return []
    return SECTIONS.flatMap((section) => {
      const sidebarLinks = section.sidebarLinks
        .filter((link) => !link.permission || permissions[link.permission])
        .map(({ permission: _permission, ...link }) => link)
      if (sidebarLinks.length === 0) return []
      // The section's own top-nav target must be a page the caller can actually open — a
      // support-only staffer's Platform section starts at Support Tools, not Platform Team.
      return [{ ...section, sidebarLinks, path: sidebarLinks[0].path }]
    })
  }, [permissions])

  return (
    <SidebarShell
      sections={sections}
      roleBadge={isSuperAdmin ? 'Super Admin' : 'Platform Staff'}
      headerActions={<NotificationsDropdown />}
    >
      {children}
    </SidebarShell>
  )
}
