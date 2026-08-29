import { AdminShell } from '@/features/auth/AdminShell'
import { Badge } from '@/components/Badge'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { useNotificationChannelConfig, useUpdateNotificationChannelConfig } from '@/queries/notificationChannelConfig'
import type { components } from '@/api/schema'

type ConfigEntry = components['schemas']['NotificationChannelConfigEntry']

/**
 * Human names for the notification types the server actually sends.
 *
 * Rewritten 2026-08-27. The previous map named ten things, of which nine the server never sends:
 * `plan_steps`, `new_lead`, `document_review`, `unattended_reminder`, `new_consultancy` and
 * `course_suggestion` do not exist anywhere, and `chat` / `events` / `blog` are CATEGORIES rather
 * than types. Meanwhile eighteen of the nineteen real types had no row at all. Anything missing
 * here still renders — as its raw type — so a newly added notification shows up unlabelled rather
 * than invisibly.
 */
const LABELS: Record<string, string> = {
  chat_message: 'New chat message',
  broadcast: 'Broadcast',
  blog_post: 'New blog article',
  blog_categories_discovered: 'New blog topics available',
  event_rsvp: 'Event RSVP confirmed',
  step_approved: 'Plan step approved',
  step_sent_back: 'Plan step sent back',
  step_due_date_changed: 'Plan step due date changed',
  dream_courses_ready: 'Dream Course requirements met',
  points_earned: 'Sentpo points earned',
  coupon_redeemed: 'Coupon redeemed',
  referral_signup: 'Referral signed up',
  course_suggested: 'Course suggested to a student',
  cross_country_college_selected: 'College chosen outside the served country',
  complaint_received: 'Complaint received',
  incoming_transfer: 'Incoming consultancy transfer',
  kyc_submitted: 'KYC certificate submitted',
  countries_served_changed: 'Countries served changed',
  upgrade_requested: 'Consultancy requested a plan upgrade',
  payer_method_changed: 'Payer method changed',
  institution_suggested: 'School or college not in the list',
  application_status_changed: 'College application status changed',
}

// Row-level component so useUpdateNotificationChannelConfig() can be called at its own render top
// level — Table's `render: (row) => ...` runs as a callback, not a component body.
function ChannelToggles({ entry }: { entry: ConfigEntry }) {
  const updateConfig = useUpdateNotificationChannelConfig()

  const channels = [
    { key: 'in_app_enabled', label: 'In-app', checked: Boolean(entry.in_app_enabled) },
    { key: 'push_enabled', label: 'Push', checked: Boolean(entry.push_enabled) },
    { key: 'email_enabled', label: 'Email', checked: Boolean(entry.email_enabled) },
  ] as const

  return (
    <div className="flex items-center justify-end gap-lg">
      {channels.map((channel) => (
        <div key={channel.key} className="flex items-center gap-sm">
          <span className="text-caption text-text-secondary">{channel.label}</span>
          <Toggle
            checked={channel.checked}
            onChange={(checked) =>
              updateConfig.mutate({ notification_type: entry.notification_type!, [channel.key]: checked })
            }
            label={`${LABELS[entry.notification_type] ?? entry.notification_type} ${channel.label}`}
          />
        </div>
      ))}
    </div>
  )
}

export function NotificationChannelConfigPage() {
  const config = useNotificationChannelConfig()

  const columns: TableColumn<ConfigEntry>[] = [
    {
      key: 'audience',
      header: 'Goes to',
      // Which product's users receive this (user-requested, 2026-08-27). The two audiences have
      // opposite tolerances — a student gets a handful of notifications and an unwanted push costs
      // you the install; console staff live in the product all day — so knowing which one a row
      // affects is most of the decision.
      render: (entry) =>
        entry.audience === 'sentpo' ? (
          <Badge color="primary">Sentpo App</Badge>
        ) : (
          <Badge color="secondary">immiNow Platform</Badge>
        ),
    },
    {
      key: 'notification_type',
      header: 'Notification Type',
      render: (entry) => {
        const silenced = !entry.in_app_enabled && !entry.push_enabled && !entry.email_enabled
        return (
          <div className="flex flex-col">
            <span className="font-medium text-text-primary">
              {LABELS[entry.notification_type] ?? entry.notification_type}
            </span>
            {/* All three off is a real state, not an impossible one — but it means the
                notification is not delivered anywhere, which is worth saying out loud rather than
                leaving someone to discover from an absence. */}
            {silenced && <span className="text-caption text-warning">Not delivered anywhere</span>}
          </div>
        )
      },
    },
    { key: 'channels', header: 'Channels', align: 'right', render: (entry) => <ChannelToggles entry={entry} /> },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Notification Channel Config</h1>
          <p className="text-body-sm text-text-secondary">
            What the platform permits, per notification type. This is the first of two gates: turning a channel off
            here stops it for everyone, whatever they have chosen in their own notification settings — which can only
            narrow it further, never widen it. &ldquo;Goes to&rdquo; says which product&rsquo;s users are affected.
          </p>
          {/* Said plainly rather than left for someone to discover: Email genuinely sends, Push
              does not yet, and a row of identical-looking toggles gives no hint which is which. */}
          <p className="text-caption text-text-secondary">
            In-app and Email take effect immediately. <strong>Push does not send yet</strong> — it needs the FCM/APNs
            integration, so turning it on records the intent and reaches no device until that lands.
          </p>
        </div>

        <Table
          columns={columns}
          rows={config.data ?? []}
          rowKey={(entry) => entry.notification_type!}
          loading={config.isLoading}
          error={config.isError ? 'Could not load the channel config.' : undefined}
          emptyMessage="No notification types configured."
        />
      </div>
    </AdminShell>
  )
}
