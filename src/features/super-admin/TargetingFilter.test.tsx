import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Owner decision 20 (2026-10-07): every form with "who can see" targeting shows about how many
// students it would reach. ONE control, inside TargetingFilter, for ads, broadcasts and events
// (quizzes, webinars, in-person meetings). Pinned here: which route each surface asks, what is
// sent, the pause before asking, that a superseded request is cancelled, and that a refused
// half-filled form shows nothing.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))

import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import type { Targeting } from '@/lib/targeting'
import type { AudienceSurface } from '@/queries/audienceCount'
import { TargetingFilter } from './TargetingFilter'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

type CountInit = { signal: AbortSignal; params: { query: Record<string, unknown> } }
/** What the count route answers; a test replaces it. */
let answerCount: (init: CountInit) => unknown

const count = (n: number) => ({ data: { count: n }, error: undefined })
const SLOW = { timeout: 3000 }

function countCalls(path = '/events/audience-count') {
  return (mockedGet.mock.calls as unknown as [string, CountInit][]).filter(([p]) => p === path).map(([, init]) => init)
}

function filter(value: Targeting, surface: AudienceSurface = 'events') {
  return (
    <TargetingFilter
      value={value}
      onChange={() => {}}
      countries={['India']}
      unknownDataPolicy="includes"
      surface={surface}
      lifecycle={surface === 'broadcast'}
    />
  )
}

function renderFilter(value: Targeting, surface: AudienceSurface = 'events') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const view = render(<QueryClientProvider client={client}>{filter(value, surface)}</QueryClientProvider>)
  return {
    change: (next: Targeting) => view.rerender(<QueryClientProvider client={client}>{filter(next, surface)}</QueryClientProvider>),
  }
}

beforeEach(() => {
  mockedGet.mockReset()
  mockedPost.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  answerCount = () => count(1240)
  mockedGet.mockImplementation((async (path: string, init: CountInit) => {
    if (path.endsWith('/audience-count')) return answerCount(init)
    // The pickers' own lists: study levels are a bare array, schools and states are paged.
    if (path === '/study-levels') return { data: [], error: undefined }
    return { data: { items: [], meta: { next_cursor: null } }, error: undefined }
  }) as never)
  mockedPost.mockImplementation((async () => count(310)) as never)
})

