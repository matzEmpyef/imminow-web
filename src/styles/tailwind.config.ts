import type { Config } from 'tailwindcss'

// Assembles tokens.css / typography.css custom properties into Tailwind's theme.
// Components use Tailwind utility classes derived from these tokens, never a raw hex or px value.
export default {
  theme: {
    extend: {
      colors: {
        primary: 'var(--color-primary)',
        secondary: 'var(--color-secondary)',
        success: 'var(--color-success)',
        warning: 'var(--color-warning)',
        error: 'var(--color-error)',
        info: 'var(--color-info)',
        required: 'var(--color-required)',
        background: 'var(--color-background)',
        surface: 'var(--color-surface)',
        'surface-glass': 'var(--color-surface-glass)',
        border: 'var(--color-border)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-on-primary': 'var(--color-text-on-primary)',
        'primary-subtle': 'var(--color-primary-subtle)',
        'pill-selected': 'var(--color-pill-selected)',
        'secondary-subtle': 'var(--color-secondary-subtle)',
        'success-subtle': 'var(--color-success-subtle)',
        'warning-subtle': 'var(--color-warning-subtle)',
        'info-subtle': 'var(--color-info-subtle)',
        'unread-bg': 'var(--color-unread-bg)',
      },
      spacing: {
        xs: 'var(--space-xs)',
        sm: 'var(--space-sm)',
        md: 'var(--space-md)',
        lg: 'var(--space-lg)',
        xl: 'var(--space-xl)',
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
      },
      // NOTE: `max-w-{xs,sm,md,lg,xl}` are unusable in this project — our spacing scale above
      // reuses the same key names as Tailwind's built-in named maxWidth scale, and under this
      // project's Tailwind v4 `@config` (JS-config-compat) setup, max-w-* resolves from our
      // `spacing` extension instead of the real named max-width scale (max-w-md → 16px, not
      // 28rem). Adding an explicit `maxWidth` override here does NOT fix it — confirmed via the
      // generated stylesheet, which still shows `.max-w-md { max-width: var(--space-md) }`
      // regardless — so this compat layer only honors a subset of extendable theme keys, not
      // arbitrary new ones. Use an inline `style={{ maxWidth: '...' }}` instead wherever a
      // component needs a real max-width constraint (see GlobalSearch.tsx for the pattern).
      boxShadow: {
        card: 'var(--shadow-card)',
      },
      fontFamily: {
        sans: ['var(--font-family-base)'],
      },
      fontSize: {
        display: ['var(--text-display-size)', { fontWeight: 'var(--text-display-weight)' }],
        h1: ['var(--text-h1-size)', { fontWeight: 'var(--text-h1-weight)' }],
        h2: ['var(--text-h2-size)', { fontWeight: 'var(--text-h2-weight)' }],
        h3: ['var(--text-h3-size)', { fontWeight: 'var(--text-h3-weight)' }],
        body: ['var(--text-body-size)', { fontWeight: 'var(--text-body-weight)' }],
        'body-sm': ['var(--text-body-small-size)', { fontWeight: 'var(--text-body-small-weight)' }],
        caption: ['var(--text-caption-size)', { fontWeight: 'var(--text-caption-weight)' }],
        button: ['var(--text-button-size)', { fontWeight: 'var(--text-button-weight)' }],
      },
    },
  },
} satisfies Config
