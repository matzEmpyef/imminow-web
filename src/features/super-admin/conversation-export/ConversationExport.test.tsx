import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Conversation export for disputes (owner ruling 2026-10-06; decisions 60 and 61). Pinned here:
//   - the dialog: pick the consultancy (message count, last message), a reason that is kept, ask;
//   - the export is followed until it is ready, has failed, or the dialog closes, and no longer;
//   - the download link is asked for at the click, and opened;
//   - recent exports for the student, a colleague's included, each downloadable where it can be;
//   - the server's own sentence for 409 / 410 / 429, and "no longer available" for 404;
//   - who is offered the way in: `support` holders and Super Admins, on a student only.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))

import { api } from '@/api/client'
import { useMe } from '@/queries/me'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { formatDateTime } from '@/lib/time'
import { CONVERSATION_EXPORT_POLL_MS, type ConversationExport } from '@/queries/conversationExports'
import type { Complaint } from '@/queries/complaints'
import type { CaseDispute } from '@/queries/disputes'
import { ComplaintDrawer } from '../cases/ComplaintDrawer'
import { DisputeDrawer } from '../cases/DisputeDrawer'
import { PersonSignInDrawer, type SignInHistoryPerson } from '../PersonSignInDrawer'
import { ConversationExportModal } from './ConversationExportModal'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const CONVERSATIONS = [
  { consultancy_id: 'c-bright', consultancy_name: 'Bright Path', message_count: 128, last_message_at: '2026-10-05T10:00:00Z' },
  { consultancy_id: 'c-north', consultancy_name: 'Northwind Education', message_count: 1, last_message_at: '2026-08-11T10:00:00Z' },
]

function anExport(overrides: Partial<ConversationExport> = {}): ConversationExport {
  return {
    id: 'exp-1',
    student_id: 'user-meera',
    consultancy_id: 'c-bright',
    consultancy_name: 'Bright Path',
    status: 'queued',
    requested_at: '2026-10-08T09:00:00Z',
    requested_by_id: 'op-1',
    requested_by_name: 'Ananya Rao',
    message_count: null,
    ready_until: null,
    downloadable: false,
    ...overrides,
  }
}
const READY = anExport({ status: 'completed', message_count: 128, ready_until: '2026-10-09T09:05:00Z', downloadable: true })
const COLLEAGUES = anExport({
  id: 'exp-old',
  consultancy_id: 'c-north',
  consultancy_name: 'Northwind Education',
  status: 'completed',
  requested_at: '2026-10-07T15:30:00Z',
  requested_by_name: 'Dev Shah',
  ready_until: '2026-10-08T15:31:00Z',
  downloadable: true,
})

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status } } as never
}
function refused(status: number, code: string, message: string) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', status } }, response: { status } } as never
}

/** What the server holds; each test sets these. */
let conversations: unknown
let recent: ConversationExport[]
/** The answers GET /conversation-exports/{id} gives, in order; the last one repeats. */
let states: unknown[]

function calls(path: string) {
  return (mockedGet.mock.calls as unknown[][]).filter((call) => call[0] === path)
}

function renderIn(ui: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

const onClose = vi.fn()
function renderModal(consultancyId?: string | null) {
  return renderIn(
    <ConversationExportModal student={{ id: 'user-meera', name: 'Meera Pillai' }} consultancyId={consultancyId} onClose={onClose} />,
  )
}

async function request(reason = 'Dispute D-204, asked by the student.') {
  await screen.findByLabelText(/Bright Path/)
  fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: reason } })
  fireEvent.click(screen.getByRole('button', { name: 'Request' }))
}

/** One polling interval passes. */
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CONVERSATION_EXPORT_POLL_MS + 50)
  })
}

