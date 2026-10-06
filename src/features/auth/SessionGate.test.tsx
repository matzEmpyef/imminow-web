import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-036. Every signed-in route waits for `GET /me` and decides from it. Pinned here:
//   - nothing is drawn (no shell, no "no access") until the answer is in;
//   - a failed read offers "Try again" and "Log out", never a blank page;
//   - the two refusals `/me` gives show the server's own message instead of a shell;
//   - each guard opens for its own scope and sends everyone else to THEIR home;
//   - platform pages follow the grants in the current answer, not a copy made at sign-in.
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
const logout = vi.fn()
vi.mock('@/lib/useLogout', () => ({ useLogout: () => logout }))

import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, meFailed, meLoading, meRefused, plainMe, platformMe, staffMe } from '@/test/me'
import { ConsultancyRoute } from './ConsultancyRoute'
import { FreelancerRoute } from './FreelancerRoute'
import { PlatformRoute } from './PlatformRoute'
import { ProtectedRoute } from './ProtectedRoute'

const mockedMe = vi.mocked(useMe)

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/login" element={<p>Login page</p>} />
        <Route path="/account" element={<ProtectedRoute><p>My account</p></ProtectedRoute>} />
        <Route path="/dashboard" element={<ConsultancyRoute><p>Consultancy dashboard</p></ConsultancyRoute>} />
        <Route path="/admin/dashboard" element={<PlatformRoute><p>Console dashboard</p></PlatformRoute>} />
        <Route path="/admin/ratings" element={<PlatformRoute permission="consultancy_approval"><p>Ratings page</p></PlatformRoute>} />
        <Route
          path="/admin/case-followups"
          element={<PlatformRoute anyPermission={['finance', 'support']}><p>Follow-ups</p></PlatformRoute>}
        />
        <Route path="/freelancer/dashboard" element={<FreelancerRoute><p>Freelancer dashboard</p></FreelancerRoute>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  logout.mockClear()
  useAuthStore.setState({ accessToken: 'token', refreshToken: 'refresh' })
})

describe('before /me has answered', () => {
  it('sends someone who is not signed in to the login page', () => {
    useAuthStore.setState({ accessToken: null, refreshToken: null })
    mockedMe.mockReturnValue(meLoading())
    renderAt('/dashboard')
    expect(screen.getByText('Login page')).toBeInTheDocument()
  })

  it.each(['/account', '/dashboard', '/admin/dashboard', '/admin/ratings', '/freelancer/dashboard'])(
    'holds a loading state on %s: no page, no redirect, no denial',
    (path) => {
      mockedMe.mockReturnValue(meLoading())
      renderAt(path)
      expect(screen.getByRole('status')).toHaveTextContent('Loading your account…')
      expect(screen.queryByText(/dashboard|My account|Ratings page|Login page/i)).not.toBeInTheDocument()
      expect(screen.queryByText(/access/i)).not.toBeInTheDocument()
    },
  )
})

