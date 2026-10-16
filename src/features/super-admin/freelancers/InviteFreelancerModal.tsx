import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useInviteFreelancer } from '@/queries/freelancerRates'
import {
  PERCENT_SENTENCE,
  REFERRAL_CODE_LENGTH,
  checkText,
  cleanName,
  codeError as codeErrorOf,
  emailError as emailErrorOf,
  isTextOk,
  normaliseCode,
  normaliseEmail,
  percentError,
  phoneError as phoneErrorOf,
  phoneToSend,
} from '@/lib/validation'
import { usePhoneRegion } from '@/lib/phoneRegion'
import { useServerFieldErrors } from '@/lib/useServerFieldErrors'

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

  const region = usePhoneRegion()
  const server = useServerFieldErrors(inviteFreelancer.error, {
    first_name: firstName,
    last_name: lastName,
    email,
    phone,
    referral_code: code,
    rate: rate,
  })
  const codeError = touched && code.length > 0 ? codeErrorOf(code, REFERRAL_CODE_LENGTH) : undefined
  // The rate is required (assumptions audit C7, approved 2026-09-19) — "set it later" meant a
  // case closed, immiNow collected ₹1,20,000, and the payouts page showed the freelancer ₹0 with
  // nothing anywhere saying a rate was missing. The server refuses an invite without one too.
  const parsedRate = Number(rate)
  // A share of 0% is allowed: it means no share (decision 154, ruling 6).
  const rateValid = rate.trim() !== '' && Number.isFinite(parsedRate) && !percentError(rate)
  const rateError = touched && !rateValid ? PERCENT_SENTENCE : undefined
  const phoneError = phoneErrorOf(phone, region)
  const emailInvalid = emailErrorOf(email)
  const canSubmit =
    isTextOk('name', firstName) &&
    isTextOk('name', lastName) &&
    Boolean(email.trim()) &&
    !emailInvalid &&
    !phoneError &&
    code.length > 0 &&
    !codeErrorOf(code, REFERRAL_CODE_LENGTH) &&
    rateValid
  const firstNameError = touched && !isTextOk('name', firstName) ? checkText('name', firstName) : undefined
  const lastNameError = touched && !isTextOk('name', lastName) ? checkText('name', lastName) : undefined
  const emailError = touched && !email.trim() ? 'Email is required.' : emailInvalid
  const requiredCodeError = touched && !code.trim() ? 'Referral code is required.' : codeError

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!canSubmit) return
    inviteFreelancer.mutate(
      {
        first_name: cleanName(firstName),
        last_name: cleanName(lastName),
        email: normaliseEmail(email),
        referral_code: normaliseCode(code),
        phone: phone.trim() ? phoneToSend(phone, region) : undefined,
        rate: parsedRate,
      },
      {
        onSuccess: () => {
          onInvited(normaliseEmail(email))
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
          {inviteFreelancer.isError && !server.allBesideFields && (
            <p className="mr-auto self-center text-body-sm text-error">{inviteFreelancer.error.message}</p>
          )}
          <Button type="submit" form="invite-freelancer-form" loading={inviteFreelancer.isPending}>
            Send invite
          </Button>
        </>
      }
    >
      <form id="invite-freelancer-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <div className="flex gap-sm">
          <TextField
            kind="name"
            label="First name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            error={firstNameError ?? server.messageFor('first_name')}
            className="flex-1"
          />
          <TextField
            kind="name"
            label="Last name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            error={lastNameError ?? server.messageFor('last_name')}
            className="flex-1"
          />
        </div>
        <TextField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={emailError ?? server.messageFor('email')}
        />
        <TextField
          label="Phone"
          type="tel"
          phoneRegion={region}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={phoneError ?? server.messageFor('phone')}
        />
        <div className="flex flex-col gap-xs">
          <TextField
            kind="code"
            label="Referral code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onBlur={() => setTouched(true)}
            error={requiredCodeError ?? server.messageFor('referral_code')}
            className="font-mono"
          />
          <p className="pl-lg text-caption text-text-secondary">
            4–20 letters, digits or dashes. This is what students type at signup.
          </p>
        </div>
        <div className="flex flex-col gap-xs">
          <TextField
            kind="percent"
            label="Their share of the commission immiNow collects"
            type="number"
            required
            min={0}
            max={100}
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            onBlur={() => setTouched(true)}
            error={rateError ?? server.messageFor('rate')}
          />
          <p className="pl-lg text-caption text-text-secondary">
            A percentage of what immiNow collects on the students they bring. Needed now, not
            later — a freelancer with no share earns nothing on every case they send until one is
            set, and nothing on screen says so.
          </p>
        </div>
      </form>
    </Modal>
  )
}
