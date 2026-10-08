import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MutationCache, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Settings → Study Levels (2026-10-08): a move sends the WHOLE ladder once
// (`POST /study-levels/reorder`), not one PATCH per rung; when the server refuses it (400, the
// ladder changed since it was loaded) the list is read again and a message says so.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { api } from '@/api/client'
import { showToast } from '@/lib/toast'
import { reportFailedSave } from '@/lib/saveErrors'
import type { StudyLevel } from '@/lib/studyLevels'
import { ReorderLevelCell } from './CatalogSettingsPage'

const mockedPost = vi.mocked(api.POST)
const mockedPatch = vi.mocked(api.PATCH)

// The management list: every rung, the retired one included.
const LADDER = [
  { code: 'diploma', label: 'Diploma', sort_order: 10, active: true },
  { code: 'bachelors', label: 'Bachelors', sort_order: 20, active: true },
  { code: 'pg_diploma', label: 'PG Diploma', sort_order: 30, active: false },
  { code: 'masters', label: 'Masters', sort_order: 40, active: true },
] as StudyLevel[]

function renderCell(code: string) {
  // Wired as the app's own client is, so a failure nobody shows inline reaches the toast.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    mutationCache: new MutationCache({ onError: reportFailedSave }),
  })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  render(
    <QueryClientProvider client={client}>
      <ReorderLevelCell level={LADDER.find((l) => l.code === code)!} rows={LADDER} />
    </QueryClientProvider>,
  )
  return { invalidate }
}

beforeEach(() => {
  mockedPost.mockReset()
  mockedPatch.mockReset()
  vi.mocked(showToast).mockClear()
})

describe('Study levels — reordering', () => {
  it('sends one request carrying every code once, in the new order', async () => {
    mockedPost.mockResolvedValue({ data: LADDER, error: undefined, response: { status: 200 } } as never)
    renderCell('bachelors')
    fireEvent.click(screen.getByRole('button', { name: 'Move Bachelors up' }))

    await waitFor(() => expect(mockedPost).toHaveBeenCalledTimes(1))
    expect(mockedPost).toHaveBeenCalledWith('/study-levels/reorder', {
      body: { codes: ['bachelors', 'diploma', 'pg_diploma', 'masters'] },
    })
    expect(mockedPatch).not.toHaveBeenCalled()
  })

  it('moves down past a retired rung, still naming it', async () => {
    mockedPost.mockResolvedValue({ data: LADDER, error: undefined, response: { status: 200 } } as never)
    renderCell('bachelors')
    fireEvent.click(screen.getByRole('button', { name: 'Move Bachelors down' }))
    await waitFor(() =>
      expect(mockedPost).toHaveBeenCalledWith('/study-levels/reorder', {
        body: { codes: ['diploma', 'pg_diploma', 'bachelors', 'masters'] },
      }),
    )
  })

  it('reloads the list and says so when the ladder changed meanwhile (400)', async () => {
    mockedPost.mockResolvedValue({
      data: undefined,
      error: {
        error: { code: 'validation_failed', message: 'codes must list every study level once.', request_id: 'r1', status: 400 },
      },
      response: { status: 400 },
    } as never)
    const { invalidate } = renderCell('masters')
    fireEvent.click(screen.getByRole('button', { name: 'Move Masters up' }))

    await waitFor(() =>
      expect(showToast).toHaveBeenCalledWith(
        'The list changed while you were reordering. It has been reloaded.',
        'error',
        expect.anything(),
      ),
    )
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['study-levels'] })
  })
})
