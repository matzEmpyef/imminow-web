import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useInviteFreelancer } from '@/queries/freelancerRates'

// Same shape the server enforces (openapi 400 on a malformed code) — checked client-side too so a
// typo is caught before the round trip, not just echoed back from the server.
const CODE_PATTERN = /^[A-Z0-9-]{4,20}$/

/**
 * Invites a freelancer (2026-09-11) — the referral code is TYPED by the admin, not generated, so
 * this is the one place that choice gets made. Capitalised as it's typed, since the server stores
 * it in capitals and a student types it verbatim at signup.
 */
export function InviteFreelancerModal({
  onClose,
  onInvited,
}: {
  onClose: () => void
  onInvited: (email: string) => void
}) {
  const inviteFreelancer = useInviteFreelancer()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [rate, setRate] = useState('')
  const [touched, setTouched] = useState(false)

  const codeError = touched && code.length > 0 && !CODE_PATTERN.test(code) ? 'Use 4–20 letters, digits or dashes.' : undefined
  const canSubmit = Boolean(firstName && lastName && email && CODE_PATTERN.test(code))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    inviteFreelancer.mutate(
      {
        first_name: firstName,
        last_name: lastName,
        email,
        referral_code: code,
        phone: phone || undefined,
        rate: rate === '' ? undefined : Number(rate),
      },
      {
        onSuccess: () => {
          onInvited(email)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Invite Freelancer"
      widthRem={28}
      footer={
        <>
          {inviteFreelancer.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{inviteFreelancer.error.message}</p>
          )}
          <Button type="submit" form="invite-freelancer-form" loading={inviteFreelancer.isPending} disabled={!canSubmit}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-freelancer-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex gap-sm">
          <TextField
            label="First name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="flex-1"
          />
          <TextField
            label="Last name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="flex-1"
          />
        </div>
        <TextField label="Email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <TextField label="Phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <div className="flex flex-col gap-xs">
          <TextField
            label="Referral code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setTouched(true)}
            error={codeError}
            className="font-mono"
          />
          <p className="pl-lg text-caption text-text-secondary">
            4–20 letters, digits or dashes. This is what students type at signup.
          </p>
        </div>
        <div className="flex flex-col gap-xs">
          <TextField
            label="Share %"
            type="number"
            min={0}
            max={100}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
          />
          <p className="pl-lg text-caption text-text-secondary">
            Their share of the commission immiNow collects on the students they bring. Can be set later instead.
          </p>
        </div>
      </form>
    </Modal>
  )
}
