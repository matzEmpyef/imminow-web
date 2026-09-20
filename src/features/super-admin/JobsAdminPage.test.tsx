import { fireEvent, render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// The job location change (product owner, 2026-09-20): a job's free-text `location` became a
// derived, read-only string composed from country / province / city, and the list's location
// filter became `filter[country]` + `filter[province_state]` sourced from `GET /jobs/locations`.
// The two rules worth pinning are the ones a later refactor would quietly break:
//
//   1. a country is REQUIRED unless the work mode is Remote, and the form blocks the save itself
//      rather than spending a round trip to collect the server's 422;
//   2. the filter options come from the ENDPOINT, not from a distinct-values scan of the rows on
//      screen — which is the entire point of the change, and is invisible in any screenshot.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/jobsAdmin', () => ({
  useAdminJobs: vi.fn(),
  useCreateJob: vi.fn(),
  useUpdateJob: vi.fn(),
  useJobLocations: vi.fn(),
}))
vi.mock('@/queries/countries', () => ({
  useCountries: vi.fn(),
  useStates: vi.fn(),
}))

import { useAdminJobs, useCreateJob, useJobLocations, useUpdateJob } from '@/queries/jobsAdmin'
import { useCountries, useStates } from '@/queries/countries'
import { JobsAdminPage } from './JobsAdminPage'

const mockedJobs = vi.mocked(useAdminJobs)
const mockedCreate = vi.mocked(useCreateJob)
const mockedUpdate = vi.mocked(useUpdateJob)
const mockedLocations = vi.mocked(useJobLocations)
const mockedCountries = vi.mocked(useCountries)
const mockedStates = vi.mocked(useStates)

const COUNTRIES_WITH_JOBS = [
  { name: 'Canada', job_count: 3 },
  { name: 'India', job_count: 24 },
  { name: 'Ireland', job_count: 1 },
  { name: 'United Kingdom', job_count: 1 },
]
const INDIAN_PROVINCES_WITH_JOBS = [
  { name: 'Karnataka', job_count: 9 },
  { name: 'Maharashtra', job_count: 6 },
]

// The row on screen is in a place that has NO live listings, so it is deliberately absent from
// both lists above: if the pickers ever went back to scanning the loaded page, "Iceland" would
// appear as an option and these tests would say so.
const ROWS = [
  {
    id: 'job-1',
    title: 'Support Engineer',
    company: 'Northwind',
    location: 'Reykjavík, Iceland',
    country: 'Iceland',
    work_mode: 'on_site' as const,
    status: 'live' as const,
    active: true,
  },
  {
    id: 'job-2',
    title: 'Anywhere Designer',
    company: 'Driftwork',
    // A place-less remote listing: the server composes an EMPTY location for it, which is correct
    // and must not render as a gap someone is meant to go and fill in.
    location: '',
    country: null,
    work_mode: 'remote' as const,
    status: 'live' as const,
    active: true,
  },
]

function query<T>(data: T, overrides: Record<string, unknown> = {}) {
  return { data, isLoading: false, isError: false, ...overrides } as never
}

function mutation(mutate: ReturnType<typeof vi.fn>) {
  return { mutate, isPending: false, isError: false, error: null } as never
}

const createMutate = vi.fn()
const updateMutate = vi.fn()

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <JobsAdminPage />
    </QueryClientProvider>,
  )
}

/** Fill the fields that are required no matter what, so only the place rule is left under test. */
function fillTheRest(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText(/^Title/), { target: { value: 'Data Analyst' } })
  fireEvent.change(within(dialog).getByLabelText(/^Company$|^Company \*/), { target: { value: 'Contoso' } })
  fireEvent.change(within(dialog).getByLabelText(/^Apply URL/), { target: { value: 'https://jobs.example.com/1' } })
}

beforeEach(() => {
  createMutate.mockClear()
  updateMutate.mockClear()
  mockedJobs.mockReturnValue(query({ items: ROWS, meta: { total: ROWS.length } }))
  mockedCreate.mockReturnValue(mutation(createMutate))
  mockedUpdate.mockReturnValue(mutation(updateMutate))
  mockedLocations.mockImplementation((country?: string) => {
    if (!country) return query(COUNTRIES_WITH_JOBS)
    if (country === 'India') return query(INDIAN_PROVINCES_WITH_JOBS)
    return query([])
  })
  mockedCountries.mockReturnValue(query(['Canada', 'India', 'Ireland', 'United Kingdom']))
  mockedStates.mockImplementation((country: string | undefined) =>
    query(country === 'India' ? [{ name: 'Karnataka' }, { name: 'Maharashtra' }] : []),
  )
})

