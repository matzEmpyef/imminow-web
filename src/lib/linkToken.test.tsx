import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-123 and F-124: the two emailed-link pages read their token from the fragment (new
// links) or the path (links already mailed), send it in the request body only, and take it out of
// the address. The guardian page offers a fresh link when the server no longer knows the token.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/assets/brand/login-bg.png', () => ({ default: 'login-bg.png' }))

import { api } from '@/api/client'
import { SetPasswordPage } from '@/features/auth/SetPasswordPage'
import { GuardianApprovalPage } from '@/features/guardian/GuardianApprovalPage'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status } } as never
}
function refused(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message, status } }, response: { status } } as never
}

function Address() {
  const location = useLocation()
  return <p data-testid="address">{location.pathname + location.hash}</p>
}

function renderAt(address: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Address />
        <Routes>
          <Route path="/set-password/:token?" element={<SetPasswordPage />} />
          <Route path="/guardian/:token?" element={<GuardianApprovalPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const invite = { first_name: 'Asha', consultancy_name: 'Northwind Education', role: 'consultant' }
const pending = { student_first_name: 'Ravi', student_age: 16, status: 'pending' }

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
})

describe('Set Your Password', () => {
  it('reads the token from the fragment, sends it in the body and cleans the address', async () => {
    mockedPost.mockResolvedValue(ok(invite))
    renderAt('/set-password#tok-fragment')

    expect(await screen.findByText('Welcome, Asha')).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledWith('/auth/invite/describe', expect.objectContaining({ body: { token: 'tok-fragment' } }))
    expect(mockedGet).not.toHaveBeenCalled()
    expect(screen.getByTestId('address')).toHaveTextContent(/^\/set-password$/)
  })

  it('still opens a link mailed in the old shape, and accepts with the token in the body', async () => {
    mockedPost.mockImplementation(((path: string) =>
      Promise.resolve(
        path === '/auth/invite/describe' ? ok(invite) : refused(410, 'gone', 'This invite was already used.'),
      )) as never)
    renderAt('/set-password/tok-path')

    expect(await screen.findByText('Welcome, Asha')).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledWith('/auth/invite/describe', expect.objectContaining({ body: { token: 'tok-path' } }))
    expect(screen.getByTestId('address')).toHaveTextContent(/^\/set-password$/)

    fireEvent.change(screen.getByLabelText(/^New password/), { target: { value: 'a-long-password' } })
    fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: 'a-long-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set password and log in' }))

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/auth/invite/accept', {
        body: { token: 'tok-path', password: 'a-long-password' },
      }),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('This invite was already used.')
    // No call anywhere carried the token in a path.
    for (const call of mockedPost.mock.calls as unknown[][]) expect(String(call[0])).not.toContain('{token}')
  })

  it('asks nothing of the server when the address carries no token', () => {
    renderAt('/set-password')
    expect(screen.getByText('Invite expired')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })
})

describe('the guardian approval page', () => {
  it('reads the token from the fragment and answers with it in the body', async () => {
    mockedPost.mockResolvedValueOnce(ok(pending)).mockResolvedValueOnce(ok({ ...pending, status: 'approved' }))
    renderAt('/guardian#g-fragment')

    expect(await screen.findByText("Approve Ravi's Sentpo account")).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledWith('/guardian-consent/prompt', expect.objectContaining({ body: { token: 'g-fragment' } }))
    expect(screen.getByTestId('address')).toHaveTextContent(/^\/guardian$/)

    fireEvent.change(screen.getByLabelText(/^Your full name/), { target: { value: 'Meera Rao' } })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Approve' }))

    expect(await screen.findByText("You approved Ravi's account")).toBeInTheDocument()
    expect(mockedPost).toHaveBeenLastCalledWith('/guardian-consent/decide', {
      body: { token: 'g-fragment', decision: 'approve', guardian_name: 'Meera Rao', confirms_adult_guardian: true },
    })
  })

  it('withdraws with the token of an old-shape link in the body', async () => {
    mockedPost
      .mockResolvedValueOnce(ok({ ...pending, status: 'approved' }))
      .mockResolvedValueOnce(ok({ ...pending, status: 'withdrawn' }))
    renderAt('/guardian/g-path')

    fireEvent.click(await screen.findByRole('button', { name: 'Withdraw my approval' }))
    expect(await screen.findByText('Your approval has been withdrawn')).toBeInTheDocument()
    expect(mockedPost).toHaveBeenLastCalledWith('/guardian-consent/withdraw', { body: { token: 'g-path' } })
    expect(mockedGet).not.toHaveBeenCalled()
  })

  it('offers a fresh link when the link is no longer valid, and says the same thing whatever happened', async () => {
    mockedPost
      .mockResolvedValueOnce(refused(404, 'not_found', 'Not found'))
      .mockResolvedValueOnce(ok({ status: 'accepted' }, 202))
    renderAt('/guardian/g-old')

    expect(await screen.findByText('This link is no longer valid')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Send me a fresh link' }))

    expect(
      await screen.findByText('If this link was for an approval you gave, we have emailed you a new one.'),
    ).toBeInTheDocument()
    expect(mockedPost).toHaveBeenLastCalledWith('/guardian-consent/fresh-link', { body: { token: 'g-old' } })
    expect(screen.queryByRole('button', { name: 'Send me a fresh link' })).not.toBeInTheDocument()
  })

  it('does not call a working link invalid when the server could not be reached', async () => {
    mockedPost.mockResolvedValueOnce(refused(503, 'http_503', ''))
    renderAt('/guardian/g-fine')

    expect(await screen.findByText('We could not open this page')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send me a fresh link' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
