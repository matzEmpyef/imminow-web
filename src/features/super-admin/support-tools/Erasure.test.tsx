import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Account deletion and export in Support Tools (gate 12f, owner decisions 4, 10 and 20). Erasing
// locks the account now and erases after 30 days; until then a Super Admin can keep it. Pinned:
//   - the erase form's three guards (the account's email typed, the operator's password, a second
//     screen that says exactly what will happen) and what it sends, scheduled and immediate;
//   - every refusal shows the server's own words, in the right place;
//   - the Pending erasures list, and who may cancel;
//   - the badge, the disabled export and the "keep account" card on an account already scheduled;
//   - the export's three refusals.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
// The other cards in the popup are not under test, and each would need its own data.
vi.mock('./SwitchConsultancyForm', () => ({ SwitchConsultancyForm: () => null }))
vi.mock('./ChangeEmailForm', () => ({ ChangeEmailForm: () => null }))
vi.mock('./GuardianForm', () => ({ GuardianForm: () => null }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import type { ErasureRequest, UserSearchResult } from '@/queries/supportTools'
import { EraseForm } from './EraseForm'
import { ExportForm } from './ExportForm'
import { PendingErasuresPanel } from './PendingErasuresPanel'
import { UserActionsModal } from './UserActionsModal'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)
const mockedDelete = vi.mocked(api.DELETE)

const STUDENT: UserSearchResult = {
  id: 'user-meera',
  name: 'Meera Pillai',
  email: 'meera@example.test',
  phone: '+91 98765 43210',
  role: 'student',
  case_stage: 'in_plan',
  journey_id: 'journey-1',
  consultancy_name: null,
}
const PHONE_ONLY: UserSearchResult = { ...STUDENT, id: 'user-arun', name: 'Arun Das', email: null }
const SCHEDULED: UserSearchResult = { ...STUDENT, erasure_due_at: '2026-11-05T09:00:00Z' }

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

function signInAs(role: 'super_admin' | 'platform_staff') {
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support_tools: true }, { role })))
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return { client, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  mockedDelete.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  signInAs('super_admin')
})

