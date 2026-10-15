import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designationNameTaken, DESIGNATION_NAME_TAKEN } from '@/lib/designationName'

// T4-22 remainder: a second designation with a name the organisation already has is refused, in
// the page's own sentence beside the field, ignoring case and the spaces round the name.
const create = vi.fn()
const created = vi.hoisted(() => ({ error: null as Error | null }))
vi.mock('@/queries/staff', () => ({
  useCreateDesignation: () => ({ mutate: create, isPending: false, isError: Boolean(created.error), error: created.error }),
  useDesignations: () => ({ data: [{ id: 'd1', name: 'Counsellor', protected: false, permissions: {} }] }),
}))
vi.mock('@/components/ServerSearchSelect', () => ({ ServerSearchSelect: () => null }))

import { ApiError } from '@/api/errors'
import { CreateDesignationModal } from './CreateDesignationModal'

beforeEach(() => {
  create.mockReset()
  created.error = null
})

describe('New Designation: a name another designation already has', () => {
  it('says so beside the field and does not create, whatever the case or spacing', () => {
    render(<CreateDesignationModal onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: '  counsellor ' } })
    expect(screen.getByText(DESIGNATION_NAME_TAKEN)).toBeInTheDocument()
    expect(DESIGNATION_NAME_TAKEN).toBe('A designation with this name already exists. Choose a different name.')
    const button = screen.getByRole('button', { name: 'Create' })
    expect(button).toBeDisabled()
    fireEvent.submit(button.closest('form') ?? document.getElementById('create-designation-form')!)
    expect(create).not.toHaveBeenCalled()
  })

  it('creates a name nobody has, with the spaces trimmed, and shows no warning', () => {
    render(<CreateDesignationModal onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: ' Branch Manager ' } })
    expect(screen.queryByText(DESIGNATION_NAME_TAKEN)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).toHaveBeenCalledWith({ name: 'Branch Manager', duplicate_from_employee_id: undefined }, expect.anything())
  })
})

describe('New Designation: the server refuses the name', () => {
  it('shows the served sentence beside the name field, once, until the name is changed', () => {
    const sentence = 'A designation with this name already exists. Choose a different name.'
    const { rerender } = render(<CreateDesignationModal onClose={() => {}} />)
    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Front Desk' } })
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(create).toHaveBeenCalledTimes(1)

    created.error = new ApiError(
      'Could not create this designation.',
      { error: { code: 'validation_failed', message: sentence, details: { fields: { name: sentence } }, status: 400 } },
      400,
    )
    rerender(<CreateDesignationModal onClose={() => {}} />)
    expect(screen.getAllByText(sentence)).toHaveLength(1)
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^Name/), { target: { value: 'Front Desk 2' } })
    expect(screen.queryByText(sentence)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})

describe('designationNameTaken', () => {
  const list = [
    { id: 'a', name: 'Counsellor' },
    { id: 'b', name: 'Branch Manager' },
  ]
  it('ignores case and surrounding spaces', () => {
    expect(designationNameTaken(' BRANCH manager ', list)).toBe(true)
    expect(designationNameTaken('Branch', list)).toBe(false)
  })
  it('lets a designation keep its own name when renamed, but not take another one', () => {
    expect(designationNameTaken('counsellor', list, 'a')).toBe(false)
    expect(designationNameTaken('counsellor', list, 'b')).toBe(true)
  })
  it('treats an empty name or a list not yet loaded as free', () => {
    expect(designationNameTaken('  ', list)).toBe(false)
    expect(designationNameTaken('Counsellor', undefined)).toBe(false)
  })
})
