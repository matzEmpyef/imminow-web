import { useEffect, useState } from 'react'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { AppShell } from './AppShell'
import { AdminShell } from './AdminShell'
import { FreelancerShell } from './FreelancerShell'
import { AccountShell } from './AccountShell'
import { Card } from '@/components/Card'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Button } from '@/components/Button'
import { Toggle } from '@/components/Toggle'
import { ChangePasswordModal } from './ChangePasswordModal'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useProfile, useUpdateProfile } from '@/queries/profile'
import { useMyConsultancy } from '@/queries/consultancy'
import { useNotificationSettings, useUpdateNotificationSettings } from '@/queries/notifications'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'
import { PHONE_ERROR, isValidPhone } from '@/lib/validation'
import { formatDate, relativeTime } from '@/lib/time'
import { showToast } from '@/lib/toast'

type NotificationSettings = components['schemas']['NotificationSettings']
type Role = components['schemas']['User']['role']

// Only the four email/push toggle pairs — NOT every schema key: `blog_push` (2026-08-20) is a
// lone student-facing boolean with no meaning for staff, and iterating Object.keys would try to
// render it as a toggle pair.
const TOGGLE_CATEGORIES = [
  'chat',
  'plan',
  'events',
  'broadcast',
] as const satisfies readonly (keyof NotificationSettings)[]

// What each category means to THIS person (2026-09-12) — the rows used to be four bare labels
// like "Plan & step updates", which a platform staffer has no plan or step for.
const CATEGORY_COPY: Record<
  (typeof TOGGLE_CATEGORIES)[number],
  { label: string; staff: string; platform: string; freelancer: string }
> = {
  chat: {
    label: 'Chat messages',
    staff: 'A student writes to you, or a colleague messages you.',
    platform: 'Messages sent to you on the platform.',
    freelancer: 'Messages sent to you on the platform.',
  },
  plan: {
    label: 'Case updates',
    staff: 'A student submits a step, replaces a document or reports an offer.',
    platform: 'Payments declared, dues falling due or overdue, cases needing a decision.',
    freelancer: 'A student you referred moves stage, or a payout is recorded for you.',
  },
  events: {
    label: 'Events & webinars',
    staff: 'Webinars, quizzes and meetings you have a part in.',
    platform: 'Webinars, quizzes and meetings you run.',
    freelancer: 'Webinars and events open to you.',
  },
  broadcast: {
    label: 'Announcements',
    staff: 'Notices from immiNow to everyone on the platform.',
    platform: 'Notices from immiNow to everyone on the platform.',
    freelancer: 'Notices from immiNow to everyone on the platform.',
  },
}

const ROLE_LABEL: Record<Role, string> = {
  student: 'Student',
  consultancy_admin: 'Consultancy Admin',
  consultant: 'Consultant',
  super_admin: 'Super Admin',
  platform_staff: 'Platform staff',
  freelancer: 'Freelancer',
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase() || '?'
}