describe('the erase form', () => {
  const onCancel = vi.fn()

  function renderForm(result: UserSearchResult = STUDENT) {
    onCancel.mockClear()
    return renderWithClient(<EraseForm result={result} onCancel={onCancel} />)
  }

  function fill({ reason = 'Asked by email on 6 October.', identifier = 'meera@example.test', password = 'pw-1' } = {}) {
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: reason } })
    fireEvent.change(screen.getByLabelText(/to confirm/), { target: { value: identifier } })
    fireEvent.change(screen.getByLabelText(/^Your password/), { target: { value: password } })
  }

  const continueButton = () => screen.getByRole('button', { name: 'Continue' })

  it('restates the account in full and says what erasing really does', () => {
    renderForm()
    const facts = screen.getByText('Account ID').closest('dl')!
    expect(facts).toHaveTextContent('Meera Pillai')
    expect(facts).toHaveTextContent('meera@example.test')
    expect(facts).toHaveTextContent('+91 98765 43210')
    expect(facts).toHaveTextContent('Student')
    expect(facts).toHaveTextContent('user-meera')
    expect(
      screen.getByText(/Locks the account now, closes their open cases and chats with the reason .account deleted. and tells each consultancy, and permanently erases their personal data on .*, 30 days from now\. Until then it can be cancelled from the Pending erasures list or by the person signing in\./),
    ).toBeInTheDocument()
  })

  it('stays shut until there is a reason, the matching email and the password', () => {
    renderForm()
    expect(continueButton()).toBeDisabled()
    fill({ identifier: 'someone-else@example.test' })
    expect(continueButton()).toBeDisabled()
    expect(screen.getByText('This does not match the account’s email.')).toBeInTheDocument()
    fill({ password: '' })
    expect(continueButton()).toBeDisabled()
    fill({ reason: '   ' })
    expect(continueButton()).toBeDisabled()
    fill({ identifier: '  MEERA@example.test ' })
    expect(continueButton()).toBeEnabled()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('asks a phone-only account for its phone number', () => {
    renderForm(PHONE_ONLY)
    expect(screen.getByLabelText(/Type the account’s phone number to confirm/)).toBeInTheDocument()
    fill({ identifier: '+91 98765 43210' })
    expect(continueButton()).toBeEnabled()
  })

  it('shows a second screen that says exactly what will happen, and sends nothing until it is confirmed', () => {
    renderForm()
    fill()
    fireEvent.click(continueButton())
    expect(screen.getByText('Schedule erasure for Meera Pillai?')).toBeInTheDocument()
    expect(screen.getByText('The account is locked now. They are signed out and cannot sign in.')).toBeInTheDocument()
    expect(screen.getByText(/Their open cases and chats close with the reason .account deleted., and each consultancy is told\. These stay closed even if the account is kept\./)).toBeInTheDocument()
    expect(screen.getByText(/Their personal data is permanently erased on/)).toHaveTextContent(
      '30 days from now. Until then you can keep the account from Pending erasures, and a student can keep it by signing in.',
    )
    expect(screen.getByText('Payments and invoices already recorded stay, with the name removed.')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(continueButton()).toBeEnabled()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('schedules the erasure with the reason and password, and reports the date the server gave', async () => {
    mockedPost.mockResolvedValueOnce(
      ok({ status: 'erasure_pending', due_at: '2026-11-05T09:00:00Z', cancel_until: '2026-11-05T09:00:00Z' }, 202),
    )
    renderForm()
    fill({ reason: '  Asked by email on 6 October.  ' })
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/users/{id}/erase', {
        params: { path: { id: 'user-meera' } },
        body: { reason: 'Asked by email on 6 October.', password: 'pw-1' },
      }),
    )
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(/^Erasure scheduled for Meera Pillai — their data is erased on .*2026 unless it is cancelled before then\.$/)
    expect(screen.getByText('The account is locked now. You can keep it from Pending erasures on the Support Tools page.')).toBeInTheDocument()
  })

  it('needs a longer reason for an immediate erasure, warns in red, and sends immediate: true', async () => {
    mockedPost.mockResolvedValueOnce(ok({ status: 'erasure_queued', due_at: null, cancel_until: null }, 202))
    renderForm()
    fill({ reason: 'Court order.' })
    fireEvent.click(screen.getByLabelText('Erase immediately (legal request)'))
    expect(screen.getByText('Nothing can be cancelled. The data is erased within minutes.')).toBeInTheDocument()
    expect(screen.getByText('A legal request needs a reason of at least 20 characters.')).toBeInTheDocument()
    expect(continueButton()).toBeDisabled()

    fill({ reason: 'Court order 114/2026, Kochi district court.' })
    fireEvent.click(continueButton())
    expect(screen.getByText('Erase Meera Pillai’s data now?')).toBeInTheDocument()
    expect(screen.getByText('Their personal data is erased within minutes. Nothing can be cancelled.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Erase now' }))

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/users/{id}/erase', {
        params: { path: { id: 'user-meera' } },
        body: { reason: 'Court order 114/2026, Kochi district court.', password: 'pw-1', immediate: true },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent('Erasure started for Meera Pillai.')
    expect(screen.getByText('The account is locked and the data is erased within minutes. This cannot be cancelled.')).toBeInTheDocument()
  })

  it('puts a wrong password on the password field and returns to the form', async () => {
    mockedPost.mockResolvedValueOnce(refused(400, 'invalid_current_password', 'That is not your current password.'))
    renderForm()
    fill()
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))
    expect(await screen.findByText('That is not your current password.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Your password/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each([
    [409, 'lockout_guard', 'This person is still an active employee of Bright Path. Deactivate them first.'],
    [409, 'conflict', 'An erasure is already scheduled for this account on 5 Nov 2026.'],
    [400, 'step_up_required', 'Confirm your password to continue.'],
    [400, 'validation_failed', 'A legal request needs a longer reason.'],
  ])("shows the server's message for %i %s", async (status, code, message) => {
    mockedPost.mockResolvedValueOnce(refused(status, code, message, code === 'conflict' ? { due_at: '2026-11-05T09:00:00Z' } : undefined))
    renderForm()
    fill()
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('says under the reason, always, that it is kept for good and what not to put in it', () => {
    renderForm()
    const note =
      'This reason is kept permanently, also after the account is erased. Do not include the person’s name, contact details or anything they told you — a reference is enough (court order number, ticket number).'
    expect(screen.getByText(note)).toBeInTheDocument()
    expect(screen.queryByText(/State the legal basis\./)).not.toBeInTheDocument()
    expect(screen.queryByText('Kept in the audit log.')).not.toBeInTheDocument()
    // Immediate adds the legal basis.
    fireEvent.click(screen.getByLabelText('Erase immediately (legal request)'))
    expect(screen.getByText(`${note} State the legal basis.`)).toBeInTheDocument()
    // A message about the reason does not push the note away.
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Court order.' } })
    expect(screen.getByText('A legal request needs a reason of at least 20 characters.')).toBeInTheDocument()
    expect(screen.getByText(`${note} State the legal basis.`)).toBeInTheDocument()
  })

  it('on 429 shows the server’s message with the wait, and the form stays filled in', async () => {
    mockedPost.mockResolvedValueOnce(
      refused(429, 'rate_limited', 'You have scheduled 10 erasures in 24 hours. Another Super Admin can continue.', { retry_after_seconds: 7200 }),
    )
    renderForm()
    fill({ reason: 'Ticket 4411' })
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You have scheduled 10 erasures in 24 hours. Another Super Admin can continue.')
    expect(screen.getByText('You can try again in about 2 hours.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Reason/)).toHaveValue('Ticket 4411')
    expect(screen.getByLabelText(/to confirm/)).toHaveValue('meera@example.test')
    expect(screen.getByLabelText(/^Your password/)).toHaveValue('pw-1')
    expect(continueButton()).toBeEnabled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('on 503 says to try again, and the form stays filled in', async () => {
    mockedPost.mockResolvedValueOnce(refused(503, 'service_unavailable', 'Service unavailable.'))
    renderForm()
    fill({ reason: 'Ticket 4411' })
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Support Tools could not check your daily allowance just now, so nothing was done. Try again in a moment.',
    )
    expect(screen.getByLabelText(/^Reason/)).toHaveValue('Ticket 4411')
  })

  it('refreshes the list and the search after a refusal too, since the screen was out of date', async () => {
    mockedPost.mockResolvedValueOnce(refused(409, 'conflict', 'An erasure is already scheduled for this account.'))
    const { client } = renderForm()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    fill()
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Schedule erasure' }))
    await screen.findByRole('alert')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['erasures'] })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-search'] })
  })
})

describe('the Pending erasures list', () => {
  const PENDING: ErasureRequest = {
    id: 'erasure-1',
    user_id: 'user-meera',
    name: 'Meera Pillai',
    email: 'meera@example.test',
    phone: null,
    role: 'student',
    consultancy_name: null,
    status: 'pending',
    immediate: false,
    requested_at: '2026-10-06T09:00:00Z',
    due_at: '2026-11-05T09:00:00Z',
    requested_by: 'self',
    requested_by_name: null,
    cancelled_at: null,
    completed_at: null,
  }
  const BY_SUPPORT: ErasureRequest = {
    ...PENDING,
    id: 'erasure-2',
    user_id: 'user-ravi',
    name: 'Ravi Menon',
    email: 'ravi@example.test',
    role: 'consultant',
    consultancy_name: 'Bright Path',
    status: 'queued',
    immediate: true,
    requested_by: 'support',
    requested_by_name: 'Ananya Rao',
  }
  const KEPT: ErasureRequest = { ...PENDING, id: 'erasure-3', name: 'Old Request', status: 'cancelled', cancelled_at: '2026-10-02T09:00:00Z' }

  function serve() {
    mockedGet.mockImplementation((async (_path: string, init: { params: { query: { filter: { status: string } } } }) =>
      ok({
        items: init.params.query.filter.status === 'ended' ? [KEPT] : [PENDING, BY_SUPPORT],
        meta: { next_cursor: null, total: 2 },
      })) as never)
  }

  function listStatuses() {
    return (mockedGet.mock.calls as unknown as [string, { params: { query: { filter: { status: string } } } }][])
      .filter(([path]) => path === '/admin/erasures')
      .map(([, init]) => init.params.query.filter.status)
  }

  it('lists each scheduled erasure: who, who asked, when it erases, and its state', async () => {
    serve()
    renderWithClient(<PendingErasuresPanel />)
    const mine = (await screen.findByText('Meera Pillai')).closest('tr')!
    expect(mine).toHaveTextContent('meera@example.test')
    expect(mine).toHaveTextContent('Student')
    expect(mine).toHaveTextContent('by the account holder')
    expect(within(mine).getByText('Scheduled')).toBeInTheDocument()

    const theirs = screen.getByText('Ravi Menon').closest('tr')!
    expect(theirs).toHaveTextContent('Consultant')
    expect(theirs).toHaveTextContent('Bright Path')
    expect(theirs).toHaveTextContent('by Ananya Rao')
    expect(theirs).toHaveTextContent('Immediate (legal request)')
    expect(within(theirs).getByText('Erasing')).toBeInTheDocument()
    expect(listStatuses()).toEqual(['pending'])
  })

  it('offers Cancel to a Super Admin, and only while the erasure can still be cancelled', async () => {
    serve()
    renderWithClient(<PendingErasuresPanel />)
    const mine = (await screen.findByText('Meera Pillai')).closest('tr')!
    expect(within(mine).getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    const theirs = screen.getByText('Ravi Menon').closest('tr')!
    expect(within(theirs).queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('shows the list to other Support Tools staff with no Cancel, and says why', async () => {
    signInAs('platform_staff')
    serve()
    renderWithClient(<PendingErasuresPanel />)
    await screen.findByText('Meera Pillai')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    expect(screen.getByText(/Only a Super Admin can cancel one\./)).toBeInTheDocument()
  })

  it('switches to recently ended erasures', async () => {
    serve()
    renderWithClient(<PendingErasuresPanel />)
    await screen.findByText('Meera Pillai')
    fireEvent.click(screen.getByRole('switch', { name: 'Recently ended' }))
    const row = (await screen.findByText('Old Request')).closest('tr')!
    expect(within(row).getByText('Kept')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recently ended erasures' })).toBeInTheDocument()
    expect(listStatuses().at(-1)).toBe('ended')
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
  })

  it('says so when nothing is scheduled, and shows the server message when the list is refused', async () => {
    mockedGet.mockResolvedValueOnce(ok({ items: [], meta: { next_cursor: null, total: 0 } }))
    const first = renderWithClient(<PendingErasuresPanel />)
    expect(await screen.findByText('No erasures are scheduled.')).toBeInTheDocument()
    first.unmount()

    mockedGet.mockResolvedValueOnce(refused(403, 'permission_denied', 'Support Tools is not switched on for your account.'))
    renderWithClient(<PendingErasuresPanel />)
    expect(await screen.findByText('Support Tools is not switched on for your account.')).toBeInTheDocument()
  })

  describe('cancelling', () => {
    async function openDialog() {
      serve()
      const view = renderWithClient(<PendingErasuresPanel />)
      const row = (await screen.findByText('Meera Pillai')).closest('tr')!
      fireEvent.click(within(row).getByRole('button', { name: 'Cancel' }))
      return { dialog: await screen.findByRole('dialog', { name: 'Keep Meera Pillai’s account?' }), ...view }
    }

    it('asks first, saying what is kept and what stays closed', async () => {
      const { dialog } = await openDialog()
      expect(dialog).toHaveTextContent(/The erasure scheduled for .*2026 is cancelled\. Nothing is erased, Meera Pillai can sign in again, and their email is told\./)
      expect(dialog).toHaveTextContent('Their closed cases and chats stay closed.')
      expect(mockedDelete).not.toHaveBeenCalled()
    })

    it('says under the reason that it is kept for good, and to say how the person was verified', async () => {
      const { dialog } = await openDialog()
      expect(
        within(dialog).getByText(
          'This reason is kept permanently. Do not include the person’s name, contact details or anything they told you — say how they were verified.',
        ),
      ).toBeInTheDocument()
      // Not the old line, which promised only the audit log.
      expect(within(dialog).queryByText('Kept in the audit log.')).not.toBeInTheDocument()
      // Shown with an error too.
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep account' }))
      expect(within(dialog).getByText('Add a reason.')).toBeInTheDocument()
      expect(within(dialog).getByText(/^This reason is kept permanently\./)).toBeInTheDocument()
    })

    it('needs a reason', async () => {
      const { dialog } = await openDialog()
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep account' }))
      expect(within(dialog).getByText('Add a reason.')).toBeInTheDocument()
      expect(mockedDelete).not.toHaveBeenCalled()
    })

    it('sends the reason, confirms, and refreshes the list and the search', async () => {
      mockedDelete.mockResolvedValueOnce(ok({ ...PENDING, status: 'cancelled', cancelled_at: '2026-10-06T10:00:00Z' }))
      const { dialog, client } = await openDialog()
      const invalidate = vi.spyOn(client, 'invalidateQueries')
      fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: ' She called from her registered phone. ' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep account' }))
      await waitFor(() =>
        expect(mockedDelete).toHaveBeenCalledWith('/users/{id}/erasure', {
          params: { path: { id: 'user-meera' } },
          body: { reason: 'She called from her registered phone.' },
        }),
      )
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(showToast).toHaveBeenCalledWith('Meera Pillai’s account is kept. They can sign in again')
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['erasures'] })
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-search'] })
    })

    it.each([
      [409, 'conflict', 'This account can no longer be kept. Its deletion has started.'],
      [404, 'not_found', 'No erasure is pending for this account.'],
    ])("shows the server's message on %i %s and keeps the dialog open", async (status, code, message) => {
      mockedDelete.mockResolvedValueOnce(refused(status, code, message))
      const { dialog } = await openDialog()
      fireEvent.change(within(dialog).getByLabelText(/^Reason/), { target: { value: 'Asked by phone.' } })
      fireEvent.click(within(dialog).getByRole('button', { name: 'Keep account' }))
      expect(await within(dialog).findByRole('alert')).toHaveTextContent(message)
      expect(showToast).not.toHaveBeenCalled()
    })
  })
})

describe('an account already scheduled for deletion, in the Actions popup', () => {
  function renderPopup(result: UserSearchResult) {
    const onClose = vi.fn()
    renderWithClient(<UserActionsModal result={result} onClose={onClose} />)
    return { onClose, dialog: screen.getByRole('dialog', { name: result.name }) }
  }

  it('carries the badge, switches the export off with the reason, and offers to keep the account', () => {
    const { dialog } = renderPopup(SCHEDULED)
    expect(within(dialog).getByText(/^Deletion scheduled .*2026$/)).toBeInTheDocument()
    expect(within(dialog).getByText('Not available while an erasure is pending.')).toBeInTheDocument()
    const exportCard = within(dialog).getByText('Data export').closest('div.rounded-md') as HTMLElement
    expect(within(exportCard).getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(within(dialog).getByText('Cancel scheduled erasure')).toBeInTheDocument()
    expect(within(dialog).queryByText('Erase user data')).not.toBeInTheDocument()
  })

  it('keeps the account from the popup and closes it', async () => {
    mockedDelete.mockResolvedValueOnce(ok({ id: 'erasure-1', status: 'cancelled' }))
    const { dialog, onClose } = renderPopup(SCHEDULED)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep account' }))
    const confirm = await screen.findByRole('dialog', { name: 'Keep Meera Pillai’s account?' })
    fireEvent.change(within(confirm).getByLabelText(/^Reason/), { target: { value: 'Asked by phone.' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Keep account' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(mockedDelete).toHaveBeenCalledWith('/users/{id}/erasure', {
      params: { path: { id: 'user-meera' } },
      body: { reason: 'Asked by phone.' },
    })
  })

  it('tells staff who are not Super Admins that only one can cancel it', () => {
    signInAs('platform_staff')
    const { dialog } = renderPopup(SCHEDULED)
    expect(within(dialog).getByText(/This account is scheduled for deletion on .*2026\. Only a Super Admin can cancel/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Keep account' })).not.toBeInTheDocument()
  })

  it('is unchanged for an account with nothing scheduled: export available, erase for Super Admins only', () => {
    const first = renderPopup(STUDENT)
    expect(within(first.dialog).queryByText(/Deletion scheduled/)).not.toBeInTheDocument()
    const exportCard = within(first.dialog).getByText('Data export').closest('div.rounded-md') as HTMLElement
    expect(within(exportCard).getByRole('button', { name: 'Start' })).toBeEnabled()
    expect(within(first.dialog).getByText('Erase user data')).toBeInTheDocument()
  })

  it('still hides erasing from staff who are not Super Admins', () => {
    signInAs('platform_staff')
    const { dialog } = renderPopup(STUDENT)
    expect(within(dialog).getByText('Erasing a user is limited to super admins.')).toBeInTheDocument()
    expect(within(dialog).queryByText('Erase user data')).not.toBeInTheDocument()
  })
})

describe('the Support export', () => {
  function renderForm() {
    renderWithClient(<ExportForm result={STUDENT} onCancel={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Data-access request by email.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generate export' }))
  }

  it('says where the copy goes: to the user, collected inside the product, never to the operator', async () => {
    mockedPost.mockResolvedValueOnce(ok({ export_id: 'export-1', status: 'queued' }, 202))
    renderForm()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Export queued. Meera Pillai gets an email at their own verified address when the copy is ready, and downloads it from inside the product within 7 days. It is not sent to you.',
    )
    expect(mockedPost).toHaveBeenCalledWith('/users/{id}/export', {
      params: { path: { id: 'user-meera' } },
      body: { reason: 'Data-access request by email.' },
    })
  })

  it.each([
    ['email_unverified', 'This account has no verified email address to send a copy to.'],
    ['conflict', 'An erasure is pending for this account, so no export can be made.'],
  ])("shows the server's message for 409 %s", async (code, message) => {
    mockedPost.mockResolvedValueOnce(refused(409, code, message))
    renderForm()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('adds when an export opens again for 409 export_on_hold', async () => {
    mockedPost.mockResolvedValueOnce(
      refused(409, 'export_on_hold', 'The sign-in email was changed recently, so exports are on hold.', {
        available_at: '2026-10-08T09:30:00Z',
      }),
    )
    renderForm()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('The sign-in email was changed recently, so exports are on hold.')
    expect(alert).toHaveTextContent(/An export can be requested from .*2026/)
  })
})
