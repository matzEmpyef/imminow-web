import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The head office's place on Create Account (product owner, 2026-09-21). `POST /consultancies` now
// really creates the primary branch, where before it only said so, and takes `branch_country` /
// `branch_state` / `branch_district` / `branch_city` for it — validated by the same server function
// a branch edit uses, India district rule included.
//
// The rules worth pinning are the ones a later refactor would quietly break:
//
//   1. the place is ALL OR NOTHING once started — a country makes the state required and an Indian
//      state makes the district required — and the form blocks the submit itself rather than
//      spending a round trip collecting the server's 422;
//   2. it stays OPTIONAL as a whole, because a Super Admin onboarding an account in a hurry must
//      still be able to create one without it;
//   3. an empty office city is OMITTED rather than sent null, because the server fills it in from
//      the account's own city and null means "no city at all".
vi.mock('@/queries/adminConsultancies', () => ({ useCreateConsultancy: vi.fn() }))
vi.mock('@/queries/adminColleges', () => ({ useAdminColleges: vi.fn() }))
vi.mock('@/queries/supportTools', () => ({ useUserSearch: vi.fn() }))
vi.mock('@/queries/countries', () => ({ useCountries: vi.fn(), useStates: vi.fn(), useDistricts: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useCreateConsultancy } from '@/queries/adminConsultancies'
import { useAdminColleges } from '@/queries/adminColleges'
import { useUserSearch } from '@/queries/supportTools'
import { useCountries, useDistricts, useStates } from '@/queries/countries'
import { useAuthStore } from '@/stores/authStore'
import { CreateConsultancyModal } from './CreateConsultancyModal'

const mockedCreate = vi.mocked(useCreateConsultancy)
const mockedColleges = vi.mocked(useAdminColleges)
const mockedUserSearch = vi.mocked(useUserSearch)
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

const createMutate = vi.fn()

beforeEach(() => {
  createMutate.mockClear()
  mockedCreate.mockReturnValue({ mutate: createMutate, isPending: false, isError: false, error: null } as never)
  mockedColleges.mockReturnValue(query({ items: [] }))
  mockedUserSearch.mockReturnValue(query({ items: [] }))
  mockedCountries.mockReturnValue(query(['Canada', 'India']))
  mockedStates.mockImplementation((country?: string) =>
    query(country === 'India' ? [{ name: 'Kerala' }] : country === 'Canada' ? [{ name: 'Ontario' }] : []),
  )
  // Only India models districts; every other state answers 200 with an empty array.
  mockedDistricts.mockImplementation((country?: string, state?: string) =>
    query(country === 'India' && state === 'Kerala' ? KERALA_DISTRICTS : []),
  )
  useAuthStore.setState({ user: { role: 'super_admin' } as never })
})

/** Everything the form needs apart from the place, so only the place rule is left under test. */
function fillTheRest(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/^Consultancy name/), { target: { value: 'Blue Ocean' } })
  fireEvent.change(within(dialog).getByLabelText(/^City/), { target: { value: 'Kochi' } })
  fireEvent.change(within(dialog).getByLabelText(/^Street address/), { target: { value: '2nd Floor, MG Road' } })
  fireEvent.change(within(dialog).getByLabelText(/^First name/), { target: { value: 'Laila' } })
  fireEvent.change(within(dialog).getByLabelText(/^Last name/), { target: { value: 'Nair' } })
  fireEvent.change(within(dialog).getByLabelText(/^Email/), { target: { value: 'laila@example.com' } })
}

function openForm() {
  render(<CreateConsultancyModal onClose={() => {}} />)
  const dialog = screen.getByRole('dialog', { name: 'Create Account' })
  fillTheRest(dialog)
  return dialog
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: /^Create Consultancy$/ }))
}

describe("the head office's place is all or nothing", () => {
  it('refuses a country with no state, which the server refuses too', () => {
    const dialog = openForm()
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'Canada' } })

    submit()

    expect(createMutate).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Pick a state — a country on its own is refused.')).toBeInTheDocument()
    // Named by the button too: the place sits several sections above it, so a Create that does
    // nothing with no explanation is the failure the summary exists to prevent.
    expect(screen.getByText(/Still needed:.*head office's state/)).toBeInTheDocument()
  })

  it('refuses an Indian state with no district', () => {
    const dialog = openForm()
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office state/), { target: { value: 'Kerala' } })

    submit()

    expect(createMutate).not.toHaveBeenCalled()
    expect(
      within(dialog).getByText('A branch in India needs a district — students are matched to the nearest branch by it.'),
    ).toBeInTheDocument()
  })

  it('sends all four levels once the place is complete', () => {
    const dialog = openForm()
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office state/), { target: { value: 'Kerala' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office district/), { target: { value: 'Ernakulam' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office city/), { target: { value: 'Kochi' } })

    submit()

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      branch_address: '2nd Floor, MG Road',
      branch_country: 'India',
      branch_state: 'Kerala',
      branch_district: 'Ernakulam',
      branch_city: 'Kochi',
    })
  })

  it('drops the district when the country changes, so a stale one never reaches the 422', () => {
    const dialog = openForm()
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office state/), { target: { value: 'Kerala' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office district/), { target: { value: 'Ernakulam' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'Canada' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office state/), { target: { value: 'Ontario' } })

    submit()

    const body = createMutate.mock.calls[0][0]
    expect(body).toMatchObject({ branch_country: 'Canada', branch_state: 'Ontario' })
    expect(body).not.toHaveProperty('branch_district')
  })
})

describe('an account onboarded in a hurry', () => {
  it('is created with no place at all, and mentions no branch_* place field', () => {
    openForm()

    submit()

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0][0]
    expect(body).toMatchObject({ name: 'Blue Ocean', branch_address: '2nd Floor, MG Road' })
    for (const field of ['branch_country', 'branch_state', 'branch_district', 'branch_city']) {
      expect(body).not.toHaveProperty(field)
    }
  })

  it('omits an empty office city rather than nulling it, so the server fills it from the account', () => {
    const dialog = openForm()
    fireEvent.change(within(dialog).getByLabelText(/^Office country/), { target: { value: 'Canada' } })
    fireEvent.change(within(dialog).getByLabelText(/^Office state/), { target: { value: 'Ontario' } })

    submit()

    const body = createMutate.mock.calls[0][0]
    expect(body).toMatchObject({ branch_country: 'Canada', branch_state: 'Ontario' })
    // `branch_city: null` would mean "no city at all"; absent means "use the account's own city",
    // which is the one place fact this form was definitely told.
    expect(body).not.toHaveProperty('branch_city')
  })
})
