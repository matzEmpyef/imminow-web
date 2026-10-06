import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The platform Ratings page (owner decision 16, review F-012). Pinned here:
//   - the chips come from `counts` (All = included + excluded) and each sends the right filter;
//   - a row prints what the server says, "Erased account" for a student who is gone;
//   - the drawer shows the submissions behind the rating;
//   - Exclude needs a reason and a confirmation that says what happens; Restore is confirmed too;
//   - a refusal shows the server's own words.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/features/auth/AdminShell', () => ({
  AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}))
vi.mock('./finance/ConsultancySearchSelect', () => ({
  ConsultancySearchSelect: ({ value, onChange }: { value: string; onChange: (id: string) => void }) => (
    <button type="button" onClick={() => onChange(value ? '' : 'cons-1')}>
      {value ? 'Clear consultancy' : 'Pick Bright Path'}
    </button>
  ),
}))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { useAuthStore } from '@/stores/authStore'
import type { AdminRating } from '@/queries/adminRatings'
import { RatingsPage } from './RatingsPage'

const mockedGet = vi.mocked(api.GET)
const mockedPatch = vi.mocked(api.PATCH)

function rating(overrides: Partial<AdminRating> = {}): AdminRating {
  return {
    id: 'rating-1',
    consultancy_id: 'cons-1',
    consultancy_name: 'Bright Path',
    student_id: 'student-1',
    student_name: 'Meera Pillai',
    student_account_created_at: '2026-09-28T08:00:00Z',
    stars: 3.5,
    last_stars: 4,
    submissions: 2,
    first_rated_at: '2026-09-29T10:00:00Z',
    last_rated_at: '2026-10-05T10:00:00Z',
    relationship: 'client',
    acquisition_source: 'B',
    consultancies_rated: 1,
    asked_count: 3,
    flags: ['account_new', 'single_consultancy'],
    excluded: false,
    excluded_at: null,
    excluded_by_name: null,
    excluded_reason: null,
    rated_again_since_exclusion: false,
    submissions_history: [
      { stars: 4, stars_after: 3.5, via: 'review', rated_at: '2026-10-05T10:00:00Z', account_age_days: 7 },
      { stars: 3, stars_after: 3, via: 'chat', rated_at: '2026-09-29T10:00:00Z', account_age_days: 1 },
    ],
    review_id: 'review-1',
    ...overrides,
  }
}

const ERASED = rating({
  id: 'rating-2',
  student_id: null,
  student_name: null,
  student_account_created_at: null,
  relationship: 'chat',
  acquisition_source: null,
  flags: [],
  stars: 5,
  last_stars: 5,
  submissions: 1,
  submissions_history: [],
  review_id: null,
})

const EXCLUDED = rating({
  id: 'rating-3',
  student_name: 'Arun Das',
  excluded: true,
  excluded_at: '2026-10-05T12:00:00Z',
  excluded_by_name: 'Ananya Rao',
  excluded_reason: 'Rated by a staff member of the consultancy.',
  rated_again_since_exclusion: true,
})

let rows: AdminRating[]

function ok<T>(data: T) {
  return { data, error: undefined, response: { status: 200 } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return { data: undefined, error: { error: { code, message, request_id: 'r1', details } }, response: { status } } as never
}

/** The query string of each list request, newest last. */
function listQueries(): Record<string, unknown>[] {
  return (mockedGet.mock.calls as unknown as [string, { params: { query: Record<string, unknown> } }][])
    .filter(([path]) => path === '/admin/ratings')
    .map(([, init]) => init.params.query)
}

function renderPage(path = '/admin/ratings') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <RatingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPatch.mockReset()
  vi.mocked(showToast).mockClear()
  useAuthStore.setState({ accessToken: 'test-token' })
  rows = [rating(), ERASED, EXCLUDED]
  mockedGet.mockImplementation((async () =>
    ok({
      items: rows,
      meta: { next_cursor: null, total: rows.length },
      counts: { included: 41, excluded: 4, flagged: 6 },
    })) as never)
})

