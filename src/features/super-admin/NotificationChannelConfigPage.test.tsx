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
