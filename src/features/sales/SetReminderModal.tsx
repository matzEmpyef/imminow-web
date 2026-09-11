import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useSetLeadReminder } from '@/queries/leads'
import { localDateISO } from '@/lib/time'

// Ultimate-only, gated the same way as Activity itself — LeadConversationPage decides whether to
// render the trigger button, this modal assumes it's already allowed to be open. Always
// self-assigned (no assignee picker, user-requested) — creates an activity_tasks row that shows
// up in the Activity page's existing Assigned Tasks list rather than a separate reminders list.
export function SetReminderModal({ leadId, onClose }: { leadId: string; onClose: () => void }) {
  const setReminder = useSetLeadReminder(leadId)
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  // The date input's minimum, so a reminder can't be backdated.
  const minDate = localDateISO()

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!note.trim() || !date || !time || date < minDate) return
    setReminder.mutate({ note, due_date: date, due_time: time }, { onSuccess: onClose })
  }

  return (
    <Modal
      onClose={onClose}
      title="Set Reminder"
      widthRem={26}
      footer={
        <>
          {date && date < minDate && (
            <p className="mr-auto self-center text-body-sm text-error">Date can't be in the past.</p>
          )}
          {setReminder.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{setReminder.error.message}</p>
          )}
          <Button
            type="submit"
            form="set-reminder-form"
            loading={setReminder.isPending}
            disabled={!note.trim() || !date || !time || date < minDate}
          >
            Set Reminder
          </Button>
        </>
      }
    >
      <form id="set-reminder-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex flex-col gap-xs">
          <label className="text-body-sm font-medium text-text-primary" htmlFor="reminder-note">
            Note
          </label>
          <textarea
            id="reminder-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            required
            className="rounded-md border border-border bg-surface px-3 py-sm text-body"
          />
        </div>
        <div className="grid grid-cols-2 gap-md">
          <TextField
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            min={minDate}
            required
          />
          <TextField label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
        </div>
      </form>
    </Modal>
  )
}
