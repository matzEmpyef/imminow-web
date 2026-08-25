import type { ReactNode } from 'react'

type IconBadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

interface IconBadgeProps {
  color?: IconBadgeColor
  children: ReactNode
}

// ui-ux-design-web.md Section 5: an icon inside a soft-tinted rounded square (bg-{color}/10) —
// used as a category marker on stat cards and list rows, not for clickable action icons.
const colorClasses: Record<IconBadgeColor, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
}

export function IconBadge({ color = 'primary', children }: IconBadgeProps) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${colorClasses[color]}`}>
      {children}
    </span>
  )
}