describe('the list', () => {
  it('labels the chips from the platform-wide counts, with All as included plus excluded', async () => {
    renderPage()
    expect(await screen.findByRole('button', { name: 'All (45)' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Flagged (6)' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Excluded (4)' })).toBeInTheDocument()
  })

  it('asks for everything first, then only flagged, then only excluded', async () => {
    renderPage()
    await screen.findByText('Meera Pillai')
    expect(listQueries().at(-1)).toEqual({ limit: 20 })

    fireEvent.click(screen.getByRole('button', { name: 'Flagged (6)' }))
    await waitFor(() => expect(listQueries().at(-1)).toEqual({ flagged: true, limit: 20 }))

    fireEvent.click(screen.getByRole('button', { name: 'Excluded (4)' }))
    await waitFor(() => expect(listQueries().at(-1)).toEqual({ excluded: true, limit: 20 }))
  })

  it('narrows to one consultancy', async () => {
    renderPage()
    await screen.findByText('Meera Pillai')
    fireEvent.click(screen.getByRole('button', { name: 'Pick Bright Path' }))
    await waitFor(() => expect(listQueries().at(-1)).toEqual({ consultancy_id: 'cons-1', limit: 20 }))
  })

  it('shows everything one account rated when opened with a student id, and can be cleared', async () => {
    renderPage('/admin/ratings?student_id=student-1')
    await screen.findByText('Meera Pillai')
    expect(listQueries().at(-1)).toEqual({ student_id: 'student-1', limit: 20 })
    fireEvent.click(screen.getByRole('button', { name: /Ratings by one account/ }))
    await waitFor(() => expect(listQueries().at(-1)).toEqual({ limit: 20 }))
  })

  it('prints each row as the server gave it', async () => {
    renderPage()
    const row = (await screen.findByText('Meera Pillai')).closest('tr')!
    expect(row).toHaveTextContent('account created')
    expect(row).toHaveTextContent('Bright Path')
    expect(row).toHaveTextContent('3.5 · 2 submissions')
    expect(row).toHaveTextContent('Client · Channel B')
    expect(within(row).getByText('New account')).toBeInTheDocument()
    expect(within(row).getByText('Only this consultancy')).toBeInTheDocument()
    expect(within(row).getByText('Included')).toBeInTheDocument()
    expect(within(row).getByRole('link', { name: 'Bright Path' })).toHaveAttribute(
      'href',
      '/admin/consultancies?search=Bright%20Path',
    )
  })

  it('prints "Erased account" for a student who is gone, with no account date and no signals', async () => {
    renderPage()
    const row = (await screen.findByText('Erased account')).closest('tr')!
    expect(row).not.toHaveTextContent('account created')
    expect(row).toHaveTextContent('5.0 · 1 submission')
    expect(row).toHaveTextContent('Chat')
    expect(within(row).queryByText('New account')).not.toBeInTheDocument()
  })

  it('marks an excluded rating, and that the student rated again since', async () => {
    renderPage()
    const row = (await screen.findByText('Arun Das')).closest('tr')!
    expect(within(row).getByText('Excluded')).toBeInTheDocument()
    expect(within(row).getByText('rated again since')).toBeInTheDocument()
  })

  it("shows the server's message when the list is refused", async () => {
    mockedGet.mockImplementation((async () =>
      refused(403, 'permission_denied', 'Ratings are limited to staff who manage consultancies.')) as never)
    renderPage()
    expect(await screen.findByText('Ratings are limited to staff who manage consultancies.')).toBeInTheDocument()
  })

  it('never states the hidden thresholds', async () => {
    const { container } = renderPage()
    await screen.findByText('Meera Pillai')
    expect(container.textContent).not.toMatch(/7 days|400|characters|turns/i)
  })
})