let anchorClick: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockedGet.mockReset()
  mockedPost.mockReset()
  onClose.mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ support: true })))
  conversations = ok({ items: CONVERSATIONS })
  recent = []
  states = [ok(READY)]
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/users/{id}/conversations') return conversations
    if (path === '/users/{id}/conversation-exports') return ok({ items: recent, meta: { next_cursor: null, total: recent.length } })
    if (path === '/conversation-exports/{id}') return states.length > 1 ? states.shift() : states[0]
    if (path === '/admin/applicants/{id}') return ok({ journey_id: 'j1', student: { id: 'user-meera', name: 'Meera Pillai' } })
    // The drawers' own lists (sign-in history, working notes).
    return ok({
      items: [],
      meta: { next_cursor: null, total: 0 },
      summary: { last_success_at: null, failures_recent: 0, failures_recent_days: 30, recording_since: '2026-09-01T00:00:00Z' },
    })
  }) as never)
  mockedPost.mockImplementation((async (path: string) => {
    if (path === '/users/{id}/conversation-exports') return ok(anExport(), 202)
    if (path === '/conversation-exports/{id}/download') return ok({ url: 'https://files.example.test/t.pdf?sig=1', expires_in_seconds: 300 })
    return ok({})
  }) as never)
  anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
})

afterEach(() => {
  anchorClick.mockRestore()
  vi.useRealTimers()
})

