import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The two page-level gates share one contract the audit leaned on: hold a skeleton while the
// answer is unknown, show an ERROR (never a denial) when the check itself failed, deny only on a
// real "no", and otherwise render the page. A regression to "false while loading == denied"
// flashes "you don't have access" at people who do — the bug PermissionGate was written to fix.
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-testid="shell">{children}</div> }))
vi.mock('@/lib/features', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/features')>()),
  useFeatures: vi.fn(),
}))
vi.mock('@/lib/permissions', () => ({ usePermissionChecker: vi.fn() }))
// FeatureGate's locked card now asks who is reading it (console review H14, 2026-09-13): the
// admin who can actually upgrade gets a link, everyone else keeps the "ask your admin" copy.
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () => ({
    isInstitute: false,
    org: 'consultancy',
    Org: 'Consultancy',
    person: 'consultant',
    Person: 'Consultant',
    wholeLabel: 'Whole Consultancy',
    adminLabel: 'Consultancy Admin',
  }),
}))

import { useFeatures, FEATURE_REGISTRY } from '@/lib/features'
import { usePermissionChecker } from '@/lib/permissions'
import { FeatureGate } from './FeatureGate'
import { PermissionGate } from './PermissionGate'

const phonebook = FEATURE_REGISTRY.find((f) => f.key === 'phonebook')!
const mockedFeatures = vi.mocked(useFeatures)
const mockedChecker = vi.mocked(usePermissionChecker)

describe('FeatureGate', () => {
  // The locked card carries a Link now, so every render needs a router around it.
  const renderGate = () =>
    render(
      <MemoryRouter>
        <FeatureGate feature={phonebook}>
          <p>Phonebook page</p>
        </FeatureGate>
      </MemoryRouter>,
    )

  beforeEach(() => {
    // Default: an ordinary consultant, who keeps the "ask your admin" copy.
    mockedChecker.mockReturnValue({
      can: () => false,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof usePermissionChecker>)
  })

  it('renders the page when the flag is on', () => {
    mockedFeatures.mockReturnValue({ data: { phonebook: true }, isLoading: false, isError: false })
    renderGate()
    expect(screen.getByText('Phonebook page')).toBeInTheDocument()
  })

  it('names the plan that includes the feature when the flag is off', () => {
    mockedFeatures.mockReturnValue({ data: { phonebook: false }, isLoading: false, isError: false })
    renderGate()
    expect(screen.queryByText('Phonebook page')).not.toBeInTheDocument()
    expect(screen.getByText(/isn't included in your current plan/)).toBeInTheDocument()
    expect(screen.getByText(/part of the Business plan/)).toBeInTheDocument()
    expect(screen.getByText(/Ask your consultancy admin to upgrade/)).toBeInTheDocument()
  })

  // H14: the admin holds the upgrade, so telling them to go and ask themselves is a dead end.
  it('routes the admin to Subscription instead of telling them to ask an admin', () => {
    mockedFeatures.mockReturnValue({ data: { phonebook: false }, isLoading: false, isError: false })
    mockedChecker.mockReturnValue({
      can: (key: string) => key === 'settings.edit_profile',
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as ReturnType<typeof usePermissionChecker>)
    renderGate()
    expect(screen.queryByText(/Ask your consultancy admin/)).not.toBeInTheDocument()
    const link = screen.getByRole('link', { name: /Consultancy Management/ })
    expect(link).toHaveAttribute('href', '/administration/consultancy-profile')
  })

  it('holds a skeleton while loading and shows an error — not a denial — when the check failed', () => {
    mockedFeatures.mockReturnValue({ data: {}, isLoading: true, isError: false })
    const { rerender } = renderGate()
    expect(screen.queryByText(/isn't included/)).not.toBeInTheDocument()
    expect(screen.queryByText('Phonebook page')).not.toBeInTheDocument()

    mockedFeatures.mockReturnValue({ data: {}, isLoading: false, isError: true })
    rerender(
      <MemoryRouter>
        <FeatureGate feature={phonebook}>
          <p>Phonebook page</p>
        </FeatureGate>
      </MemoryRouter>,
    )
    expect(screen.getByText("Could not check your plan's features.")).toBeInTheDocument()
    expect(screen.queryByText(/isn't included/)).not.toBeInTheDocument()
  })
})

describe('PermissionGate', () => {
  function checker(overrides: Partial<ReturnType<typeof usePermissionChecker>>) {
    mockedChecker.mockReturnValue({ can: () => false, isLoading: false, isError: false, refetch: vi.fn(), ...overrides } as ReturnType<typeof usePermissionChecker>)
  }

  it('renders the page when the permission is granted', () => {
    checker({ can: (key: string) => key === 'staff.manage_employees' })
    render(<PermissionGate permission="staff.manage_employees" area="Staff Administration"><p>Employees</p></PermissionGate>)
    expect(screen.getByText('Employees')).toBeInTheDocument()
  })

  it('denies with the area named when the permission is genuinely missing', () => {
    checker({ can: () => false })
    render(<PermissionGate permission="staff.manage_employees" area="Staff Administration"><p>Employees</p></PermissionGate>)
    expect(screen.queryByText('Employees')).not.toBeInTheDocument()
    expect(screen.getByText("You don't have access to Staff Administration.")).toBeInTheDocument()
  })

  it('never invents a denial: skeleton while loading, error with retry when the lookup failed', () => {
    checker({ isLoading: true })
    const { rerender } = render(<PermissionGate permission="x" area="X"><p>Page</p></PermissionGate>)
    expect(screen.queryByText(/don't have access/)).not.toBeInTheDocument()

    const refetch = vi.fn()
    checker({ isError: true, refetch })
    rerender(<PermissionGate permission="x" area="X"><p>Page</p></PermissionGate>)
    expect(screen.getByText('Could not check your permissions.')).toBeInTheDocument()
    expect(screen.queryByText(/don't have access/)).not.toBeInTheDocument()
  })
})
