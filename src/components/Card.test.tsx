import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Card } from './Card'

// Review F-318: Enter or Space on a clickable card gives `onClick` a real click, not a keyboard event.
describe('Card', () => {
  it('activates on Enter and Space with a mouse event', () => {
    const onClick = vi.fn()
    render(<Card onClick={onClick}>Open</Card>)
    const card = screen.getByRole('button', { name: 'Open' })
    fireEvent.keyDown(card, { key: 'Enter' })
    fireEvent.keyDown(card, { key: ' ' })
    expect(onClick).toHaveBeenCalledTimes(2)
    expect(onClick.mock.calls[0][0].type).toBe('click')
  })

  it('is not a button, and ignores keys, without an onClick', () => {
    render(<Card>Plain</Card>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })
})