describe('asking for a conversation export', () => {
  it('lists the consultancies the student has talked to, with how many messages and the last one', async () => {
    renderModal()
    expect(await screen.findByLabelText(/Bright Path/)).not.toBeChecked()
    expect(screen.getByText('128 messages · last message 05/10/2026')).toBeInTheDocument()
    expect(screen.getByText('1 message · last message 11/08/2026')).toBeInTheDocument()
    expect(calls('/users/{id}/conversations')[0][1]).toMatchObject({ params: { path: { id: 'user-meera' } } })
  })

  it('starts on the consultancy it was opened for, and on the only one when there is one', async () => {
    const first = renderModal('c-north')
    expect(await screen.findByLabelText(/Northwind Education/)).toBeChecked()
    expect(screen.getByLabelText(/Bright Path/)).not.toBeChecked()
    first.unmount()

    conversations = ok({ items: [CONVERSATIONS[0]] })
    renderModal('c-somewhere-else')
    expect(await screen.findByLabelText(/Bright Path/)).toBeChecked()
  })

  it('says the reason is kept, and sends nothing without a consultancy and a reason of 3 characters', async () => {
    renderModal()
    await screen.findByLabelText(/Bright Path/)
    expect(screen.getByText('Your reason is kept on the record with your name.')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Reason/)).toHaveAttribute('maxlength', '500')

    fireEvent.change(screen.getByLabelText(/^Reason/), { target: { value: ' ab ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Request' }))
    expect(screen.getByText('Choose the consultancy.')).toBeInTheDocument()
    expect(screen.getByText('Give a reason of at least 3 characters.')).toBeInTheDocument()
    // The note about the record stays beside the error.
    expect(screen.getByText('Your reason is kept on the record with your name.')).toBeInTheDocument()
    expect(mockedPost).not.toHaveBeenCalled()
  })

  it('says so when the student has no conversation, and shows the server’s sentence for an account that is not a student’s', async () => {
    conversations = ok({ items: [] })
    const first = renderModal()
    expect(await screen.findByText('This student has no conversation with a consultancy yet.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Request' })).toBeDisabled()
    first.unmount()

    conversations = refused(409, 'conflict', 'This account is not a student’s.')
    renderModal()
    expect(await screen.findByText('This account is not a student’s.')).toBeInTheDocument()
  })

  it('sends the consultancy and the trimmed reason, then follows the export until it is ready and stops', async () => {
    states = [ok(anExport({ status: 'processing' })), ok(READY)]
    renderModal('c-bright')
    await request('  Dispute D-204, asked by the student.  ')

    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/users/{id}/conversation-exports', {
        params: { path: { id: 'user-meera' } },
        body: { consultancy_id: 'c-bright', reason: 'Dispute D-204, asked by the student.' },
      }),
    )
    const state = await screen.findByRole('status')
    expect(state).toHaveTextContent('Bright Path')
    expect(state).toHaveTextContent('Preparing…')
    expect(within(state).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
    expect(calls('/conversation-exports/{id}')).toHaveLength(0)

    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(1)
    expect(calls('/conversation-exports/{id}')[0][1]).toMatchObject({ params: { path: { id: 'exp-1' } } })
    expect(screen.getByRole('status')).toHaveTextContent('Preparing…')

    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(2)
    expect(screen.getByRole('status')).toHaveTextContent('Ready')
    expect(screen.getByRole('status')).toHaveTextContent(`Available until ${formatDateTime(READY.ready_until!)}`)
    expect(within(screen.getByRole('status')).getByRole('button', { name: /Download/ })).toBeInTheDocument()

    // Ready: it is not asked about again.
    await tick()
    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(2)
  })

  it('stops following the export when the dialog closes', async () => {
    states = [ok(anExport({ status: 'processing' }))]
    const view = renderModal('c-bright')
    await request()
    await screen.findByRole('status')
    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(1)

    view.unmount()
    await tick()
    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(1)
  })

  it('says it could not be prepared when it failed, stops, and lets the operator ask again with the reason kept', async () => {
    states = [ok(anExport({ status: 'failed' }))]
    renderModal('c-bright')
    await request()
    await screen.findByRole('status')
    await tick()

    expect(screen.getByRole('status')).toHaveTextContent('It could not be prepared. Ask again.')
    expect(screen.queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()
    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Ask again' }))
    expect(screen.getByLabelText(/^Reason/)).toHaveValue('Dispute D-204, asked by the student.')
    expect(screen.getByLabelText(/Bright Path/)).toBeChecked()
    expect(screen.getByRole('button', { name: 'Request' })).toBeEnabled()
  })

  it('says the export is no longer available when the server no longer knows it (404), and stops', async () => {
    states = [refused(404, 'not_found', 'Not found.')]
    renderModal('c-bright')
    await request()
    await screen.findByRole('status')
    await tick()

    expect(screen.getByRole('status')).toHaveTextContent('This export is no longer available.')
    expect(screen.getByRole('status')).not.toHaveTextContent('Not found.')
    await tick()
    expect(calls('/conversation-exports/{id}')).toHaveLength(1)
    expect(screen.getByRole('button', { name: 'Ask again' })).toBeInTheDocument()
  })

  it.each([
    [429, 'rate_limited', 'You have exported 10 conversations this hour. Try again after 15:00.'],
    [409, 'conflict', 'This account is not a student’s.'],
    [404, 'not_found', 'This student has no conversation with that consultancy.'],
  ])('shows the server’s sentence when the request is refused (%i)', async (status, code, message) => {
    mockedPost.mockImplementationOnce((async () => refused(status, code, message)) as never)
    renderModal('c-bright')
    await request()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    // The form stays as it was filled in.
    expect(screen.getByLabelText(/^Reason/)).toHaveValue('Dispute D-204, asked by the student.')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})

describe('downloading a transcript', () => {
  function downloadCalls() {
    return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === '/conversation-exports/{id}/download')
  }

  it('asks for the link at the click, opens it, and leaves it to click', async () => {
    recent = [COLLEAGUES]
    renderModal()
    const button = await screen.findByRole('button', { name: /Download/ })
    // Nothing is asked for until the click: the link lasts five minutes.
    expect(downloadCalls()).toHaveLength(0)

    fireEvent.click(button)
    await waitFor(() => expect(downloadCalls()).toHaveLength(1))
    expect(downloadCalls()[0][1]).toEqual({ params: { path: { id: 'exp-old' } } })
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1))
    const opened = anchorClick.mock.contexts[0] as HTMLAnchorElement
    expect(opened.href).toBe('https://files.example.test/t.pdf?sig=1')
    expect(opened.rel).toBe('noopener noreferrer')
    expect(screen.getByRole('link', { name: 'open the download link' })).toHaveAttribute('href', 'https://files.example.test/t.pdf?sig=1')
    expect(screen.getByText(/It works for 5 minutes\./)).toBeInTheDocument()

    // A second click asks for a new link.
    fireEvent.click(screen.getByRole('button', { name: /Download/ }))
    await waitFor(() => expect(downloadCalls()).toHaveLength(2))
  })

  it.each([
    [410, 'gone', 'This transcript is no longer available. Ask for a new one.', 'This transcript is no longer available. Ask for a new one.'],
    [409, 'conflict', 'This transcript is not ready yet.', 'This transcript is not ready yet.'],
    [429, 'rate_limited', 'You have reached this hour’s limit. Try again after 15:00.', 'You have reached this hour’s limit. Try again after 15:00.'],
    [404, 'not_found', 'Not found.', 'This export is no longer available.'],
  ])('on %i shows %s as the console should', async (status, code, message, shown) => {
    recent = [COLLEAGUES]
    mockedPost.mockImplementationOnce((async () => refused(status, code, message)) as never)
    renderModal()
    fireEvent.click(await screen.findByRole('button', { name: /Download/ }))

    expect((await screen.findByRole('alert')).textContent).toBe(shown)
    expect(anchorClick).not.toHaveBeenCalled()
    // The row was out of date, so the list is read again.
    await waitFor(() => expect(calls('/users/{id}/conversation-exports').length).toBeGreaterThan(1))
  })
})

