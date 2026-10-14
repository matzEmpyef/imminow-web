import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

// Notification types the server sends are given plain names; one with no name reads as its raw
// type. `admin_role_handed_over` (Support changed a consultancy's administrator) must have its name.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('@/queries/notificationChannelConfig', () => ({
  useNotificationChannelConfig: vi.fn(),
  useUpdateNotificationChannelConfig: () => ({ mutate: vi.fn(), isPending: false }),
}))

import { useNotificationChannelConfig } from '@/queries/notificationChannelConfig'
import { NotificationChannelConfigPage } from './NotificationChannelConfigPage'

describe('Notification Channel Config', () => {
  it('names the administrator notice instead of showing its raw type', () => {
    vi.mocked(useNotificationChannelConfig).mockReturnValue({
      data: [
        {
          notification_type: 'admin_role_handed_over',
          audience: 'imminow',
          in_app_enabled: true,
          push_enabled: true,
          email_enabled: true,
        },
      ],
      isLoading: false,
      isError: false,
    } as never)
    render(<NotificationChannelConfigPage />)
    expect(
      screen.getByText('Support made someone else the administrator of a consultancy (to the new administrator and the former one)'),
    ).toBeInTheDocument()
    expect(screen.queryByText('admin_role_handed_over')).not.toBeInTheDocument()
  })
})

// Phase 8: the new bell types read with a plain name, not their raw type.
describe('Notification Channel Config: the newer types', () => {
  it('gives each a plain name', () => {
    const types = [
      'case_dispute_open_3_days',
      'step_review_waiting',
      'step_review_unanswered',
      'client_committed',
      'plan_downgraded',
      'consultancy_unavailable',
    ]
    vi.mocked(useNotificationChannelConfig).mockReturnValue({
      data: types.map((notification_type) => ({
        notification_type,
        audience: 'imminow',
        in_app_enabled: true,
        push_enabled: true,
        email_enabled: true,
      })),
      isLoading: false,
      isError: false,
    } as never)
    render(<NotificationChannelConfigPage />)
    expect(screen.getByText('A dispute has been open for 3 days (immiNow staff)')).toBeInTheDocument()
    expect(screen.getByText('A student became the consultancy’s client')).toBeInTheDocument()
    expect(screen.getByText('immiNow moved the consultancy to a smaller plan (to its admin)')).toBeInTheDocument()
    for (const type of types) expect(screen.queryByText(type)).not.toBeInTheDocument()
  })
})
