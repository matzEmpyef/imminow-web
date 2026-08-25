import { AdminShell } from '@/features/auth/AdminShell'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { useNotificationChannelConfig, useUpdateNotificationChannelConfig } from '@/queries/notificationChannelConfig'
import type { components } from '@/api/schema'

type ConfigEntry = components['schemas']['NotificationChannelConfigEntry']

const LABELS: Record<string, string> = {
  chat: 'Chat',
  plan_steps: 'Plan & Steps',
  events: 'Events',
  broadcast: 'Broadcast',
  blog: 'Blog',
  new_lead: 'New lead assigned',
  document_review: 'Document awaiting review',
  unattended_reminder: 'Unattended case reminder',
  new_consultancy: 'New consultancy created',
  course_suggestion: 'Course suggestion submitted',
}

// Row-level component so useUpdateNotificationChannelConfig() can be called at its own render top
// level — Table's `render: (row) => ...` runs as a callback, not a component body.
function ChannelToggles({ entry }: { entry: ConfigEntry }) {
  const updateConfig = useUpdateNotificationChannelConfig()

  return (
    <div className="flex items-center justify-end gap-lg">
      <div className="flex items-center gap-sm">
        <span className="text-caption text-text-secondary">Push</span>
        <Toggle
          checked={Boolean(entry.push_enabled)}
          onChange={(checked) =>
            updateConfig.mutate({ notification_type: entry.notification_type!, push_enabled: checked })
          }
          label={`${entry.notification_type} push`}
        />
      </div>
      <div className="flex items-center gap-sm">
        <span className="text-caption text-text-secondary">Email</span>
        <Toggle
          checked={Boolean(entry.email_enabled)}
          onChange={(checked) =>
            updateConfig.mutate({ notification_type: entry.notification_type!, email_enabled: checked })
          }
          label={`${entry.notification_type} email`}
        />
      </div>
    </div>
  )
}

export function NotificationChannelConfigPage() {
  const config = useNotificationChannelConfig()

  const columns: TableColumn<ConfigEntry>[] = [
    {
      key: 'notification_type',
      header: 'Notification Type',
      render: (entry) => (
        <span className="font-medium text-text-primary">
          {LABELS[entry.notification_type] ?? entry.notification_type}
        </span>
      ),
    },
    { key: 'channels', header: 'Channels', align: 'right', render: (entry) => <ChannelToggles entry={entry} /> },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Notification Channel Config</h1>
          <p className="text-body-sm text-text-secondary">
            Platform-wide Push and Email defaults per notification type.
          </p>
        </div>

        <Table
          columns={columns}
          rows={config.data ?? []}
          rowKey={(entry) => entry.notification_type!}
          loading={config.isLoading}
          emptyMessage="No notification types configured."
        />
      </div>
    </AdminShell>
  )
}