describe('recent exports for the student', () => {
  it('lists each one with who asked, when and its state, and offers Download where it can be downloaded', async () => {
    recent = [
      anExport({ id: 'exp-new', status: 'processing', requested_by_name: 'Ananya Rao' }),
      COLLEAGUES,
      anExport({ id: 'exp-failed', status: 'failed', requested_by_name: null, requested_at: '2026-10-06T08:00:00Z' }),
      anExport({ id: 'exp-gone', status: 'completed', downloadable: false, requested_by_name: 'Kiran Joseph', requested_at: '2026-10-01T08:00:00Z' }),
    ]
    renderModal()
    expect(await screen.findByText('Recent exports for this student')).toBeInTheDocument()

    const colleague = (await screen.findByText(`Asked by Dev Shah · ${formatDateTime(COLLEAGUES.requested_at)}`)).closest('div.border-t') as HTMLElement
    expect(colleague).toHaveTextContent('Northwind Education')
    expect(colleague).toHaveTextContent('Ready')
    expect(colleague).toHaveTextContent(`Available until ${formatDateTime(COLLEAGUES.ready_until!)}`)
    expect(within(colleague).getByRole('button', { name: /Download/ })).toBeInTheDocument()

    const preparing = screen.getByText(/^Asked by Ananya Rao · /).closest('div.border-t') as HTMLElement
    expect(preparing).toHaveTextContent('Preparing…')
    expect(within(preparing).queryByRole('button', { name: /Download/ })).not.toBeInTheDocument()

    const failed = screen.getByText(/^Asked by a colleague · /).closest('div.border-t') as HTMLElement
    expect(failed).toHaveTextContent('It could not be prepared. Ask again.')

    expect(screen.getByText('No longer available')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Download/ })).toHaveLength(1)
    expect(calls('/users/{id}/conversation-exports')[0][1]).toMatchObject({ params: { path: { id: 'user-meera' } } })
  })

  it('says so when there are none', async () => {
    renderModal()
    expect(await screen.findByText('No exports yet.')).toBeInTheDocument()
  })

  it('reads the list again once the export being followed is ready, and shows that one once', async () => {
    renderModal('c-bright')
    await request()
    await screen.findByRole('status')
    recent = [READY, COLLEAGUES]
    const before = calls('/users/{id}/conversation-exports').length
    await tick()

    await waitFor(() => expect(calls('/users/{id}/conversation-exports').length).toBeGreaterThan(before))
    expect(await screen.findByText(/^Asked by Dev Shah · /)).toBeInTheDocument()
    // The one just asked for stays in its own panel; it is not repeated in the list.
    expect(screen.getAllByText('Bright Path')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /Download/ })).toHaveLength(2)
  })
})

