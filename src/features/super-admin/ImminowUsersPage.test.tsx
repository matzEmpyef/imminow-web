import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// The immiNow Users directory lists consultancy and institute staff only (owner, 2026-10-06): the
// platform's own staff moved to the Platform Team page. The cut is the server's, so what is worth
// pinning here is what the page no longer shows — the Kind column on screen and in the CSV — and
// that a row still opens the sign-in history (the interaction the platform team kept elsewhere).
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./finance/ConsultancySearchSelect', () => ({
  ConsultancySearchSelect: () => <div data-testid="consultancy-filter" />,
}))
vi.mock('./PersonSignInDrawer', () => ({
  PersonSignInDrawer: ({ person }: { person: { id: string; name: string; kind: string } | null }) =>
    person ? <div role="dialog">{`history:${person.id}:${person.kind}`}</div> : null,
}))
vi.mock('@/queries/adminUserDirectories', () => ({
  useImminowUserDirectory: vi.fn(),
  fetchAllImminowUserDirectory: vi.fn(),
}))
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csv')>()),
  downloadCsv: vi.fn(),
}))

import { fetchAllImminowUserDirectory, useImminowUserDirectory } from '@/queries/adminUserDirectories'
import { downloadCsv } from '@/lib/csv'
import { ImminowUsersPage } from './ImminowUsersPage'

const ROWS = [
  {
    id: 'user-priya',
    kind: 'consultancy_staff' as const,
    name: 'Priya Nair',
    email: 'priya.admin@example.com',
    consultancy_name: 'Northstar Overseas',
    designation: 'Owner/Admin',
    active: true,
    invited_at: '2026-08-01T10:00:00Z',
    accepted_at: '2026-08-02T10:00:00Z',
    last_login_at: '2026-10-01T10:00:00Z',
  },
]

beforeEach(() => {
  vi.mocked(useImminowUserDirectory).mockReturnValue({
    data: { items: ROWS, meta: { total: 1, next_cursor: null } },
    isLoading: false,
    isError: false,
  } as never)
  vi.mocked(fetchAllImminowUserDirectory).mockResolvedValue(ROWS as never)
  vi.mocked(downloadCsv).mockClear()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <ImminowUsersPage />
    </MemoryRouter>,
  )
}

describe('ImminowUsersPage', () => {
  it('has no Kind column, and says it is for consultancy staff', () => {
    renderPage()
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.trim())
    expect(headers).toEqual(['Name', 'Consultancy', 'Designation', 'Status', 'Invited / Accepted', 'Last login'])
    expect(screen.queryByText('Kind')).toBeNull()
    expect(screen.queryByText('Consultancy Staff')).toBeNull()
    expect(screen.queryByText('Platform Staff')).toBeNull()
    expect(screen.getByText('Priya Nair')).toBeTruthy()
  })

  it('still opens the sign-in history from a row', () => {
    renderPage()
    fireEvent.click(screen.getByText('Priya Nair'))
    expect(screen.getByRole('dialog').textContent).toBe('history:user-priya:consultancy_staff')
  })

  it('leaves Kind out of the CSV export too', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'Download CSV' }))
    await waitFor(() => expect(downloadCsv).toHaveBeenCalledTimes(1))
    const csv = vi.mocked(downloadCsv).mock.calls[0][1]
    expect(csv.split('\r\n')[0]).toBe('Name,Email,Consultancy,Designation,Status,Invited,Accepted,Last login')
    expect(csv).not.toMatch(/Platform Staff|Consultancy Staff/)
  })
})
