import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The admin of a lapsed consultancy is the one person who can still sign in to it. `GET /me`
// tells them so (`staff.lapsed`, review F-036), and that alone must put the renewal notice up —
// whatever the consultancy record says, and before it has loaded.
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn(), useRequestRenewal: vi.fn() }))

import { useMe } from '@/queries/me'
import { useMyConsultancy, useRequestRenewal } from '@/queries/consultancy'
import { meAnswered, staffMe } from '@/test/me'
import { SubscriptionBanner } from './SubscriptionBanner'

const ALL = ['settings.edit_profile']

function consultancy(data: Record<string, unknown> | undefined) {
  vi.mocked(useMyConsultancy).mockReturnValue({ data } as never)
}

beforeEach(() => {
  vi.mocked(useRequestRenewal).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
})

describe('SubscriptionBanner', () => {
  it('says nothing on an active subscription', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true, permissions: ALL })))
    consultancy({ subscription_status: 'active' })
    const { container } = render(<SubscriptionBanner />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows the lapsed notice with Request renewal to the admin /me marks as lapsed', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true, lapsed: true, permissions: ALL })))
    consultancy({ subscription_status: 'lapsed', renewal_requested_at: null })
    render(<SubscriptionBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Your subscription has lapsed.')
    expect(screen.getByRole('status')).toHaveTextContent('you can still serve your existing clients')
    expect(screen.getByRole('button', { name: 'Request renewal' })).toBeInTheDocument()
  })

  it('goes by /me when the consultancy record has not caught up', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true, lapsed: true, permissions: ALL })))
    consultancy({ subscription_status: 'grace', renewal_requested_at: '2026-10-01T09:00:00Z' })
    render(<SubscriptionBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Your subscription has lapsed.')
    expect(screen.getByRole('status')).toHaveTextContent('Renewal requested on')
    expect(screen.queryByRole('button', { name: 'Request renewal' })).not.toBeInTheDocument()
  })

  it('shows the notice before the consultancy record has loaded, and holds the button until it has', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ is_admin: true, lapsed: true, permissions: ALL })))
    consultancy(undefined)
    render(<SubscriptionBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Your subscription has lapsed.')
    expect(screen.queryByRole('button', { name: 'Request renewal' })).not.toBeInTheDocument()
  })

  it('tells staff in the grace period to ask their admin', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ permissions: [] })))
    consultancy({ subscription_status: 'grace', subscription_expires_at: '2026-09-30', grace_ends_at: '2026-10-14' })
    render(<SubscriptionBanner />)
    expect(screen.getByRole('status')).toHaveTextContent('Ask your admin to renew it with immiNow.')
  })
})
