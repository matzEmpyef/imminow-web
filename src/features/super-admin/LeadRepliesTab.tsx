import { useState } from 'react'
import { Button } from '@/components/Button'
import { Card } from '@/components/Card'
import { TextField } from '@/components/TextField'
import { fieldMessages } from '@/api/errors'
import { showToast } from '@/lib/toast'
import { usePlatformSettings, useUpdatePlatformSettings } from '@/queries/catalogSettings'
import { SettingsUsedIn } from './SettingsUsedIn'

// Owner's ruling 2026-10-09: a student's first message must never sit unseen. Two clocks run from
// it, and all are set here. The defaults and ranges are the server's (`PlatformSettings`).
type LeadReplyField =
  'lead_reply_reminder_hours' | 'lead_platform_alert_hours' | 'lead_platform_alert_after_reminder_hours'

const FIELDS: {
  key: LeadReplyField
  label: string
  fallback: number
  min: number
  max: number
  hint: string
}[] = [
  {
    key: 'lead_reply_reminder_hours',
    label: 'Remind the consultancy after (working hours)',
    fallback: 2,
    min: 1,
    max: 48,
    hint:
      'How many of the consultancy’s own working hours a student’s first message can wait for a reply before ' +
      'the consultancy is reminded, once. Working hours are the consultancy’s visiting hours in its own time ' +
      'zone, or Monday to Saturday 10:00–17:00 India time when it has set none.',
  },
  {
    key: 'lead_platform_alert_hours',
    label: 'Tell immiNow after (hours)',
    fallback: 24,
    min: 1,
    max: 168,
    hint:
      'The earliest immiNow support is told that a student’s first contact with a consultancy has had no ' +
      'reply, counted in hours from the student’s message. The student also joins the follow-up queue from ' +
      'that moment. It can be later than this: see the setting below.',
  },
  {
    key: 'lead_platform_alert_after_reminder_hours',
    label: 'Working hours the consultancy gets after its reminder before immiNow is told',
    fallback: 4,
    min: 1,
    max: 48,
    hint:
      'immiNow is told at the later of this and the limit above, so it never hears before the ' +
      'consultancy has been reminded.',
  },
]

function parse(value: string): number {
  return value.trim() === '' ? NaN : Number(value)
}

function valid(value: string, min: number, max: number): boolean {
  const n = parse(value)
  return Number.isInteger(n) && n >= min && n <= max
}

/**
 * Lead Replies — how long a student's first message to a consultancy may wait for an answer
 * before the consultancy is reminded, and before immiNow is told (the later of a clock limit and
 * some working hours after the reminder). A change applies to first
 * messages sent after it is saved; each change is audited by the server.
 */
export function LeadRepliesTab() {
  const settings = usePlatformSettings()
  const update = useUpdatePlatformSettings()
  const saved: Record<LeadReplyField, number> = {
    lead_reply_reminder_hours: settings.data?.lead_reply_reminder_hours ?? 2,
    lead_platform_alert_hours: settings.data?.lead_platform_alert_hours ?? 24,
    lead_platform_alert_after_reminder_hours: settings.data?.lead_platform_alert_after_reminder_hours ?? 4,
  }
  const [draft, setDraft] = useState<Record<LeadReplyField, string> | null>(null)
  // What the last refused save sent, so the server's sentence stays only beside a value it judged.
  const [sent, setSent] = useState<Record<LeadReplyField, string> | null>(null)
  const current = draft ?? {
    lead_reply_reminder_hours: String(saved.lead_reply_reminder_hours),
    lead_platform_alert_hours: String(saved.lead_platform_alert_hours),
    lead_platform_alert_after_reminder_hours: String(saved.lead_platform_alert_after_reminder_hours),
  }
  const refused = fieldMessages(update.error)

  const invalid = FIELDS.some((f) => !valid(current[f.key], f.min, f.max))
  const unchanged = FIELDS.every((f) => parse(current[f.key]) === saved[f.key])

  function errorFor(f: (typeof FIELDS)[number]): string | undefined {
    const value = current[f.key]
    if (value !== '' && !valid(value, f.min, f.max)) return `A whole number from ${f.min} to ${f.max}.`
    if (value === '') return `Enter a whole number from ${f.min} to ${f.max}.`
    return sent && sent[f.key] === value ? refused[f.key] : undefined
  }

  function save() {
    const body = {
      lead_reply_reminder_hours: parse(current.lead_reply_reminder_hours),
      lead_platform_alert_hours: parse(current.lead_platform_alert_hours),
      lead_platform_alert_after_reminder_hours: parse(current.lead_platform_alert_after_reminder_hours),
    }
    setSent(current)
    update.mutate(body, {
      onSuccess: () => {
        setDraft(null)
        setSent(null)
        showToast('Lead reply settings saved')
      },
    })
  }

  const shownFieldError = FIELDS.some((f) => refused[f.key])

  return (
    <Card className="flex flex-col gap-md">
      <div className="flex flex-col gap-xs">
        <h2 className="text-h3 text-text-primary">Lead replies</h2>
        <p className="text-body-sm text-text-secondary">
          When a student writes to a consultancy for the first time, the consultancy is reminded once. immiNow is told
          later, and never before the consultancy has been reminded and has had some working hours to answer. A change
          applies to first messages sent after you save it.
        </p>
      </div>

      <div className="flex flex-col gap-md">
        {FIELDS.map((f) => (
          <TextField
            kind="count"
            key={f.key}
            label={f.label}
            type="number"
            inputMode="numeric"
            step={1}
            min={f.min}
            max={f.max}
            value={current[f.key]}
            hint={f.hint}
            error={errorFor(f)}
            onChange={(e) => setDraft({ ...current, [f.key]: e.target.value })}
          />
        ))}
      </div>

      <SettingsUsedIn places={['Consultancy lead reminders', 'Service follow-ups']} />

      <div className="flex items-center justify-end gap-md border-t border-border pt-md">
        {update.isError && !shownFieldError && <p className="text-body-sm text-error">{update.error.message}</p>}
        <Button loading={update.isPending} disabled={invalid || unchanged || settings.isLoading} onClick={save}>
          Save
        </Button>
      </div>
    </Card>
  )
}
