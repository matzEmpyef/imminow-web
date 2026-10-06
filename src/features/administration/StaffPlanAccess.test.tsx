import type { ReactNode } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The product owner's 2026-09-25 decisions on staff access (build reference 1.15/1.16, contract
// gate 5), as the console carries them:
//   1. Starter = full access: without the `designations` feature the invite asks for no access
//      rights and sends no designation — the server puts the invitee on protected "Full access";
//   2. a protected designation (Owner/Admin, Full access) is read-only everywhere, and says why;
//   3. both editors show ONLY `available_permissions`, in that order, and a save sends the whole
//      visible map — never a hidden key, whose stored tick the server keeps for after an upgrade;
//   4. Designations shows its count against the ceiling, the protected ones included.
vi.mock('@/queries/staff', () => ({
  useInviteEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(),
  useDisableEmployee: vi.fn(),
  useUpdateDesignation: vi.fn(),
  useCreateDesignation: vi.fn(),
  useDesignations: vi.fn(),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/features/auth/AppShell', () => ({ AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import {
  useDesignations,
  useDisableEmployee,
  useInviteEmployee,
  useUpdateDesignation,
  useUpdateEmployee,
} from '@/queries/staff'
import { useMyConsultancy } from '@/queries/consultancy'
import { useMe } from '@/queries/me'
import { meAnswered, staffMe } from '@/test/me'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { DesignationPermissionsModal } from './DesignationPermissionsModal'
import { EmployeeAccessModal } from './EmployeeAccessModal'
import { DesignationsPage } from './DesignationsPage'
import type { components } from '@/api/schema'

type Designation = components['schemas']['Designation']
type Employee = components['schemas']['Employee']

// A Business-like plan with Designations switched off for the test: manage_designations has no
// meaning, so the server leaves it out of the list.
const AVAILABLE = ['leads.view_own', 'leads.view_all', 'clients.view_own', 'staff.manage_employees']

const COUNSELLOR: Designation = {
  id: 'des-1',
  name: 'Counsellor',
  protected: false,
  permissions: { 'leads.view_own': true, 'leads.view_all': false, 'staff.manage_designations': true },
}
const FULL_ACCESS: Designation = {
  id: 'des-full',
  name: 'Full access',
  protected: true,
  permissions: { 'leads.view_own': true, 'leads.view_all': true, 'clients.view_own': true, 'staff.manage_employees': false },
}

function mutation(mutate: ReturnType<typeof vi.fn>, extra: Record<string, unknown> = {}) {
  return { mutate, isPending: false, isError: false, error: null, ...extra } as never
}

const inviteMutate = vi.fn()
const updateEmployeeMutate = vi.fn()
const updateDesignationMutate = vi.fn()

beforeEach(() => {
  inviteMutate.mockClear()
  updateEmployeeMutate.mockClear()
  updateDesignationMutate.mockClear()
  vi.mocked(useInviteEmployee).mockReturnValue(mutation(inviteMutate))
  vi.mocked(useUpdateEmployee).mockReturnValue(mutation(updateEmployeeMutate))
  vi.mocked(useDisableEmployee).mockReturnValue(mutation(vi.fn()))
  vi.mocked(useUpdateDesignation).mockReturnValue(mutation(updateDesignationMutate))
  vi.mocked(useMyConsultancy).mockReturnValue({
    data: { kind: 'consultancy', available_permissions: AVAILABLE, limits: { tags: 100, designations: 50, branches: 100 } },
  } as never)
  // The editors read the plan's visible permissions off `GET /me` (review F-036).
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true, available_permissions: AVAILABLE })))
})

function fillInvite(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/^First name/), { target: { value: 'Arjun' } })
  fireEvent.change(within(dialog).getByLabelText(/^Last name/), { target: { value: 'Rao' } })
  fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'arjun@example.com' } })
}

