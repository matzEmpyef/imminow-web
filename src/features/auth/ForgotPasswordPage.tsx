import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { useForgotPassword } from '@/queries/auth'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)

  const emailError = touched && !EMAIL_PATTERN.test(email) ? 'Enter a valid email address.' : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!EMAIL_PATTERN.test(email)) return
    forgotPassword.mutate({ email })
  }

  if (forgotPassword.isSuccess) {
    return (
      <AuthLayout title="Check your email">
        <p className="text-body text-text-secondary">
          If an account exists for <strong className="text-text-primary">{email}</strong>, we've sent a link to reset
          your password.
        </p>
        <Link to="/login" className="text-body-sm text-primary hover:underline">
          Back to log in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Forgot password">
      <form className="flex flex-col gap-md" onSubmit={handleSubmit} noValidate>
        <TextField
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setTouched(true)}
          error={emailError}
        />
        <Button type="submit" loading={forgotPassword.isPending}>
          Send reset link
        </Button>
        <Link to="/login" className="text-center text-body-sm text-primary hover:underline">
          Back to log in
        </Link>
      </form>
    </AuthLayout>
  )
}
