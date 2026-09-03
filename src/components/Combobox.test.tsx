import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox } from './Combobox'

// The free-text combobox (Add Contact's Category) used to close only on an outside click, so
// tabbing to the next field left its panel hanging open (keyboard pass, B7, 2026-09-03). Leaving
// by keyboard now keeps typed text, restores the saved value if the field was emptied, and stays
// open when focus moves onto one of its own rows.
const options = ['Agent', 'College']

describe('Combobox', () => {
  it('opens on focus and closes when focus leaves, keeping the typed text', () => {
    const onChange = vi.fn()
    render(<Combobox label="Category" value="" onChange={onChange} options={options} />)
    const input = screen.getByLabelText('Category')
    fireEvent.focus(input)
    expect(screen.getByRole('button', { name: 'Agent' })).toBeInTheDocument()

    fireEvent.change(input, { target: { value: 'Courier' } })
    fireEvent.blur(input, { relatedTarget: document.body })
    expect(screen.queryByRole('button', { name: 'Agent' })).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledWith('Courier')
  })

  it('restores the saved value when the field was emptied before leaving', () => {
    const onChange = vi.fn()
    render(<Combobox label="Category" value="Agent" onChange={onChange} options={options} />)
    const input = screen.getByLabelText('Category') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input, { relatedTarget: document.body })
    expect(input.value).toBe('Agent')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stays open when focus moves onto one of its own rows, and selects on click', () => {
    const onChange = vi.fn()
    render(<Combobox label="Category" value="" onChange={onChange} options={options} />)
    const input = screen.getByLabelText('Category')
    fireEvent.focus(input)
    const row = screen.getByRole('button', { name: 'College' })
    fireEvent.blur(input, { relatedTarget: row })
    expect(screen.getByRole('button', { name: 'College' })).toBeInTheDocument()
    fireEvent.click(row)
    expect(onChange).toHaveBeenCalledWith('College')
    expect(screen.queryByRole('button', { name: 'College' })).not.toBeInTheDocument()
  })
})
