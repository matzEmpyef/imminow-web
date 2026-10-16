import { configure, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Create Applicant has two outcomes since contract gate 12f (owner decisions 1 and 25). A new
// person is created at once (201) and their client page opens, as before. An email or phone that
// belongs to an existing Sentpo student creates nothing (202): the student is asked to accept in
// the app, and the console must not navigate to a client that does not exist or show anything
// about the account.
const navigate = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router-dom')>()),
  useNavigate: () => navigate,
}))
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
// The consultant picker searches the roster on the server (its own tests: components/
// ServerSearchSelect.test.tsx and queries/employeePickers.test.tsx). Here it is a plain field, so
// these tests stay about what Create Applicant does with the answer.
vi.mock('@/components/ServerSearchSelect', () => ({
  ServerSearchSelect: ({ label, value, onChange }: { label: string; value: string; onChange: (id: string) => void }) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))
let institute = false
vi.mock('@/lib/accountWords', () => ({
  useAccountWords: () =>
    institute ? { isInstitute: true, person: 'team member' } : { isInstitute: false, person: 'consultant' },
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE } from '@/lib/useIdempotencyKey'
import { alreadyApplied, sentKey } from '@/test/writeAnswers'
import { CreateApplicantModal } from './CreateApplicantModal'

const mockedPost = vi.mocked(api.POST)

// The full suite runs these under load; a slow first render must not fail a correct test.
configure({ asyncUtilTimeout: 5000 })

type Answer =
  | { status: 201 | 202; body: unknown }
  | { status: number; code: string; message: string; details?: Record<string, unknown> }

const REQUEST = {
  id: 'p1',
  status: 'pending',
  requested: { first_name: 'Asha', last_name: 'Rao', email: 'asha@example.com' },
  case_type: 'student',
  sent_at: '2026-10-06T09:00:00Z',
  expires_at: '2026-10-20T09:00:00Z',
}

const REQUEST_SENT_TEXT =
  "This person already has a Sentpo account. We've sent them a request to become your applicant. Nothing is shared with you until they accept in the app. You'll see it under Waiting for the student to accept."

let answers: Answer[]

function resolve(answer: Answer) {
  if ('body' in answer) return { data: answer.body, error: undefined, response: { status: answer.status } }
  return {
    data: undefined,
    error: { error: { code: answer.code, message: answer.message, request_id: 'r1', details: answer.details } },
    response: { status: answer.status },
  }
}

function clientCalls() {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/clients')
}

function renderModal() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  const onClose = vi.fn()
  render(
    <QueryClientProvider client={client}>
      <CreateApplicantModal onClose={onClose} />
    </QueryClientProvider>,
  )
  return { onClose, invalidate }
}

function fill() {
  fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Asha' } })
  fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Rao' } })
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.com' } })
  fireEvent.click(screen.getByLabelText('Student'))
  fireEvent.change(screen.getByLabelText('Assigned Consultant'), { target: { value: 'e1' } })
  fireEvent.click(screen.getByLabelText('I confirm this applicant is 16 or older.'))
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Create Applicant' }))
}

async function refusedWith(answer: Answer) {
  answers = [answer]
  const view = renderModal()
  fill()
  submit()
  await waitFor(() => expect(clientCalls()).toHaveLength(1))
  return view
}

beforeEach(() => {
  institute = false
  answers = []
  navigate.mockClear()
  mockedPost.mockReset()
  vi.mocked(showToast).mockClear()
  mockedPost.mockImplementation((async () => resolve(answers.shift() ?? { status: 201, body: { id: 'c1' } })) as never)
})

describe('CreateApplicantModal — a new person (201)', () => {
  it('opens the new client page, as before', async () => {
    answers = [{ status: 201, body: { id: 'c1' } }]
    const { invalidate } = renderModal()
    fill()
    submit()

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients/c1'))
    expect(screen.queryByRole('dialog', { name: 'Request sent' })).not.toBeInTheDocument()
    const body = (clientCalls()[0][1] as { body: Record<string, unknown> }).body
    expect(body).toEqual({
      first_name: 'Asha',
      last_name: 'Rao',
      email: 'asha@example.com',
      phone: null,
      address: null,
      case_type: 'student',
      assigned_employee_id: 'e1',
      age_confirmed: true,
    })
    expect(sentKey(clientCalls()[0])).toMatch(/^[0-9a-f-]{36}$/)
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['clients'])
  })
})

// Owner's ruling, decision 152: a college has only students, never PR applicants.
describe('CreateApplicantModal — a college', () => {
  it('is offered no applicant type, does not wait for one, and sends student', async () => {
    institute = true
    answers = [{ status: 201, body: { id: 'c1' } }]
    renderModal()
    expect(screen.queryByText('Applicant Type')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('PR')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Student')).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Asha' } })
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Rao' } })
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'asha@example.com' } })
    fireEvent.change(screen.getByLabelText('Assigned team member'), { target: { value: 'e1' } })
    fireEvent.click(screen.getByLabelText('I confirm this applicant is 16 or older.'))
    expect(screen.queryByText(/applicant type/)).not.toBeInTheDocument()
    submit()

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/clients/c1'))
    expect((clientCalls()[0][1] as { body: Record<string, unknown> }).body).toMatchObject({ case_type: 'student' })
  })

  it('leaves a consultancy both choices, and nothing assumed', () => {
    renderModal()
    expect(screen.getByLabelText('Student')).not.toBeChecked()
    expect(screen.getByLabelText('PR')).not.toBeChecked()
  })
})

