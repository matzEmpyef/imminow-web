import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 11 (review W2-C05): an exchange rate was saved with the single check "greater
// than zero", and a country's default currency changed the moment its table dropdown did. Pinned
// here: a rate change of more than 10% either way asks first and saves only on Confirm, a smaller
// one saves as before, the rupee is fixed at 1 with nothing to edit, the server's refusal is shown
// in its own words, and the country currency asks first too.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PUT: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { DefaultCurrencyCell } from './CatalogSettingsPage'
import { ExchangeRatesTab } from './ExchangeRatesTab'

const mockedGet = vi.mocked(api.GET)
const mockedPut = vi.mocked(api.PUT)
const mockedPatch = vi.mocked(api.PATCH)

function renderWithClient(ui: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function putCalls() {
  return (mockedPut.mock.calls as unknown[][]).map((call) => ({
    currency: (call[1] as { params: { path: { currency: string } } }).params.path.currency,
    body: (call[1] as { body: unknown }).body,
  }))
}

/** Opens CAD's edit form (current rate ₹62) and submits `value`. */
async function editCadRate(value: string) {
  fireEvent.click(await screen.findByRole('button', { name: 'Edit CAD rate' }))
  const form = screen.getByRole('dialog', { name: 'Edit CAD Rate' })
  fireEvent.change(within(form).getByLabelText(/₹ per unit of this currency/), { target: { value } })
  fireEvent.click(within(form).getByRole('button', { name: 'Save Rate' }))
  return form
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPut.mockReset()
  mockedPatch.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/exchange-rates') {
      return {
        data: [
          { currency: 'INR', inr_per_unit: 1, updated_at: '2026-10-01T00:00:00Z' },
          { currency: 'CAD', inr_per_unit: 62, updated_at: '2026-10-01T00:00:00Z' },
          { currency: 'USD', inr_per_unit: 84, updated_at: '2026-10-01T00:00:00Z' },
        ],
        error: undefined,
      }
    }
    return { data: [], error: undefined }
  }) as never)
  mockedPut.mockResolvedValue({ data: {}, error: undefined } as never)
  mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
})

describe('exchange rate confirmation (owner decision 11)', () => {
  it('a change of more than 10% asks first, stating the currency, both rates and the change, and saves only on Confirm', async () => {
    renderWithClient(<ExchangeRatesTab />)
    await editCadRate('6.2')

    const confirm = await screen.findByRole('dialog', { name: 'Change the CAD rate by −90%?' })
    expect(mockedPut).not.toHaveBeenCalled()
    expect(within(confirm).getByText('CAD')).toBeInTheDocument()
    expect(within(confirm).getByText('₹62')).toBeInTheDocument()
    expect(within(confirm).getByText('₹6.2')).toBeInTheDocument()
    expect(within(confirm).getByText('−90%')).toBeInTheDocument()

    // Cancel goes back to the form with nothing saved.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: /Change the CAD rate/ })).not.toBeInTheDocument()
    expect(mockedPut).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Save Rate' }))
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /Change the CAD rate/ })).getByRole('button', { name: 'Confirm' }),
    )
    await waitFor(() => expect(putCalls()).toEqual([{ currency: 'CAD', body: { inr_per_unit: 6.2 } }]))
  })

  it('asks for a rise of more than 10% as well', async () => {
    renderWithClient(<ExchangeRatesTab />)
    await editCadRate('70')
    expect(await screen.findByRole('dialog', { name: 'Change the CAD rate by +12.9%?' })).toBeInTheDocument()
    expect(mockedPut).not.toHaveBeenCalled()
  })

  it('a change of 10% or less saves directly', async () => {
    renderWithClient(<ExchangeRatesTab />)
    await editCadRate('63')

    await waitFor(() => expect(putCalls()).toEqual([{ currency: 'CAD', body: { inr_per_unit: 63 } }]))
    expect(screen.queryByRole('dialog', { name: /Change the CAD rate/ })).not.toBeInTheDocument()
  })

  it('the rupee row is fixed at 1 and cannot be edited, here or through Add Currency', async () => {
    renderWithClient(<ExchangeRatesTab />)
    await screen.findByRole('button', { name: 'Edit CAD rate' })

    const rupeeRow = screen.getByText('INR').closest('tr')!
    expect(within(rupeeRow).getByText('₹1')).toBeInTheDocument()
    expect(within(rupeeRow).getByText('Base currency · fixed at 1')).toBeInTheDocument()
    expect(within(rupeeRow).queryByRole('button')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit INR rate' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Add Currency' }))
    const form = screen.getByRole('dialog', { name: 'Add Currency' })
    fireEvent.change(within(form).getByLabelText(/Currency code/), { target: { value: 'inr' } })
    fireEvent.change(within(form).getByLabelText(/₹ per unit of this currency/), { target: { value: '2' } })
    expect(within(form).getByText(/The rupee is the base currency/)).toBeInTheDocument()
    expect(within(form).getByRole('button', { name: 'Save Rate' })).toBeDisabled()
    fireEvent.submit(form.querySelector('form')!)
    expect(mockedPut).not.toHaveBeenCalled()
  })

  it("shows the server's own message when a save is refused", async () => {
    mockedPut.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'rate_out_of_bounds', message: 'A CAD rate must be between ₹30 and ₹120.' } },
    } as never)
    renderWithClient(<ExchangeRatesTab />)
    const form = await editCadRate('6.2')
    fireEvent.click(
      within(await screen.findByRole('dialog', { name: /Change the CAD rate/ })).getByRole('button', { name: 'Confirm' }),
    )

    expect(await within(form).findByText('A CAD rate must be between ₹30 and ₹120.')).toBeInTheDocument()
    // The confirmation has gone; the form and what was typed are still there.
    expect(screen.queryByRole('dialog', { name: /Change the CAD rate/ })).not.toBeInTheDocument()
    expect(within(form).getByLabelText(/₹ per unit of this currency/)).toHaveValue(6.2)
  })
})

