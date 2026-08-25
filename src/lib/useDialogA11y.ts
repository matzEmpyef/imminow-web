import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  '[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// One hook behind Modal.tsx and Drawer.tsx (~64+ combined consumers) so every dialog in the app
// gets Escape-to-close and a focus trap from one fix rather than each needing it added by hand
// (neither had either — caught in the frontend audit, 2026-08-24). Returns a ref to attach to the
// dialog's outer element.
//
// `active` (default true, fine for Modal — every caller conditionally mounts it, so "mounted"
// already means "open") exists for Drawer, which stays mounted across its own `open` prop
// toggling rather than being conditionally rendered by its caller. Without `active` in the deps,
// the effect below would only ever attach on Drawer's first mount — often while still closed —
// and never again once `open` actually flips true.
export function useDialogA11y<T extends HTMLElement>(onClose: () => void, active = true) {
  const ref = useRef<T>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !active) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))

    const first = focusables()[0]
    ;(first ?? dialog).focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const firstItem = items[0]
      const lastItem = items[items.length - 1]
      if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault()
        lastItem.focus()
      } else if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault()
        firstItem.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on `active` only; onClose from the caller is stable enough that including it would re-trap focus mid-interaction on every render
  }, [active])

  return ref
}
