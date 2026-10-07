import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Lane v, the quiz follow-up (owner, 2026-10-06), console side.
//   - Settings: once a quiz has ended (`schedule_locked`) its start, end and time limit are
//     read-only and are not sent; everything else still saves. A quiz that ends while the form is
//     open is refused 409 `quiz_schedule_locked`: the server's sentence is shown and the three
//     fields lock, so the next save carries the other changes only.
//   - Leaderboard: provisional ("Live standings") or final is the server's word. No prize, trophy
//     or winner before it is final; late attempts are counted, never ranked.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/super-admin/TargetingFilter', () => ({ TargetingFilter: () => null }))
vi.mock('@/lib/csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/csv')>()),
  downloadCsv: vi.fn(),
}))

import { api } from '@/api/client'
import { downloadCsv } from '@/lib/csv'
import { formatDateTime } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import { QuizLeaderboardModal, QuizParticipationCell } from './QuizLeaderboardModal'
import { QuizSettingsModal } from './QuizSettingsModal'
import type { Event } from './quizShared'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

const LOCKED_SENTENCE = 'This quiz has ended, so its start time, end time and time limit can no longer be changed.'

// 10:00 to 11:00 UTC is 15:30 to 16:30 in India.
const STARTS = '2026-10-01T10:00:00Z'
const ENDS = '2026-10-01T11:00:00Z'
const FINAL_AT = '2026-10-01T11:10:15Z'

function quiz(overrides: Partial<Event> = {}): Event {
  return {
    id: 'quiz-1',
    type: 'quiz',
    title: 'Study in Canada quiz',
    description: null,
    timezone: 'Asia/Kolkata',
    starts_at: STARTS,
    ends_at: ENDS,
    questions_per_attempt: 5,
    time_limit_minutes: 10,
    points_override: 10,
    position_prizes: [],
    status: 'ended',
    attendance_count: 3,
    schedule_locked: true,
    results_final: false,
    results_final_at: FINAL_AT,
    ...overrides,
  } as Event
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

const input = (label: RegExp) => screen.getByLabelText(label) as HTMLInputElement
const sentBody = (call = 0) => (mockedPatch.mock.calls[call][1] as { body: Record<string, unknown> }).body

type Entry = Record<string, unknown>
let leaderboard: Record<string, unknown>

function entryRow(rank: number, name: string, extra: Entry = {}): Entry {
  return {
    rank,
    student_name: name,
    email: `${name.split(' ')[0].toLowerCase()}@example.test`,
    phone: '+919800000000',
    student_type: 'aspirant',
    score: 6 - rank,
    completion_time_ms: 60_000 * rank,
    submitted_at: '2026-10-01T10:20:00Z',
    prize: null,
    ...extra,
  }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  vi.mocked(showToast).mockClear()
  vi.mocked(downloadCsv).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  leaderboard = {
    entries: [entryRow(1, 'Asha Rao'), entryRow(2, 'Bina Das')],
    participant_count: 3,
    late_count: 1,
    results_final: false,
    results_final_at: FINAL_AT,
  }
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/events/{id}/leaderboard') return { data: leaderboard, error: undefined }
    return { data: [], error: undefined }
  }) as never)
  mockedPatch.mockResolvedValue({ data: quiz(), error: undefined } as never)
})