describe('when /me could not be read', () => {
  it('offers Try again and Log out instead of a blank page', () => {
    const refetch = vi.fn()
    mockedMe.mockReturnValue(meFailed(new TypeError('Failed to fetch'), undefined, refetch))
    renderAt('/dashboard')
    expect(screen.getByRole('heading', { name: 'We could not load your account' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Check your connection and try again.')
    expect(screen.queryByText('Consultancy dashboard')).not.toBeInTheDocument()
    expect(screen.queryByText('Login page')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(refetch).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it('keeps the page up when only a background refresh failed', () => {
    mockedMe.mockReturnValue(meFailed(new TypeError('Failed to fetch'), staffMe()))
    renderAt('/dashboard')
    expect(screen.getByText('Consultancy dashboard')).toBeInTheDocument()
  })
})

describe('when /me refuses the caller', () => {
  it("shows the server's message for a disabled account, with no shell", () => {
    mockedMe.mockReturnValue(meRefused('account_disabled', 'Your account has been disabled. Contact your admin.'))
    renderAt('/dashboard')
    expect(screen.getByRole('heading', { name: 'Your account is switched off' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your account has been disabled. Contact your admin.')
    expect(screen.queryByText('Consultancy dashboard')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }))
    expect(logout).toHaveBeenCalledTimes(1)
  })

  it("shows the server's message to staff of a lapsed consultancy", () => {
    mockedMe.mockReturnValue(
      meRefused('subscription_lapsed', 'Your consultancy’s subscription has lapsed. Only admins can sign in.'),
    )
    renderAt('/dashboard')
    expect(screen.getByRole('heading', { name: 'Your subscription has ended' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Only admins can sign in.')
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('takes the page away when a later answer is a refusal, even though an earlier one is still held', () => {
    mockedMe.mockReturnValue(meRefused('account_disabled', 'Your account has been disabled.', staffMe()))
    renderAt('/dashboard')
    expect(screen.queryByText('Consultancy dashboard')).not.toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Your account has been disabled.')
  })
})

describe('each guard opens for its own scope', () => {
  it('lets consultancy staff, institute staff and the admin of a lapsed consultancy into the consultancy pages', () => {
    for (const me of [
      staffMe(),
      staffMe({ consultancy_kind: 'institute', college_id: 'college-1' }),
      staffMe({ is_admin: true, lapsed: true }),
    ]) {
      mockedMe.mockReturnValue(meAnswered(me))
      const view = renderAt('/dashboard')
      expect(screen.getByText('Consultancy dashboard')).toBeInTheDocument()
      view.unmount()
    }
  })

  it('sends a platform account that opens a consultancy page to the console', () => {
    mockedMe.mockReturnValue(meAnswered(platformMe()))
    renderAt('/dashboard')
    expect(screen.getByText('Console dashboard')).toBeInTheDocument()
  })

  it('sends consultancy staff who open a console page to their own dashboard', () => {
    mockedMe.mockReturnValue(meAnswered(staffMe()))
    renderAt('/admin/ratings')
    expect(screen.getByText('Consultancy dashboard')).toBeInTheDocument()
  })

  it('sends a freelancer and a student to their own pages', () => {
    mockedMe.mockReturnValue(meAnswered(plainMe('freelancer')))
    const first = renderAt('/dashboard')
    expect(screen.getByText('Freelancer dashboard')).toBeInTheDocument()
    first.unmount()

    mockedMe.mockReturnValue(meAnswered(plainMe('student')))
    renderAt('/admin/dashboard')
    expect(screen.getByText('My account')).toBeInTheDocument()
  })

  it('goes by scope, not by the role name on the user', () => {
    // A role this build has never heard of still lands in the shell the server names.
    mockedMe.mockReturnValue(meAnswered({ ...platformMe(), user: { ...platformMe().user, role: 'something_new' as never } }))
    renderAt('/dashboard')
    expect(screen.getByText('Console dashboard')).toBeInTheDocument()
  })
})

describe('platform pages follow the grants in the current answer', () => {
  it('opens a page for a staffer who holds its grant', () => {
    mockedMe.mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
    renderAt('/admin/ratings')
    expect(screen.getByText('Ratings page')).toBeInTheDocument()
  })

  it('keeps a staffer without the grant inside the console, on its dashboard', () => {
    mockedMe.mockReturnValue(meAnswered(platformMe({ finance: true })))
    renderAt('/admin/ratings')
    expect(screen.getByText('Console dashboard')).toBeInTheDocument()
  })

  it('closes the page as soon as the grant is gone from the answer, with no new sign-in', () => {
    mockedMe.mockReturnValue(meAnswered(platformMe({ consultancy_approval: true })))
    const view = renderAt('/admin/ratings')
    expect(screen.getByText('Ratings page')).toBeInTheDocument()

    mockedMe.mockReturnValue(meAnswered(platformMe({ consultancy_approval: false })))
    view.rerender(
      <MemoryRouter initialEntries={['/admin/ratings']}>
        <Routes>
          <Route path="/admin/dashboard" element={<p>Console dashboard</p>} />
          <Route path="/admin/ratings" element={<PlatformRoute permission="consultancy_approval"><p>Ratings page</p></PlatformRoute>} />
        </Routes>
      </MemoryRouter>,
    )
    expect(screen.queryByText('Ratings page')).not.toBeInTheDocument()
  })

  it('opens an any-of page for either grant and for neither sends them to the dashboard', () => {
    mockedMe.mockReturnValue(meAnswered(platformMe({ support: true })))
    const first = renderAt('/admin/case-followups')
    expect(screen.getByText('Follow-ups')).toBeInTheDocument()
    first.unmount()

    mockedMe.mockReturnValue(meAnswered(platformMe({ jobs: true })))
    renderAt('/admin/case-followups')
    expect(screen.getByText('Console dashboard')).toBeInTheDocument()
  })

  it('treats a platform account with no grants listed as holding none', () => {
    mockedMe.mockReturnValue(meAnswered({ ...platformMe(), user: { ...platformMe().user, platform_permissions: null } }))
    renderAt('/admin/ratings')
    expect(screen.getByText('Console dashboard')).toBeInTheDocument()
  })
})
