import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Support Tools → a student's actions → "Correct date of birth" (owner decision 3, lane x). A
// student cannot change a recorded date of birth; Support corrects it against a document. Pinned:
//   - the card is offered for students only;
//   - nothing is sent until there is a date, a reason and the password, and a second screen has
//     said exactly what will happen;
//   - what is sent, and what the three `guardian_effect` answers say;
//   - every refusal shows the server's own words, in the right place.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), DELETE: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('./SwitchConsultancyForm', () => ({ SwitchConsultancyForm: () => null }))
vi.mock('./ChangeEmailForm', () => ({ ChangeEmailForm: () => null }))
vi.mock('./GuardianForm', () => ({ GuardianForm: () => null }))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { localDateISO } from '@/lib/time'
import type { UserSearchResult } from '@/queries/supportTools'
import { DateOfBirthForm } from './DateOfBirthForm'
import { UserActionsModal } from './UserActionsModal'

const mockedPost = vi.mocked(api.POST)

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

function corrected(guardian_effect: 'none' | 'now_required' | 'no_longer_required', previous: string | null = '2005-03-02') {
  return {
    data: {
      user_id: 'user-meera',
      date_of_birth: '2009-03-02',
      previous_date_of_birth: previous,
      guardian_effect,
      guardian_consent: { status: guardian_effect === 'now_required' ? 'pending' : 'not_required' },
    },
    error: undefined,
    response: { status: 200 },
  } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

function renderWithClient(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  return { invalidate, ...render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>) }
}

const onCancel = vi.fn()
function renderForm() {
  onCancel.mockClear()
  return renderWithClient(<DateOfBirthForm result={STUDENT} onCancel={onCancel} />)
}

function fill({ date = '2009-03-02', reason = 'Passport, checked on a video call.', password = 'pw-1' } = {}) {
  fireEvent.change(screen.getByLabelText(/^Correct date of birth/), { target: { value: date } })
  fireEvent.change(screen.getByLabelText(/^Which document did you check\?/), { target: { value: reason } })
  fireEvent.change(screen.getByLabelText(/^Your password/), { target: { value: password } })
}

const continueButton = () => screen.getByRole('button', { name: 'Continue' })

/** Fills the form, goes through the confirmation and sends. */
function send() {
  fill()
  fireEvent.click(continueButton())
  fireEvent.click(screen.getByRole('button', { name: 'Correct date of birth' }))
}

beforeEach(() => {
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support_tools: true })))
})

describe('who is offered "Correct date of birth"', () => {
  it('a student is', () => {
    renderWithClient(<UserActionsModal result={STUDENT} onClose={vi.fn()} />)
    expect(screen.getByText('Correct date of birth')).toBeInTheDocument()
    expect(
      screen.getByText("Replaces the date of birth on this student's account, after you have checked it against a document."),
    ).toBeInTheDocument()
  })

  it.each(['consultant', 'consultancy_admin', 'freelancer', 'platform_staff'] as const)('a %s is not', (role) => {
    renderWithClient(<UserActionsModal result={{ ...STUDENT, role, journey_id: undefined as never }} onClose={vi.fn()} />)
    expect(screen.queryByText('Correct date of birth')).not.toBeInTheDocument()
  })
})

