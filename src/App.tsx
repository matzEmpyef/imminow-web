import { lazy, Suspense, useEffect, type ComponentProps } from 'react'
import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { track } from '@/lib/analytics'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { ConsultancyRoute } from '@/features/auth/ConsultancyRoute'
import { PlatformRoute } from '@/features/auth/PlatformRoute'
import { PermissionGate } from '@/features/auth/PermissionGate'
import { FeatureGate } from '@/features/auth/FeatureGate'
import { FreelancerRoute } from '@/features/auth/FreelancerRoute'
import { FEATURE_REGISTRY } from '@/lib/features'
import { roleHomePath } from '@/lib/roleHome'

// Lookup so route elements can pass a FeatureDef by key without importing/finding it inline at
// every call site — see FEATURE_REGISTRY in @/lib/features for the definitions themselves.
const FEATURE_BY_KEY = Object.fromEntries(FEATURE_REGISTRY.map((f) => [f.key, f]))
import { useAuthStore } from '@/stores/authStore'
import { Skeleton } from '@/components/QueryState'

// Every route below `LoginPage` is lazy — one dynamic import per page, so the initial bundle is
// the login screen plus the shell, not all ~60 pages this console has grown to (caught in the
// frontend audit, 2026-08-24: zero code splitting, one ~1.35MB bundle). `LoginPage` alone stays a
// plain eager import: it's the first thing an unauthenticated visitor sees, and lazy-loading it
// would trade the bundle-size win for a loading flash before the login form even paints — a bad
// trade for the single most-hit page in the app. Named-export form (`.then((m) => ({ default:
// m.XPage }))`) rather than default exports, since that's this codebase's existing convention and
// changing every page to a default export would be a much larger, unrelated diff.
const ForgotPasswordPage = lazy(() =>
  import('@/features/auth/ForgotPasswordPage').then((m) => ({ default: m.ForgotPasswordPage })),
)
const ResetPasswordPage = lazy(() =>
  import('@/features/auth/ResetPasswordPage').then((m) => ({ default: m.ResetPasswordPage })),
)
const SetPasswordPage = lazy(() =>
  import('@/features/auth/SetPasswordPage').then((m) => ({ default: m.SetPasswordPage })),
)
const MyAccountPage = lazy(() => import('@/features/auth/MyAccountPage').then((m) => ({ default: m.MyAccountPage })))
const NotificationsPage = lazy(() =>
  import('@/features/auth/NotificationsPage').then((m) => ({ default: m.NotificationsPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const LeadPoolPage = lazy(() => import('@/features/sales/LeadPoolPage').then((m) => ({ default: m.LeadPoolPage })))
const ActiveLeadsPage = lazy(() =>
  import('@/features/sales/ActiveLeadsPage').then((m) => ({ default: m.ActiveLeadsPage })),
)
const LeadConversationPage = lazy(() =>
  import('@/features/sales/LeadConversationPage').then((m) => ({ default: m.LeadConversationPage })),
)
const ClientsListPage = lazy(() =>
  import('@/features/clients/ClientsListPage').then((m) => ({ default: m.ClientsListPage })),
)
const ClientProfilePage = lazy(() =>
  import('@/features/clients/ClientProfilePage').then((m) => ({ default: m.ClientProfilePage })),
)
const ClientConversationPage = lazy(() =>
  import('@/features/clients/ClientConversationPage').then((m) => ({ default: m.ClientConversationPage })),
)
const CourseFinderPage = lazy(() =>
  import('@/features/clients/CourseFinderPage').then((m) => ({ default: m.CourseFinderPage })),
)
const InvoicesPage = lazy(() => import('@/features/clients/InvoicesPage').then((m) => ({ default: m.InvoicesPage })))
const ReceiptsPage = lazy(() => import('@/features/clients/ReceiptsPage').then((m) => ({ default: m.ReceiptsPage })))
const CommissionDetailsPage = lazy(() =>
  import('@/features/administration/CommissionDetailsPage').then((m) => ({ default: m.CommissionDetailsPage })),
)
const ConsultancyProfilePage = lazy(() =>
  import('@/features/administration/ConsultancyProfilePage').then((m) => ({ default: m.ConsultancyProfilePage })),
)
const PlanTemplatesPage = lazy(() =>
  import('@/features/administration/PlanTemplatesPage').then((m) => ({ default: m.PlanTemplatesPage })),
)
const CourseSuggestionsPage = lazy(() =>
  import('@/features/administration/CourseSuggestionsPage').then((m) => ({ default: m.CourseSuggestionsPage })),
)
const FormsPage = lazy(() => import('@/features/administration/FormsPage').then((m) => ({ default: m.FormsPage })))
const FormBuilderPage = lazy(() =>
  import('@/features/administration/FormBuilderPage').then((m) => ({ default: m.FormBuilderPage })),
)
const BranchesPage = lazy(() =>
  import('@/features/administration/BranchesPage').then((m) => ({ default: m.BranchesPage })),
)
const EmployeesPage = lazy(() =>
  import('@/features/administration/EmployeesPage').then((m) => ({ default: m.EmployeesPage })),
)
const DesignationsPage = lazy(() =>
  import('@/features/administration/DesignationsPage').then((m) => ({ default: m.DesignationsPage })),
)
const PhonebookPage = lazy(() =>
  import('@/features/administration/PhonebookPage').then((m) => ({ default: m.PhonebookPage })),
)
const DocumentLibraryPage = lazy(() =>
  import('@/features/administration/DocumentLibraryPage').then((m) => ({ default: m.DocumentLibraryPage })),
)
const InternalMessagingPage = lazy(() =>
  import('@/features/administration/InternalMessagingPage').then((m) => ({ default: m.InternalMessagingPage })),
)
const AuditLogPage = lazy(() =>
  import('@/features/administration/AuditLogPage').then((m) => ({ default: m.AuditLogPage })),
)
const ActivityPage = lazy(() => import('@/features/dashboard/ActivityPage').then((m) => ({ default: m.ActivityPage })))
const SuperAdminDashboardPage = lazy(() =>
  import('@/features/super-admin/SuperAdminDashboardPage').then((m) => ({ default: m.SuperAdminDashboardPage })),
)
const ManageConsultanciesPage = lazy(() =>
  import('@/features/super-admin/ManageConsultanciesPage').then((m) => ({ default: m.ManageConsultanciesPage })),
)
const ApplicantAllocationPage = lazy(() =>
  import('@/features/super-admin/ApplicantAllocationPage').then((m) => ({ default: m.ApplicantAllocationPage })),
)
const SentpoUsersPage = lazy(() =>
  import('@/features/super-admin/SentpoUsersPage').then((m) => ({ default: m.SentpoUsersPage })),
)
const ImminowUsersPage = lazy(() =>
  import('@/features/super-admin/ImminowUsersPage').then((m) => ({ default: m.ImminowUsersPage })),
)
const SupplyDemandPage = lazy(() =>
  import('@/features/super-admin/SupplyDemandPage').then((m) => ({ default: m.SupplyDemandPage })),
)
const PlatformPulsePage = lazy(() =>
  import('@/features/super-admin/PlatformPulsePage').then((m) => ({ default: m.PlatformPulsePage })),
)
const PerformanceLeaguePage = lazy(() =>
  import('@/features/super-admin/PerformanceLeaguePage').then((m) => ({ default: m.PerformanceLeaguePage })),
)
const CollegesCoursesPage = lazy(() =>
  import('@/features/super-admin/CollegesCoursesPage').then((m) => ({ default: m.CollegesCoursesPage })),
)
const CollegeDetailPage = lazy(() =>
  import('@/features/super-admin/CollegeDetailPage').then((m) => ({ default: m.CollegeDetailPage })),
)
const InstitutionsPage = lazy(() =>
  import('@/features/super-admin/InstitutionsPage').then((m) => ({ default: m.InstitutionsPage })),
)
const CountriesPage = lazy(() =>
  import('@/features/super-admin/CountriesPage').then((m) => ({ default: m.CountriesPage })),
)
const CountryGuidesPage = lazy(() =>
  import('@/features/super-admin/CountryGuidesPage').then((m) => ({ default: m.CountryGuidesPage })),
)
const CatalogSettingsPage = lazy(() =>
  import('@/features/super-admin/CatalogSettingsPage').then((m) => ({ default: m.CatalogSettingsPage })),
)
const CourseSuggestionsReviewPage = lazy(() =>
  import('@/features/super-admin/CourseSuggestionsReviewPage').then((m) => ({
    default: m.CourseSuggestionsReviewPage,
  })),
)
const AdsManagerPage = lazy(() =>
  import('@/features/super-admin/AdsManagerPage').then((m) => ({ default: m.AdsManagerPage })),
)
const EarnRulesPage = lazy(() =>
  import('@/features/super-admin/EarnRulesPage').then((m) => ({ default: m.EarnRulesPage })),
)
const CouponsAdminPage = lazy(() =>
  import('@/features/super-admin/CouponsAdminPage').then((m) => ({ default: m.CouponsAdminPage })),
)
const RedemptionPartnersPage = lazy(() =>
  import('@/features/super-admin/RedemptionPartnersPage').then((m) => ({ default: m.RedemptionPartnersPage })),
)
const WebinarsPage = lazy(() =>
  import('@/features/super-admin/WebinarsPage').then((m) => ({ default: m.WebinarsPage })),
)
const QuizAdminPage = lazy(() =>
  import('@/features/super-admin/QuizAdminPage').then((m) => ({ default: m.QuizAdminPage })),
)
const PhysicalMeetingsPage = lazy(() =>
  import('@/features/super-admin/PhysicalMeetingsPage').then((m) => ({ default: m.PhysicalMeetingsPage })),
)
const JobsAdminPage = lazy(() =>
  import('@/features/super-admin/JobsAdminPage').then((m) => ({ default: m.JobsAdminPage })),
)
const BlogAdminPage = lazy(() =>
  import('@/features/super-admin/BlogAdminPage').then((m) => ({ default: m.BlogAdminPage })),
)
const CommissionRatesPage = lazy(() =>
  import('@/features/super-admin/CommissionRatesPage').then((m) => ({ default: m.CommissionRatesPage })),
)
const FreelancerPayoutsPage = lazy(() =>
  import('@/features/super-admin/FreelancerPayoutsPage').then((m) => ({ default: m.FreelancerPayoutsPage })),
)
const FinanceDashboardPage = lazy(() =>
  import('@/features/super-admin/FinanceDashboardPage').then((m) => ({ default: m.FinanceDashboardPage })),
)
const SupportToolsPage = lazy(() =>
  import('@/features/super-admin/SupportToolsPage').then((m) => ({ default: m.SupportToolsPage })),
)
const ComplaintsPage = lazy(() =>
  import('@/features/super-admin/ComplaintsPage').then((m) => ({ default: m.ComplaintsPage })),
)
const VisitRequestsPage = lazy(() =>
  import('@/features/super-admin/VisitRequestsPage').then((m) => ({ default: m.VisitRequestsPage })),
)
const PlatformTeamPage = lazy(() =>
  import('@/features/super-admin/PlatformTeamPage').then((m) => ({ default: m.PlatformTeamPage })),
)
const NotificationChannelConfigPage = lazy(() =>
  import('@/features/super-admin/NotificationChannelConfigPage').then((m) => ({
    default: m.NotificationChannelConfigPage,
  })),
)
const AppConfigPage = lazy(() =>
  import('@/features/super-admin/AppConfigPage').then((m) => ({ default: m.AppConfigPage })),
)
const BroadcastPage = lazy(() =>
  import('@/features/super-admin/BroadcastPage').then((m) => ({ default: m.BroadcastPage })),
)
const PlatformAuditLogPage = lazy(() =>
  import('@/features/super-admin/PlatformAuditLogPage').then((m) => ({ default: m.PlatformAuditLogPage })),
)
const FreelancersPage = lazy(() =>
  import('@/features/super-admin/FreelancersPage').then((m) => ({ default: m.FreelancersPage })),
)
const FreelancerDashboardPage = lazy(() =>
  import('@/features/freelancer/FreelancerDashboardPage').then((m) => ({ default: m.FreelancerDashboardPage })),
)

function DefaultRedirect() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  if (!isAuthed) return <Navigate to="/login" replace />
  return <Navigate to={roleHomePath(role)} replace />
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Outlet />
    </ProtectedRoute>
  )
}

function ConsultancyLayout() {
  return (
    <ConsultancyRoute>
      <Outlet />
    </ConsultancyRoute>
  )
}

function PlatformLayout({ permission }: { permission?: ComponentProps<typeof PlatformRoute>['permission'] }) {
  return (
    <PlatformRoute permission={permission}>
      <Outlet />
    </PlatformRoute>
  )
}

function FreelancerLayout() {
  return (
    <FreelancerRoute>
      <Outlet />
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
        <Route path="/set-password/:token" element={<SetPasswordPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/account" element={<MyAccountPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
        </Route>
        <Route element={<ConsultancyLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/sales/lead-pool" element={<LeadPoolPage />} />
          <Route path="/sales/active-leads" element={<ActiveLeadsPage />} />
          <Route path="/sales/leads/:id" element={<LeadConversationPage />} />
          <Route path="/clients" element={<ClientsListPage />} />
          <Route path="/clients/course-finder" element={<CourseFinderPage />} />
          <Route path="/clients/invoices" element={<InvoicesPage />} />
          <Route path="/clients/receipts" element={<ReceiptsPage />} />
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
          <Route
            path="/administration/audit-log"
            element={
              <FeatureGate feature={FEATURE_BY_KEY.audit_log}>
                <AuditLogPage />
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
          <Route path="/admin/supply-demand" element={<SupplyDemandPage />} />
          <Route path="/admin/platform-pulse" element={<PlatformPulsePage />} />
        </Route>
        <Route element={<PlatformLayout permission="consultancy_approval" />}>
          <Route path="/admin/consultancies" element={<ManageConsultanciesPage />} />
          <Route path="/admin/applicant-allocation" element={<ApplicantAllocationPage />} />
          <Route path="/admin/performance-league" element={<PerformanceLeaguePage />} />
        </Route>
        <Route element={<PlatformLayout permission="catalog" />}>
          <Route path="/admin/colleges" element={<CollegesCoursesPage />} />
          <Route path="/admin/colleges/:id" element={<CollegeDetailPage />} />
          <Route path="/admin/course-suggestions-review" element={<CourseSuggestionsReviewPage />} />
          <Route path="/admin/countries" element={<CountriesPage />} />
          <Route path="/admin/institutions" element={<InstitutionsPage />} />
          <Route path="/admin/country-guides" element={<CountryGuidesPage />} />
          <Route path="/admin/catalog-settings" element={<CatalogSettingsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="ads" />}>
          <Route path="/admin/ads" element={<AdsManagerPage />} />
        </Route>
        <Route element={<PlatformLayout permission="points_coupons" />}>
          <Route path="/admin/earn-rules" element={<EarnRulesPage />} />
          <Route path="/admin/coupons" element={<CouponsAdminPage />} />
          <Route path="/admin/redemption-partners" element={<RedemptionPartnersPage />} />
        </Route>
        <Route element={<PlatformLayout permission="content" />}>
          <Route path="/admin/webinars" element={<WebinarsPage />} />
          <Route path="/admin/quiz" element={<QuizAdminPage />} />
          <Route path="/admin/physical-meetings" element={<PhysicalMeetingsPage />} />
          <Route path="/admin/jobs" element={<JobsAdminPage />} />
          <Route path="/admin/blog" element={<BlogAdminPage />} />
        </Route>
        <Route element={<PlatformLayout permission="finance" />}>
          <Route path="/admin/commission-rates" element={<CommissionRatesPage />} />
          <Route path="/admin/freelancer-payouts" element={<FreelancerPayoutsPage />} />
          <Route path="/admin/freelancers" element={<FreelancersPage />} />
          <Route path="/admin/finance-dashboard" element={<FinanceDashboardPage />} />
        </Route>
        {/* Merged into Freelancers as a tab (2026-08-27). The old path is kept as a redirect so
            existing bookmarks and any link still pointing here land somewhere real. */}
        <Route path="/admin/freelancer-rates" element={<Navigate to="/admin/freelancers" replace />} />
        <Route element={<PlatformLayout permission="support" />}>
          <Route path="/admin/support-tools" element={<SupportToolsPage />} />
          <Route path="/admin/complaints" element={<ComplaintsPage />} />
          <Route path="/admin/visit-requests" element={<VisitRequestsPage />} />
        </Route>
        <Route element={<PlatformLayout permission="platform_staff_administration" />}>
          <Route path="/admin/platform-team" element={<PlatformTeamPage />} />
          <Route path="/admin/users/sentpo" element={<SentpoUsersPage />} />
          <Route path="/admin/users/imminow" element={<ImminowUsersPage />} />
          <Route path="/admin/notification-channel-config" element={<NotificationChannelConfigPage />} />
          <Route path="/admin/app-config" element={<AppConfigPage />} />
          <Route path="/admin/broadcast" element={<BroadcastPage />} />
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
