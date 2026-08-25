import type { HTMLAttributes, KeyboardEvent, MouseEvent } from 'react'

// ui-ux-design-web.md Section 5: Surface color, radius-lg, shadow-card, 20-24px padding.
// A Card given onClick becomes keyboard- and screen-reader-accessible automatically (role,
// tabIndex, Enter/Space activation) — callers never have to remember this per instance.
export function Card({ className, children, onClick, onKeyDown, ...props }: HTMLAttributes<HTMLDivElement>) {
  const isInteractive = Boolean(onClick)

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(e)
    if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onClick?.(e as unknown as MouseEvent<HTMLDivElement>)
    }
  }

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- false positive: role/tabIndex/onKeyDown ARE set whenever onClick exists, the rule just can't narrow the ternaries
    <div
      className={`rounded-lg bg-surface p-lg shadow-card ${
        isInteractive ? 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary' : ''
      } ${className ?? ''}`}
      onClick={onClick}
      onKeyDown={isInteractive ? handleKeyDown : onKeyDown}
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      {...props}
    >
      {children}
    </div>
  )
}
