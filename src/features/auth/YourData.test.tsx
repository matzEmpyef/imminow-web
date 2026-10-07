import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The account holder's side of export and deletion in the console (gate 12f): "Your data" on My
// Account (ask for a copy, see it being prepared, download it here), the sign-in notice for an
// account scheduled for deletion, and what a consultancy sees on a case that closed because its
// student deleted their account.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/assets/brand/login-bg.png', () => ({ default: 'login-bg.png' }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { accountDeletedBannerMessage, closeSubReasonLabel, isClosedByAccountDeletion } from '@/lib/clientStatus'
import { isAllowedDeepLink } from '@/lib/deepLinks'
import { ReopenClientModal } from '@/features/clients/ReopenClientModal'
import type { ExportRequest } from '@/queries/dataExports'
import { LoginPage } from './LoginPage'
import { YourDataCard } from './YourDataCard'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return {
    client,
    ...render(
      <QueryClientProvider client={client}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    ),
  }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('Your data on My Account', () => {
  const READY: ExportRequest = {
    id: 'export-ready',
    status: 'completed',
    requested_at: '2026-10-01T09:00:00Z',
    ready_until: '2026-10-08T09:00:00Z',
    downloadable: true,
  }
  const PREPARING: ExportRequest = { id: 'export-new', status: 'processing', requested_at: '2026-10-06T09:00:00Z', ready_until: null, downloadable: false }
  const EXPIRED: ExportRequest = { id: 'export-old', status: 'completed', requested_at: '2026-09-01T09:00:00Z', ready_until: '2026-09-08T09:00:00Z', downloadable: false }
  const FAILED: ExportRequest = { id: 'export-bad', status: 'failed', requested_at: '2026-09-20T09:00:00Z', ready_until: null, downloadable: false }

  function serveList(items: ExportRequest[]) {
    mockedGet.mockImplementation((async () => ok({ items })) as never)
  }

  /** The row whose copy is in this state. */
  function rowOf(label: string) {
    return screen.getByText(label).closest('div.border-t') as HTMLElement
  }

  it('says what it is for and that nothing has been requested yet', async () => {
    serveList([])
    renderWithClient(<YourDataCard />)
    expect(screen.getByRole('heading', { name: 'Your data' })).toBeInTheDocument()
    expect(
      screen.getByText('Request a copy of everything immiNow holds about you. We email you when it is ready, and you download it here within 7 days.'),
    ).toBeInTheDocument()
    expect(await screen.findByText('You have not requested a copy yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request a copy' })).toBeEnabled()
  })

  it('shows each copy in its state, with Download only on one that is ready', async () => {
    serveList([READY, EXPIRED, FAILED])
    renderWithClient(<YourDataCard />)
    const ready = await waitFor(() => rowOf('Ready'))
    expect(ready).toHaveTextContent(/Download it by .*2026\./)
    expect(within(ready).getByRole('button', { name: 'Download' })).toBeInTheDocument()

    const expired = rowOf('No longer available')
    expect(expired).toHaveTextContent('The download period has ended. Request a new copy.')
    expect(within(expired).queryByRole('button')).not.toBeInTheDocument()

    const failed = rowOf('Not completed')
    expect(failed).toHaveTextContent('This copy could not be prepared. Request a new one.')
    expect(within(failed).queryByRole('button')).not.toBeInTheDocument()
  })

  it('holds Request a copy while one is being prepared', async () => {
    serveList([PREPARING])
    renderWithClient(<YourDataCard />)
    const row = await waitFor(() => rowOf('Being prepared'))
    expect(row).toHaveTextContent('We will email you when it is ready.')
    expect(screen.getByRole('button', { name: 'Request a copy' })).toBeDisabled()
    expect(screen.getByText('A copy is already being prepared.')).toBeInTheDocument()
  })

  it('requests a copy, says where the email goes, and reads the list again', async () => {
    serveList([])
    mockedPost.mockResolvedValueOnce(ok({ export_id: 'export-new', status: 'queued', delivery_email: 'a***a@example.test' }, 202))
    renderWithClient(<YourDataCard />)
    await screen.findByText('You have not requested a copy yet.')
    serveList([PREPARING])
    fireEvent.click(screen.getByRole('button', { name: 'Request a copy' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Your copy is being prepared. We will email a***a@example.test when it is ready.',
    )
    expect(mockedPost).toHaveBeenCalledWith('/profile/export')
    await waitFor(() => expect(rowOf('Being prepared')).toBeInTheDocument())
  })

  it.each([
    ['email_unverified', 'Verify an email address before requesting a copy of your data.'],
    ['conflict', 'Your account is scheduled for deletion, so a copy cannot be requested.'],
  ])("shows the server's message for 409 %s", async (code, message) => {
    serveList([])
    mockedPost.mockResolvedValueOnce(refused(409, code, message))
    renderWithClient(<YourDataCard />)
    await screen.findByText('You have not requested a copy yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Request a copy' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('adds when a copy can be requested for 409 export_on_hold', async () => {
    serveList([])
    mockedPost.mockResolvedValueOnce(
      refused(409, 'export_on_hold', 'Your sign-in email was changed recently, so copies are on hold.', {
        available_at: '2026-10-08T09:30:00Z',
      }),
    )
    renderWithClient(<YourDataCard />)
    await screen.findByText('You have not requested a copy yet.')
    fireEvent.click(screen.getByRole('button', { name: 'Request a copy' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Your sign-in email was changed recently, so copies are on hold.')
    expect(alert).toHaveTextContent(/You can request a copy from .*2026/)
  })

  it('asks for a link at the click, opens it, and leaves it on the row in case the browser stopped it', async () => {
    serveList([READY])
    const opened: string[] = []
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      opened.push(`${this.href} ${this.target} ${this.rel}`)
    })
    mockedPost.mockResolvedValueOnce(ok({ url: 'https://files.example.test/export.zip?sig=abc', expires_in_seconds: 300 }))
    renderWithClient(<YourDataCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))

    const link = await screen.findByRole('link', { name: 'open the download link' })
    expect(mockedPost).toHaveBeenCalledWith('/me/exports/{id}/download', { params: { path: { id: 'export-ready' } } })
    expect(opened).toEqual(['https://files.example.test/export.zip?sig=abc _blank noopener noreferrer'])
    expect(link).toHaveAttribute('href', 'https://files.example.test/export.zip?sig=abc')
    expect(rowOf('Ready')).toHaveTextContent('It works for 5 minutes.')
    click.mockRestore()
  })

  it("shows the server's message when the copy is gone (410) and reads the list again", async () => {
    serveList([READY])
    mockedPost.mockResolvedValueOnce(refused(410, 'gone', 'This copy is past its download period. Request a new one.'))
    renderWithClient(<YourDataCard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Download' }))
    // The same copy, now past its period: the list says so once it is read again.
    serveList([{ ...READY, downloadable: false }])
    expect(await screen.findByText('This copy is past its download period. Request a new one.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Download' })).not.toBeInTheDocument())
    expect(screen.queryByRole('link', { name: 'open the download link' })).not.toBeInTheDocument()
  })

  it('offers Retry when the list could not be read', async () => {
    mockedGet.mockImplementationOnce((async () => refused(500, 'internal_error', '')) as never)
    renderWithClient(<YourDataCard />)
    expect(await screen.findByText(/Could not load your copies\./)).toBeInTheDocument()
    serveList([])
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByText('You have not requested a copy yet.')).toBeInTheDocument()
  })
})

describe('signing in to an account scheduled for deletion', () => {
  beforeEach(() => useAuthStore.setState({ accessToken: null, refreshToken: null }))

  function signIn() {
    renderWithClient(<LoginPage />)
    fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: 'ravi@example.test' } })
    fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }))
  }

  it("shows the server's message under a heading that says what it is, and does not sign in", async () => {
    mockedPost.mockResolvedValueOnce(
      refused(
        403,
        'account_locked_for_erasure',
        'This account is scheduled for deletion on 5 Nov 2026. Contact Sentpo support if you want to keep it.',
        { due_at: '2026-11-05T09:00:00Z' },
      ),
    )
    signIn()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('This account is scheduled for deletion')
    expect(alert).toHaveTextContent('This account is scheduled for deletion on 5 Nov 2026. Contact Sentpo support if you want to keep it.')
    expect(useAuthStore.getState().accessToken).toBeNull()
  })

  it('still shows a wrong password as a plain error', async () => {
    mockedPost.mockResolvedValueOnce(refused(401, 'invalid_credentials', 'Incorrect email or password.'))
    signIn()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Incorrect email or password.')
    expect(alert).not.toHaveTextContent('scheduled for deletion')
  })
})

