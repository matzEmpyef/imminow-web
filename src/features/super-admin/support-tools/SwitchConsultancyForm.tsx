import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/Badge'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useSwitchCandidates, useSwitchConsultancy, type UserSearchResult } from '@/queries/supportTools'

const BLOCKED_REASON_LABELS: Record<string, string> = {
  current_consultancy: 'Current consultancy',
  no_active_staff: 'No active staff',
  subscription_lapsed: 'Subscription lapsed',
  freelancer_disabled: 'Freelancer disabled',
}

/**
 * Moves a student's case to a different consultancy (rewritten 2026-09-12 on the switch-candidates
 * contract). Mounted only while its card is expanded and `result.journey_id` is set — a student
 * with an active case, which is the only kind of user this action applies to.
 *
 * `UserSearchResult` doesn't carry the student's current consultancy name (that field is
 * documented as staff/freelancer-only), so it's recovered from the candidates list itself: the
 * server always includes the current consultancy, blocked with reason `current_consultancy`.
 */
export function SwitchConsultancyForm({ result, onCancel }: { result: UserSearchResult; onCancel: () => void }) {
  const candidates = useSwitchCandidates(result.journey_id)
  const switchConsultancy = useSwitchConsultancy()
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [reason, setReason] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [successClientId, setSuccessClientId] = useState<string | null>(null)

  if (successClientId) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-success">{result.name}'s case has been moved.</p>
        <div className="flex items-center gap-sm">
          <Link to={`/admin/applicants/${successClientId}`} className="text-body-sm font-medium text-primary hover:underline">
            Open the new case
          </Link>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  if (candidates.isLoading) return <p className="text-body-sm text-text-secondary">Loading consultancies…</p>
  if (candidates.isError) return <p className="text-body-sm text-error">Could not load consultancies to switch to.</p>

  const refusal = candidates.data?.refusal
  if (refusal) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="text-body-sm text-text-primary">{refusal.message ?? 'This case cannot be moved right now.'}</p>
        {refusal.code === 'case_in_dispute' && (
          <Link to="/admin/disputes" className="text-body-sm font-medium text-primary hover:underline">
            Open in Disputes
          </Link>
        )}
        <div>
          <Button size="sm" variant="secondary" onClick={onCancel}>
            Close
          </Button>
        </div>
      </div>
    )
  }

  const items = candidates.data?.items ?? []
  const current = items.find((c) => c.blocked_reason === 'current_consultancy')
  const selected = items.find((c) => c.consultancy_id === selectedId)
  const trimmedQuery = query.trim().toLowerCase()
  const filtered = trimmedQuery
    ? items.filter(
        (c) => c.name.toLowerCase().includes(trimmedQuery) || (c.city ?? '').toLowerCase().includes(trimmedQuery),
      )
    : items

  if (confirming && selected) {
    return (
      <div className="flex flex-col gap-sm">
        <p className="rounded-md bg-background p-sm text-body-sm text-text-primary">
          {result.name}'s case at {current?.name ?? 'their current consultancy'} closes, and a new case opens at{' '}
          {selected.name}. {current?.name ?? 'The current consultancy'} loses access to their shared documents. The
          student and both consultancies are told.
        </p>
        {switchConsultancy.isError && <p className="text-body-sm text-error">{switchConsultancy.error.message}</p>}
        <div className="flex items-center justify-end gap-sm">
          <Button size="sm" variant="secondary" onClick={() => setConfirming(false)} disabled={switchConsultancy.isPending}>
            Back
          </Button>
          <Button
            size="sm"
            loading={switchConsultancy.isPending}
            onClick={() =>
              switchConsultancy.mutate(
                { journeyId: result.journey_id!, new_consultancy_id: selected.consultancy_id, reason: reason.trim() },
                { onSuccess: (data) => data?.client_id && setSuccessClientId(data.client_id) },
              )
            }
          >
            Confirm switch
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-sm">
      <TextField label="Search by name or city" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul className="flex max-h-64 flex-col gap-xs overflow-y-auto">
        {filtered.length === 0 && <li className="text-body-sm text-text-secondary">No matches.</li>}
        {filtered.map((c) => {
          const blocked = Boolean(c.blocked_reason)
          const isSelected = c.consultancy_id === selectedId
          return (
            <li key={c.consultancy_id}>
              <button
                type="button"
                disabled={blocked}
                onClick={() => setSelectedId(c.consultancy_id)}
                className={`flex w-full flex-col gap-xs rounded-md border p-sm text-left ${
                  isSelected ? 'border-primary bg-primary/5' : 'border-border'
                } ${blocked ? 'cursor-not-allowed opacity-50' : 'hover:bg-background'}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-sm">
                  <span className="font-medium text-text-primary">{c.name}</span>
                  <span className="text-caption text-text-secondary">{c.city ?? '—'}</span>
                </div>
                {c.serves_countries.length > 0 && (
                  <div className="flex flex-wrap gap-xs">
                    <span className="text-caption text-text-secondary">Serves:</span>
                    {c.serves_countries.map((country) => (
                      <Badge key={country} color="secondary">
                        {country}
                      </Badge>
                    ))}
                  </div>
                )}
                <p className="text-caption text-text-secondary">
                  {c.active_applicants} active · {c.seats_used}/{c.seat_limit} seats
                </p>
                {c.blocked_reason && (
                  <p className="text-caption text-error">{BLOCKED_REASON_LABELS[c.blocked_reason] ?? c.blocked_reason}</p>
                )}
              </button>
            </li>
          )
        })}
      </ul>
      <TextField label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      <div className="flex items-center justify-end gap-sm">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" disabled={!selectedId || !reason.trim()} onClick={() => setConfirming(true)}>
          Continue
        </Button>
      </div>
    </div>
  )
}
