import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-226: a receipt that a live commission instalment was recorded through cannot be voided
// (409 `still_referenced`). The server says what to do first, and the row shows its sentence.
vi.mock('@/features/auth/AppShell', () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/features/auth/PermissionGate', () => ({
  PermissionGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))
vi.mock('@/lib/permissions', () => ({ usePermission: () => true }))
vi.mock('@/queries/invoicing', () => ({
  useReceipts: vi.fn(),
  useVoidReceipt: vi.fn(),
  useInvoices: vi.fn(),
  useCreateReceipt: vi.fn(),
}))

import { ApiError } from '@/api/errors'
import { useReceipts, useVoidReceipt } from '@/queries/invoicing'
import { ReceiptsPage } from './ReceiptsPage'

const STILL_REFERENCED =
  'A commission instalment was recorded through this receipt. Void that instalment first, then void the receipt.'

const mutate = vi.fn()
const reset = vi.fn()

function mutation(error: Error | null = null) {
  return { mutate, reset, isPending: false, isError: Boolean(error), error } as never
}

const receipt = (id: string, invoice: string) => ({
  id,
  invoice_number: invoice,
  applicant_name: 'Asha Rao',
  amount: { amount: 5000, currency: 'INR' },
  recorded_at: '2026-10-01T10:00:00Z',
  status: 'recorded',
})

beforeEach(() => {
  mutate.mockReset()
  reset.mockReset()
  vi.mocked(useReceipts).mockReturnValue({
    data: { items: [receipt('r1', 'INV-1'), receipt('r2', 'INV-2')], meta: { next_cursor: null, total: 2 } },
    isLoading: false,
    isError: false,
  } as never)
  vi.mocked(useVoidReceipt).mockReturnValue(mutation())
})

function startVoid(row = 0) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Void' })[row])
  fireEvent.change(screen.getByPlaceholderText('Reason…'), { target: { value: 'Entered twice' } })
}

describe('Receipts — voiding', () => {
  it('sends the receipt and the reason', () => {
    render(<ReceiptsPage />)
    startVoid()
    fireEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    expect(mutate.mock.calls[0][0]).toEqual({ id: 'r1', reason: 'Entered twice' })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('shows the server’s sentence on the row when an instalment still uses the receipt', () => {
    vi.mocked(useVoidReceipt).mockReturnValue(
      mutation(new ApiError('x', { error: { code: 'still_referenced', message: STILL_REFERENCED } }, 409)),
    )
    render(<ReceiptsPage />)
    // Not shown against a receipt nobody is voiding.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    startVoid()
    expect(screen.getByRole('alert')).toHaveTextContent(STILL_REFERENCED)
  })

  it('clears the last refusal when another receipt is picked', () => {
    render(<ReceiptsPage />)
    startVoid(1)
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
