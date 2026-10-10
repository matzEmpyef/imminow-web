import { render, screen, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The webinar email's button opens /webinar#<token> (owner's ruling 2026-10-10). Public, no account.
// The token is read from the address, sent in the body once, and the address is cleaned; then the
// student is sent on to the meeting, or shown the server's sentence.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/externalRedirect', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/externalRedirect')>()),
  goTo: vi.fn(),
}))

import { api } from '@/api/client'
import { goTo } from '@/lib/externalRedirect'
import { WebinarLinkPage } from './WebinarLinkPage'

const mockedPost = vi.mocked(api.POST)
const mockedGoTo = vi.mocked(goTo)

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}
function refused(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message, status } }, response: { status } } as never
}

function Address() {
  const location = useLocation()
  return <p data-testid="address">{location.pathname + location.search + location.hash}</p>
}

function renderAt(address: string, strict = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[address]}>
        <Address />
        <Routes>
          <Route path="/webinar/:token?" element={<WebinarLinkPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree)
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockedPost.mockReset()
  mockedGoTo.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('the webinar link page', () => {
  it('sends the token from the fragment in the body, cleans the address, then moves on', async () => {
    mockedPost.mockResolvedValue(
      ok({ redirect_url: 'https://meet.example.com/abc', event_title: 'Visa Q&A', points_awarded: 5 }),
    )
    renderAt('/webinar#tok-123')

    expect(await screen.findByRole('heading', { name: 'Taking you to Visa Q&A…' })).toBeInTheDocument()
    expect(screen.getByText(/You earned 5 points/)).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedPost).toHaveBeenCalledWith(
      '/events/webinar-link/attend',
      expect.objectContaining({ body: { token: 'tok-123' } }),
    )
    expect(screen.getByTestId('address')).toHaveTextContent(/^\/webinar$/)

    expect(mockedGoTo).not.toHaveBeenCalled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(mockedGoTo).toHaveBeenCalledWith('https://meet.example.com/abc')
  })

  it('does not mention points when none were awarded', async () => {
    mockedPost.mockResolvedValue(
      ok({ redirect_url: 'https://meet.example.com/abc', event_title: 'Visa Q&A', points_awarded: null }),
    )
    renderAt('/webinar#tok-123')
    await screen.findByRole('heading', { name: 'Taking you to Visa Q&A…' })
    expect(screen.queryByText(/You earned/)).not.toBeInTheDocument()
  })

  it('calls the server exactly once, even when React mounts the page twice', async () => {
    mockedPost.mockResolvedValue(
      ok({ redirect_url: 'https://meet.example.com/abc', event_title: 'Visa Q&A', points_awarded: 0 }),
    )
    renderAt('/webinar#tok-123', true)
    await screen.findByRole('heading', { name: 'Taking you to Visa Q&A…' })
    expect(mockedPost).toHaveBeenCalledTimes(1)
  })

  it("shows the server's sentence when the link is refused, with no retry and no meeting address", async () => {
    mockedPost.mockResolvedValue(
      refused(410, 'gone', 'This link has already been used. Tap Join in the Sentpo app, or ask for the link again.'),
    )
    renderAt('/webinar#tok-123')

    expect(await screen.findByRole('alert')).toHaveTextContent('This link has already been used.')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000)
    })
    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedGoTo).not.toHaveBeenCalled()
  })

  it('says the link is not valid, without calling the server, when there is no token', async () => {
    renderAt('/webinar')
    expect(await screen.findByRole('alert')).toHaveTextContent('This link is not valid.')
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('never sends the browser to an address that is not a web address', async () => {
    mockedPost.mockResolvedValue(
      ok({ redirect_url: 'javascript:alert(1)', event_title: 'Visa Q&A', points_awarded: 0 }),
    )
    renderAt('/webinar#tok-123')
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(mockedGoTo).not.toHaveBeenCalled()
  })
})
