import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 8 T2-04 / T4-09: every commission rate write carries a typed reason of at least 3
// characters. T4-08: the default behind an account's rates is the server's note, as served.
vi.mock('@/queries/commissionRates', () => ({
  useCommissionDefaults: vi.fn(),
  useUpdateCommissionDefaults: vi.fn(),
  useCommissionRates: vi.fn(),
  useSaveCommissionRateRows: vi.fn(),
  useCommissionDefaultInUse: vi.fn(),
  useMyCommissionRates: vi.fn(),
  useMyCommissionDefaultInUse: vi.fn(),
}))
vi.mock('@/queries/adminConsultancies', () => ({
  useAdminConsultancy: () => ({
    data: { name: 'Northstar', freelancer_enabled: false, countries_served: ['Canada'] },
    isPending: false,
    isError: false,
  }),
  useUpdateEntitlements: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/queries/countries', () => ({ useCountries: () => ({ data: ['Canada'] }) }))
vi.mock('../finance/ConsultancySearchSelect', () => ({ ConsultancySearchSelect: () => null }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/components/CountryLabel', () => ({ CountryLabel: ({ name }: { name: string }) => <span>{name}</span> }))

import {
  useCommissionDefaultInUse,
  useCommissionDefaults,
  useCommissionRates,
  useMyCommissionDefaultInUse,
  useMyCommissionRates,
  useSaveCommissionRateRows,
  useUpdateCommissionDefaults,
} from '@/queries/commissionRates'
import { CommissionAccountDrawer } from './CommissionAccountDrawer'
import { CommissionDefaultsCard } from './CommissionDefaultsCard'
import { RateEditorModal } from './RateEditorModal'
import { CommissionRatesTab } from '@/features/administration/ConsultancyCommissionRatesTab'

const NOTE =
  "immiNow has not set a rate for your consultancy yet, so its standard rate applies: 25% of what you earn on each case. When a freelancer brought the student, it is 40%."

describe('Commission defaults: a reason is required', () => {
  const mutate = vi.fn()
  beforeEach(() => {
    mutate.mockReset()
    vi.mocked(useCommissionDefaults).mockReturnValue({
      data: { consultancy_percent: 25, freelancer_percent: 40, institute_percent: 10, payment_terms_days: 30 },
    } as never)
    vi.mocked(useUpdateCommissionDefaults).mockReturnValue({ mutate, isPending: false, isError: false } as never)
  })

  it('asks for the reason before Confirm, and sends it with the changed defaults', () => {
    render(<CommissionDefaultsCard />)
    fireEvent.change(screen.getByLabelText('Default percent for consultancies'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const confirm = screen.getByRole('button', { name: 'Confirm' })
    expect(confirm).toBeDisabled()
    expect(screen.getByText('Still needed: the reason.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: 'ab' } })
    expect(confirm).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Board decision  ' } })
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(mutate.mock.calls[0][0]).toEqual({ consultancy_percent: 30, reason: 'Board decision' })
  })

  it("shows the server's sentence if it still refuses", () => {
    vi.mocked(useUpdateCommissionDefaults).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new Error('Say why the default rates are being changed.'),
    } as never)
    render(<CommissionDefaultsCard />)
    fireEvent.change(screen.getByLabelText('Default percent for consultancies'), { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getAllByText('Say why the default rates are being changed.').length).toBeGreaterThan(0)
  })
})

describe('Rate editor: a reason is required', () => {
  const mutate = vi.fn()
  beforeEach(() => {
    mutate.mockReset()
    vi.mocked(useCommissionRates).mockReturnValue({ data: [], isPending: false, isError: false } as never)
    vi.mocked(useSaveCommissionRateRows).mockReturnValue({ mutate, isPending: false, isError: false } as never)
  })

  it('keeps Save off until there is a reason, and sends the trimmed reason with the rows', () => {
    render(
      <RateEditorModal
        onClose={() => {}}
        defaultConsultancyId="acc-1"
        defaultConsultancyName="Northstar"
        defaultCountry="Canada"
        lockConsultancy
        lockCountry
      />,
    )
    fireEvent.change(screen.getAllByLabelText('Direct %')[0], { target: { value: '12' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText('Still needed: the reason.')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/Reason/), { target: { value: '  Agreed on the call  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({
      consultancy_id: 'acc-1',
      destination_country: 'Canada',
      reason: 'Agreed on the call',
      rows: [{ payer_method: 'applicant', direct_rate: 12, freelancer_sourced_rate: 12 }],
    })
  })
})

describe("The account's default rate, in the server's words", () => {
  it('replaces "No rates configured yet" on the consultancy\'s own tab, and sits under a filled table', () => {
    vi.mocked(useMyCommissionDefaultInUse).mockReturnValue({ data: { note: NOTE } } as never)
    vi.mocked(useMyCommissionRates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
    const empty = render(<CommissionRatesTab consultancy={{ freelancer_enabled: true } as never} />)
    expect(screen.getByText(NOTE)).toBeInTheDocument()
    expect(screen.queryByText('No rates configured yet.')).toBeNull()
    empty.unmount()

    vi.mocked(useMyCommissionRates).mockReturnValue({
      data: [{ id: 'r1', destination_country: 'Canada', payer_method: 'college', direct_rate: 12, freelancer_sourced_rate: 20 }],
      isLoading: false,
      isError: false,
    } as never)
    render(<CommissionRatesTab consultancy={{ freelancer_enabled: true } as never} />)
    expect(screen.getByText(NOTE)).toBeInTheDocument()
  })

  it('says nothing in its place while the note has not arrived', () => {
    vi.mocked(useMyCommissionDefaultInUse).mockReturnValue({ data: undefined } as never)
    vi.mocked(useMyCommissionRates).mockReturnValue({ data: [], isLoading: false, isError: false } as never)
    render(<CommissionRatesTab consultancy={{ freelancer_enabled: true } as never} />)
    expect(screen.queryByText('No rates configured yet.')).toBeNull()
  })

  it("shows immiNow's staff the note for the account they opened", () => {
    const staffNote = 'Northstar has no rate set yet, so the standard rate applies: 25% of what it earns on each case.'
    vi.mocked(useCommissionDefaultInUse).mockReturnValue({ data: { note: staffNote } } as never)
    vi.mocked(useCommissionRates).mockReturnValue({ data: [], isPending: false, isError: false } as never)
    render(
      <QueryClientProvider client={new QueryClient()}>
      <CommissionAccountDrawer
        row={
          {
            consultancy_id: 'acc-1',
            consultancy_name: 'Northstar',
            kind: 'consultancy',
            countries_served: ['Canada'],
            default_percent: 25,
            freelancer_enabled: false,
          } as never
        }
        onClose={() => {}}
      />
      </QueryClientProvider>,
    )
    expect(screen.getByText(staffNote)).toBeInTheDocument()
    expect(vi.mocked(useCommissionDefaultInUse)).toHaveBeenCalledWith('acc-1')
  })
})
