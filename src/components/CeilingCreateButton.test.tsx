import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// The create action on Tags, Designations and Branches, with the count against the consultancy's
// ceiling under it (product owner, 2026-09-25). At the ceiling it is disabled WITH the reason.
vi.mock('@/queries/consultancy', () => ({ useMyConsultancy: vi.fn() }))

import { useMyConsultancy } from '@/queries/consultancy'
import { CeilingCreateButton } from './CeilingCreateButton'

const LIMITS = { tags: 100, designations: 50, branches: 100 }

function withLimits(limits: typeof LIMITS | undefined) {
  vi.mocked(useMyConsultancy).mockReturnValue({ data: { limits } } as never)
}

beforeEach(() => withLimits(LIMITS))

describe('CeilingCreateButton', () => {
  it('shows "N of M" under an enabled button below the ceiling', () => {
    const onClick = vi.fn()
    render(
      <CeilingCreateButton kind="tags" count={12} onClick={onClick}>
        Add tag
      </CeilingCreateButton>,
    )
    const button = screen.getByRole('button', { name: 'Add tag' })
    expect(button).toBeEnabled()
    expect(screen.getByText('12 of 100 tags')).toBeInTheDocument()
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('counts designations against their own ceiling', () => {
    render(
      <CeilingCreateButton kind="designations" count={4} onClick={() => {}}>
        New Designation
      </CeilingCreateButton>,
    )
    expect(screen.getByText('4 of 50 designations')).toBeInTheDocument()
  })

  it('disables create at the ceiling and says why — on the page and as the tooltip', () => {
    const onClick = vi.fn()
    render(
      <CeilingCreateButton kind="branches" count={100} onClick={onClick}>
        Add Branch
      </CeilingCreateButton>,
    )
    const button = screen.getByRole('button', { name: 'Add Branch' })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', "You've reached the 100-branch limit.")
    expect(button).toHaveAccessibleDescription("You've reached the 100-branch limit.")
    expect(screen.getByText("You've reached the 100-branch limit.")).toBeInTheDocument()
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows no count and disables nothing when the record carries no limits', () => {
    withLimits(undefined)
    render(
      <CeilingCreateButton kind="tags" count={250} onClick={() => {}}>
        Add tag
      </CeilingCreateButton>,
    )
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeEnabled()
    expect(screen.queryByText(/of 100/)).not.toBeInTheDocument()
  })

  it('shows no count while the list itself is still loading', () => {
    render(
      <CeilingCreateButton kind="tags" count={undefined} onClick={() => {}}>
        Add tag
      </CeilingCreateButton>,
    )
    expect(screen.getByRole('button', { name: 'Add tag' })).toBeEnabled()
    expect(screen.queryByText(/tags$/)).not.toBeInTheDocument()
  })
})
