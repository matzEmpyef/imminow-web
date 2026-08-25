import type { HTMLAttributes } from 'react'

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor
}

// ui-ux-design-web.md Section 5: pill-shaped, soft-tinted background (bg-{color}/10,
// text-{color}) — never a solid fill. Status is never color-only; pair with a text label.
const colorClasses: Record<BadgeColor, string> = {
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  error: 'bg-error/10 text-error',
  info: 'bg-info/10 text-info',
}

export function Badge({ color = 'primary', className, children, ...props }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full px-sm py-[2px] text-caption font-medium ${colorClasses[color]} ${className ?? ''}`}
      {...props}
    >
      {children}
    </span>
  )
}