describe('the job form: a country is required unless the work mode is Remote', () => {
  it('blocks the save itself instead of letting the server answer 422', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Listing' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Listing' })
    fillTheRest(dialog)

    // Work mode defaults to On-site, so this listing needs a country and has none.
    fireEvent.click(screen.getByRole('button', { name: 'Create Listing' }))

    expect(createMutate).not.toHaveBeenCalled()
    expect(within(dialog).getByText('Required unless the work mode is Remote.')).toBeInTheDocument()
  })

  it('lets a REMOTE listing through with no place at all, and sends no location', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Listing' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Listing' })
    fillTheRest(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Work mode/), { target: { value: 'remote' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Listing' }))

    expect(createMutate).toHaveBeenCalledTimes(1)
    const body = createMutate.mock.calls[0][0]
    expect(body).toMatchObject({ work_mode: 'remote', country: null, province_state: null, city: null })
    // `location` is derived and read-only now: a location in the body is ignored, so sending one
    // would only make this form look as though it still set the field.
    expect(body).not.toHaveProperty('location')
  })

  it('accepts a non-remote listing once a country is chosen, and carries the province and city', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Listing' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Listing' })
    fillTheRest(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State \/ province/), { target: { value: 'Karnataka' } })
    fireEvent.change(within(dialog).getByLabelText(/^City/), { target: { value: 'Bengaluru' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Listing' }))

    expect(createMutate).toHaveBeenCalledTimes(1)
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      country: 'India',
      province_state: 'Karnataka',
      city: 'Bengaluru',
    })
  })

  it('drops the province when the country changes, so a stale state never reaches the 422', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Add Listing' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Listing' })
    fillTheRest(dialog)
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'India' } })
    fireEvent.change(within(dialog).getByLabelText(/^State \/ province/), { target: { value: 'Maharashtra' } })
    fireEvent.change(within(dialog).getByLabelText(/^Country/), { target: { value: 'Canada' } })

    fireEvent.click(screen.getByRole('button', { name: 'Create Listing' }))

    expect(createMutate.mock.calls[0][0]).toMatchObject({ country: 'Canada', province_state: null })
  })
})

describe('the jobs list filters', () => {
  it('offers the countries GET /jobs/locations returns, with their counts — not the rows on screen', () => {
    renderPage()
    const countryFilter = screen.getByLabelText('Country')
    expect(within(countryFilter).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any country',
      'Canada (3)',
      'India (24)',
      'Ireland (1)',
      'United Kingdom (1)',
    ])
    // The loaded page has a job in Iceland; the endpoint does not list it, so neither does this.
    expect(within(countryFilter).queryByText(/Iceland/)).not.toBeInTheDocument()
  })

  it('keeps the province picker disabled until a country is chosen, then fills it from the endpoint', () => {
    renderPage()
    const provinceFilter = screen.getByLabelText('State / province')
    expect(provinceFilter).toBeDisabled()
    expect(within(provinceFilter).getByRole('option')).toHaveTextContent('Pick a country first')

    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })

    expect(screen.getByLabelText('State / province')).toBeEnabled()
    expect(within(screen.getByLabelText('State / province')).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Any state / province',
      'Karnataka (9)',
      'Maharashtra (6)',
    ])
  })

  it('asks the list for filter[country] and filter[province_state], never filter[location]', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })
    fireEvent.change(screen.getByLabelText('State / province'), { target: { value: 'Karnataka' } })

    const lastCall = mockedJobs.mock.calls.at(-1)![0]
    expect(lastCall).toMatchObject({ country: 'India', provinceState: 'Karnataka' })
    expect(lastCall).not.toHaveProperty('location')
  })

  it('resets a chosen province when the country changes', () => {
    renderPage()
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'India' } })
    fireEvent.change(screen.getByLabelText('State / province'), { target: { value: 'Karnataka' } })
    fireEvent.change(screen.getByLabelText('Country'), { target: { value: 'Canada' } })

    expect(mockedJobs.mock.calls.at(-1)![0]).toMatchObject({ country: 'Canada', provinceState: undefined })
  })
})

describe('a remote listing with no place', () => {
  it('reads as "Remote" in the Location column rather than an empty or unfinished-looking cell', () => {
    renderPage()
    const row = screen.getByText('Anywhere Designer').closest('tr')!
    // Column order: Listing, Type, Work Mode, Location, … — so this is the Location cell itself,
    // not the Work Mode badge beside it. The cell answers its own column header: "Location not
    // set" would read as a half-filled row somebody ought to fix, when the listing is complete and
    // simply has nowhere to be.
    expect(row.querySelectorAll('td')[3]).toHaveTextContent('Remote')
    expect(within(row).queryByText('Location not set')).not.toBeInTheDocument()

    // The placed listing still shows its derived location, unchanged.
    const placed = screen.getByText('Support Engineer').closest('tr')!
    expect(placed.querySelectorAll('td')[3]).toHaveTextContent('Reykjavík, Iceland')
  })
})