describe('the drawer', () => {
  async function openDrawer(name: string) {
    renderPage()
    fireEvent.click(await screen.findByText(name))
    return screen.findByRole('dialog', { name })
  }

  it('shows the submissions behind the rating and the signals', async () => {
    const drawer = await openDrawer('Meera Pillai')
    expect(drawer).toHaveTextContent('The average of 2 submissions.')
    expect(drawer).toHaveTextContent('4★ with a review → rating 3.5')
    expect(drawer).toHaveTextContent('account was 7 days old')
    expect(drawer).toHaveTextContent('3★ from chat → rating 3.0')
    expect(drawer).toHaveTextContent('account was 1 day old')
    expect(drawer).toHaveTextContent('Bright Path asked for a rating 3 times')
    expect(drawer).toHaveTextContent('1 consultancy rated by this account')
    expect(drawer).toHaveTextContent('This student also wrote a review of this consultancy.')
    expect(within(drawer).getByRole('link', { name: 'Open Reviews' })).toHaveAttribute('href', '/admin/reviews')
    expect(within(drawer).getByRole('button', { name: 'Exclude from score' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Restore to score' })).not.toBeInTheDocument()
  })

  it('says who excluded a rating, when and why, and offers Restore instead of Exclude', async () => {
    const drawer = await openDrawer('Arun Das')
    expect(drawer).toHaveTextContent('Excluded from the score')
    expect(drawer).toHaveTextContent('Ananya Rao')
    expect(drawer).toHaveTextContent('Reason: Rated by a staff member of the consultancy.')
    expect(drawer).toHaveTextContent('The student has rated again since. It stays excluded until you restore it.')
    expect(within(drawer).getByRole('button', { name: 'Restore to score' })).toBeInTheDocument()
    expect(within(drawer).queryByRole('button', { name: 'Exclude from score' })).not.toBeInTheDocument()
  })

  it('opens for an erased account', async () => {
    const drawer = await openDrawer('Erased account')
    expect(drawer).toHaveTextContent('This account was erased. The rating still counts unless it is excluded.')
    expect(drawer).toHaveTextContent('Chat only, no case')
    expect(drawer).toHaveTextContent('No submissions on record.')
  })
})

describe('excluding a rating', () => {
  async function openConfirm() {
    renderPage()
    fireEvent.click(await screen.findByText('Meera Pillai'))
    const drawer = await screen.findByRole('dialog', { name: 'Meera Pillai' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Exclude from score' }))
    return screen.findByRole('dialog', { name: 'Exclude this rating from the score?' })
  }

  it('says exactly what will happen before anything is sent', async () => {
    const confirm = await openConfirm()
    expect(confirm).toHaveTextContent(
      'The rating from Meera Pillai will stop counting towards Bright Path’s score. The score and the number of ratings shown to students change straight away.',
    )
    expect(confirm).toHaveTextContent('The student is not told, and still sees their own rating in the app.')
    expect(confirm).toHaveTextContent('If they rate again, it stays excluded until you restore it.')
    expect(confirm).toHaveTextContent('A written review is not affected. Hide that from Reviews.')
    expect(confirm).toHaveTextContent('You can restore the rating at any time.')
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('needs a reason, and sends nothing without one', async () => {
    const confirm = await openConfirm()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Exclude from score' }))
    expect(within(confirm).getByText('Add a reason.')).toBeInTheDocument()
    fireEvent.change(within(confirm).getByLabelText(/Reason/), { target: { value: '   ' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Exclude from score' }))
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('sends the trimmed reason, then shows the rating as excluded', async () => {
    const after = rating({
      excluded: true,
      excluded_at: '2026-10-06T09:00:00Z',
      excluded_by_name: 'Ananya Rao',
      excluded_reason: 'Same device as the consultancy owner.',
    })
    mockedPatch.mockResolvedValueOnce(ok(after))
    const confirm = await openConfirm()
    fireEvent.change(within(confirm).getByLabelText(/Reason/), {
      target: { value: '  Same device as the consultancy owner.  ' },
    })
    rows = [after, ERASED, EXCLUDED]
    fireEvent.click(within(confirm).getByRole('button', { name: 'Exclude from score' }))

    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/ratings/{id}', {
        params: { path: { id: 'rating-1' } },
        body: { excluded: true, reason: 'Same device as the consultancy owner.' },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Exclude this rating from the score?' })).not.toBeInTheDocument())
    const drawer = screen.getByRole('dialog', { name: 'Meera Pillai' })
    expect(drawer).toHaveTextContent('Reason: Same device as the consultancy owner.')
    expect(within(drawer).getByRole('button', { name: 'Restore to score' })).toBeInTheDocument()
    expect(showToast).toHaveBeenCalledWith('Excluded. Bright Path’s score no longer counts this rating')
  })

  it("mirrors the server's own missing-reason refusal on the field", async () => {
    mockedPatch.mockResolvedValueOnce(refused(400, 'validation_failed', 'A reason is required.', { reason: 'required' }))
    const confirm = await openConfirm()
    fireEvent.change(within(confirm).getByLabelText(/Reason/), { target: { value: 'x' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Exclude from score' }))
    expect(await within(confirm).findByText('Add a reason.')).toBeInTheDocument()
    expect(within(confirm).queryByRole('alert')).not.toBeInTheDocument()
  })

  it("shows the server's message for any other refusal and keeps the popup open", async () => {
    mockedPatch.mockResolvedValueOnce(refused(404, 'not_found', 'This rating no longer exists.'))
    const confirm = await openConfirm()
    fireEvent.change(within(confirm).getByLabelText(/Reason/), { target: { value: 'Duplicate account.' } })
    fireEvent.click(within(confirm).getByRole('button', { name: 'Exclude from score' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('This rating no longer exists.')
    expect(showToast).not.toHaveBeenCalled()
  })

  it('changes nothing when cancelled', async () => {
    const confirm = await openConfirm()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog', { name: 'Exclude this rating from the score?' })).not.toBeInTheDocument()
    expect(mockedPatch).not.toHaveBeenCalled()
  })
})

describe('restoring a rating', () => {
  async function openConfirm() {
    renderPage()
    fireEvent.click(await screen.findByText('Arun Das'))
    const drawer = await screen.findByRole('dialog', { name: 'Arun Das' })
    fireEvent.click(within(drawer).getByRole('button', { name: 'Restore to score' }))
    return screen.findByRole('dialog', { name: 'Restore this rating to the score?' })
  }

  it('asks first, saying what will happen', async () => {
    const confirm = await openConfirm()
    expect(confirm).toHaveTextContent(
      'The rating from Arun Das will count towards Bright Path’s score again, at 3.5 stars. The score shown to students changes straight away.',
    )
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('sends excluded: false with no reason, then shows the rating as included', async () => {
    const after = { ...EXCLUDED, excluded: false, excluded_at: null, excluded_by_name: null, excluded_reason: null, rated_again_since_exclusion: false }
    mockedPatch.mockResolvedValueOnce(ok(after))
    const confirm = await openConfirm()
    rows = [rating(), ERASED, after]
    fireEvent.click(within(confirm).getByRole('button', { name: 'Restore to score' }))
    await waitFor(() =>
      expect(mockedPatch).toHaveBeenCalledWith('/admin/ratings/{id}', {
        params: { path: { id: 'rating-3' } },
        body: { excluded: false },
      }),
    )
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Restore this rating to the score?' })).not.toBeInTheDocument())
    const drawer = screen.getByRole('dialog', { name: 'Arun Das' })
    expect(within(drawer).getByRole('button', { name: 'Exclude from score' })).toBeInTheDocument()
    expect(showToast).toHaveBeenCalledWith('Restored. Bright Path’s score counts this rating again')
  })

  it("shows the server's message when restoring is refused", async () => {
    mockedPatch.mockResolvedValueOnce(refused(403, 'permission_denied', 'You can no longer manage ratings.'))
    const confirm = await openConfirm()
    fireEvent.click(within(confirm).getByRole('button', { name: 'Restore to score' }))
    expect(await within(confirm).findByRole('alert')).toHaveTextContent('You can no longer manage ratings.')
  })
})
