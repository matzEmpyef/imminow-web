import { useEffect, useState } from 'react'
import { AppShell } from './AppShell'
import { AdminShell } from './AdminShell'
import { FreelancerShell } from './FreelancerShell'
import { AccountShell } from './AccountShell'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { Toggle } from '@/components/Toggle'
import { ChangePasswordModal } from './ChangePasswordModal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useProfile, useUpdateProfile } from '@/queries/profile'
import { useNotificationSettings, useUpdateNotificationSettings } from '@/queries/notifications'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'
import { PHONE_ERROR, isValidPhone } from '@/lib/validation'

type NotificationSettings = components['schemas']['NotificationSettings']
// Only the four email/push toggle pairs — NOT every schema key: `blog_push` (2026-08-20) is a
// lone student-facing boolean with no meaning for staff, and iterating Object.keys would try to
// render it as a toggle pair.
const TOGGLE_CATEGORIES = [
  'chat',
  'plan',
  'events',
  'broadcast',
] as const satisfies readonly (keyof NotificationSettings)[]
const CATEGORY_LABELS: Record<(typeof TOGGLE_CATEGORIES)[number], string> = {
  chat: 'Chat messages',
  plan: 'Plan & step updates',
  events: 'Events & webinars',
  broadcast: 'Announcements',
}

export function MyAccountPage() {
  const profile = useProfile()
  const updateProfile = useUpdateProfile()
  const role = useAuthStore((s) => s.user?.role)
  // M12 fix (frontend review, 1 Sep 2026): this page always rendered AppShell, so a platform or
  // freelancer account editing their own profile got the consultancy shell around it. Students
  // get the slim AccountShell (N2, second pass) — the consultancy nav bounced them anyway.
  const Shell =
    role === 'super_admin' || role === 'platform_staff'
      ? AdminShell
      : role === 'freelancer'
        ? FreelancerShell
        : role === 'student'
          ? AccountShell
          : AppShell
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [showChangePassword, setShowChangePassword] = useState(false)

  useEffect(() => {
    if (!profile.data) return
    setFirstName(profile.data.first_name ?? '')
    setLastName(profile.data.last_name ?? '')
    setPhone(profile.data.phone ?? '')
  }, [profile.data])

  const settings = useNotificationSettings()
  const updateSettings = useUpdateNotificationSettings()

  if (profile.isLoading) {
    return (
      <Shell>
        <div className="flex flex-col gap-md">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </div>
      </Shell>
    )
  }

  if (profile.isError || !profile.data) {
    return (
      <Shell>
        <ErrorState message="Could not load your account." onRetry={() => profile.refetch()} />
      </Shell>
    )
  }

  const user = profile.data
  const isConsultancyStaff = user.role !== 'student'
  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined

  return (
    <Shell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">My Account</h1>

        <Card>
          <h2 className="text-h2 text-text-primary">Profile</h2>
          <form
            className="mt-md flex flex-col gap-md"
            onSubmit={(e) => {
              e.preventDefault()
              if (phoneError) return
              updateProfile.mutate({ first_name: firstName, last_name: lastName, phone })
            }}
          >
            <div className="grid grid-cols-2 gap-md">
              <TextField label="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              <TextField label="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <TextField label="Email" value={user.email} disabled readOnly />
            <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneError} />
            {isConsultancyStaff && <TextField label="Designation" value={user.designation ?? ''} disabled readOnly />}
            {updateProfile.isSuccess && <p className="text-body-sm text-success">Profile updated.</p>}
            <Button
              type="submit"
              loading={updateProfile.isPending}
              disabled={Boolean(phoneError)}
              className="w-fit self-end mt-md"
            >
              Save changes
            </Button>
          </form>
        </Card>

        <Card>
          <h2 className="text-h2 text-text-primary">Security</h2>
          <div className="mt-md flex flex-col gap-md">
            <div>
              <p className="text-body text-text-primary">Password</p>
              <p className="text-caption text-text-secondary">Change the password you use to log in.</p>
              <Button variant="secondary" className="mt-sm w-fit" onClick={() => setShowChangePassword(true)}>
                Change password
              </Button>
            </div>
            <div className="flex items-center justify-between border-t border-border pt-md">
              <div>
                <p className="text-body text-text-primary">Two-factor authentication</p>
                <p className="text-caption text-text-secondary">
                  {user.two_factor_required
                    ? "Required for your role and can't be turned off."
                    : user.two_factor_enabled
                      ? 'Currently enabled.'
                      : 'Currently disabled.'}
                </p>
              </div>
              <Toggle
                label="Two-factor authentication"
                checked={Boolean(user.two_factor_enabled) || Boolean(user.two_factor_required)}
                disabled
                onChange={() => {}}
              />
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-h2 text-text-primary">Notifications</h2>
          <div className="mt-md flex flex-col gap-sm">
            {settings.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
            {settings.data &&
              TOGGLE_CATEGORIES.map((category) => (
                <div
                  key={category}
                  className="flex items-center justify-between border-b border-border py-sm last:border-0"
                >
                  <p className="text-body text-text-primary">{CATEGORY_LABELS[category]}</p>
                  <div className="flex items-center gap-lg">
                    <span className="flex items-center gap-xs text-body-sm text-text-secondary">
                      <Toggle
                        label={`${CATEGORY_LABELS[category]} email`}
                        checked={settings.data![category].email}
                        onChange={(checked) =>
                          updateSettings.mutate({
                            ...settings.data!,
                            [category]: { ...settings.data![category], email: checked },
                          })
                        }
                      />
                      Email
                    </span>
                    <span className="flex items-center gap-xs text-body-sm text-text-secondary">
                      <Toggle
                        label={`${CATEGORY_LABELS[category]} push`}
                        checked={settings.data![category].push}
                        onChange={(checked) =>
                          updateSettings.mutate({
                            ...settings.data!,
                            [category]: { ...settings.data![category], push: checked },
                          })
                        }
                      />
                      Push
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </Card>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </Shell>
  )
}
