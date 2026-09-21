import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The primary branch became a CHOICE on 2026-09-21 (product owner: the invite and the edit both
// take it explicitly, "to avoid the confusion of it being decided by tick order"). It decides which
// branch every one of this consultant's leads and clients is filed under — and so which branch
// their revenue is attributed to — which was never safe to read off the order someone happened to
// tick boxes in. The access modal printed "(primary)" as a read-only LABEL for that non-decision.
//
// What is pinned here:
//   1. the radio is the control, and what it sends is `primary_branch_id`;
//   2. it can only be one of the branches ticked for that person — which is the server's own 422 —
//      and unticking the current primary moves it the way the server's fallback would;
//   3. omitting it entirely still means "first covered branch", so a single-branch consultancy and
//      an invite nobody touched the branch list on both behave exactly as before.
vi.mock('@/queries/staff', () => ({
  useInviteEmployee: vi.fn(),
  useUpdateEmployee: vi.fn(),
  useDisableEmployee: vi.fn(),
  useEmployees: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useDisableEmployee, useEmployees, useInviteEmployee, useUpdateEmployee } from '@/queries/staff'
import { InviteEmployeeModal } from './InviteEmployeeModal'
import { EmployeeAccessModal } from './EmployeeAccessModal'
import { primaryBranchError, toggleBranch } from './branchAccess'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']
type Employee = components['schemas']['Employee']
type Designation = components['schemas']['Designation']

const MUMBAI = 'branch-mumbai'
const DELHI = 'branch-delhi'
const BRANCHES: Branch[] = [
  { id: MUMBAI, name: 'Head Office — Mumbai', address: '14th Floor, Lotus Corporate Park', active: true },
  { id: DELHI, name: 'North Campus — Delhi', address: 'B-42, Connaught Place', active: true },
]
const DESIGNATIONS: Designation[] = [
  { id: 'des-1', name: 'Counsellor', permissions: {} } as Designation,
]

function mutation(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false, isError: false, error: null } as never
}

const inviteMutate = vi.fn()
const updateMutate = vi.fn()

beforeEach(() => {
  inviteMutate.mockClear()
  updateMutate.mockClear()
  vi.mocked(useInviteEmployee).mockReturnValue(mutation(inviteMutate))
  vi.mocked(useUpdateEmployee).mockReturnValue(mutation(updateMutate))
  vi.mocked(useDisableEmployee).mockReturnValue(mutation(vi.fn()))
  vi.mocked(useEmployees).mockReturnValue({ data: { items: [] }, isLoading: false, isError: false } as never)
})

function renderInvite() {
  return render(
    <InviteEmployeeModal
      hasDesignations
      designations={DESIGNATIONS}
      branches={BRANCHES}
      hasMultiBranch
      onClose={() => {}}
    />,
  )
}

function fillInvite(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/^First name/), { target: { value: 'Arjun' } })
  fireEvent.change(within(dialog).getByLabelText(/^Last name/), { target: { value: 'Rao' } })
  fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'arjun@example.com' } })
}

