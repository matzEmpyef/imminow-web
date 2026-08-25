import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useChangePassword } from '@/queries/profile'

// User-requested — My Account's Security card had "password change fields" per the build
// reference, but they were a permanently-disabled inline stub with no backing endpoint. This is
// the real, working version, moved into a popup rather than inline on the page.
export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const changePassword = useChangePassword()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState<{ newPassword?: boolean; confirm?: boolean }>({})

  const newPasswordError = touched.newPassword && newPassword.length < 8 ? 'Use at least 8 characters.' : undefined
  const confirmError = touched.confirm && confirm !== newPassword ? 'Passwords do not match.' : undefined
  const canSubmit = Boolean(currentPassword) && newPassword.length >= 8 && confirm === newPassword

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched({ newPassword: true, confirm: true })
    if (!canSubmit) return
    changePassword.mutate({ current_password: currentPassword, new_password: newPassword }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Change Password"
      widthRem={26}
      footer={
        <>
          {changePassword.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{changePassword.error.message}</p>
          )}
          <div className="flex gap-sm">
            <Button type="submit" form="change-password-form" loading={changePassword.isPending} disabled={!canSubmit}>
              Change Password
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="change-password-form" onSubmit={handleSubmit} className="flex flex-col gap-md" noValidate>
        <TextField
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
        />
        <TextField
          label="New password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, newPassword: true }))}
          error={newPasswordError}
        />
        <TextField
          label="Confirm new password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          onBlur={() => setTouched((t) => ({ ...t, confirm: true }))}
          error={confirmError}
        />
      </form>
    </Modal>
  )
}
