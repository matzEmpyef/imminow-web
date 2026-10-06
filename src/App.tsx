import { Suspense, useEffect, type ComponentProps, type ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom'
import { track } from '@/lib/analytics'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { ConsultancyRoute } from '@/features/auth/ConsultancyRoute'
import { PlatformRoute } from '@/features/auth/PlatformRoute'
import { PermissionGate } from '@/features/auth/PermissionGate'
import { FeatureGate } from '@/features/auth/FeatureGate'
import { FreelancerRoute } from '@/features/auth/FreelancerRoute'
import { FEATURE_REGISTRY } from '@/lib/features'
import { scopeHomePath } from '@/lib/roleHome'
import { SessionGate } from '@/features/auth/SessionGate'
import { AppShell } from '@/features/auth/AppShell'
import { AdminShell } from '@/features/auth/AdminShell'
import { FreelancerShell } from '@/features/auth/FreelancerShell'
import { shellForScope } from '@/features/auth/shellForScope'
import { PageErrorBoundary } from '@/components/AppErrorBoundary'
import { lazyPage } from '@/lib/lazyPage'
import { useMe } from '@/queries/me'

// Lookup so route elements can pass a FeatureDef by key without importing/finding it inline at
// every call site — see FEATURE_REGISTRY in @/lib/features for the definitions themselves.
const FEATURE_BY_KEY = Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.key, f]))
import { Skeleton } from '@/components/QueryState'

