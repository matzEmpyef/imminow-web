import type { ReactNode } from 'react'
import { Button } from '@/components/Button'

/**
 * One action row in the Support actions popup (2026-09-12 rebuild) — a heading, a one-line
 * description of what it does, and a "Start" button that expands into the actual form. Only the
 * wrapper is shared; each action's form is its own component mounted only while expanded, so
 * closing and reopening one always starts from a clean slate rather than carrying over a half-
 * filled form from last time.
 */
export function ActionCard({
  title,
  description,
  danger = false,
  expanded,
  onStart,
  children,
}: {
  title: string
  description: string
  danger?: boolean
  expanded: boolean
  onStart: () => void
  children?: ReactNode
}) {
  return (
    <div
      className={`flex flex-col gap-sm rounded-md border p-md ${danger ? 'border-error/40 bg-error/5' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-md">
        <div>
          <p className={`text-body-sm font-semibold ${danger ? 'text-error' : 'text-text-primary'}`}>{title}</p>
          <p className="mt-0.5 text-caption text-text-secondary">{description}</p>
        </div>
        {!expanded && (
          <Button
            size="sm"
            variant={danger ? 'destructive' : 'secondary'}
            onClick={onStart}
            className="shrink-0 whitespace-nowrap"
          >
            Start
          </Button>
        )}
      </div>
      {expanded && children && <div className="flex flex-col gap-sm border-t border-border pt-sm">{children}</div>}
    </div>
  )
}
