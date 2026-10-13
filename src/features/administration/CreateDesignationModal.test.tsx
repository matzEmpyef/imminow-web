import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { designationNameTaken, DESIGNATION_NAME_TAKEN } from '@/lib/designationName'

// T4-22 remainder: a second designation with a name the organisation already has is refused, in
// the page's own sentence beside the field, ignoring case and the spaces round the name.
const create = vi.fn()
vi.mock('@/queries/staff', () => ({
  useCreateDesignation: () => ({ mutate: create, isPending: false, isError: false, error: null }),
  useDesignations: () => ({ data: [{ id: 'd1', name: 'Counsellor', protected: false, permissions: {} }] }),
}))
vi.mock('@/components/ServerSearchSelect', () => ({ ServerSearchSelect: () => null }))

import { CreateDesignationModal } from './CreateDesignationModal'

beforeEach(() => create.mockReset())

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
