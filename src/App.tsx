import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import { PlatformRoute } from '@/features/auth/PlatformRoute'
import { PermissionGate } from '@/features/auth/PermissionGate'
import { FeatureGate } from '@/features/auth/FeatureGate'
import { FreelancerRoute } from '@/features/auth/FreelancerRoute'
import { FEATURE_REGISTRY } from '@/lib/features'

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
  if (role === 'super_admin' || role === 'platform_staff') return <Navigate to="/admin/dashboard" replace />
  if (role === 'freelancer') return <Navigate to="/freelancer/dashboard" replace />
  return <Navigate to="/dashboard" replace />
}

function App() {
  return (
    <Suspense fallback={<Skeleton className="m-lg h-64 rounded-lg" />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/set-password/:token" element={<SetPasswordPage />} />
        <Route
          path="/account"
          element={
            <ProtectedRoute>
              <MyAccountPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/notifications"
          element={
            <ProtectedRoute>
              <NotificationsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/lead-pool"
          element={
            <ProtectedRoute>
              <LeadPoolPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/active-leads"
          element={
            <ProtectedRoute>
              <ActiveLeadsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/sales/leads/:id"
          element={
            <ProtectedRoute>
              <LeadConversationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients"
          element={
            <ProtectedRoute>
              <ClientsListPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/course-finder"
          element={
            <ProtectedRoute>
              <CourseFinderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/invoices"
          element={
            <ProtectedRoute>
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/receipts"
          element={
            <ProtectedRoute>
              <ReceiptsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:id"
          element={
            <ProtectedRoute>
              <ClientProfilePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/clients/:id/conversation"
          element={
            <ProtectedRoute>
              <ClientConversationPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/consultancy-profile"
          element={
            <ProtectedRoute>
              <PermissionGate permission="settings.edit_profile" area="Consultancy Management">
                <ConsultancyProfilePage />
              </PermissionGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/commission-details"
          element={
            <ProtectedRoute>
              <CommissionDetailsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/plan-templates"
          element={
            <ProtectedRoute>
              <PermissionGate permission="settings.manage_templates" area="Plan Templates">
                <PlanTemplatesPage />
              </PermissionGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/course-suggestions"
          element={
            <ProtectedRoute>
              <PermissionGate permission="settings.manage_course_suggestions" area="Course Suggestions">
                <CourseSuggestionsPage />
              </PermissionGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/forms"
          element={
            <ProtectedRoute>
              <FormsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/forms/:id"
          element={
            <ProtectedRoute>
              <FormBuilderPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/branches"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.multi_branch}>
                <PermissionGate permission="staff.manage_branches" area="Branches">
                  <BranchesPage />
                </PermissionGate>
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/employees"
          element={
            <ProtectedRoute>
              <PermissionGate permission="staff.manage_employees" area="Employees">
                <EmployeesPage />
              </PermissionGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/designations"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.designations}>
                <PermissionGate permission="staff.manage_designations" area="Designations">
                  <DesignationsPage />
                </PermissionGate>
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/phonebook"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.phonebook}>
                <PhonebookPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/document-library"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.document_library}>
                <DocumentLibraryPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/internal-messaging"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/internal-messaging/:id"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.internal_messaging}>
                <InternalMessagingPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/administration/audit-log"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.audit_log}>
                <AuditLogPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/activity"
          element={
            <ProtectedRoute>
              <FeatureGate feature={FEATURE_BY_KEY.activity_queue}>
                <ActivityPage />
              </FeatureGate>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/dashboard"
          element={
            <PlatformRoute>
              <SuperAdminDashboardPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/consultancies"
          element={
            <PlatformRoute permission="consultancy_approval">
              <ManageConsultanciesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/applicant-allocation"
          element={
            <PlatformRoute permission="consultancy_approval">
              <ApplicantAllocationPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/colleges"
          element={
            <PlatformRoute permission="catalog">
              <CollegesCoursesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/colleges/:id"
          element={
            <PlatformRoute permission="catalog">
              <CollegeDetailPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/course-suggestions-review"
          element={
            <PlatformRoute permission="catalog">
              <CourseSuggestionsReviewPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/countries"
          element={
            <PlatformRoute permission="catalog">
              <CountriesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/institutions"
          element={
            <PlatformRoute permission="catalog">
              <InstitutionsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/country-guides"
          element={
            <PlatformRoute permission="catalog">
              <CountryGuidesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/catalog-settings"
          element={
            <PlatformRoute permission="catalog">
              <CatalogSettingsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/ads"
          element={
            <PlatformRoute permission="ads">
              <AdsManagerPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/earn-rules"
          element={
            <PlatformRoute permission="points_coupons">
              <EarnRulesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/coupons"
          element={
            <PlatformRoute permission="points_coupons">
              <CouponsAdminPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/redemption-partners"
          element={
            <PlatformRoute permission="points_coupons">
              <RedemptionPartnersPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/webinars"
          element={
            <PlatformRoute permission="content">
              <WebinarsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/quiz"
          element={
            <PlatformRoute permission="content">
              <QuizAdminPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/physical-meetings"
          element={
            <PlatformRoute permission="content">
              <PhysicalMeetingsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/jobs"
          element={
            <PlatformRoute permission="content">
              <JobsAdminPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/blog"
          element={
            <PlatformRoute permission="content">
              <BlogAdminPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/commission-rates"
          element={
            <PlatformRoute permission="finance">
              <CommissionRatesPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/freelancer-payouts"
          element={
            <PlatformRoute permission="finance">
              <FreelancerPayoutsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/freelancers"
          element={
            <PlatformRoute permission="finance">
              <FreelancersPage />
            </PlatformRoute>
          }
        />
        {/* Merged into Freelancers as a tab (2026-08-27). The old path is kept as a redirect so
            existing bookmarks and any link still pointing here land somewhere real. */}
        <Route path="/admin/freelancer-rates" element={<Navigate to="/admin/freelancers" replace />} />
        <Route
          path="/admin/finance-dashboard"
          element={
            <PlatformRoute permission="finance">
              <FinanceDashboardPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/support-tools"
          element={
            <PlatformRoute permission="support">
              <SupportToolsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/complaints"
          element={
            <PlatformRoute permission="support">
              <ComplaintsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/visit-requests"
          element={
            <PlatformRoute permission="support">
              <VisitRequestsPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/platform-team"
          element={
            <PlatformRoute permission="platform_staff_administration">
              <PlatformTeamPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/notification-channel-config"
          element={
            <PlatformRoute permission="platform_staff_administration">
              <NotificationChannelConfigPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/broadcast"
          element={
            <PlatformRoute permission="platform_staff_administration">
              <BroadcastPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/admin/audit-log-platform"
          element={
            <PlatformRoute permission="platform_staff_administration">
              <PlatformAuditLogPage />
            </PlatformRoute>
          }
        />
        <Route
          path="/freelancer/dashboard"
          element={
            <FreelancerRoute>
              <FreelancerDashboardPage />
            </FreelancerRoute>
          }
        />
        <Route path="*" element={<DefaultRedirect />} />
      </Routes>
    </Suspense>
  )
}

export default App
