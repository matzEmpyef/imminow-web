import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The quiz prize list (review F-018, owner decision 13). The form used to send its own state: a
// cleared number field went out as text, an untouched row as a prize, "0 points" as a prize of
// nothing. The job that pays prizes could not read such a list, and one bad quiz stopped prizes
// and reminders for every quiz. Pinned here: what is SENT, what is refused before sending, the
// "Prizes not paid" warning, and the wording about when questions lock.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/queries/eventsAdmin', () => ({
  useAdminEvents: vi.fn(),
  useVoidEvent: vi.fn(),
  useCreateEvent: vi.fn(),
  useUpdateEvent: vi.fn(),
}))
vi.mock('@/queries/countries', () => ({ useCountries: vi.fn(() => ({ data: [] })) }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/super-admin/TargetingFilter', () => ({ TargetingFilter: () => null }))
vi.mock('./QuizLeaderboardModal', () => ({ QuizParticipationCell: () => null }))
vi.mock('./EventListingToggle', () => ({ EventListingToggle: () => null }))
vi.mock('./ManageQuestionsModal', () => ({ ManageQuestionsModal: () => null }))
vi.mock('./QuizBrandingModal', () => ({ QuizBrandingModal: () => null }))
vi.mock('./EventDetailsModal', () => ({ EventDetailsModal: () => null }))

import { useAdminEvents, useCreateEvent, useUpdateEvent, useVoidEvent } from '@/queries/eventsAdmin'
import { QuizAdminPage } from './QuizAdminPage'
import { QuizSettingsModal } from './QuizSettingsModal'
import { cleanPrizes, prizeListError, type Event, type PrizeDraft } from './quizShared'
import { useQuizForm } from './useQuizForm'

const FUTURE = '2030-01-10T10:00:00Z'
const FUTURE_END = '2030-01-10T11:00:00Z'

function quiz(overrides: Partial<Event> = {}): Event {
  return {
    id: 'quiz-1',
    type: 'quiz',
    title: 'Study in Canada quiz',
    description: null,
    timezone: 'Asia/Kolkata',
    starts_at: FUTURE,
    ends_at: FUTURE_END,
    questions_per_attempt: 5,
    time_limit_minutes: 10,
    points_override: 10,
    position_prizes: [],
    status: 'upcoming',
    attendance_count: 0,
    ...overrides,
  } as Event
}

/** A prize row as the form really holds it after typing and clearing fields. */
const draft = (row: PrizeDraft) => row as never

describe('what is sent for the prize list', () => {
  it('sends the position as a number', () => {
    expect(cleanPrizes([{ position: '2', prize: 'Backpack', points: null }])).toEqual([
      { position: 2, prize: 'Backpack', points: null },
    ])
  })

  it('sends points as a number, or null when the field is blank or 0 — never "" and never 0', () => {
    expect(cleanPrizes([{ position: 1, prize: 'Earbuds', points: '500' }])[0].points).toBe(500)
    for (const blank of ['', '   ', null, undefined, 0, '0']) {
      const [row] = cleanPrizes([{ position: 1, prize: 'Earbuds', points: blank }])
      expect(row.points).toBeNull()
    }
  })

  it('sends the prize trimmed, or null when there is none', () => {
    expect(cleanPrizes([{ position: 1, prize: '  Earbuds  ', points: 100 }])[0].prize).toBe('Earbuds')
    expect(cleanPrizes([{ position: 1, prize: '   ', points: 100 }])[0].prize).toBeNull()
    expect(cleanPrizes([{ position: 1, points: 100 }])[0].prize).toBeNull()
  })

  it('drops a row with neither a prize nor points', () => {
    expect(
      cleanPrizes([
        { position: 1, prize: 'Earbuds', points: '' },
        { position: 2, prize: '', points: '' },
        { position: 3, prize: '  ', points: 0 },
        { position: 4, prize: '', points: 250 },
      ]),
    ).toEqual([
      { position: 1, prize: 'Earbuds', points: null },
      { position: 4, prize: null, points: 250 },
    ])
  })
})

describe('what is refused before it is sent', () => {
  it('accepts a good list and an empty one', () => {
    expect(prizeListError([])).toBeUndefined()
    expect(
      prizeListError([
        { position: 1, prize: 'Earbuds', points: 500 },
        { position: 2, prize: '', points: 100000 },
      ]),
    ).toBeUndefined()
  })

  it('refuses a position used twice, naming it', () => {
    expect(
      prizeListError([
        { position: 1, prize: 'Earbuds' },
        { position: '1', points: 200 },
      ]),
    ).toBe('Position 1 has more than one prize. Each position can have only one.')
  })

  it('does not count a dropped row as a repeat', () => {
    expect(
      prizeListError([
        { position: 1, prize: 'Earbuds' },
        { position: 1, prize: '', points: '' },
      ]),
    ).toBeUndefined()
  })

  it.each([0, -1, 1.5, ''])('refuses position %j', (position) => {
    expect(prizeListError([{ position, prize: 'Earbuds' }])).toBe(
      'Each prize needs a position: a whole number, 1 or higher.',
    )
  })

  it.each([-5, 1.5, 100001])('refuses %j bonus points', (points) => {
    expect(prizeListError([{ position: 3, prize: 'Earbuds', points }])).toBe(
      'Bonus points for position 3 must be a whole number from 1 to 1,00,000.',
    )
  })

  it('refuses a prize longer than 200 characters', () => {
    expect(prizeListError([{ position: 2, prize: 'x'.repeat(201) }])).toBe(
      'The prize for position 2 is too long. Keep it to 200 characters.',
    )
    expect(prizeListError([{ position: 2, prize: 'x'.repeat(200) }])).toBeUndefined()
  })
})

describe('useQuizForm', () => {
  it('builds position_prizes from the cleaned list', () => {
    const { result } = renderHook(() =>
      useQuizForm(
        quiz({
          position_prizes: [
            draft({ position: '1', prize: ' Earbuds ', points: '' }),
            draft({ position: 2, prize: '', points: '250' }),
            draft({ position: 3, prize: '', points: '' }),
          ],
        }),
      ),
    )
    expect(result.current.prizeError).toBeUndefined()
    expect(result.current.toPayload().position_prizes).toEqual([
      { position: 1, prize: 'Earbuds', points: null },
      { position: 2, prize: null, points: 250 },
    ])
  })

  it('blocks the save while a position repeats, and opens again once it is fixed', () => {
    const { result } = renderHook(() =>
      useQuizForm(quiz({ position_prizes: [{ position: 1, prize: 'Earbuds' }, { position: 1, prize: 'Backpack' }] })),
    )
    expect(result.current.prizeError).toMatch(/Position 1 has more than one prize/)
    expect(result.current.isValid).toBe(false)
    act(() => result.current.updatePrize(1, { position: 2, prize: 'Backpack' }))
    expect(result.current.prizeError).toBeUndefined()
    expect(result.current.isValid).toBe(true)
  })

  it('does not ask for an end time because of a row that will not be sent', () => {
    const { result } = renderHook(() => useQuizForm(quiz({ ends_at: null })))
    act(() => result.current.addPrize())
    expect(result.current.endError).toBeUndefined()
    expect(result.current.toPayload().position_prizes).toEqual([])
    act(() => result.current.updatePrize(0, { position: 1, prize: 'Earbuds' }))
    expect(result.current.endError).toBe('A quiz with position prizes needs an end time — that is when the prizes are paid.')
  })
})

describe('the quiz details form', () => {
  const updateMutate = vi.fn()

  beforeEach(() => {
    updateMutate.mockClear()
    vi.mocked(useCreateEvent).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
    vi.mocked(useUpdateEvent).mockReturnValue({ mutate: updateMutate, isPending: false, isError: false } as never)
  })

  it('says why a repeated position cannot be saved, and keeps Save shut', () => {
    render(
      <QuizSettingsModal
        editingEvent={quiz({ position_prizes: [{ position: 1, prize: 'Earbuds' }, { position: 1, prize: 'Backpack' }] })}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Position 1 has more than one prize. Each position can have only one.')
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled()
  })

  it('saves numbers as numbers after the fields have been typed into', () => {
    render(<QuizSettingsModal editingEvent={quiz({ position_prizes: [{ position: 1, prize: 'Earbuds', points: 500 }] })} onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText('Bonus points'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /Save/ }))
    expect(updateMutate).toHaveBeenCalledTimes(1)
    expect(updateMutate.mock.calls[0][0].position_prizes).toEqual([{ position: 1, prize: 'Earbuds', points: null }])
  })

  it('adds the short-window advice to the prize help text', () => {
    render(<QuizSettingsModal editingEvent={quiz()} onClose={() => {}} />)
    expect(
      screen.getByText(/Students see their questions only when they start; a long window with a short time limit still lets an early finisher tell a late starter what to expect, so keep prize quizzes to a short window\./),
    ).toBeInTheDocument()
  })

  it('says questions lock once someone has STARTED, not once someone has taken the quiz', () => {
    const { container } = render(<QuizSettingsModal editingEvent={quiz({ attendance_count: 3 })} onClose={() => {}} />)
    expect(
      screen.getByText(/Questions and questions per attempt are locked once someone has started the quiz, so every attempt is measured against the same test\./),
    ).toHaveTextContent('3 students have completed it so far.')
    expect(container.textContent).not.toMatch(/taken (the|this) quiz/)
  })

  it('shows why the prizes were not paid, where the list is fixed', () => {
    render(
      <QuizSettingsModal
        editingEvent={quiz({ prize_settlement_error: 'position_prizes[1].points: expected an integer' } as never)}
        onClose={() => {}}
      />,
    )
    const notice = screen.getByRole('status')
    expect(notice).toHaveTextContent('Prizes not paid — fix the prize list')
    expect(notice).toHaveTextContent('position_prizes[1].points: expected an integer')
    expect(notice).toHaveTextContent('Correct the rows below and save. The prizes are then paid on the next run.')
  })
})

describe('the Quizzes list', () => {
  function serve(rows: Event[]) {
    vi.mocked(useAdminEvents).mockReturnValue({
      data: { items: rows, meta: { next_cursor: null, total: rows.length } },
      isLoading: false,
      isError: false,
    } as never)
    vi.mocked(useVoidEvent).mockReturnValue({ mutate: vi.fn(), isPending: false, isError: false } as never)
  }

  it('warns "Prizes not paid" on a quiz the job could not settle, with its error as the tooltip', () => {
    serve([
      quiz({ id: 'quiz-bad', title: 'Broken prizes quiz', prize_settlement_error: 'position_prizes[0].position: not a number' } as never),
      quiz({ id: 'quiz-ok', title: 'Healthy quiz' }),
    ])
    render(<QuizAdminPage />)
    const bad = screen.getByText('Broken prizes quiz').closest('tr')!
    const badge = within(bad).getByText('Prizes not paid — fix the prize list')
    expect(badge).toHaveAttribute('title', 'position_prizes[0].position: not a number')
    const fine = screen.getByText('Healthy quiz').closest('tr')!
    expect(within(fine).queryByText(/Prizes not paid/)).not.toBeInTheDocument()
  })
})