describe('the invite: picking a primary branch among the ones ticked', () => {
  it('sends nothing about branches when none is ticked, so the server default stands', () => {
    renderInvite()
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    fillInvite(dialog)
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))

    expect(inviteMutate).toHaveBeenCalledTimes(1)
    const body = inviteMutate.mock.calls[0][0]
    expect(body).not.toHaveProperty('branch_ids')
    expect(body).not.toHaveProperty('primary_branch_id')
  })

  it('makes the first branch ticked the primary, which is the behaviour it had before', () => {
    renderInvite()
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    fillInvite(dialog)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'North Campus — Delhi' }))
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))

    expect(inviteMutate.mock.calls[0][0]).toMatchObject({
      branch_ids: [DELHI],
      primary_branch_id: DELHI,
    })
  })

  it('lets the primary be the SECOND of two ticked branches — the whole point of the control', () => {
    renderInvite()
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    fillInvite(dialog)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Head Office — Mumbai' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'North Campus — Delhi' }))
    fireEvent.click(within(dialog).getByRole('radio', { name: /Make North Campus — Delhi the primary branch/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite' }))

    expect(inviteMutate.mock.calls[0][0]).toMatchObject({
      branch_ids: [MUMBAI, DELHI],
      primary_branch_id: DELHI,
    })
  })

  it('keeps a branch nobody ticked from being made primary — the server refuses that 422', () => {
    renderInvite()
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    fillInvite(dialog)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Head Office — Mumbai' }))

    expect(within(dialog).getByRole('radio', { name: /Make North Campus — Delhi the primary branch/ })).toBeDisabled()
  })

  it('shows no branch picker at all when the consultancy has one branch', () => {
    render(
      <InviteEmployeeModal
        hasDesignations
        designations={DESIGNATIONS}
        branches={[BRANCHES[0]]}
        hasMultiBranch
        onClose={() => {}}
      />,
    )
    expect(screen.queryByRole('checkbox', { name: 'Head Office — Mumbai' })).not.toBeInTheDocument()
  })
})

describe('the access modal: "(primary)" was a label, now it is the control', () => {
  const EMPLOYEE: Employee = {
    id: 'emp-1',
    consultancy_id: 'c-1',
    user: { id: 'u-1', first_name: 'Priya', last_name: 'Sharma', email: 'priya@example.com' },
    branch_ids: [MUMBAI, DELHI],
    primary_branch_id: MUMBAI,
    designation_id: 'des-1',
    active: true,
  } as Employee

  function openModal(employee: Employee = EMPLOYEE) {
    render(
      <EmployeeAccessModal
        employee={employee}
        designations={DESIGNATIONS}
        branches={BRANCHES}
        hasMultiBranch
        hasDesignations
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Manage access for Priya Sharma' }))
    return screen.getByRole('dialog', { name: 'Priya Sharma — Access' })
  }

  it('starts on the stored primary and saves a change to the other branch', () => {
    const dialog = openModal()
    expect(within(dialog).getByRole('radio', { name: /Make Head Office — Mumbai the primary/ })).toBeChecked()

    fireEvent.click(within(dialog).getByRole('radio', { name: /Make North Campus — Delhi the primary/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const body = updateMutate.mock.calls[0][0]
    expect(body).toMatchObject({ branch_ids: [MUMBAI, DELHI], primary_branch_id: DELHI })
    // Branch coverage is not a permission change, so it must not demand the audit reason that
    // designation and override edits do — and it must not SEND the two fields either. The server
    // reads their mere presence as a permission change and refuses the call 400 without a reason,
    // which is exactly how this failed the first time it was tried against the real API.
    expect(body.reason).toBeUndefined()
    expect(body).not.toHaveProperty('designation_id')
    expect(body).not.toHaveProperty('permission_overrides')
  })

  it('SAVES a branch-only change at all — the button used to stay disabled for one', () => {
    // `dirty` meant "sensitive change" and gated both the reason field AND the Save button, so
    // ticking a branch and pressing Save did nothing. Found while making the primary a control:
    // a control nobody can submit is not a control.
    const dialog = openModal()
    const save = screen.getByRole('button', { name: 'Save Changes' })
    expect(save).toBeDisabled()

    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'North Campus — Delhi' }))
    expect(save).toBeEnabled()
    fireEvent.click(save)
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ branch_ids: [MUMBAI], primary_branch_id: MUMBAI })
  })

  it('moves the primary to the first branch still ticked when the primary itself is unticked', () => {
    const dialog = openModal()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Head Office — Mumbai' }))

    expect(within(dialog).getByRole('radio', { name: /Make North Campus — Delhi the primary/ })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ branch_ids: [DELHI], primary_branch_id: DELHI })
  })

  it('falls back to branch_ids[0] for an employee who never had one chosen', () => {
    const dialog = openModal({ ...EMPLOYEE, primary_branch_id: undefined } as Employee)
    expect(within(dialog).getByRole('radio', { name: /Make Head Office — Mumbai the primary/ })).toBeChecked()
  })

  it('opens for the branch half alone on an account without the designations feature', () => {
    // Branches moved to Starter; designations did not. This modal is the only place an employee's
    // branches can be changed, so gating the whole of it on `designations` left such an account
    // with branches it could put nobody in.
    render(
      <EmployeeAccessModal
        employee={EMPLOYEE}
        designations={[]}
        branches={BRANCHES}
        hasMultiBranch
        hasDesignations={false}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Manage access for Priya Sharma' }))
    const dialog = screen.getByRole('dialog', { name: 'Priya Sharma — Access' })

    expect(within(dialog).getByRole('checkbox', { name: 'Head Office — Mumbai' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText('Access Rights')).not.toBeInTheDocument()
    expect(within(dialog).queryByText('Individual permission overrides')).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('radio', { name: /Make North Campus — Delhi the primary/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    const body = updateMutate.mock.calls[0][0]
    expect(body).toMatchObject({ primary_branch_id: DELHI })
    // Nothing about designations is sent, because nothing about them was on screen to send.
    expect(body).not.toHaveProperty('designation_id')
    expect(body).not.toHaveProperty('permission_overrides')
  })
})

describe('the rules behind the control', () => {
  it('never yields a primary outside the ticked set', () => {
    const order = [MUMBAI, DELHI]
    let access = { branchIds: [] as string[], primaryId: '' }
    access = toggleBranch(access, DELHI, order)
    expect(access).toEqual({ branchIds: [DELHI], primaryId: DELHI })

    // Ticked second but listed first — the branch list's order wins, not the click order, so the
    // array sent matches what is on screen top to bottom.
    access = toggleBranch(access, MUMBAI, order)
    expect(access).toEqual({ branchIds: [MUMBAI, DELHI], primaryId: DELHI })

    access = toggleBranch(access, DELHI, order)
    expect(access).toEqual({ branchIds: [MUMBAI], primaryId: MUMBAI })

    access = toggleBranch(access, MUMBAI, order)
    expect(access).toEqual({ branchIds: [], primaryId: '' })
  })

  it('reports the invalid pairing the server refuses, and stays quiet when nobody covers a branch', () => {
    expect(primaryBranchError({ branchIds: [], primaryId: '' })).toBeUndefined()
    expect(primaryBranchError({ branchIds: [MUMBAI], primaryId: MUMBAI })).toBeUndefined()
    expect(primaryBranchError({ branchIds: [MUMBAI], primaryId: '' })).toBe('Choose which branch is primary.')
    expect(primaryBranchError({ branchIds: [MUMBAI], primaryId: DELHI })).toBe(
      'The primary branch has to be one of the ticked branches.',
    )
  })
})
