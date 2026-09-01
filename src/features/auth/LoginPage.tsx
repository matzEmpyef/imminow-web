import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { BRAND_LOGO } from '@/lib/brand'
import loginBg from '@/assets/brand/login-bg.png'
import googleIcon from '@/assets/brand/google-icon.png'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { useLogin } from '@/queries/auth'
import { useAuthStore } from '@/stores/authStore'
import { roleHomePath } from '@/lib/roleHome'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The wavy seam between the two halves (user-requested, 2026-08-19 — "I don't want straight
// line in login page... I want curly border"), drawn as a single SVG path rather than a CSS
// clip-path so it scales cleanly at any viewport height: the outer container supplies the
// white/`bg-background` canvas everywhere, and this path only paints the purple region (the
// wavy boundary out to the right edge) on top of it — no separate white path needed. `viewBox`
// is in 0–100 percentage units with `preserveAspectRatio="none"` so the curve always spans the
// full height/width of whatever the flex layout gives it. Centered on the true midline and kept
// deliberately subtle (small amplitude) per follow-up feedback on the first, more aggressive cut.
// A `clip-path`+Tailwind-gradient rewrite was tried here to fix a flagged color-blend issue near
// the top of the curve — user said it still wasn't fixed, so reverted back to this plain SVG
// gradient rather than keep guessing at further variations.
function LoginWaveDivider() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 hidden h-full w-full md:block"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="login-wave-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" />
          <stop offset="100%" stopColor="var(--color-secondary)" />
        </linearGradient>
      </defs>
      <path d="M50,0 C46,20 46,35 50,50 C54,65 54,80 50,100 L100,100 L100,0 Z" fill="url(#login-wave-gradient)" />
    </svg>
  )
}

// The one login-specific split layout — not AuthLayout, which stays the centered glass card
// used by Forgot Password / Reset Password / Set Password. Login is immiNow's single front
// door (no self-signup, build reference 1.15), so it gets its own first-impression treatment:
// a clean form on the left, a gradient hero panel on the right using the sanctioned
// Login-screen glass allowance (ui-ux-design-web.md Section 1) for the headline card. The panel
// itself carries no background — that comes from `LoginWaveDivider` painted behind it — so its
// wavy left edge shows through instead of a hard vertical split. No longer layers translucent
// white blur circles over the gradient (user-requested, 2026-08-19, "remove the background
// white transparent layer") — the top-left one in particular sat right where the wave curve's
// own color-blend complaint was pointing, washing the gradient out there. The headline text
// itself lost its glass-card wrapper (user-requested follow-up, "I don't want rounded-lg border
// border-white/20 bg-white/10") — sits directly on the gradient now, plain text — and gained a
// supplied illustration (`login-bg.png`, dropped in `docs/`, copied to `src/assets/brand` to
// match how `BRAND_LOGO` is already imported) underneath it.
function LoginHeroPanel() {
  return (
    <div className="relative z-10 hidden overflow-hidden md:flex md:w-1/2 md:flex-col md:items-center md:justify-center md:p-xl">
      <div className="relative z-10 w-full max-w-[32rem] text-center">
        <p className="text-display text-text-on-primary" style={{ lineHeight: 'normal', padding: '0 1rem' }}>
          Guiding aspirants from application to acceptance.
        </p>
        <p className="mt-md text-body text-white/80">Welcome to immiNow.</p>
        <img src={loginBg} alt="" aria-hidden="true" className="mt-xl w-full" />
      </div>
    </div>
  )
}

export function LoginPage() {
  const navigate = useNavigate()
  const login = useLogin()
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const role = useAuthStore((s) => s.user?.role)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean }>({})

  // M14 fix (frontend review, 1 Sep 2026): a session sitting in sessionStorage used to leave the
  // login form showing anyway — bounce straight to that role's own landing page instead.
  if (isAuthed) return <Navigate to={roleHomePath(role)} replace />

  const emailError = touched.email && !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : undefined
  const passwordError = touched.password && !password ? 'Password is required.' : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (!EMAIL_PATTERN.test(email) || !password) return
    login.mutate({ email, password }, { onSuccess: (data) => navigate(roleHomePath(data.user.role)) })
  }

  return (
    <div className="relative flex min-h-screen overflow-hidden bg-background">
      <LoginWaveDivider />
      <div className="relative z-10 flex w-full flex-col justify-center px-lg py-xl md:w-1/2 md:px-xl">
        <div className="mx-auto flex w-full max-w-[24rem] flex-col">
          <img src={BRAND_LOGO} alt="immiNow" className="mx-auto h-12 w-fit" />
          <h1 className="mt-xl text-h1 text-text-primary">Log in</h1>

          <form className="mt-lg flex flex-col gap-md" onSubmit={handleSubmit} noValidate>
            <TextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              error={emailError}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, password: true }))}
              error={passwordError}
            />
            {login.isError && (
              <p role="alert" className="text-body-sm text-error">
                {login.error.message}
              </p>
            )}
            <Button type="submit" loading={login.isPending}>
              Log in
            </Button>
            <div className="flex items-center gap-sm text-body-sm text-text-secondary">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            {/* Google OAuth is a real documented login method (build reference 1.1) and
                `POST /auth/login` accepts a `google_token`, but the mock server only implements
                email/password and no OAuth client is configured — so the button is correctly
                branded with the supplied Google mark and stays disabled. The reason is a visible
                caption rather than a `title` tooltip: a tooltip never appears on touch, and it
                also overrode the button's own accessible name (verified in the a11y tree — the
                button read as the tooltip text instead of "Continue with Google"). */}
            <div className="flex flex-col items-center gap-xs">
              <Button
                type="button"
                variant="secondary"
                disabled
                aria-describedby="google-unavailable"
                className="inline-flex w-full items-center justify-center gap-sm"
              >
                <img src={googleIcon} alt="" aria-hidden="true" className="h-5 w-5" />
                Continue with Google
              </Button>
              <p id="google-unavailable" className="text-caption text-text-secondary">
                Needs a configured OAuth client — unavailable in this build.
              </p>
            </div>
            <div className="flex flex-col items-center gap-xs pt-sm text-body-sm">
              <Link to="/forgot-password" className="text-primary hover:underline">
                Forgot password?
              </Link>
              <p className="text-text-secondary">Received an invite? Check your email.</p>
            </div>
          </form>
        </div>
      </div>
      <LoginHeroPanel />
    </div>
  )
}
