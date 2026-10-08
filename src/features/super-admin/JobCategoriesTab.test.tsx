import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Settings → Job Categories (owner decision 69c, 2026-10-08): the managed list behind a job's
// category, modelled on Fields of Study. No delete — a category is retired or merged.
vi.mock('@/queries/jobCategories', () => ({
  useJobCategories: vi.fn(),
  useCreateJobCategory: vi.fn(),
  useUpdateJobCategory: vi.fn(),
  useMergeJobCategory: vi.fn(),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import {
  useCreateJobCategory,
  useJobCategories,
  useMergeJobCategory,
  useUpdateJobCategory,
} from '@/queries/jobCategories'
import { JobCategoriesTab } from './JobCategoriesTab'

const CATEGORIES = [
  { id: 'engineering', name: 'Engineering', active: true, job_count: 4 },
  { id: 'general', name: 'General', active: true, job_count: 1 },
  { id: 'hospitality', name: 'Hospitality', active: false, job_count: 0 },
]

const create = vi.fn()
const update = vi.fn()
const merge = vi.fn()

function mutation(mutate: ReturnType<typeof vi.fn>, error: Error | null = null) {
  return { mutate, reset: vi.fn(), isPending: false, isError: Boolean(error), error } as never
}

function refusal(code: string, message: string, details?: Record<string, unknown>) {
  return new ApiError('Could not update this category.', { error: { code, message, details, status: 409 } })
}

beforeEach(() => {
  create.mockReset()
  update.mockReset()
  merge.mockReset()
  vi.mocked(useJobCategories).mockReturnValue({ data: CATEGORIES, isLoading: false, isError: false } as never)
  vi.mocked(useCreateJobCategory).mockReturnValue(mutation(create))
  vi.mocked(useUpdateJobCategory).mockReturnValue(mutation(update))
  vi.mocked(useMergeJobCategory).mockReturnValue(mutation(merge))
})

describe('Settings → Job Categories', () => {
  it('lists every category, retired ones included, with how many jobs use each', () => {
    render(<JobCategoriesTab />)
    expect(vi.mocked(useJobCategories)).toHaveBeenCalledWith(true)
    const retired = screen.getByText('Hospitality').closest('tr')!
    expect(within(retired).getByText('Retired')).toBeInTheDocument()
    expect(within(screen.getByText('Engineering').closest('tr')!).getByText('4')).toBeInTheDocument()
    // There is no delete.
    expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
  })

  it('adds a category by name', () => {
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Add Category' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Job Category' })
    fireEvent.change(within(dialog).getByLabelText(/^Name/), { target: { value: '  Design ' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Add Category' }))
    expect(create.mock.calls[0][0]).toEqual({ name: 'Design' })
  })

  it("shows the server's sentence beside the name when it is already taken", () => {
    const sentence = 'A job category named "General" already exists.'
    vi.mocked(useUpdateJobCategory).mockReturnValue(mutation(update, refusal('already_exists', sentence)))
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Engineering' }))
    const dialog = screen.getByRole('dialog', { name: 'Edit Job Category' })
    const name = within(dialog).getByLabelText(/^Name/)
    fireEvent.change(name, { target: { value: 'General' } })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save Changes' }))
    expect(update.mock.calls[0][0]).toEqual({ id: 'engineering', name: 'General' })
    expect(name).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getAllByText(sentence)).toHaveLength(1)
  })

  it('restores a retired category in one click', () => {
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Restore Hospitality' }))
    expect(update.mock.calls[0][0]).toEqual({ id: 'hospitality', active: true })
  })

  it('offers Merge when a category still in use cannot be retired', () => {
    vi.mocked(useUpdateJobCategory).mockReturnValue(
      mutation(update, refusal('still_referenced', '"Engineering" is still used by 4 jobs.', { jobs: 4 })),
    )
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Retire Engineering' }))
    const dialog = screen.getByRole('dialog', { name: 'Retire job category' })
    expect(within(dialog).getByText('4 jobs use this category. Merge it into another one instead.')).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: 'Retire' })).not.toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge' }))
    expect(screen.getByRole('dialog', { name: 'Merge Engineering' })).toBeInTheDocument()
  })

  it('says "1 job uses" for a single listing', () => {
    vi.mocked(useUpdateJobCategory).mockReturnValue(
      mutation(update, refusal('still_referenced', '"General" is still used by 1 job.', { jobs: 1 })),
    )
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Retire General' }))
    expect(screen.getByText('1 job uses this category. Merge it into another one instead.')).toBeInTheDocument()
  })

  it('retires a category on confirmation', () => {
    render(<JobCategoriesTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Retire General' }))
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Retire' }))
    expect(update.mock.calls[0][0]).toEqual({ id: 'general', active: false })
  })
})
