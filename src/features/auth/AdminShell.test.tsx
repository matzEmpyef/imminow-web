import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review I-047: Supply & Demand and Platform Pulse need the `consultancy_approval` permission
// (the server answers anyone else 403), so the console lists them only for someone who holds it.
// The routes carry the same permission (`App.tsx`), through the gate every console page uses.
vi.mock('@/components/SidebarShell', () => ({
  SidebarShell: ({ sections }: { sections: { sidebarLinks: { label: string }[] }[] }) => (
    <ul>
      {sections.flatMap((section) => section.sidebarLinks).map((link) => (
        <li key={link.label}>{link.label}</li>
      ))}
    </ul>
  ),
}))
vi.mock('@/components/NotificationsDropdown', () => ({ NotificationsDropdown: () => null }))
vi.mock('@/queries/adminDashboard', () => ({ useAdminAttention: () => ({ data: { open_count: 0 } }) }))
vi.mock('@/lib/me', () => ({ usePlatformPermissions: vi.fn(), useIsSuperAdmin: () => false }))

import { usePlatformPermissions } from '@/lib/me'
import { AdminShell } from './AdminShell'

function show(permissions: Record<string, boolean>) {
  vi.mocked(usePlatformPermissions).mockReturnValue(permissions as never)
  render(
    <MemoryRouter initialEntries={['/admin/dashboard']}>
      <AdminShell>
        <p>page</p>
      </AdminShell>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.mocked(usePlatformPermissions).mockReset()
})

describe('console navigation — the reporting pages', () => {
  it('lists Supply & Demand and Platform Pulse for a holder of consultancy_approval', () => {
    show({ consultancy_approval: true })
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('Supply & Demand')).toBeInTheDocument()
    expect(screen.getByText('Platform Pulse')).toBeInTheDocument()
  })

  it('leaves both out for platform staff without it, and keeps the pages everyone has', () => {
    show({ finance: true, support: true })
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByText('Needs attention')).toBeInTheDocument()
    expect(screen.queryByText('Supply & Demand')).not.toBeInTheDocument()
    expect(screen.queryByText('Platform Pulse')).not.toBeInTheDocument()
  })
})
