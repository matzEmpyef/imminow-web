import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { useResetPassword } from '@/queries/auth'

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''
  const resetPassword = useResetPassword()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({})

  const passwordError = touched.password && password.length < 8 ? 'Use at least 8 characters.' : undefined
  const confirmError = touched.confirm && confirm !== password ? 'Passwords do not match.' : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ password: true, confirm: true })
    if (password.length < 8 || confirm !== password) return
    resetPassword.mutate({ token, new_password: password }, { onSuccess: () => navigate('/login') })
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid link">
        <p className="text-body text-text-secondary">
          This password reset link is missing its token. Request a new one below.
        </p>
        <Link to="/forgot-password" className="text-body-sm text-primary hover:underline">
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password">
      <form className="flex flex-col gap-md" onSubmit={handleSubmit} noValidate>
        <TextField
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, password: true }))}
          error={passwordError}
        />
        <TextField
          label="Confirm password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
        />
        {resetPassword.isError && (
          <p role="alert" className="text-body-sm text-error">
            {resetPassword.error.message}
          </p>
        )}
        <Button type="submit" loading={resetPassword.isPending}>
          Reset password
        </Button>
      </form>
    </AuthLayout>
  )
}
