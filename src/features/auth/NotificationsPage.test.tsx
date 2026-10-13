import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The bell list is driven by what the server sends (title, body, deep link), not by a list of
// notification types kept here, so a type the console has never heard of reads like any other.
// `staff_invite_lapsed` (owner's ruling 2026-10-09) is the lost-invite notice the admins get when
// an invited person accepts another consultancy's invite: it must show its own title and body and
// open the team page.
vi.mock('@/features/auth/shellForScope', () => ({
  shellForScope: () =>
    function Shell({ children }: { children: ReactNode }) {
      return <div>{children}</div>
    },
}))
const scope = vi.hoisted(() => ({ value: 'consultancy' }))
vi.mock('@/lib/me', () => ({ useMyScope: () => scope.value }))
vi.mock('@/queries/notifications', () => ({
  useNotifications: vi.fn(),
  useMarkNotificationRead: vi.fn(),
  useMarkAllNotificationsRead: vi.fn(),
}))

import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from '@/queries/notifications'
import { NotificationsPage } from './NotificationsPage'

const idle = { mutate: vi.fn(), isPending: false }

function serve(items: Record<string, unknown>[]) {
  vi.mocked(useNotifications).mockReturnValue({
    data: { items, unread_count: items.length, meta: { next_cursor: null, total: items.length } },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never)
}

beforeEach(() => {
  scope.value = 'consultancy'
  vi.mocked(useMarkNotificationRead).mockReturnValue(idle as never)
  vi.mocked(useMarkAllNotificationsRead).mockReturnValue(idle as never)
})

describe('the notification list', () => {
  it('shows the lost-invite notice with its title and body, and links to the team page', () => {
    serve([
      {
        id: 'n1',
        type: 'staff_invite_lapsed',
        title: 'An invitation is no longer valid',
        body: 'Your invitation to Asha Nair can no longer be used. They have been removed from your team list and their seat is free again.',
        deep_link: '/administration/employees',
        read: false,
        created_at: new Date().toISOString(),
      },
    ])
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('An invitation is no longer valid')).toBeInTheDocument()
    expect(screen.getByText(/can no longer be used\. They have been removed from your team list/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /An invitation is no longer valid/ })).toHaveAttribute(
      'href',
      '/administration/employees',
    )
    expect(screen.queryByText(/unknown/i)).not.toBeInTheDocument()
  })

  it('shows the variant for work that was already assigned in the same way', () => {
    serve([
      {
        id: 'n2',
        type: 'staff_invite_lapsed',
        title: 'An invitation is no longer valid',
        body: 'Your invitation to Asha Nair can no longer be used. They have been switched off and their seat is free again. Leads, clients or tasks that were assigned to them need a new owner.',
        deep_link: '/administration/employees',
        read: true,
        created_at: new Date().toISOString(),
      },
    ])
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    expect(screen.getByText(/need a new owner/)).toBeInTheDocument()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/administration/employees')
  })

  // T1-07: the server fills the case id into the link; the bell opens that client, and a link left
  // as a template is not followed.
  it('opens the client named in a step notice', () => {
    serve([
      {
        id: 'n3',
        type: 'step_submitted',
        title: 'Step submitted',
        body: 'Asha Nair submitted a step for review.',
        deep_link: '/clients/0192f3a4-7b6c-7d00-9a11-3f5e8c2b1d44',
        read: false,
        created_at: new Date().toISOString(),
      },
    ])
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /Step submitted/ })).toHaveAttribute(
      'href',
      '/clients/0192f3a4-7b6c-7d00-9a11-3f5e8c2b1d44',
    )
  })

  it('does not follow a link the server left as a template', () => {
    serve([
      {
        id: 'n4',
        type: 'step_submitted',
        title: 'Step submitted',
        body: 'A step was submitted for review.',
        deep_link: '/clients/{client_id}',
        read: false,
        created_at: new Date().toISOString(),
      },
    ])
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    // The notice is still listed; it just goes nowhere.
    expect(screen.getByText('Step submitted')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Step submitted/ })).toBeNull()
  })
})

// T4-36: a freelancer's notice that carries no address the console serves opens their referrals.
describe('a freelancer’s notices', () => {
  it('open the referrals page when the notice carries no usable address', () => {
    scope.value = 'freelancer'
    serve([
      { id: 'n9', type: 'payout', title: 'A payout is on its way', body: '₹450 for Omar.', deep_link: '/payouts/9', read: false, created_at: new Date().toISOString() },
    ])
    render(
      <MemoryRouter>
        <NotificationsPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole('link', { name: /A payout is on its way/ })).toHaveAttribute('href', '/freelancer/dashboard')
  })
})
