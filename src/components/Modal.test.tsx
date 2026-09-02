import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

// Modal shares `useDialogA11y` with Drawer (~64 consumers between them). What every dialog in the
// console relies on: a labelled dialog role, focus moved inside on open and returned on close,
// Escape closes, Tab never leaves, and the backdrop is a real close control.
function renderModal(onClose = vi.fn(), footer?: React.ReactNode) {
  const utils = render(
    <Modal onClose={onClose} title="Invite Employee" footer={footer}>
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

  it('closes on Escape and on the backdrop, and renders the footer slot', () => {
    const { onClose } = renderModal(vi.fn(), <button type="button">Save</button>)
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Two "Close" controls: the full-bleed backdrop button and the X in the header. Either ends it.
    const [backdrop, x] = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(backdrop)
    fireEvent.click(x)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('traps Tab inside the dialog in both directions', () => {
    renderModal()
    const dialog = screen.getByRole('dialog')
    // The trap cycles within the dialog element itself; the full-bleed backdrop button sits
    // outside it on purpose (it is a close control, not a stop on the Tab ring).
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
