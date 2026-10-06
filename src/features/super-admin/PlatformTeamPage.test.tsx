import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// The immiNow Users directory no longer lists platform staff (owner, 2026-10-06), so the Platform
// Team page is where their sign-in history lives, and where their invited / joined dates show.
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./PersonSignInDrawer', () => ({
  PersonSignInDrawer: ({ person }: { person: { id: string; name: string; kind: string } | null }) =>
    person ? <div role="dialog" aria-label="Sign-in history">{`history:${person.id}:${person.kind}`}</div> : null,
}))
vi.mock('@/queries/platformTeam', () => ({
  usePlatformStaff: vi.fn(),
  useCreatePlatformStaff: vi.fn(),
  useDisablePlatformStaff: vi.fn(),
  useEnablePlatformStaff: vi.fn(),
  useResendPlatformStaffInvite: vi.fn(),
  useUpdatePlatformStaffPermissions: vi.fn(),
}))

import {
  useCreatePlatformStaff,
  useDisablePlatformStaff,
  useEnablePlatformStaff,
  usePlatformStaff,
  useResendPlatformStaffInvite,
  useUpdatePlatformStaffPermissions,
} from '@/queries/platformTeam'
import { useAuthStore } from '@/stores/authStore'
import { PlatformTeamPage } from './PlatformTeamPage'

const NO_FLAGS = {} as never
const STAFF = [
  {
    id: 'staff-devika',
    user_id: 'user-devika',
    name: 'Devika Rao',
    email: 'devika.platformstaff@example.com',
    is_super_admin: false,
    active: true,
    status: 'active' as const,
    invited_at: '2026-08-01T10:00:00Z',
    joined_at: '2026-08-03T10:00:00Z',
    last_sign_in_at: '2026-10-01T10:00:00Z',
    permissions: NO_FLAGS,
  },
  {
    // Still invited: the server leaves `user_id` out until they accept, so there is no account.
    id: 'staff-new',
    name: 'Nikhil New',
    email: 'nikhil@example.com',
    is_super_admin: false,
    active: false,
    status: 'invited' as const,
    invited_at: '2026-10-04T10:00:00Z',
    joined_at: null,
    last_sign_in_at: null,
    permissions: NO_FLAGS,
  },
]

function mutation() {
  return { mutate: vi.fn(), isPending: false, isError: false, error: null } as never
}

function signInWith(permissions: Record<string, boolean>) {
  useAuthStore.setState({
    accessToken: 'test-token',
    user: { id: 'user-ananya', platform_permissions: permissions } as never,
  })
}

beforeEach(() => {
  vi.mocked(usePlatformStaff).mockReturnValue({ data: STAFF, isLoading: false, isError: false } as never)
  for (const hook of [
    useCreatePlatformStaff,
    useDisablePlatformStaff,
    useEnablePlatformStaff,
    useResendPlatformStaffInvite,
    useUpdatePlatformStaffPermissions,
  ]) {
    vi.mocked(hook).mockReturnValue(mutation())
  }
  signInWith({ team_management: true, user_directory: true })
})

describe('PlatformTeamPage sign-in history', () => {
  it('opens the sign-in history for a person with an account, without opening the staff drawer', () => {
    render(<PlatformTeamPage />)
    const row = screen.getByText('Devika Rao').closest('tr')!
    fireEvent.click(within(row).getByRole('button', { name: 'View history' }))
    expect(screen.getByRole('dialog', { name: 'Sign-in history' }).textContent).toBe('history:user-devika:platform_staff')
    // The staff drawer (permissions, actions) is the row's own click and must stay closed.
    expect(screen.queryByText('Access', { selector: 'h4' })).toBeNull()
  })

  it('offers none for someone still invited, who has no account yet', () => {
    render(<PlatformTeamPage />)
    const row = screen.getByText('Nikhil New').closest('tr')!
    expect(within(row).queryByRole('button', { name: 'View history' })).toBeNull()
    expect(within(row).getByText('No account yet')).toBeTruthy()
  })

  it('is not offered without the user directory permission, which the server requires for it', () => {
    signInWith({ team_management: true, user_directory: false })
    render(<PlatformTeamPage />)
    expect(screen.queryByRole('button', { name: 'View history' })).toBeNull()
    expect(screen.queryByText('Sign-in history')).toBeNull()
  })

  it('shows invited and joined dates in the table', () => {
    render(<PlatformTeamPage />)
    expect(screen.getByText('Invited / Joined')).toBeTruthy()
    const row = screen.getByText('Nikhil New').closest('tr')!
    // Invited, not yet joined: the joined half is a dash.
    expect(within(row).getByText(/\/ —$/)).toBeTruthy()
  })
})
