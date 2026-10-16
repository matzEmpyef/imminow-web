import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { useForgotPassword } from '@/queries/auth'
import { EMAIL_ERROR, isValidEmail, normaliseEmail } from '@/lib/validation'


export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword()
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)

  const emailError = touched && !isValidEmail(email) ? EMAIL_ERROR : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!isValidEmail(email)) return
    forgotPassword.mutate({ email: normaliseEmail(email) })
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
