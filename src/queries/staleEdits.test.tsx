import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// Review F-075 (and I-029 for an ad): seven saves send back the `version` the record was read at. When someone else saved
// first the server answers 409 `version_conflict` and writes nothing; the person is told in one
// sentence and the record is read again, through ONE shared helper (`lib/staleEdit.ts`).
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn(), PATCH: vi.fn(), DELETE: vi.fn() } }))
vi.mock('./standing', () => ({ refreshStanding: vi.fn() }))

import { api } from '@/api/client'
import { ApiError } from '@/api/errors'
import { STALE_EDIT_NOTICE, editError, isStaleEdit, reloadOnStaleEdit } from '@/lib/staleEdit'
import { useUpdateAd } from './adsAdmin'
import { useAssignClient, useSetClientBranch, useSetFinalizedCountry } from './clients'
import { useUpdateConsultancyProfile } from './consultancy'
import { useUpdateCourse } from './courseSuggestions'
import { useUpdateEmployee } from './staff'

const mockedPatch = vi.mocked(api.PATCH)

const conflict = {
  error: { code: 'version_conflict', message: 'The record has changed.', details: { current_version: 8 } },
}

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  const invalidate = vi.spyOn(client, 'invalidateQueries')
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
  return { wrapper, invalidate }
}

beforeEach(() => {
  mockedPatch.mockReset()
})

describe('the stale-edit helper', () => {
  it('words a version_conflict in the one sentence, and keeps its code and details', () => {
    const err = editError('Could not save.', conflict, 409)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.message).toBe(STALE_EDIT_NOTICE)
    expect(err.code).toBe('version_conflict')
    expect(err.details).toEqual({ current_version: 8 })
    expect(err.status).toBe(409)
    expect(isStaleEdit(err)).toBe(true)
  })

  it('leaves every other refusal with the server’s own sentence', () => {
    const err = editError('Could not save.', { error: { code: 'conflict', message: 'This case is closed.' } }, 409)
    expect(err.message).toBe('This case is closed.')
    expect(isStaleEdit(err)).toBe(false)
  })

  it('reloads only after a stale edit', () => {
    const reload = vi.fn()
    reloadOnStaleEdit(new ApiError('x', { error: { code: 'conflict' } }, 409), reload)
    reloadOnStaleEdit(new Error('network'), reload)
    expect(reload).not.toHaveBeenCalled()
    reloadOnStaleEdit(editError('x', conflict, 409), reload)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

// The seven saves, each at version 7 of its record. Their variables differ, so the table below holds
// them as one loose shape: what the tests need from a save, and nothing about what it is given.
type Save = () => { mutateAsync: (variables: never) => Promise<unknown>; isError: boolean; error: Error | null }
const useReassign = () => useAssignClient('c1', 7)
const useBranch = () => useSetClientBranch()
const useCountry = () => useSetFinalizedCountry()
const useProfile = () => useUpdateConsultancyProfile(7)
const useEmployeeSave = () => useUpdateEmployee('e1', 7)
const useCourseSave = () => useUpdateCourse('course-1', 7)
const useAdSave = () => useUpdateAd('ad-1', 7)

// Each row: the save, how it is fired, the route, the body it must send, and what it reads again.
const SAVES = [
  {
    name: 'reassigning a case',
    hook: useReassign as Save,
    variables: 'e2',
    path: '/clients/{id}/assign',
    body: { assigned_employee_id: 'e2', version: 7 },
    reloads: ['clients'],
  },
  {
    name: 'a case’s branch',
    hook: useBranch as Save,
    variables: { id: 'c1', branchId: 'b2', version: 7 },
    path: '/clients/{id}/branch',
    body: { branch_id: 'b2', version: 7 },
    reloads: ['clients'],
  },
  {
    name: 'a case’s finalized country',
    hook: useCountry as Save,
    variables: { id: 'c1', country: 'Canada', version: 7 },
    path: '/clients/{id}/finalized-country',
    body: { country: 'Canada', version: 7 },
    reloads: ['clients'],
  },
  {
    name: 'the consultancy profile',
    hook: useProfile as Save,
    variables: { city: 'Kochi' },
    path: '/consultancies/me',
    body: { city: 'Kochi', version: 7 },
    reloads: ['consultancy', 'me'],
  },
  {
    name: 'an employee',
    hook: useEmployeeSave as Save,
    variables: { designation: 'Counsellor' },
    path: '/staff/employees/{id}',
    body: { designation: 'Counsellor', version: 7 },
    reloads: ['employees'],
  },
  {
    name: 'a course',
    hook: useCourseSave as Save,
    variables: { active: false },
    path: '/courses/{id}',
    body: { active: false, version: 7 },
    reloads: ['course', 'course-1'],
  },
  {
    name: 'an ad',
    hook: useAdSave as Save,
    variables: { active: false },
    path: '/ads/{id}',
    body: { active: false, version: 7 },
    reloads: ['admin-ads'],
  },
] as const

describe.each(SAVES)('saving $name', ({ hook, variables, path, body, reloads }) => {
  it('sends back the version the record was read at', async () => {
    mockedPatch.mockResolvedValue({ data: {}, error: undefined } as never)
    const { wrapper } = setup()
    const { result } = renderHook(hook, { wrapper })

    await act(async () => {
      await result.current.mutateAsync(variables as never)
    })

    expect(mockedPatch.mock.calls[0][0]).toBe(path)
    expect((mockedPatch.mock.calls[0][1] as { body: unknown }).body).toEqual(body)
  })

  it('on a stale edit says so in the one sentence and reads the record again', async () => {
    mockedPatch.mockResolvedValue({ data: undefined, error: conflict } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(hook, { wrapper })

    await act(async () => {
      await result.current.mutateAsync(variables as never).catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe(STALE_EDIT_NOTICE)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: [...reloads] })
  })

  it('reads nothing again on any other refusal', async () => {
    mockedPatch.mockResolvedValue({
      data: undefined,
      error: { error: { code: 'permission_denied', message: 'Not allowed.' } },
    } as never)
    const { wrapper, invalidate } = setup()
    const { result } = renderHook(hook, { wrapper })

    await act(async () => {
      await result.current.mutateAsync(variables as never).catch(() => undefined)
    })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error?.message).toBe('Not allowed.')
    expect(invalidate).not.toHaveBeenCalled()
  })
})
