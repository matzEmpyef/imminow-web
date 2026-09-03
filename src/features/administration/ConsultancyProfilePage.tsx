import { useState } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useMyConsultancy } from '@/queries/consultancy'
import { usePermission } from '@/lib/permissions'
import { PartnerCollegesPanel } from './PartnerCollegesPanel'
import { ProfileTab } from './ConsultancyProfileTab'
import { SubscriptionTab } from './ConsultancySubscriptionTab'
import { CommissionRatesTab } from './ConsultancyCommissionRatesTab'
import { AllocationTab } from './ConsultancyAllocationTab'
import { TagManagementTab } from './ConsultancyTagManagementTab'
import { IncomingTransfersTab } from './ConsultancyIncomingTransfersTab'

const TABS = [
  'Profile',
  'Subscription',
  'Partner Colleges',
  'Commission Rates',
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
  const [activeTab, setActiveTab] = useState<Tab>('Profile')
  // Incoming Transfers is about accepting cases, not settings — its own permission gate.
  const canAcceptTransfers = usePermission('clients.transfer_applicant')
  const visibleTabs = TABS.filter((tab) => tab !== 'Incoming Transfers' || canAcceptTransfers)

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
        {activeTab === 'Partner Colleges' && <PartnerCollegesPanel />}
        {activeTab === 'Commission Rates' && <CommissionRatesTab consultancy={consultancy.data} />}
        {activeTab === 'Allocation Rule' && <AllocationTab />}
        {activeTab === 'Tag Management' && <TagManagementTab />}
        {activeTab === 'Incoming Transfers' && canAcceptTransfers && <IncomingTransfersTab />}
      </div>
    </AppShell>
  )
}
