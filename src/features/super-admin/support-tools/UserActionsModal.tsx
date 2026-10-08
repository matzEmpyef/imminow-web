import { useState } from 'react'
import { Badge } from '@/components/Badge'
import { Modal } from '@/components/Modal'
import { useIsSuperAdmin } from '@/lib/me'
import type { UserSearchResult } from '@/queries/supportTools'
import { formatDate } from '@/lib/time'
import { ActionCard } from './ActionCard'
import { CancelErasureModal } from './CancelErasureModal'
import { ChangeEmailForm } from './ChangeEmailForm'
import { ChangePhoneForm } from './ChangePhoneForm'
import { DateOfBirthForm } from './DateOfBirthForm'
import { EraseForm } from './EraseForm'
import { ExportForm } from './ExportForm'
import { GuardianForm } from './GuardianForm'
import { PendingContact } from './PendingContact'
import { SwitchConsultancyForm } from './SwitchConsultancyForm'

type ActionKey = 'switch' | 'email' | 'phone' | 'guardian' | 'dob' | 'export' | 'erase'

/** Why a new contact cannot be recorded on a locked account (the server answers 409 `conflict`). */
const LOCKED_FOR_DELETION = 'Not available while a deletion is scheduled. Keep the account first.'

/**
 * Support Tools' per-user action popup (rebuilt 2026-09-12 from a single always-open modal into
 * cards you open one at a time — "Start" expands a focused form, and only one stays open, so an
 * operator never has two half-filled irreversible actions on screen together).
 *
 * A wide Modal rather than a Drawer: Drawer is a fixed 24rem panel with no width prop, which is
 * too narrow for the switch-consultancy picker's candidate cards and country chips.
 */
export function UserActionsModal({
  result: opened,
  onClose,
}: {
  result: UserSearchResult
  onClose: () => void
}) {
  // The account as last answered by the server: recording a new email or number returns it with
  // what is now waiting, and the card below must say so without a new search.
  const [result, setResult] = useState(opened)
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
          <PendingContact user={result} />
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

          {/* Recorded, not changed (owner ruling 4, 2026-10-07): the address waits until the person
              proves it. A locked account takes no new contact; the erasure is cancelled first. */}
          <ActionCard
            title="Record new email (user must confirm)"
            description="For someone locked out of their own account. Records a new sign-in address, which becomes theirs once they confirm it. Their current sign-in keeps working until then."
            expanded={openAction === 'email' && !erasureDueAt}
            onStart={() => setOpenAction('email')}
            unavailableReason={erasureDueAt ? LOCKED_FOR_DELETION : undefined}
          >
            <ChangeEmailForm result={result} onCancel={() => close('email')} onRecorded={setResult} />
          </ActionCard>

          {/* Students only (owner ruling 1): a student who has lost their old number cannot pass
              the first of the two codes a phone change takes, so Support records the new one. */}
          {result.role === 'student' && (
            <ActionCard
              title="Change phone number (student must confirm)"
              description="For a student who can no longer use their old number. Records a new number, which becomes theirs once they sign in with it."
              expanded={openAction === 'phone' && !erasureDueAt}
              onStart={() => setOpenAction('phone')}
              unavailableReason={erasureDueAt ? LOCKED_FOR_DELETION : undefined}
            >
              <ChangePhoneForm result={result} onCancel={() => close('phone')} onRecorded={setResult} />
            </ActionCard>
          )}

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

          {/* Students only (owner decision 3, lane x): a student cannot change a recorded date of
              birth themselves, so Support corrects it against a document. */}
          {result.role === 'student' && (
            <ActionCard
              title="Correct date of birth"
              description="Replaces the date of birth on this student's account, after you have checked it against a document."
              expanded={openAction === 'dob'}
              onStart={() => setOpenAction('dob')}
            >
              <DateOfBirthForm result={result} onCancel={() => close('dob')} />
            </ActionCard>
          )}

          <ActionCard
            title="Data export"
            description="Generates a full copy of everything immiNow holds on this user, for a data-access request."
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
