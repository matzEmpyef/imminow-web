import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

// Modal shares `useDialogA11y` with Drawer. What every dialog in the console relies on: a labelled
// dialog role, focus moved inside on open and returned on close, Tab never leaves, and — since
// 2026-09-11 — a popup only closes on the backdrop or Escape when it asks to (`dismissible`), so a
// form can't lose what someone typed to a stray click or key.
function renderModal(onClose = vi.fn(), footer?: React.ReactNode, dismissible?: boolean) {
  const utils = render(
    <Modal onClose={onClose} title="Invite Employee" footer={footer} dismissible={dismissible}>
      <input aria-label="Email" />
      <button type="button">Send invite</button>
    </Modal>,
  )
  return { ...utils, onClose }
}

describe('Modal', () => {
  it('exposes a modal dialog named by its title', () => {
    renderModal()
    const dialog = screen.getByRole('dialog', { name: 'Invite Employee' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('heading', { name: 'Invite Employee' })).toBeInTheDocument()
  })

  it('moves focus inside on open and gives it back on close', () => {
    const outside = document.createElement('button')
    outside.textContent = 'Opener'
    document.body.appendChild(outside)
    outside.focus()
    expect(document.activeElement).toBe(outside)

    const { unmount } = renderModal()
    const dialog = screen.getByRole('dialog')
    expect(dialog.contains(document.activeElement)).toBe(true)

    unmount()
    expect(document.activeElement).toBe(outside)
    outside.remove()
  })

  it('by default ignores Escape and has no backdrop close control; the X still closes', () => {
    const { onClose } = renderModal(vi.fn(), <button type="button">Save</button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()

    // Only the header X is a "Close" control; the backdrop is inert.
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    expect(closeButtons).toHaveLength(1)
    fireEvent.click(closeButtons[0])
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape and on the backdrop when dismissible', () => {
    const { onClose } = renderModal(vi.fn(), undefined, true)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Two "Close" controls: the full-bleed backdrop button and the X in the header. Either ends it.
    const [backdrop, x] = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(backdrop)
    fireEvent.click(x)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('sends Escape to the top popup only when popups are stacked', () => {
    const parentClose = vi.fn()
    const childClose = vi.fn()
    render(
      <Modal onClose={parentClose} title="Parent" dismissible>
        <p>Parent body</p>
        <Modal onClose={childClose} title="Child" dismissible>
          <button type="button">Child action</button>
        </Modal>
      </Modal>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(childClose).toHaveBeenCalledTimes(1)
    expect(parentClose).not.toHaveBeenCalled()
  })

  it('traps Tab inside the dialog in both directions', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])'))
    const first = focusables[0]
    const last = focusables[focusables.length - 1]

    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(document.activeElement).toBe(first)

    first.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(last)
  })
})
