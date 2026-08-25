import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AuthLayout } from './AuthLayout'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { useAcceptInvite, useInvite } from '@/queries/auth'

export function SetPasswordPage() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const invite = useInvite(token)
  const acceptInvite = useAcceptInvite(token)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({})

  const passwordError = touched.password && password.length < 8 ? 'Use at least 8 characters.' : undefined
  const confirmError = touched.confirm && confirm !== password ? 'Passwords do not match.' : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ password: true, confirm: true })
    if (password.length < 8 || confirm !== password) return
    acceptInvite.mutate({ password }, { onSuccess: () => navigate('/dashboard') })
  }

  if (invite.isLoading) {
    return (
      <AuthLayout title="Set your password">
        <p className="text-body text-text-secondary">Checking your invite…</p>
      </AuthLayout>
    )
  }

  if (invite.isError || !invite.data) {
    return (
      <AuthLayout title="Invite expired">
        <p className="text-body text-text-secondary">
          This invite link has expired or was already used. Ask your consultancy admin to send a new one.
        </p>
        <Link to="/login" className="text-body-sm text-primary hover:underline">
          Back to log in
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={`Welcome, ${invite.data.first_name}`}>
      <form className="flex flex-col gap-md" onSubmit={handleSubmit} noValidate>
        <TextField label="Consultancy" value={invite.data.consultancy_name} readOnly disabled />
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
        {acceptInvite.isError && (
          <p role="alert" className="text-body-sm text-error">
            {acceptInvite.error.message}
          </p>
        )}
        <Button type="submit" loading={acceptInvite.isPending}>
          Set password and log in
        </Button>
      </form>
    </AuthLayout>
  )
}
