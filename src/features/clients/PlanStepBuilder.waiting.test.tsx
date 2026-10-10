import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// After Reopen Plan the step that was in progress goes back to waiting (`waiting_to_continue`).
// The console shows it as the pending step it is, with a quiet note saying what it waits for and
// its entered work still readable, and switches off what the server would refuse (remove, move,
// change title or tasks) with the server's reason as the tooltip.
vi.mock('@/queries/plans', () => ({
  useAddStep: vi.fn(),
  useUpdateStep: vi.fn(),
  useDeleteStep: vi.fn(),
  useReorderSteps: vi.fn(),
  useSaveStepResponses: vi.fn(),
  useUploadStepFile: vi.fn(),
}))
vi.mock('@/queries/steps', () => ({ useApproveStep: vi.fn(), useRejectStep: vi.fn() }))
vi.mock('@/lib/permissions', () => ({ usePermission: () => true }))

import { useAddStep, useDeleteStep, useReorderSteps, useSaveStepResponses, useUpdateStep, useUploadStepFile } from '@/queries/plans'
import { ApiError } from '@/api/errors'
import { WAITING_STEP_CANT_CHANGE } from '@/lib/waitingStep'
import { PlanStepBuilder } from './PlanStepBuilder'

const idle = { mutate: vi.fn(), isPending: false, error: null }

function step(over: Record<string, unknown>) {
  return {
    id: 's',
    title: 'Step',
    position: 1,
    status: 'locked',
    description: null,
    expected_end_date: null,
    components: [],
    version: 1,
    ...over,
  }
}

const plan = {
  id: 'p1',
  name: 'Study visa',
  steps: [
    step({ id: 's1', title: 'Collect documents', position: 1, status: 'active' }),
    step({
      id: 's2',
      title: 'Book the interview',
      position: 2,
      status: 'locked',
      waiting_to_continue: true,
      waiting_for_step_id: 's1',
      waiting_for_step_title: 'Collect documents',
      components: [{ id: 'c1', type: 'checklist', label: 'Papers ready', payload: { items: ['Passport', 'Photos'] } }],
      responses: { c1: { items: { Passport: true } } },
    }),
    step({ id: 's3', title: 'Pay the fee', position: 3, status: 'locked' }),
  ],
}

function renderPlan(over: { readOnly?: boolean } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  return render(<PlanStepBuilder clientId="c1" plan={plan as never} {...over} />, { wrapper })
}

beforeEach(() => {
  vi.mocked(useAddStep).mockReturnValue(idle as never)
  vi.mocked(useUpdateStep).mockReturnValue(idle as never)
  vi.mocked(useDeleteStep).mockReturnValue(idle as never)
  vi.mocked(useReorderSteps).mockReturnValue(idle as never)
  vi.mocked(useSaveStepResponses).mockReturnValue(idle as never)
  vi.mocked(useUploadStepFile).mockReturnValue(idle as never)
})

const NOTE = 'Continues after Collect documents is completed again'

describe('a step waiting for an earlier step to be completed again', () => {
  it('shows a quiet note on the step and in the step list, and still reads as pending', () => {
    renderPlan()
    fireEvent.click(screen.getByRole('button', { name: /Book the interview/ }))
    // The list row and the open step each carry the note; no other step does.
    expect(screen.getAllByText(NOTE)).toHaveLength(2)
    expect(screen.getAllByText('locked').length).toBeGreaterThan(0)
  })

  it('keeps its entered work readable, and not editable', () => {
    renderPlan()
    fireEvent.click(screen.getByRole('button', { name: /Book the interview/ }))
    expect(screen.getByLabelText('Passport')).toBeChecked()
    expect(screen.getByLabelText('Passport')).toBeDisabled()
    expect(screen.getByLabelText('Photos')).not.toBeChecked()
  })

  it('puts no note on an ordinary pending step', () => {
    renderPlan()
    fireEvent.click(screen.getByRole('button', { name: /Pay the fee/ }))
    // Only the waiting step's own row carries it.
    expect(screen.getAllByText(NOTE)).toHaveLength(1)
  })

  it('in edit mode switches off delete, move and edit with the server’s reason, and offers no component edits', () => {
    renderPlan()
    fireEvent.click(screen.getByRole('button', { name: 'Edit mode' }))
    fireEvent.click(screen.getByText('Book the interview'))

    const remove = screen.getByRole('button', { name: 'Delete Book the interview' })
    expect(remove).toBeDisabled()
    expect(remove).toHaveAttribute('title', WAITING_STEP_CANT_CHANGE)
    const drag = screen.getByRole('button', { name: 'Drag Book the interview' })
    expect(drag).toBeDisabled()
    expect(drag).toHaveAttribute('title', WAITING_STEP_CANT_CHANGE)
    const edit = screen.getByRole('button', { name: 'Edit Book the interview' })
    expect(edit).toBeDisabled()
    expect(edit).toHaveAttribute('title', WAITING_STEP_CANT_CHANGE)
    expect(screen.queryByRole('button', { name: 'Add Component' })).not.toBeInTheDocument()
    expect(screen.getByText(WAITING_STEP_CANT_CHANGE)).toBeInTheDocument()

    // An ordinary pending step beside it keeps all of these.
    expect(screen.getByRole('button', { name: 'Delete Pay the fee' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Drag Pay the fee' })).toBeEnabled()
    fireEvent.click(screen.getByText('Pay the fee'))
    expect(screen.getByRole('button', { name: 'Add Component' })).toBeInTheDocument()
  })

  it('shows the server’s sentence when a change is still refused', () => {
    const sentence = "This step was already started and is waiting. It can't be removed."
    vi.mocked(useReorderSteps).mockReturnValue({
      ...idle,
      error: new ApiError('Could not reorder the steps.', { error: { code: 'conflict', message: sentence } }, 409),
    } as never)
    renderPlan()
    expect(screen.getByText(sentence)).toBeInTheDocument()
  })
})
