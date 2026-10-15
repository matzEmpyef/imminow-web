import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// T4-21: what has to be handed over when someone is disabled is leads, clients AND tasks. The
// dialog says so, and when the server still asks for a successor it shows the server's count and
// sentence.
const disabling = vi.hoisted(() => ({ error: null as Error | null }))
vi.mock('@/queries/staff', () => ({
  useDisableEmployee: () => ({
    mutate: vi.fn(),
    isPending: false,
    isError: Boolean(disabling.error),
    error: disabling.error,
  }),
}))
vi.mock('@/queries/pickerSources', () => ({ activeEmployeeSource: {} }))
vi.mock('@/components/ServerSearchSelect', () => ({ ServerSearchSelect: () => <div>Pick a colleague</div> }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { ApiError } from '@/api/errors'
import { servedHandoverCount } from '@/lib/servedHandoverCount'
import { DisableEmployeeDialog } from './DisableEmployeeDialog'

function employee(count: number | undefined) {
  return {
    id: 'e1',
    active: true,
    status: 'active',
    assigned_work_count: count,
    user: { first_name: 'Colin', last_name: 'Test' },
  } as never
}

const SENTENCE = 'This employee still has 4 open items (leads, clients or tasks). Choose who takes them over.'

beforeEach(() => {
  disabling.error = null
})

describe('Disable Employee: the hand-over', () => {
  it('names leads, clients and tasks, with the count the server gave', () => {
    render(<DisableEmployeeDialog employee={employee(4)} onClose={() => {}} />)
    expect(screen.getByText('Hand over their 4 open items (leads, clients and tasks) to')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled()
  })

  it('says "item" for one', () => {
    render(<DisableEmployeeDialog employee={employee(1)} onClose={() => {}} />)
    expect(screen.getByText('Hand over their 1 open item (leads, clients and tasks) to')).toBeInTheDocument()
  })

  it('asks nothing when there is nothing to hand over', () => {
    render(<DisableEmployeeDialog employee={employee(0)} onClose={() => {}} />)
    expect(screen.queryByText(/Hand over their/)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeEnabled()
  })

  it('shows the served sentence and count when the server still wants a successor', () => {
    disabling.error = new ApiError(
      'Could not disable this employee.',
      { error: { code: 'reassignment_required', message: SENTENCE, details: { assigned_work_count: 4 }, status: 400 } },
      400,
    )
    render(<DisableEmployeeDialog employee={employee(0)} onClose={() => {}} />)
    expect(screen.getByText(SENTENCE)).toBeInTheDocument()
    expect(screen.getByText('Hand over their 4 open items (leads, clients and tasks) to')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Disable' })).toBeDisabled()
  })
})

describe('servedHandoverCount', () => {
  it('reads the count of a reassignment_required refusal, and nothing from any other failure', () => {
    const refusal = (code: string, details?: Record<string, unknown>) =>
      new ApiError('x', { error: { code, message: 'm', details } }, 400)
    expect(servedHandoverCount(refusal('reassignment_required', { assigned_work_count: 3 }))).toBe(3)
    expect(servedHandoverCount(refusal('reassignment_required'))).toBe(0)
    expect(servedHandoverCount(refusal('validation_failed', { assigned_work_count: 3 }))).toBe(0)
    expect(servedHandoverCount(null)).toBe(0)
  })
})
