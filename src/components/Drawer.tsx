import { type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useDialogA11y } from '@/lib/useDialogA11y'

interface DrawerProps {
  open: boolean
  onClose: () => void
  title: string
  stickyContent?: ReactNode
  children: ReactNode
}

// Shared slide-in-from-right panel — used by GlobalChatDrawer and the Contextual Help Drawer
// (SidebarShell) so both persistent-pattern drawers share one look instead of being built twice.
// `stickyContent` (e.g. GlobalChatDrawer's search box) renders between the title bar and the
// scrollable body, outside the scroll container, so it stays put while `children` scrolls.
export function Drawer({ open, onClose, title, stickyContent, children }: DrawerProps) {
  // Called unconditionally, before the `!open` early return, per the Rules of Hooks. `open` is
  // passed through as `active` — unlike Modal (always conditionally mounted by its caller),
  // Drawer stays mounted across its own open/close toggling, so the hook needs `open` itself to
  // know when to (re)attach rather than only ever running once on first mount.
  const dialogRef = useDialogA11y<HTMLDivElement>(onClose, open)
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-text-primary/40" />
      {/* eslint-disable-next-line jsx-a11y/prefer-tag-over-role -- same reasoning as Modal.tsx: native <dialog> conflicts with useDialogA11y's deliberate focus-trap design */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ maxWidth: '24rem' }}
        className="relative flex h-full w-full flex-col overflow-hidden border-l border-border bg-surface shadow-card outline-none"
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-border px-lg">
          <h2 className="text-h3 text-text-primary">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {stickyContent && <div className="shrink-0 border-b border-border px-lg py-sm">{stickyContent}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-lg py-md">{children}</div>
      </div>
    </div>
  )
}