describe('the expected audience under a targeting filter', () => {
  it('asks the events count for an event form and shows "about N students"', async () => {
    renderFilter({ state: ['Kerala'], study_level: ['ug'], min_age: 18, stage: 1, gender: null, city: [] })

    expect(await screen.findByText('Reaches about 1,240 students.', undefined, SLOW)).toBeInTheDocument()
    expect(countCalls()).toHaveLength(1)
    // Only what restricts is sent: empty lists and unset values are left out.
    expect(JSON.parse(JSON.stringify(countCalls()[0].params.query))).toEqual({
      state: ['Kerala'],
      study_level: ['ug'],
      min_age: 18,
      stage: 1,
    })
    expect(countCalls('/ads/audience-count')).toHaveLength(0)
  })

  it('asks the ads count for an ad', async () => {
    renderFilter({ target_country: ['Canada'] }, 'ads')
    expect(await screen.findByText('Reaches about 1,240 students.', undefined, SLOW)).toBeInTheDocument()
    expect(countCalls('/ads/audience-count')[0].params.query).toMatchObject({ target_country: ['Canada'] })
    expect(countCalls()).toHaveLength(0)
  })

  it('counts a broadcast segment with the whole document, lifecycle fields included', async () => {
    const targeting: Targeting = { state: ['Kerala'], joined_within_days: 30, dormant_days: 14 }
    renderFilter(targeting, 'broadcast')
    expect(await screen.findByText('Reaches about 310 students.', undefined, SLOW)).toBeInTheDocument()
    expect(mockedPost).toHaveBeenCalledWith(
      '/broadcast/audience-count',
      expect.objectContaining({ body: { audience: 'segment', targeting } }),
    )
  })

  it('passes "joined within" and "not used the app for" to the count when the document has them', async () => {
    renderFilter({ joined_within_days: 30, dormant_days: 90 })
    await screen.findByText('Reaches about 1,240 students.', undefined, SLOW)
    expect(countCalls()[0].params.query).toMatchObject({ joined_within_days: 30, dormant_days: 90 })
  })

  it('says one student in the singular, and says so when nobody matches', async () => {
    answerCount = () => count(1)
    const view = renderFilter({ city: ['Kochi'] })
    expect(await screen.findByText('Reaches about 1 student.', undefined, SLOW)).toBeInTheDocument()

    answerCount = () => count(0)
    view.change({ city: ['Nowhere'] })
    expect(await screen.findByText('Nobody matches these filters.', undefined, SLOW)).toBeInTheDocument()
  })

  it('waits for a pause in the editing: quick changes make one request, for the last of them', async () => {
    const view = renderFilter({})
    await screen.findByText('Reaches about 1,240 students.', undefined, SLOW)
    expect(countCalls()).toHaveLength(1)

    view.change({ city: ['K'] })
    view.change({ city: ['Ko'] })
    view.change({ city: ['Kochi'] })
    // The number on screen belonged to the previous document.
    expect(screen.getByText('Counting…')).toBeInTheDocument()
    expect(screen.queryByText(/Reaches about/)).not.toBeInTheDocument()

    await waitFor(() => expect(countCalls()).toHaveLength(2), SLOW)
    expect(countCalls()[1].params.query).toMatchObject({ city: ['Kochi'] })
    expect(await screen.findByText('Reaches about 1,240 students.', undefined, SLOW)).toBeInTheDocument()
    expect(countCalls()).toHaveLength(2)
  })

  it('cancels a request that a newer document has overtaken', async () => {
    let release: (value: unknown) => void = () => {}
    answerCount = () => new Promise((resolve) => (release = resolve))
    const view = renderFilter({ city: ['Kochi'] })
    await waitFor(() => expect(countCalls()).toHaveLength(1), SLOW)
    const first = countCalls()[0]
    expect(first.signal.aborted).toBe(false)

    answerCount = () => count(88)
    view.change({ city: ['Thrissur'] })
    expect(await screen.findByText('Reaches about 88 students.', undefined, SLOW)).toBeInTheDocument()
    expect(first.signal.aborted).toBe(true)

    // The overtaken answer arriving late changes nothing.
    release(count(5))
    await Promise.resolve()
    expect(screen.getByText('Reaches about 88 students.')).toBeInTheDocument()
  })

  it('shows nothing, and does not ask again, when the half-filled form is refused (422)', async () => {
    answerCount = () => ({
      data: undefined,
      error: { error: { code: 'validation_failed', message: 'targeting.institution_id must be an array of ids.', status: 422 } },
    })
    renderFilter({ institution_id: ['not-an-id'] })

    await waitFor(() => expect(countCalls()).toHaveLength(1), SLOW)
    await waitFor(() => expect(screen.queryByText('Counting…')).not.toBeInTheDocument(), SLOW)
    expect(screen.queryByText(/Reaches about/)).not.toBeInTheDocument()
    expect(screen.queryByText(/must be an array/)).not.toBeInTheDocument()
    expect(screen.queryByText('The count is not available right now.')).not.toBeInTheDocument()
    expect(countCalls()).toHaveLength(1)
  })

  it('says the count is not available when the server fails, without the server’s words', async () => {
    answerCount = () => ({ data: undefined, error: { error: { code: 'http_500', message: 'boom', status: 500 } } })
    renderFilter({})
    expect(await screen.findByText('The count is not available right now.', undefined, SLOW)).toBeInTheDocument()
    expect(screen.queryByText('boom')).not.toBeInTheDocument()
  })
})
