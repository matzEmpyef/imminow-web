import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-255: who claimed a coupon is paged by the server, 20 claims a page, with the cursor it
// hands back. The count beside the list is every claim of the coupon (the server's own figure),
// whatever page is open.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/couponsAdmin', () => ({
  useAdminCoupons: vi.fn(),
  useCouponRedemptions: vi.fn(),
  useUpdateCoupon: vi.fn(() => ({ mutate: vi.fn(), isPending: false, isError: false })),
  useCreateCoupon: vi.fn(),
  useCouponLimits: vi.fn(),
  useUpdateCouponLimits: vi.fn(),
  useVoucherCodes: vi.fn(),
  useAddVoucherCodes: vi.fn(),
  useRemoveVoucherCode: vi.fn(),
}))
vi.mock('@/queries/redemptionPartners', () => ({ useRedemptionPartners: vi.fn(() => ({ data: [] })) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { useAdminCoupons, useCouponRedemptions } from '@/queries/couponsAdmin'
import { CouponsAdminPage } from './CouponsAdminPage'

const coupon = {
  id: 'cp1',
  partner_id: 'pt1',
  partner_name: 'Brew House',
  amount: '20% off',
  point_cost: 100,
  stock: 100,
  remaining_stock: 55,
  redemption_count: 45,
  status: 'live',
  type: 'discount',
}

const claim = (n: number) => ({
  student_name: `Student ${n}`,
  email: `s${n}@example.com`,
  student_type: 'aspirant',
  redeemed_at: '2026-10-01T10:00:00Z',
})

/** What the server answers for each cursor: two pages of a 45-claim coupon. */
const PAGES: Record<string, { redemptions: ReturnType<typeof claim>[]; redemption_count: number; next_cursor: string | null }> = {
  first: { redemptions: [claim(1), claim(2)], redemption_count: 45, next_cursor: 'cur-2' },
  'cur-2': { redemptions: [claim(21)], redemption_count: 45, next_cursor: null },
}

const asked = () => vi.mocked(useCouponRedemptions).mock.calls.at(-1)!

beforeEach(() => {
  vi.mocked(useAdminCoupons).mockReturnValue({ data: [coupon], isLoading: false, isError: false } as never)
  vi.mocked(useCouponRedemptions).mockReset()
  vi.mocked(useCouponRedemptions).mockImplementation(((id: string | undefined, params: { cursor?: string } = {}) => ({
    data: id ? PAGES[params.cursor ?? 'first'] : undefined,
    isLoading: false,
  })) as never)
})

function openClaims() {
  render(<CouponsAdminPage />)
  fireEvent.click(screen.getByRole('button', { name: '45 claimed' }))
  return within(screen.getByRole('dialog'))
}

describe('Coupons — who claimed it', () => {
  it('asks for nothing until the list is opened, then for the first page of 20', () => {
    render(<CouponsAdminPage />)
    expect(asked()).toEqual([undefined, { cursor: undefined, limit: 20 }])
    fireEvent.click(screen.getByRole('button', { name: '45 claimed' }))
    expect(asked()).toEqual(['cp1', { cursor: undefined, limit: 20 }])
  })

  it('shows the page it was sent with the server’s count of every claim', () => {
    const dialog = openClaims()
    expect(dialog.getByText('Student 1')).toBeInTheDocument()
    expect(dialog.getByText('Student 2')).toBeInTheDocument()
    expect(dialog.getByText(/45/)).toBeInTheDocument()
    expect(dialog.getByRole('button', { name: 'Previous' })).toBeDisabled()
    expect(dialog.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('pages forward with the cursor the server handed back, and back again', () => {
    const dialog = openClaims()
    fireEvent.click(dialog.getByRole('button', { name: 'Next' }))
    expect(asked()).toEqual(['cp1', { cursor: 'cur-2', limit: 20 }])
    expect(dialog.getByText('Student 21')).toBeInTheDocument()
    expect(dialog.queryByText('Student 1')).not.toBeInTheDocument()
    // The last page: nowhere further to go, and the count is still every claim.
    expect(dialog.getByRole('button', { name: 'Next' })).toBeDisabled()
    expect(dialog.getByText(/45/)).toBeInTheDocument()

    fireEvent.click(dialog.getByRole('button', { name: 'Previous' }))
    expect(asked()).toEqual(['cp1', { cursor: undefined, limit: 20 }])
    expect(dialog.getByText('Student 1')).toBeInTheDocument()
  })
})
