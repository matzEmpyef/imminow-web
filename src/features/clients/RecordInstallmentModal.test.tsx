import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-078: an installment's received date after today is refused before anything is sent
// (the share's due date follows that day). The server refuses it too, and its 422 is shown.
vi.mock('@/queries/commissionEntries', () => ({ useRecordInstallment: vi.fn() }))
vi.mock('@/lib/currencies', () => ({ useCurrencyCodes: () => ['INR', 'CAD'] }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/lib/time', async (original) => ({
  ...(await original<typeof import('@/lib/time')>()),
  localDateISO: () => '2026-10-08',
}))

import { ApiError } from '@/api/errors'
import { useRecordInstallment } from '@/queries/commissionEntries'
import { RecordInstallmentModal } from './RecordInstallmentModal'

const mutate = vi.fn()

const entry = {
  id: 'entry-1',
  payer_method: 'college',
  college_name: 'Test University',
  expected_from_college: { amount: 100000, currency: 'INR' },
  expected_from_student: null,
} as never

function open() {
  render(<RecordInstallmentModal clientId="c1" entry={entry} receipts={[]} onClose={() => {}} />)
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useRecordInstallment).mockReturnValue({ mutate, isPending: false, isError: false, error: null } as never)
})

describe('RecordInstallmentModal, the received date', () => {
  it('records with today’s date', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '25000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({ received_on: '2026-10-08', amount: { amount: 25000, currency: 'INR' } })
  })

  it('refuses a date after today before sending anything', () => {
    open()
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '25000' } })
    fireEvent.change(screen.getByLabelText('Received on'), { target: { value: '2026-10-09' } })

    expect(screen.getByText('Choose today or an earlier date.')).toBeInTheDocument()
    const record = screen.getByRole('button', { name: 'Record' })
    expect(record).toBeDisabled()
    fireEvent.submit(document.getElementById('record-installment-form')!)
    expect(mutate).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('Received on'), { target: { value: '2026-10-07' } })
    expect(screen.queryByText('Choose today or an earlier date.')).toBeNull()
    expect(record).toBeEnabled()
  })

  it('shows the server’s 422 when it still refuses the date', () => {
    vi.mocked(useRecordInstallment).mockReturnValue({
      mutate,
      isPending: false,
      isError: true,
      error: new ApiError(
        'Could not record this installment.',
        { error: { code: 'validation_failed', message: 'received_on cannot be after today.' } },
        422,
      ),
    } as never)
    open()
    expect(screen.getByText('received_on cannot be after today.')).toBeInTheDocument()
  })
})