describe('quiz settings once the quiz has ended (schedule_locked)', () => {
  it('shows the start, end and time limit read-only, with the reason, and leaves the rest editable', () => {
    render(<QuizSettingsModal editingEvent={quiz()} onClose={vi.fn()} />, { wrapper })

    expect(screen.getByRole('note')).toHaveTextContent(LOCKED_SENTENCE)
    expect(input(/^Starts at/)).toBeDisabled()
    expect(input(/^Starts at/).value).toBe('2026-10-01T15:30')
    expect(input(/^Ends at/)).toBeDisabled()
    expect(input(/^Ends at/).value).toBe('2026-10-01T16:30')
    expect(input(/^Time limit/)).toBeDisabled()
    expect(input(/^Time limit/).value).toBe('10')

    expect(input(/^Title/)).toBeEnabled()
    // Students have completed this quiz, so its question count is fixed too, as is the zone the
    // locked times are read in.
    expect(input(/^Questions per attempt/)).toBeDisabled()
    expect(screen.getByLabelText(/^Time zone/)).toBeDisabled()
    expect(input(/^Participation points/)).toBeEnabled()
    // An end in the past is not an error to fix here: the form can still be saved.
    expect(screen.queryByText(/The end cannot be in the past/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled()
  })

  it('locks the points and prizes once the results are final, and says why', () => {
    const paid = quiz({ results_final: true, position_prizes: [{ position: 1, prize: 'Voucher', points: 500 }] })
    render(<QuizSettingsModal editingEvent={paid} onClose={vi.fn()} />, { wrapper })

    expect(screen.getByText(/the points and prizes have been awarded, so they can no longer be changed/)).toBeVisible()
    expect(input(/^Participation points/)).toBeDisabled()
    expect(input(/^Position/)).toBeDisabled()
    expect(input(/^Prize/)).toBeDisabled()
    expect(input(/^Bonus points/)).toBeDisabled()
    expect(screen.queryByRole('button', { name: '+ Add position prize' })).not.toBeInTheDocument()
    expect(input(/^Title/)).toBeEnabled()
  })

  it('keeps the prize list editable when the prizes could not be paid', () => {
    const unpaid = quiz({
      results_final: true,
      prize_settlement_error: 'Two prizes share position 1.',
      position_prizes: [{ position: 1, prize: 'Voucher', points: 500 }],
    })
    render(<QuizSettingsModal editingEvent={unpaid} onClose={vi.fn()} />, { wrapper })

    expect(input(/^Prize/)).toBeEnabled()
    expect(input(/^Participation points/)).toBeEnabled()
    expect(screen.getByRole('button', { name: '+ Add position prize' })).toBeInTheDocument()
  })

  it('saves the other fields and does not send the three locked ones', async () => {
    const onClose = vi.fn()
    render(<QuizSettingsModal editingEvent={quiz()} onClose={onClose} />, { wrapper })
    fireEvent.change(input(/^Title/), { target: { value: 'Study in Canada quiz (October)' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    const body = sentBody()
    expect(body.title).toBe('Study in Canada quiz (October)')
    expect(body).not.toHaveProperty('starts_at')
    expect(body).not.toHaveProperty('ends_at')
    expect(body).not.toHaveProperty('time_limit_minutes')
    expect(body).toHaveProperty('questions_per_attempt', 5)
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('reads the fixed times on whichever clock is chosen, without moving them', () => {
    render(<QuizSettingsModal editingEvent={quiz()} onClose={vi.fn()} />, { wrapper })
    fireEvent.change(screen.getByLabelText(/^Time zone/), { target: { value: 'UTC' } })
    expect(input(/^Starts at/).value).toBe('2026-10-01T10:00')
    expect(input(/^Ends at/).value).toBe('2026-10-01T11:00')
  })

  it('a quiz that is still open keeps all three editable and sends them', async () => {
    const open = quiz({
      schedule_locked: false,
      status: 'upcoming',
      starts_at: '2030-01-10T10:00:00Z',
      ends_at: '2030-01-10T11:00:00Z',
    })
    render(<QuizSettingsModal editingEvent={open} onClose={vi.fn()} />, { wrapper })
    expect(screen.queryByText(LOCKED_SENTENCE)).not.toBeInTheDocument()
    expect(input(/^Starts at/)).toBeEnabled()
    expect(input(/^Ends at/)).toBeEnabled()
    expect(input(/^Time limit/)).toBeEnabled()

    fireEvent.change(input(/^Time limit/), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(1))
    expect(sentBody()).toMatchObject({
      starts_at: '2030-01-10T10:00:00.000Z',
      ends_at: '2030-01-10T11:00:00.000Z',
      time_limit_minutes: 20,
    })
  })

  it('a quiz that ends while the form is open: the refusal is shown, the three lock, and the next save keeps the rest', async () => {
    // Open when the form was opened; the server now says it has ended.
    const open = quiz({ schedule_locked: false, status: 'live', ends_at: '2030-01-10T11:00:00Z', starts_at: STARTS })
    const onClose = vi.fn()
    mockedPatch.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'quiz_schedule_locked',
          message: LOCKED_SENTENCE,
          details: { locked_fields: ['time_limit_minutes'], ends_at: '2030-01-10T11:00:00Z' },
        },
      },
      response: { status: 409 },
    } as never)
    render(<QuizSettingsModal editingEvent={open} onClose={onClose} />, { wrapper })

    fireEvent.change(input(/^Title/), { target: { value: 'Renamed' } })
    fireEvent.change(input(/^Time limit/), { target: { value: '25' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(LOCKED_SENTENCE)
    expect(alert).toHaveTextContent(
      'Nothing was saved. Your change to the time limit has been put back. Your other changes are still here: save again to keep them.',
    )
    expect(onClose).not.toHaveBeenCalled()
    // Said once, beside the fields, not again in the footer.
    expect(screen.getAllByText(LOCKED_SENTENCE, { exact: false })).toHaveLength(1)

    // The three are locked on their stored values; the title change is still there.
    expect(input(/^Time limit/)).toBeDisabled()
    expect(input(/^Time limit/).value).toBe('10')
    expect(input(/^Starts at/)).toBeDisabled()
    expect(input(/^Ends at/)).toBeDisabled()
    expect(input(/^Title/).value).toBe('Renamed')

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(mockedPatch).toHaveBeenCalledTimes(2))
    const body = sentBody(1)
    expect(body.title).toBe('Renamed')
    expect(body).not.toHaveProperty('time_limit_minutes')
    expect(body).not.toHaveProperty('starts_at')
    expect(body).not.toHaveProperty('ends_at')
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it('names every field the refusal lists', async () => {
    const open = quiz({ schedule_locked: false, status: 'live', ends_at: '2030-01-10T11:00:00Z' })
    mockedPatch.mockResolvedValueOnce({
      data: undefined,
      error: {
        error: {
          code: 'quiz_schedule_locked',
          message: LOCKED_SENTENCE,
          details: { locked_fields: ['starts_at', 'ends_at', 'time_limit_minutes'] },
        },
      },
      response: { status: 409 },
    } as never)
    render(<QuizSettingsModal editingEvent={open} onClose={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Your change to the start time, the end time and the time limit has been put back.',
    )
  })

  it('any other refusal is still shown in the footer and locks nothing', async () => {
    const open = quiz({ schedule_locked: false, status: 'live', ends_at: '2030-01-10T11:00:00Z' })
    mockedPatch.mockResolvedValueOnce({
      data: undefined,
      error: { error: { code: 'locked_after_attempts', message: 'Questions per attempt cannot change once someone has started.' } },
      response: { status: 409 },
    } as never)
    render(<QuizSettingsModal editingEvent={open} onClose={vi.fn()} />, { wrapper })
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(await screen.findByText('Questions per attempt cannot change once someone has started.')).toBeInTheDocument()
    expect(input(/^Time limit/)).toBeEnabled()
    expect(screen.queryByText(LOCKED_SENTENCE)).not.toBeInTheDocument()
  })
})

describe('quiz leaderboard popup', () => {
  const headers = () => screen.getAllByRole('columnheader').map((th) => th.textContent)

  it('before the results are final: live standings, when they become final, and no prize anywhere', async () => {
    render(<QuizLeaderboardModal event={quiz()} onClose={vi.fn()} />, { wrapper })
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(`More results may still come in. Final results at ${formatDateTime(FINAL_AT)}.`)
    expect(screen.getByText('Live standings')).toBeInTheDocument()
    expect(screen.getByText(/3 participated · 1 arrived late \(not ranked\) · No one has won a prize yet/)).toBeInTheDocument()

    expect(await screen.findByText('Asha Rao')).toBeInTheDocument()
    expect(headers()).not.toContain('Prize')
    expect(screen.queryByText(/winner/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Final results')).not.toBeInTheDocument()
  })

  it('does not show a prize before final even if a row carried one', async () => {
    leaderboard = { ...leaderboard, entries: [entryRow(1, 'Asha Rao', { prize: { position: 1, prize: 'Wireless earbuds', points: 500 } })] }
    render(<QuizLeaderboardModal event={quiz()} onClose={vi.fn()} />, { wrapper })
    await screen.findByText('Asha Rao')
    expect(screen.queryByText(/Wireless earbuds/)).not.toBeInTheDocument()
  })

  it('once final: says so, and marks what each winning position won', async () => {
    leaderboard = {
      entries: [
        entryRow(1, 'Asha Rao', { prize: { position: 1, prize: 'Wireless earbuds', points: 500 } }),
        entryRow(2, 'Bina Das', { prize: { position: 2, prize: null, points: 1 } }),
        entryRow(3, 'Chitra Pai', { prize: null }),
      ],
      participant_count: 3,
      late_count: 0,
      results_final: true,
      results_final_at: FINAL_AT,
    }
    render(<QuizLeaderboardModal event={quiz({ results_final: true })} onClose={vi.fn()} />, { wrapper })
    expect(await screen.findByRole('status')).toHaveTextContent('These positions are final. Winners are marked in the Prize column.')
    expect(screen.getByText('Final results')).toBeInTheDocument()
    expect(screen.queryByText('Live standings')).not.toBeInTheDocument()
    expect(headers()).toContain('Prize')

    const first = (await screen.findByText('Asha Rao')).closest('tr')!
    expect(within(first).getByText('Wireless earbuds + 500 bonus points')).toBeInTheDocument()
    expect(within(screen.getByText('Bina Das').closest('tr')!).getByText('1 bonus point')).toBeInTheDocument()
    // A final position with no prize is blank, not a winner.
    const third = screen.getByText('Chitra Pai').closest('tr')!
    expect(within(third).queryByText(/bonus/)).not.toBeInTheDocument()
    // No late attempts: nothing is said about them.
    expect(screen.queryByText(/arrived late/)).not.toBeInTheDocument()
    expect(screen.queryByText(/No one has won/)).not.toBeInTheDocument()
  })

  it('decides from results_final, not from the clock: a final time already passed is still live', async () => {
    leaderboard = { ...leaderboard, results_final: false, results_final_at: '2020-01-01T00:00:00Z' }
    render(<QuizLeaderboardModal event={quiz({ results_final_at: '2020-01-01T00:00:00Z' })} onClose={vi.fn()} />, { wrapper })
    await screen.findByText('Asha Rao')
    expect(screen.getByText('Live standings')).toBeInTheDocument()
    expect(headers()).not.toContain('Prize')
  })

  it('a quiz with no end time never becomes final, and says so', async () => {
    leaderboard = { ...leaderboard, results_final_at: null }
    render(<QuizLeaderboardModal event={quiz({ ends_at: undefined, results_final_at: null })} onClose={vi.fn()} />, { wrapper })
    expect(await screen.findByRole('status')).toHaveTextContent(
      'More results may still come in. This quiz has no end time, so its results are never final.',
    )
  })

  it('the export carries the prize only once the results are final', async () => {
    render(<QuizLeaderboardModal event={quiz()} onClose={vi.fn()} />, { wrapper })
    await screen.findByText('Asha Rao')
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }))
    const live = vi.mocked(downloadCsv).mock.calls[0][1] as string
    expect(live.split('\n')[0]).not.toContain('Prize')
  })

  it('the export of final results has a Prize column', async () => {
    leaderboard = {
      ...leaderboard,
      results_final: true,
      entries: [entryRow(1, 'Asha Rao', { prize: { position: 1, prize: 'Wireless earbuds', points: null } })],
    }
    render(<QuizLeaderboardModal event={quiz({ results_final: true })} onClose={vi.fn()} />, { wrapper })
    await screen.findByText('Wireless earbuds')
    fireEvent.click(screen.getByRole('button', { name: /Download CSV/ }))
    const csv = vi.mocked(downloadCsv).mock.calls[0][1] as string
    expect(csv.split('\n')[0]).toContain('Prize')
    expect(csv).toContain('Wireless earbuds')
  })
})

describe('the quiz row says when its results are final', () => {
  it('before: the time', () => {
    render(<QuizParticipationCell event={quiz()} />, { wrapper })
    expect(screen.getByText(`Final results at ${formatDateTime(FINAL_AT)}`)).toBeInTheDocument()
  })

  it('after: "Final results"', () => {
    render(<QuizParticipationCell event={quiz({ results_final: true })} />, { wrapper })
    expect(screen.getByText('Final results')).toBeInTheDocument()
  })

  it('a quiz that never settles says nothing', () => {
    render(<QuizParticipationCell event={quiz({ results_final: false, results_final_at: null })} />, { wrapper })
    expect(screen.queryByText(/Final results/)).not.toBeInTheDocument()
  })
})
