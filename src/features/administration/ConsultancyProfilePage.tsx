import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AppShell } from '@/features/auth/AppShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useMyConsultancy } from '@/queries/consultancy'
import { usePermission } from '@/lib/permissions'
import { PartnerCollegesPanel } from './PartnerCollegesPanel'
import { ProfileTab } from './ConsultancyProfileTab'
import { SubscriptionTab } from './ConsultancySubscriptionTab'
import { SecurityTab } from './ConsultancySecurityTab'
import { useAuthStore } from '@/stores/authStore'
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
    searchParams.get('tab') === 'partner-colleges' ? 'Partner Colleges' : 'Profile',
  )
  // Incoming Transfers is about accepting cases, not settings — its own permission gate.
  const canAcceptTransfers = usePermission('clients.transfer_applicant')
  const isConsultancyAdmin = useAuthStore((s) => s.user?.role === 'consultancy_admin')
  const visibleTabs = TABS.filter(
    (tab) => (tab !== 'Incoming Transfers' || canAcceptTransfers) && (tab !== 'Security' || isConsultancyAdmin),
  )

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
        <ErrorState message="Could not load the consultancy profile." onRetry={() => consultancy.refetch()} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Consultancy Management</h1>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Profile' && <ProfileTab consultancy={consultancy.data} />}
        {activeTab === 'Subscription' && <SubscriptionTab consultancy={consultancy.data} />}
        {activeTab === 'Security' && isConsultancyAdmin && <SecurityTab consultancy={consultancy.data} />}
        {/* `kind`, not a feature flag (INSTITUTE_ACCOUNT_PLAN D13): an institute's partner
            colleges are itself and only itself, so the panel renders read-only. A
            `partner_colleges` entitlement key was deliberately NOT registered — it would have
            handed a Super Admin a switch to turn this screen off for an ordinary consultancy,
            where their commission terms live. */}
        {activeTab === 'Partner Colleges' && <PartnerCollegesPanel kind={consultancy.data.kind} />}
        {activeTab === 'Platform Commission Rates' && <CommissionRatesTab consultancy={consultancy.data} />}
        {activeTab === 'Allocation Rule' && (
          <AllocationTab enabled={Boolean(consultancy.data.features?.allocation_rule)} />
        )}
        {activeTab === 'Tag Management' && <TagManagementTab />}
        {activeTab === 'Incoming Transfers' && canAcceptTransfers && <IncomingTransfersTab />}
      </div>
    </AppShell>
  )
}