describe('the date-of-birth form', () => {
  it('stays shut until there is a date, a reason and the password', () => {
    renderForm()
    expect(continueButton()).toBeDisabled()
    fill({ reason: '   ' })
    expect(continueButton()).toBeDisabled()
    fill({ password: '' })
    expect(continueButton()).toBeDisabled()
    fill({ date: '' })
    expect(continueButton()).toBeDisabled()
    fill()
    expect(continueButton()).toBeEnabled()
  })

  it('does not offer a date in the future', () => {
    renderForm()
    // Today on the operator's own clock, not the UTC date.
    expect((screen.getByLabelText(/^Correct date of birth/) as HTMLInputElement).max).toBe(localDateISO())
  })

  it('says exactly what will happen before anything is sent, and Go back sends nothing', () => {
    renderForm()
    fill()
    fireEvent.click(continueButton())

    expect(screen.getByText('Change Meera Pillai’s date of birth to 02/03/2009?')).toBeInTheDocument()
    expect(screen.getByText('The date of birth on their account is replaced with this one.')).toBeInTheDocument()
    expect(
      screen.getByText(
        'If this date makes them under 18, their account waits for a parent or guardian’s approval from this moment. If it makes them 18 or over, they no longer need one.',
      ),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        'The student is told by notification and email that their date of birth was corrected. The message does not show the date.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('Your reason and both dates are kept in the audit log.')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Go back' }))
    expect(mockedPost).not.toHaveBeenCalled()
    // What was typed is still there.
    expect((screen.getByLabelText(/^Which document did you check\?/) as HTMLTextAreaElement).value).toBe(
      'Passport, checked on a video call.',
    )
  })

  it('sends the date, the trimmed reason and the password, and refreshes the search row', async () => {
    mockedPost.mockResolvedValue(corrected('none'))
    const { invalidate } = renderForm()
    fill({ reason: '  Passport, checked on a video call.  ' })
    fireEvent.click(continueButton())
    fireEvent.click(screen.getByRole('button', { name: 'Correct date of birth' }))

    await screen.findByRole('status')
    expect(mockedPost).toHaveBeenCalledTimes(1)
    expect(mockedPost.mock.calls[0][0]).toBe('/users/{id}/date-of-birth')
    expect(mockedPost.mock.calls[0][1]).toEqual({
      params: { path: { id: 'user-meera' } },
      body: { date_of_birth: '2009-03-02', reason: 'Passport, checked on a video call.', password: 'pw-1' },
    })
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['user-search'] })
  })

  it('a correction that changes nothing about the guardian says only that it is done', async () => {
    mockedPost.mockResolvedValue(corrected('none'))
    renderForm()
    send()
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Date of birth corrected for Meera Pillai. It is now 02/03/2009 (it was 02/03/2005).',
    )
    expect(screen.queryByText(/guardian's approval/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('says when the student now needs a guardian', async () => {
    mockedPost.mockResolvedValue(corrected('now_required'))
    renderForm()
    send()
    expect(await screen.findByText("This student is now under 18 and needs a guardian's approval.")).toBeInTheDocument()
  })

  it('says when the student no longer needs a guardian', async () => {
    mockedPost.mockResolvedValue(corrected('no_longer_required'))
    renderForm()
    send()
    expect(await screen.findByText("This student no longer needs a guardian's approval.")).toBeInTheDocument()
  })

  it('an account that had no date says only the new one', async () => {
    mockedPost.mockResolvedValue(corrected('none', null))
    renderForm()
    send()
    expect(await screen.findByRole('status')).toHaveTextContent('Date of birth corrected for Meera Pillai. It is now 02/03/2009.')
    expect(screen.getByRole('status')).not.toHaveTextContent('it was')
  })
})

describe('the date-of-birth form — refusals', () => {
  it('a wrong password is shown on the password field, back on the form', async () => {
    mockedPost.mockResolvedValue(refused(400, 'invalid_current_password', 'That password is not correct.'))
    renderForm()
    send()
    const field = await screen.findByLabelText(/^Your password/)
    await waitFor(() => expect(field).toHaveAttribute('aria-invalid', 'true'))
    expect(screen.getByText('That password is not correct.')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(continueButton()).toBeInTheDocument()
  })

  it('a missing step-up is shown on the password field too', async () => {
    mockedPost.mockResolvedValue(refused(400, 'step_up_required', 'Enter your password to continue.'))
    renderForm()
    send()
    expect(await screen.findByText('Enter your password to continue.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Your password/)).toHaveAttribute('aria-invalid', 'true')
  })

  it('a date that makes the student under 16 is shown on the date field', async () => {
    mockedPost.mockResolvedValue(refused(422, 'below_minimum_age', 'Sentpo is for students aged 16 and over.'))
    renderForm()
    send()
    expect(await screen.findByText('Sentpo is for students aged 16 and over.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Correct date of birth/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('any other refusal shows the server sentence', async () => {
    mockedPost.mockResolvedValue(refused(400, 'validation_failed', 'That is already the date of birth on this account.'))
    renderForm()
    send()
    expect(await screen.findByRole('alert')).toHaveTextContent('That is already the date of birth on this account.')
  })

  it('too many corrections shows the server sentence and when to try again', async () => {
    mockedPost.mockResolvedValue(
      refused(429, 'rate_limited', 'Too many date-of-birth corrections in the last hour. Try again later.', {
        retry_after_seconds: 540,
      }),
    )
    renderForm()
    send()
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Too many date-of-birth corrections in the last hour. Try again later.')
    expect(alert).toHaveTextContent('You can try again in about 9 minutes.')
  })

  it('no answer at all falls back to a plain sentence', async () => {
    mockedPost.mockResolvedValue({ data: undefined, error: { error: {} }, response: { status: 502 } } as never)
    renderForm()
    send()
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not correct the date of birth.')
  })
})
