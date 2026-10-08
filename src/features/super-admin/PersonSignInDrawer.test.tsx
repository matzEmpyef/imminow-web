import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-302: "Go to record" opens the clicked student's own case. When that student is missing
// from the lookup it says so; it never opens another student's case instead.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn() } }))
vi.mock('@/queries/adminUserDirectories', () => ({
  SIGN_IN_HISTORY_LIMIT: 20,
  useUserSignIns: () => ({ isLoading: true, isError: false, data: undefined }),
  useSignOutEverywhere: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
}))

import { api } from '@/api/client'
import { PersonSignInDrawer } from './PersonSignInDrawer'

const mockedGet = vi.mocked(api.GET)

const student = {
  id: 'u-asha',
  name: 'Asha Rao',
  email: 'asha@example.com',
  kind: 'student' as const,
  hasCase: true,
}

function lookup(items: { id: string; journey_id?: string }[]) {
  mockedGet.mockResolvedValue({ data: { items }, error: undefined, response: { status: 200 } } as never)
}

function renderDrawer() {
  return render(
    <MemoryRouter initialEntries={['/start']}>
      <Routes>
        <Route path="/start" element={<PersonSignInDrawer person={student} onClose={vi.fn()} />} />
        <Route path="/admin/applicants/:id" element={<p>case opened</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => mockedGet.mockReset())

describe('PersonSignInDrawer - Go to record for a student', () => {
  it("opens the student's own case", async () => {
    lookup([
      { id: 'u-other', journey_id: 'j-other' },
      { id: 'u-asha', journey_id: 'j-asha' },
    ])
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Go to record' }))
    expect(await screen.findByText('case opened')).toBeInTheDocument()
  })

  it("says the case could not be found, and opens nobody else's, when the student is not in the results", async () => {
    lookup([{ id: 'u-other', journey_id: 'j-other' }])
    renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Go to record' }))
    await waitFor(() => expect(screen.getByText("Could not find this student's case.")).toBeInTheDocument())
    expect(screen.queryByText('case opened')).not.toBeInTheDocument()
  })
})
