import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ButtonMenu } from './ButtonMenu'

function setup() {
  const first = vi.fn()
  const second = vi.fn()
  render(
    <div>
      <p>elsewhere</p>
      <ButtonMenu
        label="Import"
        items={[
          { label: 'Colleges (CSV)', onSelect: first },
          { label: 'Campuses and courses', onSelect: second },
        ]}
      />
    </div>,
  )
  return { first, second }
}

describe('ButtonMenu', () => {
  it('is closed until the button is pressed, and says so to assistive tech', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Import' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(['Colleges (CSV)', 'Campuses and courses'])
  })

  it('runs the chosen item and closes', () => {
    const { first, second } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Campuses and courses' }))
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes on Esc and gives focus back to the button', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Import' })
    fireEvent.click(button)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(button).toHaveFocus()
  })

  it('closes on a click outside, but not on a click inside', () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Import' }))
    fireEvent.mouseDown(screen.getByRole('menu'))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByText('elsewhere'))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('moves between items with the arrow keys, wrapping round', () => {
    setup()
    const button = screen.getByRole('button', { name: 'Import' })
    fireEvent.click(button)
    const [one, two] = screen.getAllByRole('menuitem')
    one.focus()
    fireEvent.keyDown(one, { key: 'ArrowDown' })
    expect(two).toHaveFocus()
    fireEvent.keyDown(two, { key: 'ArrowDown' })
    expect(one).toHaveFocus()
    fireEvent.keyDown(one, { key: 'ArrowUp' })
    expect(two).toHaveFocus()
    fireEvent.keyDown(two, { key: 'Home' })
    expect(one).toHaveFocus()
    fireEvent.keyDown(one, { key: 'End' })
    expect(two).toHaveFocus()
  })
})
