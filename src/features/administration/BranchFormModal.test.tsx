import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The branch location (product owner, 2026-09-21): a branch stopped being a name and a free-text
// address and gained country / state / district / city, because the consultancy list a student sees
// is ordered by how near a branch is to them — same city, then district, then state, then country.
//
// The rules worth pinning here are the ones a later refactor would quietly break:
//
//   1. a district is REQUIRED for a branch in India, and the form blocks the save itself rather
//      than spending a round trip collecting the server's 422;
//   2. a branch with NO location at all stays editable and saveable — every branch created before
//      this feature is one of those, and the location is deliberately not sent on a PATCH that did
//      not change it, so an unrelated rename can never trip the server's four-field check;
//   3. a level is dropped when the level above it changes, so a stale district never reaches the
//      server attached to a state that has never heard of it.
vi.mock('@/queries/staff', () => ({ useCreateBranch: vi.fn(), useUpdateBranch: vi.fn() }))
vi.mock('@/queries/countries', () => ({ useCountries: vi.fn(), useStates: vi.fn(), useDistricts: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useCreateBranch, useUpdateBranch } from '@/queries/staff'
import { useCountries, useDistricts, useStates } from '@/queries/countries'
import { BranchFormModal } from './BranchFormModal'
import type { components } from '@/api/schema'

type Branch = components['schemas']['Branch']

const mockedCreate = vi.mocked(useCreateBranch)
const mockedUpdate = vi.mocked(useUpdateBranch)
const mockedCountries = vi.mocked(useCountries)
const mockedStates = vi.mocked(useStates)
const mockedDistricts = vi.mocked(useDistricts)

const KERALA_DISTRICTS = [
  { code: null, name: 'Ernakulam', active: true },
  { code: null, name: 'Thrissur', active: true },
]

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...overrides } as never
}

function mutation(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false, isError: false, error: null } as never
}

const createMutate = vi.fn()
const updateMutate = vi.fn()

beforeEach(() => {
  createMutate.mockClear()
  updateMutate.mockClear()
  mockedCreate.mockReturnValue(mutation(createMutate))
  mockedUpdate.mockReturnValue(mutation(updateMutate))
  mockedCountries.mockReturnValue(query(['Canada', 'India']))
  mockedStates.mockImplementation((country?: string) =>
    query(
      country === 'India'
        ? [{ name: 'Kerala' }, { name: 'Maharashtra' }]
        : country === 'Canada'
          ? [{ name: 'Ontario' }]
          : [],
    ),
  )
  // Only India has districts — every other country's state answers 200 with an empty array, which
  // is a fact about the country and not a failure.
  mockedDistricts.mockImplementation((country?: string, state?: string) =>
    query(country === 'India' && state === 'Kerala' ? KERALA_DISTRICTS : []),
  )
})

function fillRequired(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'Kochi Office' } })
  fireEvent.change(within(dialog).getByLabelText(/^Street address/), { target: { value: '2nd Floor, MG Road' } })
}

describe('the branch form: a district is required in India', () => {
  it('blocks the save itself instead of letting the server answer 422', () => {
    render(<BranchFormModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Branch' })
    fillRequired(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Kerala' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(createMutate).not.toHaveBeenCalled()
    expect(
      within(dialog).getByText('A branch in India needs a district — students are matched to the nearest branch by it.'),
    ).toBeInTheDocument()
  })

  it('lets the same branch through once a district is picked, and sends all four levels', () => {
    render(<BranchFormModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Branch' })
    fillRequired(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Kerala' } })
    fireEvent.change(within(dialog).getByLabelText(/^District/), { target: { value: 'Ernakulam' } })
    fireEvent.change(within(dialog).getByLabelText(/^City/), { target: { value: 'Kochi' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      name: 'Kochi Office',
      address: '2nd Floor, MG Road',
      country: 'India',
      state: 'Kerala',
      district: 'Ernakulam',
      city: 'Kochi',
    })
  })

  it('does not ask a branch OUTSIDE India for a district — the picker says so and the save goes through', () => {
    render(<BranchFormModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Branch' })
    fillRequired(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'Canada' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Ontario' } })

    const district = within(dialog).getByLabelText(/^District/)
    expect(district).toBeDisabled()
    // Not "Select…" and not a blank — a disabled empty picker with no words on it reads as
    // something still loading, or as a field somebody forgot to fill.
    expect(within(district).getByRole('option')).toHaveTextContent('Not used in Canada')

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toMatchObject({ country: 'Canada', state: 'Ontario', district: null })
  })

  it('refuses a country with no state, which the server refuses too', () => {
    render(<BranchFormModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Branch' })
    fillRequired(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'Canada' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create' }))

    expect(createMutate).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Pick a state — a country on its own is refused.')).toBeInTheDocument()
  })

  it('drops the district when the state changes, so a stale one never reaches the 422', () => {
    render(<BranchFormModal onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Add Branch' })
    fillRequired(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Kerala' } })
    fireEvent.change(within(dialog).getByLabelText(/^District/), { target: { value: 'Ernakulam' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Maharashtra' } })

    // Maharashtra's districts are not stubbed, so the picker is empty — the point is that
    // "Ernakulam" is gone rather than carried into a state that has never heard of it.
    expect(within(dialog).getByLabelText(/^District/)).toHaveValue('')
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(createMutate).not.toHaveBeenCalled()
  })
})

describe('a branch saved before the location existed', () => {
  const LEGACY: Branch = {
    id: 'branch-legacy',
    name: 'North Campus — Delhi',
    address: 'B-42, Connaught Place',
    active: true,
  }

  it('stays editable, and a rename sends NO location at all', () => {
    render(<BranchFormModal branch={LEGACY} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Edit Branch' })
    // The street line is carried in untouched — the field was relabelled, not re-scoped.
    expect(within(dialog).getByLabelText(/^Street address/)).toHaveValue('B-42, Connaught Place')

    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: 'North Campus' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    expect(updateMutate).toHaveBeenCalledTimes(1)
    const body = updateMutate.mock.calls[0][0]
    expect(body).toMatchObject({ name: 'North Campus' })
    // A PATCH that does not mention the location never trips the server's four-field check. Send
    // `country: null` here instead and the rename would be fine but confusing; send a half-filled
    // location and it would be refused outright.
    expect(body).not.toHaveProperty('country')
    expect(body).not.toHaveProperty('district')
  })

  it('still has to satisfy the India rule once someone starts filling the location in', () => {
    render(<BranchFormModal branch={LEGACY} onClose={() => {}} />)
    const dialog = screen.getByRole('dialog', { name: 'Edit Branch' })
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State/), { target: { value: 'Kerala' } })

    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateMutate).not.toHaveBeenCalled()

    fireEvent.change(within(dialog).getByLabelText(/^District/), { target: { value: 'Thrissur' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ country: 'India', state: 'Kerala', district: 'Thrissur' })
  })
})
