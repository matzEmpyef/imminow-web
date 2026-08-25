import type { ReactNode } from 'react'

// The one sanctioned wrapper for action cells that live inside a clickable Table row. Modal isn't
// a portal, so a click (or now Enter/Space, since rows are keyboard-activatable) inside a cell's
// own menu/confirm popup would bubble into the row's onRowClick and navigate away mid-action.
// Centralised so the pattern — and its single justified lint suppression — exists exactly once:
// role="presentation" because this div is invisible plumbing, not an interactive control (the
// real controls are its children), which is also why the static-element-interactions rule is
// wrong about it here.
export function StopPropagation({ className, children }: { className?: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- both handlers only stopPropagation; the div itself is not interactive
    <div
      role="presentation"
      className={className ?? 'contents'}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      {children}
    </div>
  )
}
