import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-165: the login page after a session ended on its own says why. Owner's decision 151, as
// amended: a link opened while signed out is followed, the same person goes back to the page their
// session ended on, and everyone else lands on their own role's dashboard.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/assets/brand/login-bg.png', () => ({ default: 'login-bg.png' }))

import { api } from '@/api/client'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { endSession } from '@/lib/session'
import { useSessionNoticeStore } from '@/lib/sessionNotice'
import { useAuthStore } from '@/stores/authStore'
import { plainMe, platformMe, staffMe } from '@/test/me'
import { LoginPage } from './LoginPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}

/** The login page as a guard leaves it: reached from `from`, with the rest of the console behind it. */
function renderLogin(from?: string, at = Date.now()) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[{ pathname: '/login', state: from ? { from, at } : null }]}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/dashboard" element={<p>Home dashboard</p>} />
          <Route path="/admin/dashboard" element={<p>Platform dashboard</p>} />
          <Route path="/freelancer/dashboard" element={<p>Freelancer dashboard</p>} />
          <Route path="/clients/:id" element={<p>The client they were on</p>} />
          <Route path="/admin/finance" element={<p>A deep platform page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function signInAs(userId: string, role = 'consultant', me: unknown = staffMe({}, { id: userId })) {
  mockedPost.mockResolvedValueOnce(
    ok({ access_token: 'access-2', refresh_token: 'refresh-2', user: { id: userId, role } }),
  )
  mockedGet.mockResolvedValueOnce(ok(me))
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'asha@example.test' } })
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw' } })
  fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
}

/** A session of `userId` that ended without them asking. */
function sessionEnded(userId: string, reason: 'expired' | 'idle' | 'absolute', page = '/') {
  window.history.pushState({}, '', page)
  useAuthStore.getState().setSession({ access_token: 'access-1', refresh_token: 'refresh-1' })
  appQueryClient.setQueryData(['me'], { user: { id: userId } })
  endSession(reason)
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.getState().clear()
  appQueryClient.clear()
  vi.useRealTimers()
  useSessionNoticeStore.setState({ notice: null, returnPage: null, resumePage: null })
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

  // (a) A link opened while signed out.
  it('opens the address that was asked for while signed out, when the guard sent them just now', async () => {
    renderLogin('/clients/c9')
    signInAs('u1')
    expect(await screen.findByText('The client they were on')).toBeInTheDocument()
  })

  it('ignores an address the guard left more than 30 minutes ago', async () => {
    renderLogin('/clients/c9', Date.now() - 31 * 60 * 1000)
    signInAs('u1')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
  })

  // (b) The same person after their session ended on a page.
  it('takes the same person back to the page their session ended on', async () => {
    sessionEnded('u1', 'idle', '/clients/c1')
    renderLogin()
    signInAs('u1')
    expect(await screen.findByText('The client they were on')).toBeInTheDocument()
  })

  // (c) Someone else on the same computer.
  it('sends a different person to their own dashboard', async () => {
    sessionEnded('u1', 'idle', '/clients/c1')
    renderLogin()
    signInAs('u2')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
    expect(screen.queryByText('The client they were on')).not.toBeInTheDocument()
  })

  // (d) A page kept too long.
  it('sends the same person to the dashboard when their page is more than 12 hours old', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-14T08:00:00Z'))
    sessionEnded('u1', 'idle', '/clients/c1')
    vi.setSystemTime(new Date('2026-10-14T21:00:00Z'))
    renderLogin()
    signInAs('u1')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
  })

  // (e) A page the new role cannot open.
  it('platform staff are not sent to a consultancy page', async () => {
    renderLogin('/clients/c1')
    signInAs('p1', 'platform_staff', platformMe({}, { id: 'p1' }))
    expect(await screen.findByText('Platform dashboard')).toBeInTheDocument()
    expect(screen.queryByText('The client they were on')).not.toBeInTheDocument()
  })

  it('platform staff are taken to a platform page they asked for', async () => {
    renderLogin('/admin/finance')
    signInAs('p1', 'platform_staff', platformMe({}, { id: 'p1' }))
    expect(await screen.findByText('A deep platform page')).toBeInTheDocument()
  })

  it('consultancy and institute staff are not sent to a platform page', async () => {
    renderLogin('/admin/finance')
    signInAs('s1', 'consultancy_admin', staffMe({ is_admin: true }, { id: 's1' }))
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
    expect(screen.queryByText('A deep platform page')).not.toBeInTheDocument()
  })

  it('a freelancer is not sent to a consultancy page', async () => {
    renderLogin('/clients/c1')
    signInAs('f1', 'freelancer', plainMe('freelancer'))
    expect(await screen.findByText('Freelancer dashboard')).toBeInTheDocument()
    expect(screen.queryByText('The client they were on')).not.toBeInTheDocument()
  })

  it('goes to the home page when no address was asked for', async () => {
    renderLogin()
    signInAs('u1')
    expect(await screen.findByText('Home dashboard')).toBeInTheDocument()
  })
})

// Owner decision 58 (2026-10-08): the staff of a consultancy suspended with "sign out and block
// all staff" are refused at sign-in, 403 `account_disabled`. The page shows the server's sentence
// as it is, and nobody is signed in.
describe('signing in to a blocked account', () => {
  it('shows the server’s sentence exactly as it came', async () => {
    const sentence = 'You can’t sign in at the moment. Please contact Sentpo support.'
    renderLogin()
    mockedPost.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'account_disabled', message: sentence, request_id: 'r1' } },
      response: { status: 403 },
    } as never)
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'asha@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))

    expect((await screen.findByRole('alert')).textContent).toBe(sentence)
    expect(screen.queryByText('This account is scheduled for deletion')).not.toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})