describe('read-only exchange rates (Settings, without the finance permission)', () => {
  it('lists the rates with no edit controls and says who manages them', async () => {
    renderWithClient(<ExchangeRatesTab readOnly />)
    expect(await screen.findByText('CAD')).toBeInTheDocument()
    expect(screen.getByText('₹62')).toBeInTheDocument()
    expect(screen.getByText('Exchange rates are managed by the finance team.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit CAD rate' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Currency' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows a rate in use with no rate without the Add rate button', async () => {
    mockedGet.mockImplementation((async (path: string) => {
      if (path === '/exchange-rates') return { data: [{ currency: 'INR', inr_per_unit: 1 }], error: undefined }
      if (path === '/exchange-rates/missing') {
        return {
          data: [{ currency: 'JPY', student_count: 2, consultancy_count: 0, countries: ['Japan'] }],
          error: undefined,
        }
      }
      return { data: [], error: undefined }
    }) as never)
    renderWithClient(<ExchangeRatesTab readOnly />)
    expect(await screen.findByText('1 currency in use with no rate')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add rate' })).not.toBeInTheDocument()
  })
})

describe('country default currency confirmation (owner decision 11)', () => {
  const canada = { name: 'Canada', default_currency: 'CAD' } as never

  it('asks first, stating the country, both currencies and what it affects, and saves only on Confirm', async () => {
    renderWithClient(<DefaultCurrencyCell row={canada} hasRate />)
    const select = screen.getByLabelText('Default currency for Canada') as HTMLSelectElement
    await waitFor(() => expect(within(select).getByRole('option', { name: 'USD' })).toBeInTheDocument())

    fireEvent.change(select, { target: { value: 'USD' } })
    const confirm = screen.getByRole('dialog', { name: 'Change the default currency for Canada?' })
    expect(mockedPatch).not.toHaveBeenCalled()
    expect(within(confirm).getByText('Canada')).toBeInTheDocument()
    expect(within(confirm).getByText('CAD')).toBeInTheDocument()
    expect(within(confirm).getByText('USD')).toBeInTheDocument()
    expect(within(confirm).getByText(/invoice currency for every consultancy based in Canada/)).toBeInTheDocument()

    // Cancel: nothing sent, and the select still shows the saved currency.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(mockedPatch).not.toHaveBeenCalled()
    expect(select.value).toBe('CAD')

    fireEvent.change(select, { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    expect(mockedPatch.mock.calls[0][0]).toBe('/countries/{name}')
    expect(mockedPatch.mock.calls[0][1]).toMatchObject({
      params: { path: { name: 'Canada' } },
      body: { default_currency: 'USD' },
    })
  })

  it("shows the server's own message when the change is refused", async () => {
    mockedPatch.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'forbidden', message: 'Changing a default currency needs the Finance permission.' } },
    } as never)
    renderWithClient(<DefaultCurrencyCell row={canada} hasRate />)
    const select = screen.getByLabelText('Default currency for Canada')
    await waitFor(() => expect(within(select).getByRole('option', { name: 'USD' })).toBeInTheDocument())
    fireEvent.change(select, { target: { value: 'USD' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))

    expect(await screen.findByText('Changing a default currency needs the Finance permission.')).toBeInTheDocument()
  })
})
