import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TabBar } from './TabBar'

// Review F-311: a screen reader is told which tab is selected, and the buttons never submit a form.
describe('TabBar', () => {
  const tabs = [
    { key: 'a', label: 'First' },
    { key: 'b', label: 'Second', badge: <span>3</span> },
  ] as const

  it('marks the active tab as selected and the others not', () => {
    render(<TabBar ariaLabel="Sections" tabs={tabs} active="b" onChange={vi.fn()} />)
    expect(screen.getByRole('tablist', { name: 'Sections' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'First' })).toHaveAttribute('aria-selected', 'false')
    expect(screen.getByRole('tab', { name: /Second/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByText('3')).toBeInTheDocument()
  })

  it('reports the chosen tab, and its buttons are type=button', () => {
    const onChange = vi.fn()
    render(<TabBar ariaLabel="Sections" tabs={tabs} active="a" onChange={onChange} />)
    const second = screen.getByRole('tab', { name: /Second/ })
    expect(second).toHaveAttribute('type', 'button')
    fireEvent.click(second)
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
