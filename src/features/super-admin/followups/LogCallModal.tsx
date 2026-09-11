import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextAreaField } from '@/components/TextAreaField'
import { TextField } from '@/components/TextField'
import { SegmentedControl } from '@/components/SegmentedControl'
import type { FollowupOutcomeOption } from './labels'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export interface LogCallInput {
  note: string
  outcome?: string
  callBackOn?: string
}

interface LogCallModalProps {
  title: string
  /** The queue's own outcome list — finance and service have different words for the same idea. */
  outcomeOptions: FollowupOutcomeOption[]
  pending: boolean
  errorMessage?: string
  onClose: () => void
  onSave: (input: LogCallInput) => void
}

/**
 * The one "log what happened" form both follow-up queues use (2026-09-11) — payment logging a
 * consultancy call, support logging a student call. Deliberately minimal: a note, an optional
 * outcome, an optional call-back date. Non-dismissible (Modal's default) since this is a form —
 * losing a just-typed call note to a stray click outside would mean redoing the call.
 */
export function LogCallModal({ title, outcomeOptions, pending, errorMessage, onClose, onSave }: LogCallModalProps) {
  const [note, setNote] = useState('')
  const [outcome, setOutcome] = useState('')
  const [callBackOn, setCallBackOn] = useState('')

  function handleSave() {
    if (!note.trim()) return
    onSave({ note: note.trim(), outcome: outcome || undefined, callBackOn: callBackOn || undefined })
  }

  return (
    <Modal
      onClose={onClose}
      title={title}
      widthRem={32}
      footer={
        <>
          {errorMessage && <p className="mr-auto self-center text-body-sm text-error">{errorMessage}</p>}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={pending} disabled={!note.trim()} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <TextAreaField
          label="Note"
          required
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Who you spoke to and what they said."
        />
        <SegmentedControl
          label="Outcome"
          value={outcome}
          // Clicking the already-selected outcome clears it — outcome is optional, and the
          // platform's SegmentedControl has no built-in "none" state of its own.
          onChange={(value) => setOutcome(value === outcome ? '' : value)}
          options={outcomeOptions}
        />
        <div className="flex flex-col gap-xs">
          <TextField
            label="Call back on"
            type="date"
            min={today()}
            value={callBackOn}
            onChange={(e) => setCallBackOn(e.target.value)}
          />
          <p className="pl-lg text-caption text-text-secondary">
            The row hides until then and comes back marked Due.
          </p>
        </div>
      </div>
    </Modal>
  )
}
