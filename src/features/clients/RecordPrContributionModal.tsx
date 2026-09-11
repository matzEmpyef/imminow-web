import { useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { CountrySelect } from '@/components/CountrySelect'
import { useCreatePrCommissionEntry } from '@/queries/clients'
import { useCurrencyCodes } from '@/lib/currencies'
import { useMyConsultancy } from '@/queries/consultancy'
import { showToast } from '@/lib/toast'
import { formatMoney } from '@/lib/money'

/**
 * PR cases have no colleges — the consultant records the applicant's agreed contribution
 * directly (user, 2026-08-28). The platform's cut comes from the destination country's `pr`
 * Commission Rates row, snapshotted server-side; per the tiered-visibility rule it is not
 * shown here.
 */
export function RecordPrContributionModal({
  clientId,
  finalizedCountry,
  onClose,
}: {
  clientId: string
  finalizedCountry: string | null
  onClose: () => void
}) {
  const create = useCreatePrCommissionEntry(clientId)
  const [amount, setAmount] = useState('')
  // Starts on the consultancy's own currency (2026-09-10) — was INR for everyone.
  const consultancyCurrency = useMyConsultancy().data?.display_currency ?? 'INR'
  const [currency, setCurrency] = useState(consultancyCurrency)
  const currencyCodes = useCurrencyCodes(currency)
  const [country, setCountry] = useState(finalizedCountry ?? '')
  const [note, setNote] = useState('')

  const canSubmit = Number(amount) > 0 && country.trim().length > 0 && !create.isPending

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    create.mutate(
      {
        amount: { amount: Number(amount), currency },
        destination_country: country.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      },
      {
        onSuccess: () => {
          showToast(`Contribution of ${formatMoney(currency, Number(amount))} recorded`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Record Applicant Contribution"
      widthRem={30}
      footer={
        <>
          {create.isError && <p className="mr-auto self-center text-body-sm text-error">{create.error.message}</p>}
          <div className="flex gap-sm">
            <Button type="submit" form="pr-contribution-form" loading={create.isPending} disabled={!canSubmit}>
              Record
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </>
      }
    >
      <form id="pr-contribution-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          The agreed amount this applicant contributes for their PR case. Payments against it are then tracked as
          installments on the Commissions tab.
        </p>
        <div className="grid grid-cols-3 gap-sm">
          <TextField
            label="Amount"
            type="number"
            min="1"
            required
            className="col-span-2"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          <SelectField label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {currencyCodes.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        </div>
        <CountrySelect label="Destination country" value={country} onChange={setCountry} required />
        <TextField label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      </form>
    </Modal>
  )
}
