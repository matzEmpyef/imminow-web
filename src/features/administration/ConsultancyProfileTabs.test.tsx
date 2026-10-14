import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T2-07 and fault check 9a: a college is not offered the consultancy-only tabs, and Starter is not
// offered Tag Management.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
const world = vi.hoisted(() => ({ institute: false, tags: true }))
vi.mock('@/queries/consultancy', () => ({
  useMyConsultancy: () => ({ data: { id: 'c1', kind: 'consultancy', features: {} }, isLoading: false, isError: false }),
}))
vi.mock('@/lib/accountWords', () => ({ useAccountWords: () => ({ isInstitute: world.institute }) }))
vi.mock('@/lib/features', () => ({ useFeature: (key: string) => (key === 'tags' ? world.tags : false) }))
vi.mock('@/lib/permissions', () => ({
  usePermission: () => true,
  usePermissionChecker: () => ({ isAdmin: true }),
}))

vi.mock('./PartnerCollegesPanel', () => ({ PartnerCollegesPanel: () => <p>Partner panel</p> }))
vi.mock('./ConsultancyProfileTab', () => ({ ProfileTab: () => <p>Profile panel</p> }))
vi.mock('./ConsultancySubscriptionTab', () => ({ SubscriptionTab: () => <p>Subscription panel</p> }))
vi.mock('./ConsultancySecurityTab', () => ({ SecurityTab: () => null }))
vi.mock('./ConsultancyCommissionRatesTab', () => ({ CommissionRatesTab: () => null }))
vi.mock('./ConsultancyAllocationTab', () => ({ AllocationTab: () => null }))
vi.mock('./ConsultancyTagManagementTab', () => ({ TagManagementTab: () => null }))
vi.mock('./ConsultancyIncomingTransfersTab', () => ({ IncomingTransfersTab: () => null }))

import { ConsultancyProfilePage } from './ConsultancyProfilePage'

function show(address = '/administration/consultancy-profile') {
  render(
    <MemoryRouter initialEntries={[address]}>
      <ConsultancyProfilePage />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  world.institute = false
  world.tags = true
})

describe('Consultancy Management tabs', () => {
  it('offers a consultancy on a plan with tags every tab', () => {
    show()
    for (const name of ['Partner Colleges', 'Allocation Rule', 'Tag Management', 'Incoming Transfers']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
    expect(screen.getByRole('heading', { name: 'Consultancy Management' })).toBeInTheDocument()
  })

  it('hides Tag Management on Starter', () => {
    world.tags = false
    show()
    expect(screen.queryByRole('button', { name: 'Tag Management' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Allocation Rule' })).toBeInTheDocument()
  })

  it('hides Allocation Rule, Partner Colleges and Incoming Transfers from a college, and lands on Profile', () => {
    world.institute = true
    show('/administration/consultancy-profile?tab=partner-colleges')
    expect(screen.getByRole('heading', { name: 'Institute Management' })).toBeInTheDocument()
    for (const name of ['Partner Colleges', 'Allocation Rule', 'Incoming Transfers']) {
      expect(screen.queryByRole('button', { name })).not.toBeInTheDocument()
    }
    expect(screen.getByText('Profile panel')).toBeInTheDocument()
    expect(screen.queryByText('Partner panel')).not.toBeInTheDocument()
  })

  // `plan_downgraded` opens the subscription, where the new plan is shown.
  it('opens on the subscription when the address asks for it', () => {
    show('/administration/consultancy-profile?tab=subscription')
    expect(screen.getByText('Subscription panel')).toBeInTheDocument()
    expect(screen.queryByText('Profile panel')).not.toBeInTheDocument()
  })
})
