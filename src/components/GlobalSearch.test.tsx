import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The shell's global search is a combobox: arrow keys move through the results, Enter opens the
// active one, Escape closes, and the active row is exposed through aria-activedescendant so a
// screen reader announces it (keyboard pass, B6, 2026-09-03). Results stay real buttons, so Tab
// still works the way it did before.
const navigate = vi.fn()
vi.mock('react-router-dom', () => ({ useNavigate: () => navigate }))
vi.mock('@/queries/leads', () => ({ useLeads: vi.fn() }))
vi.mock('@/queries/clients', () => ({ useClients: vi.fn() }))

import { useLeads } from '@/queries/leads'
import { useClients } from '@/queries/clients'
import { GlobalSearch } from './GlobalSearch'

function seed() {
  vi.mocked(useLeads).mockReturnValue({
    data: { items: [{ id: 'l1', name: 'Rahul Mehta', email: 'rahul@example.com' }] },
    isLoading: false,
    isError: false,
  } as never)
  vi.mocked(useClients).mockReturnValue({
    data: { items: [{ id: 'c1', file_number: 'STP1', student: { first_name: 'Rahul', last_name: 'Sen', email: 'rs@example.com' } }] },
    isLoading: false,
    isError: false,
  } as never)
}

async function typeQuery(text: string) {
  const input = screen.getByRole('combobox')
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: text } })
  await act(async () => {
    vi.advanceTimersByTime(350)
  })
  return input
}

describe('GlobalSearch keyboard navigation', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    navigate.mockReset()
    seed()
  })
  afterEach(() => vi.useRealTimers())

  it('exposes results as a listbox with nothing active until an arrow key is pressed', async () => {
    render(<GlobalSearch />)
    const input = await typeQuery('rahul')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(2)
    expect(input).not.toHaveAttribute('aria-activedescendant')
  })

  it('moves the active option with ArrowDown/ArrowUp, wrapping at both ends', async () => {
    render(<GlobalSearch />)
    const input = await typeQuery('rahul')
    const [first, second] = screen.getAllByRole('option')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(first).toHaveAttribute('aria-selected', 'true')
    expect(input).toHaveAttribute('aria-activedescendant', first.id)

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(second).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(first).toHaveAttribute('aria-selected', 'true')

    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(second).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the active result on Enter and does nothing on Enter with no active result', async () => {
    render(<GlobalSearch />)
    const input = await typeQuery('rahul')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(navigate).toHaveBeenCalledWith('/clients/c1')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('closes on Escape and forgets the active row when the query changes', async () => {
    render(<GlobalSearch />)
    const input = await typeQuery('rahul')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-activedescendant')

    fireEvent.change(input, { target: { value: 'rahu' } })
    expect(input).not.toHaveAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
