import type { ReactNode } from 'react'
import {
  Activity,
  Briefcase,
  Building2,
  ClipboardList,
  Compass,
  FileStack,
  FileText,
  FolderOpen,
  GraduationCap,
  History,
  IdCard,
  LayoutDashboard,
  ListChecks,
  MapPin,
  MessageSquare,
  Percent,
  Phone,
  Receipt,
  Users,
  Users2,
  UserCheck,
} from 'lucide-react'
import { SidebarShell, type SidebarSection, type SidebarSubLink } from '@/components/SidebarShell'
import { GlobalSearch } from '@/components/GlobalSearch'
import { FloatingChatWindow } from '@/components/FloatingChatWindow'
import { GlobalChatDrawer } from '@/components/GlobalChatDrawer'
import { NotificationsDropdown } from '@/components/NotificationsDropdown'
import { usePermissionChecker } from '@/lib/permissions'
import { useFeatures } from '@/lib/features'
import { useActivityFeed } from '@/queries/activity'

// Only sections/links with real, built pages appear here — a link shows only once its wave has
// landed, and only once its plan includes it (Starter/Business/Ultimate, build reference 1.16
// made real 2026-08-29 — a link's visibility is now a FEATURE FLAG check, never the raw tier
// enum, since a Super Admin's per-flag override can grant or withhold a feature independent of
// tier).
interface GatedSubLink extends SidebarSubLink {
  /** Feature-registry key (see `@/lib/features`) required to see this link. */
  feature?: string
  /** Consultancy permission key required to see this link, e.g. `staff.manage_employees`. */
  permission?: string
}

interface GatedSection extends Omit<SidebarSection, 'sidebarLinks'> {
  sidebarLinks: GatedSubLink[]
}