describe('Invite Employee on a plan without designations (Starter = full access)', () => {
  function renderStarterInvite() {
    render(
      <InviteEmployeeModal
        hasDesignations={false}
        designations={[FULL_ACCESS]}
        branches={[]}
        hasMultiBranch
        onClose={() => {}}
      />,
    )
    return screen.getByRole('dialog', { name: 'Invite Employee' })
  }

  it('asks for no designation and says what the invitee will get instead', () => {
    const dialog = renderStarterInvite()
    expect(within(dialog).queryByLabelText('Designation')).not.toBeInTheDocument()
    expect(within(dialog).getByText('Full access')).toBeInTheDocument()
  })

  it('sends no designation_id (nor a job title), so the server assigns Full access', () => {
    const dialog = renderStarterInvite()
    fillInvite(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))

    expect(inviteMutate).toHaveBeenCalledTimes(1)
    const body = inviteMutate.mock.calls[0][0]
    expect(body).toMatchObject({ first_name: 'Arjun', last_name: 'Rao', email: 'arjun@example.com' })
    expect(body).not.toHaveProperty('designation_id')
    expect(body).not.toHaveProperty('designation')
  })

  it("shows the server's refusal message (e.g. a 409) rather than a generic failure", () => {
    vi.mocked(useInviteEmployee).mockReturnValue(
      mutation(inviteMutate, { isError: true, error: new Error('Your plan allows 5 seats, and all 5 are taken.') }),
    )
    const dialog = renderStarterInvite()
    expect(within(dialog).getByText('Your plan allows 5 seats, and all 5 are taken.')).toBeInTheDocument()
  })

  it('still sends the picked designation where the plan has the feature', () => {
    render(
      <InviteEmployeeModal hasDesignations designations={[COUNSELLOR]} branches={[]} hasMultiBranch onClose={() => {}} />,
    )
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    fillInvite(dialog)
    fireEvent.change(within(dialog).getByLabelText('Designation'), { target: { value: 'des-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))
    expect(inviteMutate.mock.calls[0][0]).toMatchObject({ designation_id: 'des-1', designation: 'Counsellor' })
  })
})

describe('the designation editor', () => {
  function openEditor(designation: Designation) {
    render(<DesignationPermissionsModal designation={designation} />)
    fireEvent.click(screen.getByRole('button', { name: `View permissions for ${designation.name}` }))
    return screen.getByRole('dialog', { name: `${designation.name} — Permissions` })
  }

  it('shows only the permissions the plan gives meaning to, in the served order', () => {
    const dialog = openEditor(COUNSELLOR)
    const switches = within(dialog).getAllByRole('switch')
    expect(switches.map((s) => s.getAttribute('aria-label'))).toEqual([
      'View own leads',
      'View all leads',
      'View own clients',
      'Manage employees',
    ])
    expect(within(dialog).queryByRole('switch', { name: 'Manage designations' })).not.toBeInTheDocument()
  })

  it('saves the full visible map and never a hidden key', () => {
    const dialog = openEditor(COUNSELLOR)
    fireEvent.click(within(dialog).getByRole('switch', { name: 'View all leads' }))
    fireEvent.change(within(dialog).getByLabelText(/Reason for this change/), { target: { value: 'Team lead' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(updateDesignationMutate).toHaveBeenCalledTimes(1)
    expect(updateDesignationMutate.mock.calls[0][0]).toEqual({
      name: 'Counsellor',
      reason: 'Team lead',
      permissions: {
        'leads.view_own': true,
        'leads.view_all': true,
        'clients.view_own': false,
        'staff.manage_employees': false,
      },
    })
  })

  it('opens a protected designation read-only, saying why, with nothing to save', () => {
    const dialog = openEditor(FULL_ACCESS)
    expect(within(dialog).getByText("Full access is built in, so it can't be edited or deleted.")).toBeInTheDocument()
    for (const s of within(dialog).getAllByRole('switch')) expect(s).toBeDisabled()
    expect(within(dialog).getByRole('switch', { name: 'View all leads' })).toBeChecked()
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
  })
})

describe('the per-person access editor', () => {
  const EMPLOYEE: Employee = {
    id: 'emp-1',
    consultancy_id: 'c-1',
    user: { id: 'u-1', first_name: 'Priya', last_name: 'Sharma', email: 'priya@example.com' },
    designation_id: 'des-1',
    // A hidden override (set while the plan had Designations) — kept by the server, never shown.
    permission_overrides: { 'staff.manage_designations': false },
    active: true,
  } as unknown as Employee

  function openAccess() {
    render(
      <EmployeeAccessModal employee={EMPLOYEE} designations={[COUNSELLOR]} branches={[]} hasMultiBranch={false} hasDesignations />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Manage access for Priya Sharma' }))
    return screen.getByRole('dialog', { name: 'Priya Sharma — Access' })
  }

  it('lists only the available permissions and sends only visible overrides', () => {
    const dialog = openAccess()
    expect(within(dialog).queryByRole('switch', { name: 'Manage designations' })).not.toBeInTheDocument()
    // Opening it changes nothing — a hidden override doesn't count as an unsaved edit.
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('switch', { name: 'View all leads' }))
    fireEvent.change(within(dialog).getByLabelText(/Reason for this permission change/), { target: { value: 'Cover' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(updateEmployeeMutate.mock.calls[0][0]).toMatchObject({
      designation_id: 'des-1',
      permission_overrides: { 'leads.view_all': true },
      reason: 'Cover',
    })
    expect(updateEmployeeMutate.mock.calls[0][0].permission_overrides).not.toHaveProperty('staff.manage_designations')
  })
})

describe('the Designations page', () => {
  it('counts every designation against the ceiling and lets a protected one be viewed, not edited', () => {
    vi.mocked(useDesignations).mockReturnValue({
      data: [COUNSELLOR, FULL_ACCESS],
      isLoading: false,
      isError: false,
    } as never)
    render(<DesignationsPage />)

    expect(screen.getByRole('button', { name: 'New Designation' })).toBeEnabled()
    expect(screen.getByText('2 of 50 designations')).toBeInTheDocument()
    expect(screen.getByTitle("Full access is built in, so it can't be edited or deleted.")).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'View permissions for Full access' }))
    const dialog = screen.getByRole('dialog', { name: 'Full access — Permissions' })
    expect(within(dialog).getByRole('switch', { name: 'View own leads' })).toBeDisabled()
  })

  it('disables New Designation at the ceiling with the reason', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({ ...COUNSELLOR, id: `d-${i}`, name: `Role ${i}` }))
    vi.mocked(useDesignations).mockReturnValue({ data: many, isLoading: false, isError: false } as never)
    render(<DesignationsPage />)

    expect(screen.getByRole('button', { name: 'New Designation' })).toBeDisabled()
    expect(screen.getByText("You've reached the 50-designation limit.")).toBeInTheDocument()
  })
})
