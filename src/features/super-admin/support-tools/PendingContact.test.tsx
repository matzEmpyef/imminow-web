import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner rulings 1 and 4 (2026-10-07): Support no longer changes a sign-in email or a phone number.
// It RECORDS the new one, which waits until the person proves it. Pinned:
//   - the email action is named for what it does and never says the email changed or that anyone
//     was signed out;
//   - the phone action is for students only, takes the operator's password, and tells the
//     operator what to ask the student to do;
//   - the user card says what is waiting and until when;
//   - a locked account (deletion scheduled) offers neither; every refusal is the server's words.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('./SwitchConsultancyForm', () => ({ SwitchConsultancyForm: () => null }))
vi.mock('./GuardianForm', () => ({ GuardianForm: () => null }))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { formatDate } from '@/lib/time'
import type { UserSearchResult } from '@/queries/supportTools'
import { UserActionsModal } from './UserActionsModal'

const mockedPost = vi.mocked(api.POST)

const STUDENT: UserSearchResult = {
  id: 'user-meera',
  name: 'Meera Pillai',
  email: 'meera@example.test',
  phone: '+919876543210',
  role: 'student',
  case_stage: 'in_plan',
  journey_id: 'journey-1',
  consultancy_name: null,
}
const STAFF: UserSearchResult = { ...STUDENT, id: 'user-arun', name: 'Arun Das', role: 'consultant', case_stage: null }
const UNTIL = '2026-10-15T09:00:00Z'

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

function renderActions(result: UserSearchResult) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <UserActionsModal result={result} onClose={() => {}} />
    </QueryClientProvider>,
  )
}

/** The action card with this title, as a region to look inside. */
function card(title: string): HTMLElement {
  return screen.getByText(title).closest('div.rounded-md') as HTMLElement
}
function start(title: string) {
  fireEvent.click(within(card(title)).getByRole('button', { name: 'Start' }))
}

const EMAIL_CARD = 'Record new email (user must confirm)'
const PHONE_CARD = 'Change phone number (student must confirm)'

function fillEmail() {
  fireEvent.change(screen.getByLabelText(/^New email/), { target: { value: 'meera.new@example.test' } })
  fireEvent.change(screen.getByLabelText(/^How did you verify/), { target: { value: 'video_call' } })
  fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Lost access to the old inbox.' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
}

beforeEach(() => {
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support: true })))
})

