import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useDialogA11y } from '@/lib/useDialogA11y'

interface ModalProps {
  onClose: () => void
  title: string
  children: ReactNode
  widthRem?: number
  footer?: ReactNode
  // Replaces the plain title text in the pinned header bar with richer content — a logo, badges,
  // actions (Course details, 2026-09-10). `title` still names the dialog for screen readers.
  header?: ReactNode
  /**
   * Lets a click outside the popup, or Escape, close it. OFF by default (user, 2026-09-11: "for all
   * popup in immiNow, if it has some edit or create… don't close it when we click outside… it will
   * lead to lose of data… block Esc too"). Turn it on only for popups that just show information —
   * a detail view, a list — where closing loses nothing. Defaulting to protected means a new form
   * popup is safe without anyone remembering to ask for it. The X always closes.
   */
  dismissible?: boolean
}

// Shared centered popup. Width is capped via inline style (not a `max-w-[Nrem]` class) since
// arbitrary bracket-value classes silently generate zero CSS in this project's Tailwind v4 setup
// (see GlobalSearch.tsx for the same workaround). Same header-bar + scrollable-body shape as
// Drawer.tsx — its centered-dialog cousin, not a separate pattern.
//
// `footer` (user-requested, 2026-08-19, platform-wide — "save/create button should always be
// visible just like header (body scrollable)... Can you make this design applicable across the
// platform") — an optional slot rendered `shrink-0` below the scrollable body, same pinned
// treatment the header already gets, so a tall form's Save/Create button (or a Cancel+Confirm
// pair) never scrolls out of view. Callers move their trailing Button(s) here instead of leaving
// them as the last element inside the scrollable `children`; omitting `footer` keeps the old
// everything-scrolls-together behavior for short forms/read-only popups that don't need it.
export function Modal({ onClose, title, children, widthRem = 32, footer, header, dismissible = false }: ModalProps) {
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, true, { closeOnEscape: dismissible })
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 px-md">
      {/* Both close controls are explicitly type="button" (keyboard pass, 2026-09-03): a bare
          <button> defaults to submit, and a Modal rendered inside a caller's <form> would
          otherwise submit it when the backdrop or X is activated. A protected popup's backdrop is
          inert — still there so the click lands on nothing behind it. */}
      {dismissible ? (
        <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      ) : (
        <div aria-hidden="true" className="absolute inset-0" />
      )}
      {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- native <dialog>'s showModal()/::backdrop model would conflict with useDialogA11y's focus trap + the custom backdrop close button serving ~64 consumers; see useDialogA11y.ts */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: `${widthRem}rem`, maxHeight: '90vh' }}
        className="relative flex w-full flex-col overflow-hidden rounded-lg bg-surface shadow-card outline-none"
      >
        <div
          className={`flex shrink-0 justify-between gap-md border-b border-border px-lg ${
            header ? 'items-start py-lg' : 'items-center py-md'
          }`}
        >
          {header ?? <h2 className="text-h2 text-text-primary">{title}</h2>}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">{children}</div>
        {footer && <div className="flex shrink-0 justify-end gap-sm border-t border-border px-lg py-md">{footer}</div>}
      </div>
    </div>
  )
}