describe('who is offered the export', () => {
  const STUDENT: SignInHistoryPerson = { id: 'user-meera', name: 'Meera Pillai', email: 'meera@example.test', kind: 'student' }

  function renderSentpoUser(person: SignInHistoryPerson = STUDENT) {
    return renderIn(<PersonSignInDrawer person={person} onClose={() => {}} />)
  }

  it('Sentpo Users: a `support` holder gets "Export conversation" on a student, and it opens for that student', async () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ user_directory: true, support: true })))
    renderSentpoUser()
    fireEvent.click(screen.getByRole('button', { name: 'Export conversation' }))

    expect(screen.getByRole('dialog', { name: 'Export conversation — Meera Pillai' })).toBeInTheDocument()
    expect(await screen.findByLabelText(/Bright Path/)).toBeInTheDocument()
    expect(calls('/users/{id}/conversations')[0][1]).toMatchObject({ params: { path: { id: 'user-meera' } } })
  })

  it('Sentpo Users: a Super Admin gets it too', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({}, { role: 'super_admin' })))
    renderSentpoUser()
    expect(screen.getByRole('button', { name: 'Export conversation' })).toBeInTheDocument()
  })

  it('Sentpo Users: the directory permission alone does not give it', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ user_directory: true, support_tools: true })))
    renderSentpoUser()
    expect(screen.getByRole('button', { name: 'Sign out everywhere' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Export conversation' })).not.toBeInTheDocument()
  })

  it('is not offered on console staff, who are not students', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ user_directory: true, support: true })))
    renderSentpoUser({ ...STUDENT, kind: 'consultancy_staff', consultancyName: 'Bright Path' })
    expect(screen.queryByRole('button', { name: 'Export conversation' })).not.toBeInTheDocument()
  })

  const DISPUTE = {
    id: 'd1',
    journey_id: 'j1',
    student_id: 'user-meera',
    consultancy_id: 'c-north',
    consultancy_name: 'Northwind Education',
    student_name: 'Meera Pillai',
    status: 'open',
    raised_by: 'student',
    reason: 'No reply for a month.',
    case_progress: null,
  } as unknown as CaseDispute

  it('Dispute drawer: opens for the dispute’s own student, without reading the case, on the dispute’s consultancy', async () => {
    renderIn(<DisputeDrawer dispute={DISPUTE} onClose={() => {}} onUpdated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export conversation' }))

    expect(await screen.findByLabelText(/Northwind Education/)).toBeChecked()
    expect(calls('/admin/applicants/{id}')).toHaveLength(0)
    expect(calls('/users/{id}/conversations')[0][1]).toMatchObject({ params: { path: { id: 'user-meera' } } })
  })

  it('Dispute drawer: not offered when the dispute names no student', () => {
    renderIn(<DisputeDrawer dispute={{ ...DISPUTE, student_id: null }} onClose={() => {}} onUpdated={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Export conversation' })).not.toBeInTheDocument()
  })

  it('Dispute drawer: not offered without the permission', () => {
    vi.mocked(useMe).mockReturnValue(meAnswered(platformMe({ finance: true })))
    renderIn(<DisputeDrawer dispute={DISPUTE} onClose={() => {}} onUpdated={() => {}} />)
    expect(screen.queryByRole('button', { name: 'Export conversation' })).not.toBeInTheDocument()
  })

  it('Complaint drawer: opens for the complaint’s student, on the consultancy the complaint names', async () => {
    const complaint = {
      id: 'cmp-1',
      user_id: 'user-meera',
      student_name: 'Meera Pillai',
      email: 'meera@example.test',
      category: 'consultancy_dispute',
      description: 'No reply for a month.',
      status: 'in_review',
      created_at: '2026-10-01T09:00:00Z',
      consultancy_id: 'c-bright',
      consultancy_name: 'Bright Path',
      journey_id: null,
    } as unknown as Complaint
    renderIn(<ComplaintDrawer complaint={complaint} onClose={() => {}} onUpdated={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Export conversation' }))

    expect(await screen.findByLabelText(/Bright Path/)).toBeChecked()
    expect(calls('/users/{id}/conversations')[0][1]).toMatchObject({ params: { path: { id: 'user-meera' } } })
    expect(calls('/admin/applicants/{id}')).toHaveLength(0)
  })
})
