import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-165: the login page after a session ended on its own. It says why, and the same person
// signing in again is taken back to the page they were on; anyone else starts at their home page.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/assets/brand/login-bg.png', () => ({ default: 'login-bg.png' }))

import { api } from '@/api/client'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useSessionNoticeStore } from '@/lib/sessionNotice'
import { useAuthStore } from '@/stores/authStore'
import { staffMe } from '@/test/me'
import { LoginPage } from './LoginPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}

/** The login page as a guard leaves it: reached from `from`, with the rest of the console behind it. */
function renderLogin(from?: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from } : null }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Home dashboard</p>} />
          <Route path="/clients/:id" element={<p>The client they were on</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function signInAs(userId: string) {
  mockedPost.mockResolvedValueOnce(
    ok({ access_token: 'access-2', refresh_token: 'refresh-2', user: { id: userId, role: 'consultant' } }),
  )
  mockedGet.mockResolvedValueOnce(ok(staffMe({}, { id: userId })))
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'asha@example.test' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

/** A session of `userId` that ended without them asking. */
function sessionEnded(userId: string, reason: 'expired' | 'idle' | 'absolute') {
  useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
  appQueryClient.setQueryData(['me'], { user: { id: userId } })
  endSession(reason)
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.getState().clear()
  appQueryClient.clear()
  useSessionNoticeStore.setState({ notice: null, returnBlocked: false })
})

describe('the login page after a session ended', () => {
  it.each([
    ['expired', 'Your session has ended. Log in again to carry on where you left off.'],
    ['idle', 'You were signed out after 30 minutes without activity.'],
    ['absolute', 'You were signed out after 12 hours for security. Please sign in again.'],
  ] as const)('says why (%s)', (reason, message) => {
    sessionEnded('u1', reason)
    renderLogin('/clients/c1')
    expect(screen.getByRole('status')).toHaveTextContent(message)
  })

  it('says nothing after an ordinary log out', () => {
    useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
    endSession()
    renderLogin()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('takes the same person back to the page they were on', async () => {
    sessionEnded('u1', 'expired')
    renderLogin('/clients/c1')
    signInAs('u1')
    expect(await screen.findByText('The client they were on')).toBeInTheDocument()
  })

  it('sends a different person to their own home page', async () => {
    sessionEnded('u1', 'expired')
    renderLogin('/clients/c1')
    signInAs('u2')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
  })

  it('opens the address that was asked for while signed out', async () => {
    renderLogin('/clients/c9')
    signInAs('u1')
    expect(await screen.findByText('The client they were on')).toBeInTheDocument()
  })

  it('goes to the home page when no address was asked for', async () => {
    renderLogin()
    signInAs('u1')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
  })
})