// Every route below `LoginPage` is lazy — one dynamic import per page, so the initial bundle is
// the login screen plus the shell, not all ~60 pages this console has grown to (caught in the
// frontend audit, 2026-08-24: zero code splitting, one ~1.35MB bundle). `LoginPage` alone stays a
// plain eager import: it's the first thing an unauthenticated visitor sees, and lazy-loading it
// would trade the bundle-size win for a loading flash before the login form even paints — a bad
// trade for the single most-hit page in the app. Named-export form (`.then((m) => ({ default:
// m.XPage }))`) rather than default exports, since that's this codebase's existing convention and
// changing every page to a default export would be a much larger, unrelated diff.
//
// `lazyPage`, not `React.lazy` (review F-162): after a deploy the old page files are gone, and a
// tab still open on the previous build reloads itself once instead of showing an error.
const ForgotPasswordPage = lazyPage(() =>
  import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const GuardianApprovalPage = lazyPage(() =>
  import('@/features/guardian/GuardianApprovalPage').then((m) => ({ default: m.GuardianApprovalPage })),
)
const ResetPasswordPage = lazyPage(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const SetPasswordPage = lazyPage(() =>
  import('@/features/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })),
)
const MyAccountPage = lazyPage(() => import('@/features/auth/MyAccountPage').then((m) => ({ default: m.MyAccountPage })))
const NotificationsPage = lazyPage(() =>
  import('@/features/auth/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const DashboardPage = lazyPage(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const LeadPoolPage = lazyPage(() => import('@/features/sales/LeadPoolPage').then((m) => ({ default: m.LeadPoolPage })))
const ActiveLeadsPage = lazyPage(() =>
  import('@/features/sales/ActiveLeadsPage').then((m) => ({ default: m.ActiveLeadsPage })),
)
const LeadConversationPage = lazyPage(() =>
  import('@/features/sales/LeadConversationPage').then((m) => ({ default: m.LeadConversationPage })),
)
const ClientsListPage = lazyPage(() =>
  import('@/features/clients/ClientsListPage').then((m) => ({ default: m.ClientsListPage })),
)
const ClientProfilePage = lazyPage(() =>
  import('@/features/clients/ClientProfilePage').then((m) => ({ default: m.ClientProfilePage })),
)
const ClientConversationPage = lazyPage(() =>
  import('@/features/clients/ClientConversationPage').then((m) => ({ default: m.ClientConversationPage })),
)
const CourseFinderPage = lazyPage(() =>
  import('@/features/clients/CourseFinderPage').then((m) => ({ default: m.CourseFinderPage })),
)
const InvoicesPage = lazyPage(() => import('@/features/clients/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const ReceiptsPage = lazyPage(() => import('@/features/clients/ReceiptsPage').then((m) => ({ default: m.ReceiptsPage })))
const CommissionDetailsPage = lazyPage(() =>
  import('@/features/administration/CommissionDetailsPage').then((m) => ({ default: m.CommissionDetailsPage })),
)
const ConsultancyProfilePage = lazyPage(() =>
  import('@/features/administration/ConsultancyProfilePage').then((m) => ({ default: m.ConsultancyProfilePage })),
)
const PlanTemplatesPage = lazyPage(() =>
  import('@/features/administration/PlanTemplatesPage').then((m) => ({ default: m.PlanTemplatesPage })),
)
const CourseSuggestionsPage = lazyPage(() =>
  import('@/features/administration/CourseSuggestionsPage').then((m) => ({ default: m.CourseSuggestionsPage })),
)
const FormsPage = lazyPage(() => import('@/features/administration/FormsPage').then((m) => ({ default: m.FormsPage })))
const FormBuilderPage = lazyPage(() =>
  import('@/features/administration/FormBuilderPage').then((m) => ({ default: m.FormBuilderPage })),
)
const InstituteCoursesPage = lazyPage(() =>
  import('@/features/administration/InstituteCoursesPage').then((m) => ({ default: m.InstituteCoursesPage })),
)
const BranchesPage = lazyPage(() =>
  import('@/features/administration/BranchesPage').then((m) => ({ default: m.BranchesPage })),
)
const EmployeesPage = lazyPage(() =>
  import('@/features/administration/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
)
const DesignationsPage = lazyPage(() =>
  import('@/features/administration/DesignationsPage').then((m) => ({ default: m.DesignationsPage })),
)
const PhonebookPage = lazyPage(() =>
  import('@/features/administration/PhonebookPage').then((m) => ({ default: m.PhonebookPage })),
)
const DocumentLibraryPage = lazyPage(() =>
  import('@/features/administration/DocumentLibraryPage').then((m) => ({ default: m.DocumentLibraryPage })),
)
const InternalMessagingPage = lazyPage(() =>
  import('@/features/administration/InternalMessagingPage').then((m) => ({ default: m.InternalMessagingPage })),
)
const AuditLogPage = lazyPage(() =>
  import('@/features/administration/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)
const ActivityPage = lazyPage(() => import('@/features/dashboard/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const SuperAdminDashboardPage = lazyPage(() =>
  import('@/features/super-admin/SuperAdminDashboardPage').then((m) => ({ default: m.SuperAdminDashboardPage })),
)
const ManageConsultanciesPage = lazyPage(() =>
  import('@/features/super-admin/ManageConsultanciesPage').then((m) => ({ default: m.ManageConsultanciesPage })),
)
const RatingsPage = lazyPage(() =>
  import('@/features/super-admin/RatingsPage').then((m) => ({ default: m.RatingsPage })),
)
const ReviewsPage = lazyPage(() => import('@/features/super-admin/ReviewsPage').then((m) => ({ default: m.ReviewsPage })))
const ConsultancyReviewsPage = lazyPage(() =>
  import('@/features/administration/ConsultancyReviewsPage').then((m) => ({ default: m.ConsultancyReviewsPage })),
)
const ApplicantAllocationPage = lazyPage(() =>
  import('@/features/super-admin/ApplicantAllocationPage').then((m) => ({ default: m.ApplicantAllocationPage })),
)
const SentpoUsersPage = lazyPage(() =>
  import('@/features/super-admin/SentpoUsersPage').then((m) => ({ default: m.SentpoUsersPage })),
)
const ImminowUsersPage = lazyPage(() =>
  import('@/features/super-admin/ImminowUsersPage').then((m) => ({ default: m.ImminowUsersPage })),
)
const SupplyDemandPage = lazyPage(() =>
  import('@/features/super-admin/SupplyDemandPage').then((m) => ({ default: m.SupplyDemandPage })),
)
const PlatformPulsePage = lazyPage(() =>
  import('@/features/super-admin/PlatformPulsePage').then((m) => ({ default: m.PlatformPulsePage })),
)
const NeedsAttentionPage = lazyPage(() =>
  import('@/features/super-admin/NeedsAttentionPage').then((m) => ({ default: m.NeedsAttentionPage })),
)
const PerformanceLeaguePage = lazyPage(() =>
  import('@/features/super-admin/PerformanceLeaguePage').then((m) => ({ default: m.PerformanceLeaguePage })),
)
const CollegesCoursesPage = lazyPage(() =>
  import('@/features/super-admin/CollegesCoursesPage').then((m) => ({ default: m.CollegesCoursesPage })),
)
const CollegeDetailPage = lazyPage(() =>
  import('@/features/super-admin/CollegeDetailPage').then((m) => ({ default: m.CollegeDetailPage })),
)
const InstitutionsPage = lazyPage(() =>
  import('@/features/super-admin/InstitutionsPage').then((m) => ({ default: m.InstitutionsPage })),
)
const TrendingCoursesPage = lazyPage(() =>
  import('@/features/super-admin/TrendingCoursesPage').then((m) => ({ default: m.TrendingCoursesPage })),
)
const CatalogSettingsPage = lazyPage(() =>
  import('@/features/super-admin/CatalogSettingsPage').then((m) => ({ default: m.CatalogSettingsPage })),
)
const CourseSuggestionsReviewPage = lazyPage(() =>
  import('@/features/super-admin/CourseSuggestionsReviewPage').then((m) => ({
    default: m.CourseSuggestionsReviewPage,
  })),
)
const AdsManagerPage = lazyPage(() =>
  import('@/features/super-admin/AdsManagerPage').then((m) => ({ default: m.AdsManagerPage })),
)
const MarketingOverviewPage = lazyPage(() =>
  import('@/features/super-admin/MarketingOverviewPage').then((m) => ({ default: m.MarketingOverviewPage })),
)
const EarnRulesPage = lazyPage(() =>
  import('@/features/super-admin/EarnRulesPage').then((m) => ({ default: m.EarnRulesPage })),
)
const CouponsAdminPage = lazyPage(() =>
  import('@/features/super-admin/CouponsAdminPage').then((m) => ({ default: m.CouponsAdminPage })),
)
const RedemptionPartnersPage = lazyPage(() =>
  import('@/features/super-admin/RedemptionPartnersPage').then((m) => ({ default: m.RedemptionPartnersPage })),
)
const WebinarsPage = lazyPage(() =>
  import('@/features/super-admin/WebinarsPage').then((m) => ({ default: m.WebinarsPage })),
)
const QuizAdminPage = lazyPage(() =>
  import('@/features/super-admin/QuizAdminPage').then((m) => ({ default: m.QuizAdminPage })),
)
const PhysicalMeetingsPage = lazyPage(() =>
  import('@/features/super-admin/PhysicalMeetingsPage').then((m) => ({ default: m.PhysicalMeetingsPage })),
)
const JobsAdminPage = lazyPage(() =>
  import('@/features/super-admin/JobsAdminPage').then((m) => ({ default: m.JobsAdminPage })),
)
const BlogAdminPage = lazyPage(() =>
  import('@/features/super-admin/BlogAdminPage').then((m) => ({ default: m.BlogAdminPage })),
)
const CommissionRatesPage = lazyPage(() =>
  import('@/features/super-admin/CommissionRatesPage').then((m) => ({ default: m.CommissionRatesPage })),
)
const FreelancerPayoutsPage = lazyPage(() =>
  import('@/features/super-admin/FreelancerPayoutsPage').then((m) => ({ default: m.FreelancerPayoutsPage })),
)
const ExchangeRatesPage = lazyPage(() =>
  import('@/features/super-admin/ExchangeRatesPage').then((m) => ({ default: m.ExchangeRatesPage })),
)
const FinanceDashboardPage = lazyPage(() =>
  import('@/features/super-admin/FinanceDashboardPage').then((m) => ({ default: m.FinanceDashboardPage })),
)
const SupportToolsPage = lazyPage(() =>
  import('@/features/super-admin/SupportToolsPage').then((m) => ({ default: m.SupportToolsPage })),
)
const DisputesPage = lazyPage(() =>
  import('@/features/super-admin/DisputesPage').then((m) => ({ default: m.DisputesPage })),
)
const CaseFollowupsPage = lazyPage(() =>
  import('@/features/super-admin/CaseFollowupsPage').then((m) => ({ default: m.CaseFollowupsPage })),
)
const ServiceFollowupsPage = lazyPage(() =>
  import('@/features/super-admin/ServiceFollowupsPage').then((m) => ({ default: m.ServiceFollowupsPage })),
)
const ApplicantCaseViewPage = lazyPage(() =>
  import('@/features/super-admin/ApplicantCaseViewPage').then((m) => ({ default: m.ApplicantCaseViewPage })),
)
const ComplaintsPage = lazyPage(() =>
  import('@/features/super-admin/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })),
)
const VisitRequestsPage = lazyPage(() =>
  import('@/features/super-admin/VisitRequestsPage').then((m) => ({ default: m.VisitRequestsPage })),
)
const PlatformTeamPage = lazyPage(() =>
  import('@/features/super-admin/PlatformTeamPage').then((m) => ({ default: m.PlatformTeamPage })),
)
const NotificationChannelConfigPage = lazyPage(() =>
  import('@/features/super-admin/NotificationChannelConfigPage').then((m) => ({
    default: m.NotificationChannelConfigPage,
  })),
)
const AppConfigPage = lazyPage(() =>
  import('@/features/super-admin/AppConfigPage').then((m) => ({ default: m.AppConfigPage })),
)
const BroadcastPage = lazyPage(() =>
  import('@/features/super-admin/BroadcastPage').then((m) => ({ default: m.BroadcastPage })),
)
const PlatformAuditLogPage = lazyPage(() =>
  import('@/features/super-admin/PlatformAuditLogPage').then((m) => ({ default: m.PlatformAuditLogPage })),
)
const FreelancersPage = lazyPage(() =>
  import('@/features/super-admin/FreelancersPage').then((m) => ({ default: m.FreelancersPage })),
)
const FreelancerDashboardPage = lazyPage(() =>
  import('@/features/freelancer/FreelancerDashboardPage').then((m) => ({ default: m.FreelancerDashboardPage })),
)

function LeadNoticeRedirect() {
  const { id } = useParams()
  return <Navigate to={`/sales/leads/${id}`} replace />
}

function DefaultRedirect() {
  return <SessionGate>{(me) => <Navigate to={scopeHomePath(me.scope)} replace />}</SessionGate>
}

// Analytics (Session 38, 2026-08-31) — one central hook rather than instrumenting each of the
// ~60 page components individually. `App` renders inside `BrowserRouter` (see main.tsx), so
// `useLocation()` here observes every route change platform-wide — `Navigate` redirects,
// back/forward, and real link clicks alike. `module` is just the first path segment
// ("/sales/lead-pool" -> "sales", "/admin/dashboard" -> "admin"); good enough for the starter
// vocabulary without a hand-maintained route->module map that would drift from the Routes below.
function useScreenViewAnalytics() {
  const location = useLocation()
  useEffect(() => {
    const module = location.pathname.split('/').filter(Boolean)[0] || 'root'
    track('screen_viewed', { properties: { module } })
    // Deliberately keyed on pathname only, not search/hash — a filter or tab change within the
    // same page is not a new screen view.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `location` as a whole would refire on search/hash; pathname is the screen
  }, [location.pathname])
}

// ---- Layout routes (2026-09-02) ----------------------------------------------------------------
// One guard mount per subtree instead of one wrapper per route — the audit's last giant-component
// finding was App() itself, ~65 flat routes each carrying its own guard element. Pathless
// `<Route element>` + `<Outlet/>` is React Router's own idiom for exactly this; every path below
// is UNCHANGED, so deep links, the roleHome bounces, and the guards behave precisely as the live
// four-role verification pinned them. Per-route `PermissionGate`/`FeatureGate` wrappers stay
// inline — they differ route to route and belong to the route, not the layout. The platform
// subtrees are grouped by console permission area, so the grouping itself now documents which
// permission opens which pages.

// Each layout also holds the page-crash boundary for its part of the console (review F-162):
// inside the guard, around the pages, drawing that part's own shell — so a page that crashes
// leaves the person their menu and their session.
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <OwnShellBoundary>
        <Outlet />
      </OwnShellBoundary>
    </ProtectedRoute>
  )
}

/** My Account and Notifications belong to every kind of account: the shell follows the caller. */
function OwnShellBoundary({ children }: { children: ReactNode }) {
  const scope = useMe().data?.scope
  return <PageErrorBoundary shell={shellForScope(scope)}>{children}</PageErrorBoundary>
}

function ConsultancyLayout() {
  return (
    <ConsultancyRoute>
      <PageErrorBoundary shell={AppShell}>
        <Outlet />
      </PageErrorBoundary>
    </ConsultancyRoute>
  )
}

function PlatformLayout({
  permission,
  anyPermission,
}: {
  permission?: ComponentProps<typeof PlatformRoute>['permission']
  anyPermission?: ComponentProps<typeof PlatformRoute>['anyPermission']
}) {
  return (
    <PlatformRoute permission={permission} anyPermission={anyPermission}>
      <PageErrorBoundary shell={AdminShell}>
        <Outlet />
      </PageErrorBoundary>
    </PlatformRoute>
  )
}

function FreelancerLayout() {
  return (
    <FreelancerRoute>
      <PageErrorBoundary shell={FreelancerShell}>
        <Outlet />
      </PageErrorBoundary>
    </FreelancerRoute>
  )
}

function App() {
  useScreenViewAnalytics()
  return (
    <Suspense fallback={<Skeleton className="m-lg h-64 rounded-lg" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        {/* Public, no account: the page a parent opens from the message Sentpo sent them to
            approve a 16- or 17-year-old's account (2026-09-05). Sits with login and password
            reset because it is the same kind of route — reachable with no session at all. */}
        <Route path="/guardian/:token" element={<GuardianApprovalPage />} />
        <Route path="/set-password/:token" element={<SetPasswordPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/account" element={<MyAccountPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
        <Route element={<ConsultancyLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          {/* M16 (2026-09-13): the server stopped returning pool leads to a caller without
              `leads.allocate_from_pool`, so this page rendered an empty table with no explanation
              for anyone else. Same route-level gate the money pages use. */}
          <Route
            path="/sales/lead-pool"
            element={
              <PermissionGate permission="leads.allocate_from_pool" area="the Lead Pool">
                <LeadPoolPage />
              </PermissionGate>
            }
          />
          <Route path="/sales/active-leads" element={<ActiveLeadsPage />} />
          <Route path="/sales/leads/:id" element={<LeadConversationPage />} />
          {/* The address lead notifications carry (`/leads/{lead_id}`): the same page, at the
              console's own address for it. */}
          <Route path="/leads/:id" element={<LeadNoticeRedirect />} />
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/course-finder" element={<CourseFinderPage />} />
          {/* C3 (2026-09-13): both lists are money the server now guards with
              `billing.view_commission_details` — same route-level gate the Administration pages use,
              so a direct link explains itself instead of rendering an empty table over a 403. */}
          <Route
            path="/clients/invoices"
            element={
              <PermissionGate permission="billing.view_commission_details" area="Invoices">
                <InvoicesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/clients/receipts"
            element={
              <PermissionGate permission="billing.view_commission_details" area="Receipts">
                <ReceiptsPage />
              </PermissionGate>
            }
          />
          <Route path="/clients/:id" element={<ClientProfilePage />} />
          <Route path="/clients/:id/conversation" element={<ClientConversationPage />} />
          <Route
            path="/administration/consultancy-profile"
            element={
              <PermissionGate permission="settings.edit_profile" area="Consultancy Management">
                <ConsultancyProfilePage />
              </PermissionGate>
            }
          />
          <Route
            path="/administration/reviews"
            element={
              <PermissionGate permission="settings.edit_profile" area="Reviews">
                <ConsultancyReviewsPage />
              </PermissionGate>
            }
          />
          <Route path="/administration/commission-details" element={<CommissionDetailsPage />} />
          <Route
            path="/administration/plan-templates"
            element={
              <PermissionGate permission="settings.manage_templates" area="Plan Templates">
                <PlanTemplatesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/administration/course-suggestions"
            element={
              <PermissionGate permission="settings.manage_course_suggestions" area="Course Suggestions">
                <CourseSuggestionsPage />
              </PermissionGate>
            }
          />
          {/* A college's own courses with their on/off switch (owner decision 18). The page itself
              turns away an account that is not an institute. */}
          <Route
            path="/administration/courses"
            element={
              <PermissionGate permission="settings.manage_course_suggestions" area="Your Courses">
                <InstituteCoursesPage />
              </PermissionGate>
            }
          />
          <Route path="/administration/forms" element={<FormsPage />} />
          <Route path="/administration/forms/:id" element={<FormBuilderPage />} />
          <Route
            path="/administration/branches"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.multi_branch}>
                <PermissionGate permission="staff.manage_branches" area="Branches">
                  <BranchesPage />
                </PermissionGate>
              </FeatureGate>
            }
          />
          <Route
            path="/administration/employees"
            element={
              <PermissionGate permission="staff.manage_employees" area="Employees">
                <EmployeesPage />
              </PermissionGate>
            }
          />
          <Route
            path="/administration/designations"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.designations}>
                <PermissionGate permission="staff.manage_designations" area="Designations">
                  <DesignationsPage />
                </PermissionGate>
              </FeatureGate>
            }
          />
          <Route
            path="/administration/phonebook"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.phonebook}>
                <PhonebookPage />
              </FeatureGate>
            }
          />
          <Route
            path="/administration/document-library"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.document_library}>
                <DocumentLibraryPage />
              </FeatureGate>
            }
          />
          <Route
            path="/administration/internal-messaging"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            }
          />
          <Route
            path="/administration/internal-messaging/:id"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            }
          />
          {/* Contract gate 9, K8 — the internal-messaging `chat_message` notification's deep_link is
              the bare route `/staff/conversations` (no id; the catalogue doesn't expose which
              colleague/team thread, so the best a tap can do is land on the inbox, same as the
              mobile staff shell's `isStaffLocation` prefix). Aliases onto the real page rather than
              duplicating it, so old notification rows (pre-dating this route) keep working the
              moment it ships. */}
          <Route
            path="/staff/conversations"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            }
          />
          <Route
            path="/staff/conversations/:id"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            }
          />
          <Route
            path="/administration/audit-log"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.audit_log}>
                <PermissionGate adminOnly area="the Audit Log">
                  <AuditLogPage />
                </PermissionGate>
              </FeatureGate>
            }
          />
          <Route
            path="/activity"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.activity_queue}>
                <ActivityPage />
              </FeatureGate>
            }
          />
        </Route>
        {/* Dashboard, Supply & Demand and Platform Pulse carry no permission (docs/PROGRESS.md §4
            Step 4; Platform Pulse 2026-08-31) — the bare requirePlatformAccount gate: strategic
            overviews, not one of the eight console flags. */}
        <Route element={<PlatformLayout />}>
          <Route path="/admin/dashboard" element={<SuperAdminDashboardPage />} />
          {/* No flag of its own (2026-09-10) — every platform account has a to-do list; the
              server limits it to the queues the viewer's permissions cover. */}
          <Route path="/admin/needs-attention" element={<NeedsAttentionPage />} />
          <Route path="/admin/supply-demand" element={<SupplyDemandPage />} />
          <Route path="/admin/platform-pulse" element={<PlatformPulsePage />} />
        </Route>
        {/* One PlatformLayout per console permission flag — eighteen since the 2026-09-10 split, so
            each area can be handed to one person. The sidebar (AdminShell) groups these pages as
            tabs; the routes themselves never moved, so every bookmark still works. */}
        <Route element={<PlatformLayout permission="consultancy_approval" />}>
          <Route path="/admin/consultancies" element={<ManageConsultanciesPage />} />
          <Route path="/admin/performance-league" element={<PerformanceLeaguePage />} />
          <Route path="/admin/reviews" element={<ReviewsPage />} />
          <Route path="/admin/ratings" element={<RatingsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="applicant_allocation" />}>
          <Route path="/admin/applicant-allocation" element={<ApplicantAllocationPage />} />
        </Route>
        <Route element={<PlatformLayout permission="catalog" />}>
          <Route path="/admin/colleges" element={<CollegesCoursesPage />} />
          <Route path="/admin/colleges/:id" element={<CollegeDetailPage />} />
          <Route path="/admin/course-suggestions-review" element={<CourseSuggestionsReviewPage />} />
          <Route path="/admin/institutions" element={<InstitutionsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="catalog_settings" />}>
          {/* Countries folded into Settings on 2026-09-07. Both old paths redirect rather than
              404 — they are in bookmarks and history, and a dead end for a page that still exists
              under another name is a worse answer than taking someone there. */}
          <Route path="/admin/countries" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/admin/catalog-settings" element={<Navigate to="/admin/settings" replace />} />
          <Route path="/admin/settings" element={<CatalogSettingsPage />} />
          <Route path="/admin/trending-courses" element={<TrendingCoursesPage />} />
          {/* Country Guides folded into Countries on 2026-09-07 — they were already one record.
              Kept as a redirect rather than deleted: the old path is in people's bookmarks and
              history, and a 404 for a page that still exists under another name is a worse
              answer than taking them there. */}
          <Route path="/admin/country-guides" element={<Navigate to="/admin/countries" replace />} />
        </Route>
        {/* Any Marketing permission opens it — the sidebar shows it on the same rule, and the
            server refuses anyone without one. */}
        <Route element={<PlatformLayout />}>
          <Route path="/admin/marketing" element={<MarketingOverviewPage />} />
        </Route>
        <Route element={<PlatformLayout permission="ads" />}>
          <Route path="/admin/ads" element={<AdsManagerPage />} />
        </Route>
        <Route element={<PlatformLayout permission="points_coupons" />}>
          <Route path="/admin/earn-rules" element={<EarnRulesPage />} />
          <Route path="/admin/coupons" element={<CouponsAdminPage />} />
          <Route path="/admin/redemption-partners" element={<RedemptionPartnersPage />} />
        </Route>
        <Route element={<PlatformLayout permission="events" />}>
          <Route path="/admin/webinars" element={<WebinarsPage />} />
          <Route path="/admin/quiz" element={<QuizAdminPage />} />
          <Route path="/admin/physical-meetings" element={<PhysicalMeetingsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="jobs" />}>
          <Route path="/admin/jobs" element={<JobsAdminPage />} />
        </Route>
        <Route element={<PlatformLayout permission="blog" />}>
          <Route path="/admin/blog" element={<BlogAdminPage />} />
        </Route>
        <Route element={<PlatformLayout permission="finance" />}>
          <Route path="/admin/commission-rates" element={<CommissionRatesPage />} />
          <Route path="/admin/finance-dashboard" element={<FinanceDashboardPage />} />
          <Route path="/admin/finance/exchange-rates" element={<ExchangeRatesPage />} />
        </Route>
        <Route element={<PlatformLayout permission="freelancers" />}>
          <Route path="/admin/freelancer-payouts" element={<FreelancerPayoutsPage />} />
          <Route path="/admin/freelancers" element={<FreelancersPage />} />
        </Route>
        {/* Merged into Freelancers as a tab (2026-08-27). The old path is kept as a redirect so
            existing bookmarks and any link still pointing here land somewhere real. */}
        <Route path="/admin/freelancer-rates" element={<Navigate to="/admin/freelancers" replace />} />
        {/* Payment follow-ups: Finance's queue (2026-09-11). Support has Student follow-ups. */}
        <Route element={<PlatformLayout permission="finance" />}>
          <Route path="/admin/case-followups" element={<CaseFollowupsPage />} />
          {/* The same case view, opened from Payment follow-ups, so Finance stays highlighted in
              the sidebar rather than jumping to Support (user, 2026-09-11). */}
          <Route path="/admin/case-followups/:id" element={<ApplicantCaseViewPage />} />
        </Route>
        {/* The applicant case view is opened from both queues, so either permission opens it. */}
        <Route element={<PlatformLayout anyPermission={['finance', 'support']} />}>
          <Route path="/admin/applicants/:id" element={<ApplicantCaseViewPage />} />
        </Route>
        <Route element={<PlatformLayout permission="support" />}>
          <Route path="/admin/disputes" element={<DisputesPage />} />
          {/* Students who are stuck — Support's follow-up queue (2026-09-11). */}
          <Route path="/admin/student-followups" element={<ServiceFollowupsPage />} />
          <Route path="/admin/complaints" element={<ComplaintsPage />} />
          <Route path="/admin/visit-requests" element={<VisitRequestsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="support_tools" />}>
          <Route path="/admin/support-tools" element={<SupportToolsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="team_management" />}>
          <Route path="/admin/platform-team" element={<PlatformTeamPage />} />
        </Route>
        <Route element={<PlatformLayout permission="user_directory" />}>
          <Route path="/admin/users/sentpo" element={<SentpoUsersPage />} />
          <Route path="/admin/users/imminow" element={<ImminowUsersPage />} />
        </Route>
        <Route element={<PlatformLayout permission="notifications" />}>
          <Route path="/admin/notification-channel-config" element={<NotificationChannelConfigPage />} />
          <Route path="/admin/broadcast" element={<BroadcastPage />} />
        </Route>
        <Route element={<PlatformLayout permission="app_config" />}>
          <Route path="/admin/app-config" element={<AppConfigPage />} />
        </Route>
        <Route element={<PlatformLayout permission="audit_log" />}>
          <Route path="/admin/audit-log-platform" element={<PlatformAuditLogPage />} />
        </Route>
        <Route element={<FreelancerLayout />}>
          <Route path="/freelancer/dashboard" element={<FreelancerDashboardPage />} />
        </Route>
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default App
