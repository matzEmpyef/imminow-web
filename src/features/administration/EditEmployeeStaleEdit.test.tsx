import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Review F-075: the Edit Employee dialog sends back the version the row was read at. When someone
// else saved first, the person is told, the roster reloads behind the dialog (the hook's job), and
// what they typed is still in the form, saved next time against the version just loaded.
vi.mock('@/queries/staff', () => ({ useUpdateEmployee: vi.fn() }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { STALE_EDIT_NOTICE, editError } from '@/lib/staleEdit'
import { useUpdateEmployee } from '@/queries/staff'
import { EditEmployeeModal } from './EditEmployeeModal'

const mutate = vi.fn()

const employee = (version: number) =>
  ({
    id: 'e1',
    version,
    user: { first_name: 'Meera', last_name: 'Nair', phone: null, designation: 'Counsellor' },
  }) as never

const designations = [{ id: 'd1', name: 'Counsellor' }] as never

function mutation(error: Error | null = null) {
  return { mutate, isPending: false, isError: Boolean(error), error } as never
}

beforeEach(() => {
  mutate.mockReset()
  vi.mocked(useUpdateEmployee).mockReset()
  vi.mocked(useUpdateEmployee).mockReturnValue(mutation())
})

describe('EditEmployeeModal, a stale edit', () => {
  it('saves against the version the row was read at', () => {
    render(<EditEmployeeModal employee={employee(7)} designations={designations} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Meera Nair' }))
    expect(vi.mocked(useUpdateEmployee).mock.calls.at(-1)).toEqual(['e1', 7])
  })

  it('tells the person, keeps what they typed, and saves next against the reloaded version', () => {
    const view = render(<EditEmployeeModal employee={employee(7)} designations={designations} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Meera Nair' }))
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Meenakshi' } })

    // The save is refused as stale, and the roster comes back with the newer row.
    vi.mocked(useUpdateEmployee).mockReturnValue(
      mutation(editError('Could not update this employee.', { error: { code: 'version_conflict', message: 'Changed.' } }, 409)),
    )
    view.rerender(<EditEmployeeModal employee={employee(8)} designations={designations} />)

    expect(screen.getByText(STALE_EDIT_NOTICE)).toBeInTheDocument()
    expect(screen.getByLabelText('First name')).toHaveValue('Meenakshi')
    expect(vi.mocked(useUpdateEmployee).mock.calls.at(-1)).toEqual(['e1', 8])

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    expect(mutate.mock.calls[0][0]).toMatchObject({ first_name: 'Meenakshi' })
  })
})