describe('a case that closed because its student deleted their account', () => {
  it('names the reason "Account deleted" and keeps the other reasons in words', () => {
    expect(closeSubReasonLabel('account_deleted')).toBe('Account deleted')
    expect(closeSubReasonLabel('visa_refused')).toBe('Visa refused')
    expect(closeSubReasonLabel('something_new')).toBe('Something new')
    expect(closeSubReasonLabel(null)).toBeNull()
  })

  it('says what happened and what it means, only for such a case', () => {
    const closed = { close_sub_reason: 'account_deleted', closed_at: '2026-10-06T09:00:00Z' }
    expect(isClosedByAccountDeletion(closed)).toBe(true)
    expect(accountDeletedBannerMessage(closed)).toMatch(
      /^This case closed on .*2026 because the student deleted their Sentpo account\. You can read its history, but it is read-only now\. Payments and invoices already recorded stand\.$/,
    )
    expect(accountDeletedBannerMessage({ close_sub_reason: 'visa_refused' })).toBeNull()
    expect(isClosedByAccountDeletion({ close_sub_reason: null })).toBe(false)
  })

  it("shows the server's refusal when someone tries to reopen it, and stops offering Reopen", async () => {
    mockedPost.mockResolvedValueOnce(
      refused(409, 'closed_by_platform', 'This case was closed when the student deleted their account and cannot be reopened.'),
    )
    renderWithClient(<ReopenClientModal clientId="journey-1" clientName="Meera Pillai" onClose={() => {}} />)
    const reopen = screen.getByRole('button', { name: 'Reopen Case' })
    fireEvent.click(reopen)
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This case was closed when the student deleted their account and cannot be reopened.',
    )
    expect(reopen).toBeDisabled()
  })

  it('leaves Reopen usable after any other refusal', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'case_not_closed', 'This case is not closed.'))
    renderWithClient(<ReopenClientModal clientId="journey-1" clientName="Meera Pillai" onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reopen Case' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('This case is not closed.')
    expect(screen.getByRole('button', { name: 'Reopen Case' })).toBeEnabled()
  })
})

describe('the notice a consultancy gets when a student deletes their account', () => {
  it('opens the case, or the lead conversation, it is about', () => {
    expect(isAllowedDeepLink('/clients/journey-1')).toBe(true)
    expect(isAllowedDeepLink('/leads/lead-1')).toBe(true)
    // The bare prefix names nothing, and nothing outside the console is ever followed.
    expect(isAllowedDeepLink('/leads/')).toBe(false)
    expect(isAllowedDeepLink('//evil.example/leads/1')).toBe(false)
  })
})
