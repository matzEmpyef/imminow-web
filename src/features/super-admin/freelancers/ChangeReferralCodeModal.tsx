import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { useUpdateFreelancer, type Freelancer } from '@/queries/freelancerRates'
import { showToast } from '@/lib/toast'
import { REFERRAL_CODE_LENGTH, codeError as codeErrorOf, normaliseCode } from '@/lib/validation'

/**
 * Changing a freelancer's referral code retires the old one AT ONCE (user, 2026-09-11) — anything
 * already shared with it stops working the moment this saves, though students already referred
 * through it stay attributed to this freelancer. That's a real, immediate consequence, so it's
 * spelled out before the save rather than left to be discovered later.
 */
export function ChangeReferralCodeModal({ freelancer, onClose }: { freelancer: Freelancer; onClose: () => void }) {
  const updateFreelancer = useUpdateFreelancer()
  const [code, setCode] = useState(freelancer.referral_code ?? '')
  const [touched, setTouched] = useState(false)

  const codeError = codeErrorOf(code, REFERRAL_CODE_LENGTH)
  const valid = code.length > 0 && !codeError
  const unchanged = normaliseCode(code) === freelancer.referral_code

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    if (!valid || unchanged) return
    updateFreelancer.mutate(
      { id: freelancer.id, referral_code: normaliseCode(code) },
      {
        onSuccess: () => {
          showToast('Referral code changed')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Change Referral Code"
      widthRem={26}
      footer={
        <>
          {updateFreelancer.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateFreelancer.error.message}</p>
          )}
          <Button
            type="submit"
            form="change-code-form"
            loading={updateFreelancer.isPending}
            disabled={!valid || unchanged}
          >
            Save
          </Button>
        </>
      }
    >
      <form id="change-code-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField
          kind="code"
          label="New referral code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onBlur={() => setTouched(true)}
          error={touched ? codeError : undefined}
          className="font-mono"
        />
        <p className="rounded-md bg-warning/10 px-md py-sm text-body-sm text-warning">
          The old code stops working immediately — any link already shared with it breaks. Students already referred
          stay credited to them.
        </p>
      </form>
    </Modal>
  )
}
