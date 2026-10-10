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
vi.mock('@/lib/me', () => ({ useMyScope: () => 'consultancy' }))
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
})
