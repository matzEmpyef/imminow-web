import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SearchSelect } from './SearchSelect'

// The searchable select used to close only on an outside click, so tabbing to the next field
// left its list hanging open over the form (keyboard pass, B7, 2026-09-03). It now closes when
// focus leaves the component, and stays open when focus moves onto one of its own options.
const options = [
  { id: 'a', label: 'Agent' },
  { id: 'c', label: 'College' },
]

describe('SearchSelect', () => {
  it('opens on focus and closes when focus leaves the component', () => {
    render(<SearchSelect options={options} value="" onChange={vi.fn()} placeholder="Category" />)
    const input = screen.getByPlaceholderText('Category')
    fireEvent.focus(input)
    expect(screen.getByRole('button', { name: 'Agent' })).toBeInTheDocument()

    fireEvent.blur(input, { relatedTarget: document.body })
    expect(screen.queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument()
  })

  it('stays open when focus moves onto one of its own options, and selects on click', () => {
    const onChange = vi.fn()
    render(<SearchSelect options={options} value="" onChange={onChange} placeholder="Category" />)
    const input = screen.getByPlaceholderText('Category')
    fireEvent.focus(input)
    const option = screen.getByRole('button', { name: 'College' })

    fireEvent.blur(input, { relatedTarget: option })
    expect(screen.getByRole('button', { name: 'College' })).toBeInTheDocument()

    fireEvent.click(option)
    expect(onChange).toHaveBeenCalledWith('c')
    expect(screen.queryByRole('button', { name: 'College' })).not.toBeInTheDocument()
  })

  it('closes on Escape and shows the selected label again', () => {
    render(<SearchSelect options={options} value="a" onChange={vi.fn()} placeholder="Category" />)
    const input = screen.getByPlaceholderText('Category') as HTMLInputElement
    expect(input.value).toBe('Agent')
    fireEvent.focus(input)
    expect(input.value).toBe('')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('button', { name: 'College' })).not.toBeInTheDocument()
    expect(input.value).toBe('Agent')
  })
})