const SECTIONS: GatedSection[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    matches: (p) =>
      p.startsWith('/dashboard') ||
      p.startsWith('/activity') ||
      p.startsWith('/administration/phonebook') ||
      p.startsWith('/administration/document-library') ||
      p.startsWith('/administration/internal-messaging'),
    sidebarLinks: [
      { label: 'Overview', path: '/dashboard', icon: LayoutDashboard },
      { label: 'Activity', path: '/activity', icon: Activity, feature: 'activity_queue' },
      { label: 'Phonebook', path: '/administration/phonebook', icon: Phone, feature: 'phonebook' },
      {
        label: 'Document Library',
        path: '/administration/document-library',
        icon: FolderOpen,
        feature: 'document_library',
      },
      {
        label: 'Internal Messaging',
        path: '/administration/internal-messaging',
        icon: MessageSquare,
        feature: 'internal_messaging',
      },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    path: '/sales/lead-pool',
    icon: Users,
    matches: (p) => p.startsWith('/sales'),
    sidebarLinks: [
      { label: 'Lead Pool', path: '/sales/lead-pool', icon: Users },
      { label: 'Active Leads', path: '/sales/active-leads', icon: UserCheck },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    path: '/clients',
    icon: Briefcase,
    matches: (p) => p.startsWith('/clients'),
    sidebarLinks: [
      { label: 'Clients List', path: '/clients', icon: ListChecks },
      { label: 'Course Finder', path: '/clients/course-finder', icon: Compass },
      { label: 'Invoices', path: '/clients/invoices', icon: FileText },
      { label: 'Receipts', path: '/clients/receipts', icon: Receipt },
    ],
  },
  {
    key: 'administration',
    label: 'Administration',
    path: '/administration/plan-templates',
    icon: Building2,
    // Phonebook/Document Library/Internal Messaging still live under the /administration/* path
    // prefix but now belong to the Dashboard section's sidebar (including Internal Messaging's
    // own per-conversation route, /administration/internal-messaging/:id) — relies on Dashboard
    // being checked first in SECTIONS (array order) so its more specific `matches` wins for those.
    matches: (p) => p.startsWith('/administration'),
    sidebarLinks: [
      {
        label: 'Plan Templates',
        path: '/administration/plan-templates',
        icon: FileStack,
        permission: 'settings.manage_templates',
      },
      {
        label: 'Commission Details',
        path: '/administration/commission-details',
        icon: Percent,
        permission: 'billing.view_commission_details',
      },
      { label: 'Forms', path: '/administration/forms', icon: ClipboardList },
      {
        label: 'Course Suggestions',
        path: '/administration/course-suggestions',
        icon: GraduationCap,
        permission: 'settings.manage_course_suggestions',
      },
      {
        label: 'Branches',
        path: '/administration/branches',
        icon: MapPin,
        feature: 'multi_branch',
        permission: 'staff.manage_branches',
      },
      { label: 'Employees', path: '/administration/employees', icon: Users2, permission: 'staff.manage_employees' },
      {
        label: 'Designations',
        path: '/administration/designations',
        icon: IdCard,
        feature: 'designations',
        permission: 'staff.manage_designations',
      },
      {
        label: 'Consultancy Management',
        path: '/administration/consultancy-profile',
        icon: Building2,
        permission: 'settings.edit_profile',
      },
      { label: 'Audit Log', path: '/administration/audit-log', icon: History, feature: 'audit_log' },
    ],
  },
]

// Sidebar links can require a consultancy permission as well as a feature. Started life as a
// one-off check for Consultancy Management (user-requested, 2026-08-19 — "by default only
// available to consultancy admin") and was generalised on 2026-08-23, when the contract audit
// found Employees/Designations/Branches listed for everyone despite Staff Administration being
// its own permission area. Gated on the permission keys rather than `is_consultancy_admin`:
// `usePermissionChecker` already bypasses to true for the admin, and a designation explicitly
// granted the permission reaches it too, same as every other gated action here.
//
// Navigation only — `FeatureGate`/`PermissionGate` guard the routes and the server guards the
// endpoints.
export function AppShell({ children }: { children: ReactNode }) {
  const { data: features } = useFeatures()
  const { can } = usePermissionChecker()
  // User-requested (2026-08-19) — "show number of activities that need action today as a counter
  // in Activities side menu." Only fetched once Activity is actually visible (the
  // `activity_queue` entitlement, Ultimate by default) — see useActivityFeed's own note on why
  // this is gated rather than an unconditional fetch on every page.
  const activityFeed = useActivityFeed(features.activity_queue === true)

  // Note on a failed permission/feature fetch: both `can` and `features` fail closed, so gated
  // links simply don't render — deliberately NOT surfaced as an error here. Nav is the wrong
  // place to explain a network problem, and showing links the user may not hold would be worse
  // than hiding ones they do. Anyone who navigates to a gated route directly now gets the real
  // diagnosis from `FeatureGate`/`PermissionGate`, which distinguish "fetch failed" from "denied"
  // (2026-08-25).
  const resolvedSections: SidebarSection[] = SECTIONS.map((section) => {
    const sidebarLinks = section.sidebarLinks
      .filter((link) => !link.feature || features[link.feature])
      .filter((link) => !link.permission || can(link.permission))
      .map((link) =>
        link.label === 'Activity' ? { ...link, badge: activityFeed.data?.needs_action_today_count } : link,
      )
    // The section header navigates to its first sublink — resolved AFTER permission filtering,
    // so a user denied the section's usual landing page (e.g. Plan Templates) lands on their
    // first visible link instead of a permission-denied card.
    return { ...section, sidebarLinks, path: sidebarLinks[0]?.path ?? section.path }
  })

  // Global Chat Drawer + bell. The drawer was removed 2026-08-19 on a misread instruction and
  // RESTORED 2026-08-20 (user: "I want it. I don't think I asked you to remove it, I asked to
  // not do a tab feature for Aspirants and Applicants") — one merged conversation list, no
  // Aspirant/Applicant tabs. Rows open the floating window below without navigating.
  return (
    <>
      <SidebarShell
        sections={resolvedSections}
        search={<GlobalSearch />}
        headerActions={
          <>
            <GlobalChatDrawer />
            <NotificationsDropdown />
          </>
        }
      >
        {children}
      </SidebarShell>
      <FloatingChatWindow />
    </>
  )
}