describe('CreateApplicantModal — the form', () => {
  // Phase 8, D-129 C-2: the student gives their own date of birth in the app.
  it('gives the phone field the one phone sentence as its help, and as its message for a bad number', () => {
    const sentence = 'Enter the phone number with the country code, for example +919876543210.'
    renderModal()
    expect(screen.getByText(sentence)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Phone'), { target: { value: '12' } })
    expect(screen.getAllByText(sentence)).toHaveLength(1)
    expect(screen.getByLabelText('Phone')).toHaveAttribute('aria-invalid', 'true')
  })

  it('has no date of birth field, and the button needs nothing for one', () => {
    renderModal()
    expect(screen.queryByLabelText(/Date of birth/)).not.toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent(/date of birth/i)
    fill()
    expect(screen.getByRole('button', { name: 'Create Applicant' })).toBeEnabled()
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
  })

  it('has a labelled tick box with its helper line, off to begin with', () => {
    renderModal()
    const box = screen.getByRole('checkbox', { name: 'I confirm this applicant is 16 or older.' })
    expect(box).not.toBeChecked()
    expect(box).toHaveAccessibleDescription(
      'Sentpo is for students aged 16 and over. The applicant gives their date of birth when they first sign in to the Sentpo app.',
    )
  })

  it('keeps the button off until the tick is given, and names it in the Still needed line', () => {
    renderModal()
    fill()
    const box = screen.getByLabelText('I confirm this applicant is 16 or older.')
    fireEvent.click(box)
    expect(box).not.toBeChecked()
    expect(screen.getByRole('button', { name: 'Create Applicant' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(
      'Still needed: confirmation that the applicant is 16 or older',
    )

    fireEvent.click(box)
    expect(screen.getByRole('button', { name: 'Create Applicant' })).toBeEnabled()
    expect(screen.queryByText(/Still needed/)).not.toBeInTheDocument()
  })

  it('does not send anything while the tick is missing', () => {
    renderModal()
    fill()
    fireEvent.click(screen.getByLabelText('I confirm this applicant is 16 or older.'))
    fireEvent.submit(document.getElementById('create-applicant-form') as HTMLFormElement)
    expect(clientCalls()).toHaveLength(0)
  })

  it('sends age_confirmed: true in the request body', async () => {
    renderModal()
    fill()
    submit()
    await waitFor(() => expect(clientCalls()).toHaveLength(1))
    const body = (clientCalls()[0][1] as { body: Record<string, unknown> }).body
    expect(body.age_confirmed).toBe(true)
  })
})

describe('CreateApplicantModal — an existing Sentpo student (202)', () => {
  it('shows the request-sent state in the same dialog and does not navigate', async () => {
    answers = [{ status: 202, body: REQUEST }]
    const { invalidate, onClose } = renderModal()
    fill()
    submit()

    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeInTheDocument()
    expect(screen.getByText(REQUEST_SENT_TEXT)).toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
    // The waiting panel on the Clients page is refreshed without a reload.
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['applicant-requests'])

    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows no counter when the answer has no daily_limit', async () => {
    answers = [{ status: 202, body: REQUEST }]
    renderModal()
    fill()
    submit()

    await screen.findByRole('dialog', { name: 'Request sent' })
    expect(screen.queryByText(/left today/)).not.toBeInTheDocument()
    expect(screen.queryByText(/resets tomorrow/)).not.toBeInTheDocument()
  })

  it('shows how many requests are left when the answer has daily_limit', async () => {
    answers = [{ status: 202, body: { ...REQUEST, daily_limit: { remaining: 3, resets_at: '2026-10-06T18:30:00Z' } } }]
    renderModal()
    fill()
    submit()

    expect(
      await screen.findByText('3 requests to existing students left today. The limit resets tomorrow.'),
    ).toBeInTheDocument()
  })
})

describe('CreateApplicantModal — refusals', () => {
  it.each([
    ['limit_reached', "Your consultancy has sent today's limit of requests. The limit resets tomorrow."],
    ['request_cooldown', 'You asked this person recently. You can ask again after 5 November 2026.'],
    ['conflict', 'This person has already asked to become your client. Answer their request on the chat.'],
    ['consultancy_unavailable', "This consultancy isn't taking on new clients right now."],
  ])('409 %s shows the server message', async (code, message) => {
    await refusedWith({ status: 409, code, message })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(navigate).not.toHaveBeenCalled()
  })

  // Phase 8, D-119 C-7(2): the server's one neutral sentence, shown exactly as served, for the
  // email and for the phone alike. The console no longer words it.
  it.each([
    'This address cannot be used. Please ask the applicant to provide a different email address.',
    'This phone number cannot be used. Please ask the applicant to provide a different phone number.',
  ])('409 identifier_in_use shows the server sentence exactly as served: %s', async (message) => {
    await refusedWith({ status: 409, code: 'identifier_in_use', message })
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    expect(screen.queryByText(/already in use on Sentpo/)).not.toBeInTheDocument()
    expect(navigate).not.toHaveBeenCalled()
  })

  it('429 shows "Too many attempts"', async () => {
    await refusedWith({ status: 429, code: 'rate_limited', message: 'Rate limit exceeded.' })
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Please try again later.')
  })

  it('a refusal renews the key; the same details after a lost answer keep it', async () => {
    answers = [
      { status: 409, code: 'request_cooldown', message: 'You asked this person recently.' },
      { status: 502, code: 'bad_gateway', message: 'upstream' },
      { status: 202, body: REQUEST },
    ]
    renderModal()
    fill()
    for (const attempt of [1, 2, 3]) {
      await waitFor(() => expect(screen.getByRole('button', { name: 'Create Applicant' })).toBeEnabled())
      submit()
      await waitFor(() => expect(clientCalls()).toHaveLength(attempt))
    }
    const [first, second, third] = clientCalls()
    expect(sentKey(second)).not.toBe(sentKey(first))
    expect(sentKey(third)).toBe(sentKey(second))
    expect(await screen.findByRole('dialog', { name: 'Request sent' })).toBeInTheDocument()
  })

  it('an already-applied answer closes the form, refreshes, says so and does not resubmit', async () => {
    const { onClose, invalidate } = await refusedWith(alreadyApplied() as Answer)

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1))
    expect(showToast).toHaveBeenCalledWith(ALREADY_APPLIED_NOTICE)
    const keys = invalidate.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey)
    expect(keys).toContainEqual(['clients'])
    expect(keys).toContainEqual(['applicant-requests'])
    expect(clientCalls()).toHaveLength(1)
    expect(navigate).not.toHaveBeenCalled()
  })
})
