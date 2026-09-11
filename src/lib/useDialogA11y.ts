import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTOR =
  '[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

// Every open dialog, oldest first. Keyboard handling belongs to the TOP one only: with a
// confirmation stacked on a form (Suspend over Manage Consultancy), Escape used to reach both
// listeners and close the whole stack at once, and both focus traps fought over Tab.
const openDialogs: HTMLElement[] = []

// The dialog on top: a dialog rendered INSIDE another (a confirmation within a form's body) sits
// over it even though React registers the inner one first when both mount together; among the
// rest, the most recently opened wins.
function topDialog(): HTMLElement | undefined {
  const innermost = openDialogs.filter((d) => !openDialogs.some((other) => other !== d && d.contains(other)))
  return innermost[innermost.length - 1]
}

interface DialogA11yOptions {
  /**
   * Whether Escape closes the dialog. False for anything that edits or creates (user, 2026-09-11:
   * "if it has some edit or create… don't close it when we click outside… block Esc too"), so a
   * stray key press can't throw away what someone typed. Their X, Cancel and Save still close.
   */
  closeOnEscape?: boolean
}

// One hook behind Modal.tsx and Drawer.tsx so every dialog in the app gets the focus trap and
// Escape handling from one fix rather than each needing it added by hand (neither had either —
// caught in the frontend audit, 2026-08-24). Returns a ref to attach to the dialog's outer element.
//
// `active` (default true, fine for Modal — every caller conditionally mounts it, so "mounted"
// already means "open") exists for Drawer, which stays mounted across its own `open` prop
// toggling rather than being conditionally rendered by its caller. Without `active` in the deps,
// the effect below would only ever attach on Drawer's first mount — often while still closed —
// and never again once `open` actually flips true.
export function useDialogA11y<T extends HTMLElement>(
  onClose: () => void,
  active = true,
  { closeOnEscape = true }: DialogA11yOptions = {},
) {
  const ref = useRef<T>(null)
  // Read inside the listener, which is registered once per open.
  const closeOnEscapeRef = useRef(closeOnEscape)
  closeOnEscapeRef.current = closeOnEscape

  useEffect(() => {
    const dialog = ref.current
    if (!dialog || !active) return

    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    openDialogs.push(dialog)

    const first = focusables()[0]
    ;(first ?? dialog).focus()

    function handleKeyDown(e: KeyboardEvent) {
      if (topDialog() !== dialog) return
      if (e.key === 'Escape') {
        if (closeOnEscapeRef.current) onClose()
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
      const index = openDialogs.lastIndexOf(dialog)
      if (index !== -1) openDialogs.splice(index, 1)
      previouslyFocused?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately keyed on `active` only; onClose from the caller is stable enough that including it would re-trap focus mid-interaction on every render
  }, [active])

  return ref
}