// A read-only fact about the account, shown as text — not as a disabled input pretending to be
// editable, which is how email and designation used to appear.
function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-xs border-b border-border py-sm last:border-0">
      <p className="text-caption font-medium uppercase tracking-wide text-text-secondary">{label}</p>
      <p className="text-body text-text-primary">{value}</p>
      {hint && <p className="text-caption text-text-secondary">{hint}</p>}
    </div>
  )
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
  const isConsultancyStaff = role === 'consultancy_admin' || role === 'consultant'
  const isPlatform = role === 'super_admin' || role === 'platform_staff'
  const consultancy = useMyConsultancy({ enabled: isConsultancyStaff })

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
          <Skeleton className="h-24 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
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
  const phoneError = phone && !isValidPhone(phone) ? PHONE_ERROR : undefined
  const dirty =
    firstName !== (user.first_name ?? '') || lastName !== (user.last_name ?? '') || phone !== (user.phone ?? '')
  const organisation = isConsultancyStaff
    ? (consultancy.data?.name ?? '')
    : isPlatform
      ? 'immiNow platform team'
      : role === 'freelancer'
        ? 'Sentpo freelancer partner'
        : ''
  const copyKey = isPlatform ? 'platform' : role === 'freelancer' ? 'freelancer' : 'staff'

  return (
    <Shell>
      {/* Full width inside the consultancy and platform consoles (user, 2026-09-12); the
          freelancer and student shells have no sidebar, so a centred column reads better there. */}
      <div className={`flex w-full flex-col gap-lg ${isConsultancyStaff || isPlatform ? '' : 'mx-auto max-w-3xl'}`}>
        <div>
          <h1 className="text-h1 text-text-primary">My Account</h1>
          <p className="text-body-sm text-text-secondary">Your details, sign-in security and what you are told about.</p>
        </div>

        {/* Who you are — the page never said (2026-09-12). */}
        <Card>
          <div className="flex flex-wrap items-center gap-md">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-h3 font-semibold text-primary">
              {initials(user.first_name, user.last_name)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-sm">
                <p className="text-h2 text-text-primary">
                  {user.first_name} {user.last_name}
                </p>
                <Badge color={isPlatform ? 'primary' : 'info'}>{ROLE_LABEL[user.role]}</Badge>
              </div>
              <p className="truncate text-body-sm text-text-secondary">
                {[organisation, user.designation].filter(Boolean).join(' · ') || user.email}
              </p>
            </div>
            <div className="flex w-full flex-col gap-xs text-caption text-text-secondary sm:w-auto sm:text-right">
              {user.created_at && <span>Joined {formatDate(user.created_at)}</span>}
              {user.last_login_at && <span>Last sign-in {relativeTime(user.last_login_at)}</span>}
            </div>
          </div>
        </Card>

        <div className="grid gap-lg md:grid-cols-5">
          <Card className="md:col-span-3">
            <h2 className="text-h3 text-text-primary">Profile</h2>
            <p className="text-caption text-text-secondary">What colleagues and students see as your name.</p>
            <form
              className="mt-md flex flex-col gap-md"
              onSubmit={(e) => {
                e.preventDefault()
                if (phoneError || !dirty) return
                updateProfile.mutate(
                  { first_name: firstName.trim(), last_name: lastName.trim(), phone: phone.trim() },
                  { onSuccess: () => showToast('Profile updated') },
                )
              }}
            >
              <div className="grid gap-md sm:grid-cols-2">
                <TextField label="First name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
                <TextField label="Last name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-xs">
                <TextField label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} error={phoneError} />
                {!phoneError && (
                  <p className="text-caption text-text-secondary">
                    {isConsultancyStaff
                      ? 'Shown to students you work with, so they can reach you.'
                      : 'Used by immiNow to reach you. Never shown to students.'}
                  </p>
                )}
              </div>
              {updateProfile.isError && <p className="text-body-sm text-error">{updateProfile.error.message}</p>}
              <div className="flex items-center justify-end gap-sm">
                {dirty && !updateProfile.isPending && (
                  <p className="text-caption text-text-secondary">Unsaved changes</p>
                )}
                <Button type="submit" loading={updateProfile.isPending} disabled={Boolean(phoneError) || !dirty}>
                  Save changes
                </Button>
              </div>
            </form>
          </Card>

          <Card className="md:col-span-2">
            <h2 className="text-h3 text-text-primary">Account</h2>
            <div className="mt-sm flex flex-col">
              <Fact
                label="Sign-in email"
                value={user.email ?? '—'}
                hint={isPlatform ? 'Changed through Support Tools.' : 'To change it, ask immiNow support.'}
              />
              <Fact label="Role" value={ROLE_LABEL[user.role]} />
              {organisation && <Fact label="Organisation" value={organisation} />}
              {user.designation && (
                <Fact label="Designation" value={user.designation} hint="Set by your consultancy admin." />
              )}
              {user.referral_code && (
                <Fact label="Referral code" value={user.referral_code} hint="Share it from your dashboard." />
              )}
            </div>
          </Card>
        </div>

        <Card>
          <h2 className="text-h3 text-text-primary">Sign-in security</h2>
          <div className="mt-sm flex flex-col">
            <div className="flex flex-wrap items-center gap-md border-b border-border py-md">
              <KeyRound className="h-5 w-5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-text-primary">Password</p>
                <p className="text-caption text-text-secondary">Change the password you sign in with.</p>
              </div>
              <Button variant="secondary" size="sm" onClick={() => setShowChangePassword(true)}>
                Change password
              </Button>
            </div>
            <div className="flex flex-wrap items-center gap-md py-md">
              <ShieldCheck className="h-5 w-5 shrink-0 text-text-secondary" />
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-text-primary">Two-factor authentication</p>
                {/* The toggle stays (user, 2026-08-25 — it is what the real 2FA will hang off), but
                    the copy no longer claims it is on: nothing enforces it until the new sign-in
                    system lands (2026-09-12). */}
                {/* Required for admins always, and for everyone at a consultancy whose admin (or
                    immiNow) has mandated it — the server computes the flag (review L15). */}
                <p className="text-caption text-text-secondary">
                  {user.two_factor_required
                    ? role === 'super_admin' || role === 'consultancy_admin'
                      ? 'Required for your role. Set-up arrives with the new sign-in system.'
                      : 'Required for everyone at your consultancy. Set-up arrives with the new sign-in system.'
                    : 'Optional for your role. Set-up arrives with the new sign-in system.'}
                </p>
              </div>
              <div className="flex items-center gap-sm">
                <Badge color="secondary">Coming soon</Badge>
                <Toggle
                  size="sm"
                  label="Two-factor authentication"
                  checked={Boolean(user.two_factor_enabled) || Boolean(user.two_factor_required)}
                  disabled
                  onChange={() => {}}
                />
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex flex-wrap items-baseline justify-between gap-sm">
            <div>
              <h2 className="text-h3 text-text-primary">Notifications</h2>
              <p className="text-caption text-text-secondary">Changes save as you switch them.</p>
            </div>
            <p className="text-caption text-text-secondary">
              Push reaches phones once the mobile notification service is connected.
            </p>
          </div>
          {settings.isLoading && (
            <div className="mt-md flex flex-col gap-sm">
              <Skeleton className="h-10 rounded-md" />
              <Skeleton className="h-10 rounded-md" />
            </div>
          )}
          {settings.isError && (
            <p className="mt-md text-body-sm text-error">Could not load your notification settings.</p>
          )}
          {settings.data && (
            <div className="mt-md flex flex-col">
              <div className="flex items-center gap-lg border-b border-border pb-xs text-caption font-medium uppercase tracking-wide text-text-secondary">
                <span className="min-w-0 flex-1">Tell me about</span>
                <span className="w-10 text-center">Email</span>
                <span className="w-10 text-center">Push</span>
              </div>
              {TOGGLE_CATEGORIES.map((category) => {
                const copy = CATEGORY_COPY[category]
                const current = settings.data![category]
                const set = (channel: 'email' | 'push', checked: boolean) =>
                  updateSettings.mutate({ ...settings.data!, [category]: { ...current, [channel]: checked } })
                return (
                  <div
                    key={category}
                    className="flex items-center gap-lg border-b border-border py-sm last:border-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-text-primary">{copy.label}</p>
                      <p className="text-caption text-text-secondary">{copy[copyKey]}</p>
                    </div>
                    <div className="flex w-10 justify-center">
                      <Toggle size="sm" label={`${copy.label} email`} checked={current.email} onChange={(c) => set('email', c)} />
                    </div>
                    <div className="flex w-10 justify-center">
                      <Toggle size="sm" label={`${copy.label} push`} checked={current.push} onChange={(c) => set('push', c)} />
                    </div>
                  </div>
                )
              })}
              {updateSettings.isError && (
                <p className="mt-sm text-body-sm text-error">That change didn't save. Try again.</p>
              )}
            </div>
          )}
        </Card>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </Shell>
  )
}
