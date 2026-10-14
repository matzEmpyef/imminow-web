import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useMyConsultancy } from '@/queries/consultancy'
import { useAccountWords } from '@/lib/accountWords'
import { usePermission, usePermissionChecker } from '@/lib/permissions'
import { useFeature } from '@/lib/features'
import { PartnerCollegesPanel } from './PartnerCollegesPanel'
import { ProfileTab } from './ConsultancyProfileTab'
import { SubscriptionTab } from './ConsultancySubscriptionTab'
import { SecurityTab } from './ConsultancySecurityTab'
import { CommissionRatesTab } from './ConsultancyCommissionRatesTab'
import { AllocationTab } from './ConsultancyAllocationTab'
import { TagManagementTab } from './ConsultancyTagManagementTab'
import { IncomingTransfersTab } from './ConsultancyIncomingTransfersTab'

const TABS = [
  'Profile',
  'Subscription',
  // Consultancy-admin only (review L15, 2026-09-12): who must use two-factor authentication.
  'Security',
  'Partner Colleges',
  // Renamed from "Commission Rates" (user, 2026-09-10): these are the rates immiNow charges the
  // consultancy, not the commission a college pays it (that lives on Partner Colleges).
  'Platform Commission Rates',
  'Allocation Rule',
  'Tag Management',
  'Incoming Transfers',
] as const
type Tab = (typeof TABS)[number]

// Was three separate pages/sidebar links (Consultancy Profile, Allocation Rules, Tag Management)
// — merged into one tabbed page (user-requested), same in-component tab-state convention
// ClientProfilePage.tsx already uses (no URL sync per tab).

export function ConsultancyProfilePage() {
  const consultancy = useMyConsultancy()
  // ?tab=partner-colleges — where the "New college" notification lands (2026-09-11).
  const [searchParams] = useSearchParams()
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('tab') === 'partner-colleges'
      ? 'Partner Colleges'
      : // `plan_downgraded` lands on the subscription, where the new plan is shown.
        searchParams.get('tab') === 'subscription'
        ? 'Subscription'
        : 'Profile',
  )
  // Incoming Transfers is about accepting cases, not settings — its own permission gate.
  const canAcceptTransfers = usePermission('clients.transfer_applicant')
  // The Owner/Admin, as the server sees them (`staff.is_admin`, review F-036) — not the role.
  const { isAdmin: isConsultancyAdmin } = usePermissionChecker()
  // H3 (2026-09-13): an institute is paid by its own applicants, so immiNow charges it no
  // per-case commission — there are no platform rates for it to read.
  const { isInstitute } = useAccountWords()
  // Tags are a Business feature (fault check 9a): Starter has no Tag Management tab.
  const hasTags = useFeature('tags')
  // What only a consultancy does is not offered to a college (T2-07, owner's ruling 133): it has no
  // allocation rule to set, its one Partner College is itself, and nobody transfers cases to it.
  const consultancyOnly: Tab[] = ['Allocation Rule', 'Partner Colleges', 'Incoming Transfers']
  const visibleTabs = TABS.filter(
    (tab) =>
      (tab !== 'Incoming Transfers' || canAcceptTransfers) &&
      (tab !== 'Security' || isConsultancyAdmin) &&
      (tab !== 'Platform Commission Rates' || !isInstitute) &&
      (tab !== 'Tag Management' || hasTags) &&
      !(isInstitute && consultancyOnly.includes(tab)),
  )

  // An address that names a tab this account does not have (an institute opening Partner Colleges)
  // lands on Profile instead of an empty page.
  const shownTab: Tab = visibleTabs.includes(activeTab) ? activeTab : 'Profile'

  if (consultancy.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (consultancy.isError || !consultancy.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load the consultancy profile." onRetry={() => consultancy.refetch()} error={consultancy.error} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        {/* The sidebar keeps "Consultancy Management" (a proper name for the area); the page
            itself says what the account actually is (H2, 2026-09-13). */}
        <h1 className="text-h1 text-text-primary">{isInstitute ? 'Institute' : 'Consultancy'} Management</h1>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              type="button"
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                shownTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {shownTab === 'Profile' && <ProfileTab consultancy={consultancy.data} />}
        {shownTab === 'Subscription' && <SubscriptionTab consultancy={consultancy.data} />}
        {shownTab === 'Security' && isConsultancyAdmin && <SecurityTab consultancy={consultancy.data} />}
        {/* `kind`, not a feature flag (INSTITUTE_ACCOUNT_PLAN D13): an institute's partner
            colleges are itself and only itself, so the panel renders read-only. A
            `partner_colleges` entitlement key was deliberately NOT registered — it would have
            handed a Super Admin a switch to turn this screen off for an ordinary consultancy,
            where their commission terms live. */}
        {shownTab === 'Partner Colleges' && <PartnerCollegesPanel kind={consultancy.data.kind} />}
        {shownTab === 'Platform Commission Rates' && !isInstitute && (
          <CommissionRatesTab consultancy={consultancy.data} />
        )}
        {shownTab === 'Allocation Rule' && (
          <AllocationTab enabled={Boolean(consultancy.data.features?.allocation_rule)} />
        )}
        {shownTab === 'Tag Management' && <TagManagementTab />}
        {shownTab === 'Incoming Transfers' && canAcceptTransfers && (
          <IncomingTransfersTab isInstitute={isInstitute} />
        )}
      </div>
    </AppShell>
  )
}
