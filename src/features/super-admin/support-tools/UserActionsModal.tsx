import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { useIsSuperAdmin } from '@/lib/me'
import type { UserSearchResult } from '@/queries/supportTools'
import { formatDate } from '@/lib/time'
import { ActionCard } from './ActionCard'
import { CancelErasureModal } from './CancelErasureModal'
import { ChangeEmailForm } from './ChangeEmailForm'
import { EraseForm } from './EraseForm'
import { ExportForm } from './ExportForm'
import { GuardianForm } from './GuardianForm'
import { SwitchConsultancyForm } from './SwitchConsultancyForm'

type ActionKey = 'switch' | 'email' | 'guardian' | 'export' | 'erase'

/**
 * Support Tools' per-user action popup (rebuilt 2026-09-12 from a single always-open modal into
 * cards you open one at a time — "Start" expands a focused form, and only one stays open, so an
 * operator never has two half-filled irreversible actions on screen together).
 *
 * A wide Modal rather than a Drawer: Drawer is a fixed 24rem panel with no width prop, which is
 * too narrow for the switch-consultancy picker's candidate cards and country chips.
 */
export function UserActionsModal({
  result,
  onClose,
}: {
  result: UserSearchResult
  onClose: () => void
}) {
  const [openAction, setOpenAction] = useState<ActionKey | null>(null)
  const [cancellingErasure, setCancellingErasure] = useState(false)
  // Set while an erasure is pending (gate 12f): the account is locked and waiting out its 30
  // days. An export is refused then, and erasing again makes no sense; keeping the account does.
  const erasureDueAt = result.erasure_due_at ?? null
  const isSuperAdmin = useIsSuperAdmin()

  const consent = result.guardian_consent
  const guardianRelevant = result.role === 'student' && Boolean(consent) && consent!.status !== 'not_required'

  function close(key: ActionKey) {
    setOpenAction((current) => (current === key ? null : current))
  }

  return (
    <Modal onClose={onClose} title={result.name} widthRem={44}>
      <div className="flex flex-col gap-lg">
        {/* Identity card — restated here since the row that opened this is behind the overlay now,
            and several of these actions cannot be undone. */}
        <div className="flex flex-col gap-xs rounded-md bg-background p-md">
          <div className="flex flex-wrap items-center gap-sm">
            <span className="text-body font-medium text-text-primary">{result.name}</span>
            <Badge color="primary" className="capitalize">
              {result.role.replace(/_/g, ' ')}
            </Badge>
            {result.case_stage && (
              <Badge color="info" className="capitalize">
                {result.case_stage.replace(/_/g, ' ')}
              </Badge>
            )}
            {guardianRelevant && (
              <Badge color={consent!.status === 'approved' ? 'success' : 'warning'} className="capitalize">
                Guardian {consent!.status.replace(/_/g, ' ')}
              </Badge>
            )}
            {erasureDueAt && <Badge color="error">Deletion scheduled {formatDate(erasureDueAt)}</Badge>}
          </div>
          <p className="text-body-sm text-text-secondary">
            {result.email}
            {result.phone ? ` · ${result.phone}` : ''}
          </p>
          {result.consultancy_name && <p className="text-body-sm text-text-secondary">{result.consultancy_name}</p>}
        </div>

        <p className="text-caption text-text-secondary">Every action needs a reason and is kept in the audit log.</p>

        <div className="flex flex-col gap-sm">
          {result.journey_id && (
            <ActionCard
              title="Switch consultancy"
              description="Closes this student's case at their current consultancy and opens a new one at another."
              expanded={openAction === 'switch'}
              onStart={() => setOpenAction('switch')}
            >
              <SwitchConsultancyForm result={result} onCancel={() => close('switch')} />
            </ActionCard>
          )}

          <ActionCard
            title="Change sign-in email"
            description="Replaces the address they sign in with, for someone locked out of their own account."
            expanded={openAction === 'email'}
            onStart={() => setOpenAction('email')}
          >
            <ChangeEmailForm result={result} onCancel={() => close('email')} />
          </ActionCard>

          {guardianRelevant && (
            <ActionCard
              title="Guardian approval"
              description="Sends the parent or guardian link again, for a student under 18 whose guardian declined or never received it."
              expanded={openAction === 'guardian'}
              onStart={() => setOpenAction('guardian')}
            >
              <GuardianForm result={result} onCancel={() => close('guardian')} />
            </ActionCard>
          )}

          <ActionCard
            title="Data export"
            description="Generates a full copy of everything Sentpo holds on this user, for a data-access request."
            expanded={openAction === 'export' && !erasureDueAt}
            onStart={() => setOpenAction('export')}
            unavailableReason={erasureDueAt ? 'Not available while an erasure is pending.' : undefined}
          >
            <ExportForm result={result} onCancel={() => close('export')} />
          </ActionCard>
        </div>

        <div className="border-t border-border pt-md">
          {erasureDueAt ? (
            // An erasure is already pending: there is nothing to erase again, only an account to
            // keep. Super Admin only, as on the Pending erasures list.
            isSuperAdmin ? (
              <ActionCard
                title="Cancel scheduled erasure"
                description={`This account is locked and its personal data will be erased on ${formatDate(erasureDueAt)}. Cancelling keeps the account; cases and chats that already closed stay closed.`}
                expanded={false}
                startLabel="Keep account"
                onStart={() => setCancellingErasure(true)}
              />
            ) : (
              <p className="text-caption text-text-secondary">
                This account is scheduled for deletion on {formatDate(erasureDueAt)}. Only a Super Admin can cancel
                that.
              </p>
            )
          ) : isSuperAdmin ? (
            <ActionCard
              danger
              title="Erase user data"
              description="Locks the account now and permanently erases this user's personal data after 30 days. It can be cancelled until then."
              expanded={openAction === 'erase'}
              onStart={() => setOpenAction('erase')}
            >
              <EraseForm result={result} onCancel={() => close('erase')} />
            </ActionCard>
          ) : (
            <p className="text-caption text-text-secondary">Erasing a user is limited to super admins.</p>
          )}
        </div>
      </div>

      {cancellingErasure && erasureDueAt && (
        <CancelErasureModal
          userId={result.id}
          name={result.name}
          dueAt={erasureDueAt}
          onClose={() => setCancellingErasure(false)}
          // The row this popup was opened from still says "scheduled"; close it so the next look
          // is at the refreshed search.
          onCancelled={onClose}
        />
      )}
    </Modal>
  )
}
