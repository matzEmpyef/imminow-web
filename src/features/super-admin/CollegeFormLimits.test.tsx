import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Decision 154: a college's web address is the one https rule, its acceptance rate a percentage of
// at most two decimals, its ranks whole numbers and its table years between 1900 and 2100.
const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }))
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, isError: false, error: null as unknown }))

vi.mock('@/queries/adminColleges', () => ({ useCreateCollege: () => create, useUpdateCollege: () => update }))
vi.mock('@/components/ImageUploadField', () => ({ ImageUploadField: () => <div>logo</div> }))

import { CollegeFormModal } from './CollegeFormModal'

beforeEach(() => {
  vi.clearAllMocks()
})

function open() {
  render(<CollegeFormModal onClose={() => {}} />)
  fireEvent.change(screen.getByLabelText(/^College name/), { target: { value: 'Royal College' } })
}

function type(label: RegExp | string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('the college form', () => {
  it('saves with a name and nothing else', () => {
    open()
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('stops the name at 200 characters', () => {
    open()
    type(/^College name/, 'n'.repeat(260))
    expect((screen.getByLabelText(/^College name/) as HTMLInputElement).value).toHaveLength(200)
  })

  it('refuses a website that is not https', () => {
    open()
    type(/^Website/, 'http://royal.example.edu')
    fireEvent.blur(screen.getByLabelText(/^Website/))
    expect(screen.getAllByText('Enter a web address that starts with https:// (up to 2048 characters).').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    type(/^Website/, ' https://royal.example.edu ')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Create' }))
    expect(create.mutate.mock.calls[0][0]).toMatchObject({ website: 'https://royal.example.edu' })
  })

  it('refuses an acceptance rate above 100 or with three decimals', () => {
    open()
    type(/^Acceptance %/, '120')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    type(/^Acceptance %/, '12.345')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    type(/^Acceptance %/, '12.34')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })

  it('refuses a rank of zero and a table year outside 1900 to 2100', () => {
    open()
    type(/^QS rank$/, '0')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    type(/^QS rank$/, '12')
    type(/^QS table year/, '1850')
    expect(screen.getByRole('button', { name: 'Create' })).toBeDisabled()
    type(/^QS table year/, '2026')
    expect(screen.getByRole('button', { name: 'Create' })).toBeEnabled()
  })
})