describe('recording a new sign-in email', () => {
  it('says the address waits for the person, and never that it changed or that they were signed out', async () => {
    mockedPost.mockResolvedValueOnce(
      ok({ ...STUDENT, pending_email: 'meera.new@example.test', pending_email_until: UNTIL }),
    )
    renderActions(STUDENT)
    start(EMAIL_CARD)
    fillEmail()
    expect(screen.getByText(/Their current\s+sign-in keeps working and they stay signed in\./)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Record new email' }))
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/users/{id}/email', {
        params: { path: { id: 'user-meera' } },
        body: {
          new_email: 'meera.new@example.test',
          reason: 'Lost access to the old inbox.',
          verification_method: 'video_call',
          verification_note: undefined,
        },
      }),
    )

    expect(await screen.findByRole('status')).toHaveTextContent(
      `Recorded. Waiting for Meera Pillai to confirm meera.new@example.test, until ${formatDate(UNTIL)}.`,
    )
    expect(screen.getByText(/signing in to the app with the new address/)).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/signed out|Email updated/i)
    // The card at the top now says what is waiting, without a new search.
    expect(
      screen.getByText(`Waiting for confirmation: meera.new@example.test (until ${formatDate(UNTIL)})`),
    ).toBeInTheDocument()
  })

  it('tells a console account to confirm through Forgot password', async () => {
    mockedPost.mockResolvedValueOnce(ok({ ...STAFF, pending_email: 'meera.new@example.test', pending_email_until: UNTIL }))
    renderActions(STAFF)
    start(EMAIL_CARD)
    fillEmail()
    expect(screen.getByText(/choosing Forgot password on the sign-in page with the new address/)).toBeInTheDocument()
  })

  it("shows the server's own sentence for an account scheduled for deletion, or a taken address", async () => {
    mockedPost.mockResolvedValueOnce(
      refused(409, 'conflict', 'This account is scheduled for deletion. Cancel the erasure first.'),
    )
    renderActions(STUDENT)
    start(EMAIL_CARD)
    fillEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Record new email' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This account is scheduled for deletion. Cancel the erasure first.',
    )
  })

  it('shows the hourly limit as the server words it, with when to try again', async () => {
    mockedPost.mockResolvedValueOnce(
      refused(429, 'rate_limited', 'You have reached this hour’s limit for this tool.', { retry_after_seconds: 1500 }),
    )
    renderActions(STUDENT)
    start(EMAIL_CARD)
    fillEmail()
    fireEvent.click(screen.getByRole('button', { name: 'Record new email' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('You have reached this hour’s limit for this tool.')
    expect(alert).toHaveTextContent('You can try again in about 25 minutes.')
    expect(mockedPost).toHaveBeenCalledTimes(1)
  })
})

describe('recording a new phone number', () => {
  function fillPhone() {
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '+91 90000 00000' } })
    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: 'Old SIM lost; checked on a video call.' } })
    fireEvent.change(screen.getByLabelText(/^Your password/), { target: { value: 'pw-1' } })
  }

  it('is offered for a student and for nobody else', () => {
    const { unmount } = renderActions(STUDENT)
    expect(screen.getByText(PHONE_CARD)).toBeInTheDocument()
    unmount()
    renderActions(STAFF)
    expect(screen.queryByText(PHONE_CARD)).not.toBeInTheDocument()
  })

  it('sends the number, the reason and the password, then says what to ask the student', async () => {
    mockedPost.mockResolvedValueOnce(ok({ ...STUDENT, pending_phone: '+919000000000', pending_phone_until: UNTIL }))
    renderActions(STUDENT)
    start(PHONE_CARD)
    expect(screen.getByRole('button', { name: 'Record new number' })).toBeDisabled()
    fillPhone()
    fireEvent.click(screen.getByRole('button', { name: 'Record new number' }))

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/users/{id}/phone', {
        params: { path: { id: 'user-meera' } },
        body: { new_phone: '+919000000000', reason: 'Old SIM lost; checked on a video call.', password: 'pw-1' },
      }),
    )
    expect(await screen.findByRole('status')).toHaveTextContent(
      `Recorded. Waiting for Meera Pillai to confirm +919000000000, until ${formatDate(UNTIL)}.`,
    )
    expect(screen.getByText(/Ask Meera Pillai to sign in to the app with the new number\./)).toBeInTheDocument()
    expect(screen.getByText(`Waiting for confirmation: +919000000000 (until ${formatDate(UNTIL)})`)).toBeInTheDocument()
  })

  it('puts a refused password beside the password, and a number in use beside the number', async () => {
    mockedPost.mockResolvedValueOnce(refused(400, 'invalid_current_password', 'That password is not correct.'))
    renderActions(STUDENT)
    start(PHONE_CARD)
    fillPhone()
    fireEvent.click(screen.getByRole('button', { name: 'Record new number' }))
    expect(await screen.findByText('That password is not correct.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()

    mockedPost.mockResolvedValueOnce(refused(409, 'identifier_in_use', 'That number cannot be used.'))
    fireEvent.change(screen.getByLabelText(/^Your password/), { target: { value: 'pw-2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Record new number' }))
    expect(await screen.findByText('That number cannot be used.')).toBeInTheDocument()
  })

  it('refuses a number without its country code before anything is sent', () => {
    renderActions(STUDENT)
    start(PHONE_CARD)
    fillPhone()
    fireEvent.change(screen.getByLabelText(/^New phone number/), { target: { value: '9000000000' } })
    expect(screen.getByRole('button', { name: 'Record new number' })).toBeDisabled()
    expect(mockedPost).not.toHaveBeenCalled()
  })
})

describe('the user card', () => {
  it('says what is waiting to be confirmed, and until when', () => {
    renderActions({
      ...STUDENT,
      pending_email: 'meera.new@example.test',
      pending_email_until: UNTIL,
      pending_phone: '+919000000000',
      pending_phone_until: UNTIL,
    })
    expect(
      screen.getByText(`Waiting for confirmation: meera.new@example.test (until ${formatDate(UNTIL)})`),
    ).toBeInTheDocument()
    expect(screen.getByText(`Waiting for confirmation: +919000000000 (until ${formatDate(UNTIL)})`)).toBeInTheDocument()
  })

  it('says nothing when nothing is waiting', () => {
    renderActions(STUDENT)
    expect(screen.queryByText(/Waiting for confirmation/)).not.toBeInTheDocument()
  })

  it('offers neither record action while a deletion is scheduled', () => {
    renderActions({ ...STUDENT, erasure_due_at: '2026-11-01T00:00:00Z' })
    for (const title of [EMAIL_CARD, PHONE_CARD]) {
      expect(within(card(title)).getByRole('button', { name: 'Start' })).toBeDisabled()
      expect(
        within(card(title)).getByText('Not available while a deletion is scheduled. Keep the account first.'),
      ).toBeInTheDocument()
    }
  })
})
