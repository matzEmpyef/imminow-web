import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-146: a holder of "manage designations" could raise their own designation. The server
// refuses it; the dialog now opens read-only for the designation the caller is on, saying why,
// instead of offering switches that fail on Save. The Owner/Admin edits any designation.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { isOwnDesignation } from '@/lib/permissions'
import { useMe } from '@/queries/me'
import { meAnswered, staffMe } from '@/test/me'
import { DesignationPermissionsModal } from './DesignationPermissionsModal'

const AVAILABLE = ['leads.view_own', 'leads.view_all', 'staff.manage_designations']
const COUNSELLOR = { id: 'd1', name: 'Counsellor', protected: false, permissions: { 'leads.view_own': true } } as never
const MANAGER = { id: 'd2', name: 'Branch Manager', protected: false, permissions: { 'leads.view_all': true } } as never

function openDialog(designation: never, staff: Parameters<typeof staffMe>[0]) {
  vi.mocked(useMe).mockReturnValue(meAnswered(staffMe({ available_permissions: AVAILABLE, ...staff })))
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <DesignationPermissionsModal designation={designation} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: /^View permissions for / }))
}

beforeEach(() => {
  vi.mocked(useMe).mockReset()
})

describe("the designation dialog and the caller's own designation", () => {
  it('opens read-only, saying why, for the designation the caller is on', () => {
    openDialog(COUNSELLOR, { designation_id: 'd1', permissions: ['staff.manage_designations'] })
    expect(screen.getByText('You cannot edit the designation you are on. Ask the Owner/Admin.')).toBeInTheDocument()
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save Changes' })).not.toBeInTheDocument()
  })

  it('stays editable for any other designation', () => {
    openDialog(MANAGER, { designation_id: 'd1', permissions: ['staff.manage_designations'] })
    expect(screen.queryByText(/You cannot edit the designation you are on/)).not.toBeInTheDocument()
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeInTheDocument()
  })

  it('stays editable for the Owner/Admin, whatever designation they are on', () => {
    openDialog(COUNSELLOR, { designation_id: 'd1', is_admin: true })
    expect(screen.queryByText(/You cannot edit the designation you are on/)).not.toBeInTheDocument()
    for (const toggle of screen.getAllByRole('switch')) expect(toggle).toBeEnabled()
  })

  it('the rule itself', () => {
    expect(isOwnDesignation({ is_admin: false, designation_id: 'd1' }, 'd1')).toBe(true)
    expect(isOwnDesignation({ is_admin: false, designation_id: 'd1' }, 'd2')).toBe(false)
    expect(isOwnDesignation({ is_admin: true, designation_id: 'd1' }, 'd1')).toBe(false)
    expect(isOwnDesignation({ is_admin: false, designation_id: null }, 'd1')).toBe(false)
    expect(isOwnDesignation(null, 'd1')).toBe(false)
  })
})
