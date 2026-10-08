import { useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { TextAreaField } from '@/components/TextAreaField'
import { ApiError } from '@/api/errors'
import { currencyOptions, money } from './money'
import { useReceiveCommissionDue, type CommissionDuePart, type FinanceCaseRow } from '@/queries/financeDashboard'
import { localDateISO } from '@/lib/time'
import { showToast } from '@/lib/toast'
import { ALREADY_APPLIED_NOTICE, isAlreadyApplied, usePayloadIdempotencyKey } from '@/lib/useIdempotencyKey'

/**
 * Finance records that money has actually arrived (2026-09-11) — a confirmed payment with no
 * declaration from the consultancy needed; they're only told about it afterwards. Opened two ways
 * from FinanceCaseDrawer: with a `part` (its "Mark as received" action) the amount and currency
 * are pinned to that part and it settles first; without one (the case-level "Record a payment")
 * it's money that isn't tied to any single part, so both are picked here from the case's own
 * currencies.
 *
 * IT ARRIVED IN ANOTHER CURRENCY (review F-079). Money sometimes reaches the bank in a currency
 * the case does not owe: US dollars against Canadian-dollar dues. Ticking "It arrived in another
 * currency" records it as it arrived — the amount and currency are what reached the bank — and
 * says which currency's dues it settles: the part's own, or one chosen from the currencies the
 * case owes. The rate is optional; left empty the server uses the day's rate. The server does the
 * conversion and checks the ceiling in the owed currency; nothing is converted here.
 */
export function ReceiveDueModal({
  caseRow,
  part,
  label,
  onClose,
  onReceived,
}: {
  caseRow: FinanceCaseRow
  part: CommissionDuePart | null
  /** Context line describing the part, e.g. what FinanceCaseDrawer's partLabel() renders for it. */
  label?: string
  onClose: () => void
  onReceived: (row: FinanceCaseRow) => void
}) {
  const receiveDue = useReceiveCommissionDue()
  // The currencies the case owes, as the server lists them.
  const owedCurrencies = (caseRow.by_currency ?? []).map((c) => c.currency).filter((c): c is string => Boolean(c))
  const currencies = currencyOptions(owedCurrencies, part?.currency)
  const [amount, setAmount] = useState(part ? String(part.outstanding ?? part.amount ?? '') : '')
  const [currency, setCurrency] = useState(part?.currency ?? currencies[0] ?? 'INR')
  const [receivedOn, setReceivedOn] = useState(localDateISO())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const { keyFor, settle } = usePayloadIdempotencyKey()
  // Overpayment guard (review C5, 2026-09-12) — the modal already knows what's outstanding for
  // this part/case+currency, so it warns before the round trip rather than waiting on the
  // server's 409. Only ticking the checkbox sends allow_overpayment: true.
  const [allowOverpayment, setAllowOverpayment] = useState(false)

  // "It arrived in another currency": what it settles, and at what rate.
  const [crossCurrency, setCrossCurrency] = useState(false)
  const [owedCurrency, setOwedCurrency] = useState(owedCurrencies.length === 1 ? owedCurrencies[0] : '')
  const [rate, setRate] = useState('')

  // With a part the dues settled are the part's own; otherwise the one chosen here.
  const settlesCurrency = part ? (part.currency ?? 'INR') : owedCurrency
  const effectiveCurrency = !crossCurrency && part ? (part.currency ?? 'INR') : currency
  const outstanding = part
    ? part.outstanding
    : (caseRow.by_currency ?? []).find((c) => c.currency === effectiveCurrency)?.outstanding

  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(parsed) && parsed > 0
  // Only when the money is in the currency owed: across currencies the server compares, at the
  // rate it settles at, and answers 409 `more_than_outstanding` (handled below).
  const isOverpayment = !crossCurrency && isValidAmount && outstanding != null && parsed > outstanding
  const overpaymentBy = isOverpayment ? parsed - outstanding! : 0

  const parsedRate = Number(rate)
  const rateGiven = rate.trim() !== ''
  const rateError = rateGiven && !(Number.isFinite(parsedRate) && parsedRate > 0) ? 'Enter a rate above zero.' : undefined
  const sameCurrencyError =
    crossCurrency && settlesCurrency !== '' && currency === settlesCurrency
      ? `Choose the currency the money arrived in. ${settlesCurrency} is the currency owed.`
      : undefined
  const crossInvalid = crossCurrency && (settlesCurrency === '' || Boolean(sameCurrencyError) || Boolean(rateError))

  // The server's own refusals. `more_than_outstanding` across currencies: its sentence names what
  // is outstanding in the owed currency, and the same "record it anyway" tick answers it.
  const refusal = receiveDue.error instanceof ApiError ? receiveDue.error : null
  const serverSaysOverpayment = crossCurrency && refusal?.code === 'more_than_outstanding'
  // Nothing is owed in the currency given: point at the other-currency path when it is not on.
  const notOwedHint = !crossCurrency && refusal?.code === 'currency_not_owed'

  const invalid =
    !isValidAmount || !receivedOn || crossInvalid || ((isOverpayment || serverSaysOverpayment) && !allowOverpayment)

  // The server's "more than is outstanding" was about the figures as they were sent: once one of
  // them changes, the refusal and the tick that answered it no longer apply.
  function clearServerOverpayment() {
    if (!serverSaysOverpayment) return
    receiveDue.reset()
    setAllowOverpayment(false)
  }

  function toggleCrossCurrency(next: boolean) {
    setCrossCurrency(next)
    setAllowOverpayment(false)
    receiveDue.reset()
    // The pre-filled amount is the part's outstanding in the OWED currency: it is not what arrived.
    setAmount(next ? '' : part ? String(part.outstanding ?? part.amount ?? '') : '')
    if (!next && part) setCurrency(part.currency ?? 'INR')
  }

  return (
    <Modal
      onClose={onClose}
      title={part ? 'Mark as received' : 'Record a payment'}
      widthRem={26}
      footer={
        <>
          {receiveDue.isError && !serverSaysOverpayment && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {receiveDue.error.message}
            </p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={receiveDue.isPending}
            disabled={invalid}
            onClick={() => {
              const payload = {
                entryId: caseRow.id,
                amount: parsed,
                currency: crossCurrency ? currency : part ? (part.currency ?? undefined) : currency,
                part_key: part?.key,
                received_on: receivedOn,
                reference: reference.trim() || undefined,
                note: note.trim() || undefined,
                allow_overpayment: isOverpayment || serverSaysOverpayment ? allowOverpayment : undefined,
                ...(crossCurrency
                  ? {
                      allow_cross_currency: true,
                      // With a part the server takes the part's currency; named only without one.
                      owed_currency: part ? undefined : owedCurrency,
                      rate: rateGiven ? parsedRate : undefined,
                    }
                  : {}),
              }
              receiveDue.mutate(
                { ...payload, idempotencyKey: keyFor(payload) },
                {
                  onError: (err) => {
                    settle(err)
                    // Already recorded (the first answer was lost): the write is done. Close, say so, never resubmit.
                    if (isAlreadyApplied(err)) {
                      showToast(ALREADY_APPLIED_NOTICE)
                      onClose()
                    }
                  },
                  onSuccess: (row) => {
                    showToast(`Payment recorded for ${caseRow.applicant_name}`)
                    onReceived(row)
                  },
                },
              )
            }}
          >
            {part ? 'Mark as received' : 'Record payment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {caseRow.applicant_name} · {caseRow.consultancy_name}
        </p>
        {label && <p className="text-body-sm text-text-primary">{label}</p>}
        <label className="flex items-center gap-sm text-body-sm text-text-primary">
          <input
            type="checkbox"
            checked={crossCurrency}
            onChange={(e) => toggleCrossCurrency(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          It arrived in another currency
        </label>
        <div className="flex items-center gap-sm">
          <TextField
            label={crossCurrency ? 'Amount received' : 'Amount'}
            type="number"
            min={0.01}
            step="0.01"
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              clearServerOverpayment()
            }}
            className="flex-1"
          />
          {part && !crossCurrency ? (
            <span className="flex h-12 items-center rounded-full border border-border bg-background px-md text-body-sm text-text-secondary">
              {part.currency ?? 'INR'}
            </span>
          ) : (
            <CompactSelect
              label={crossCurrency ? 'Currency received' : 'Currency'}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </CompactSelect>
          )}
        </div>
        {crossCurrency && (
          <div className="flex flex-col gap-sm rounded-md border border-border p-sm">
            <div className="flex items-center justify-between gap-sm">
              <span className="text-body-sm text-text-primary">Settles the dues in</span>
              {part || owedCurrencies.length === 1 ? (
                <span className="text-body-sm font-medium text-text-primary">{settlesCurrency}</span>
              ) : (
                <CompactSelect
                  label="Currency owed"
                  required
                  value={owedCurrency}
                  onChange={(e) => setOwedCurrency(e.target.value)}
                >
                  <option value="" disabled>
                    Choose the currency owed
                  </option>
                  {owedCurrencies.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </CompactSelect>
              )}
            </div>
            {sameCurrencyError && <p className="text-caption text-error">{sameCurrencyError}</p>}
            <TextField
              label="Rate"
              type="number"
              min={0}
              step="any"
              value={rate}
              onChange={(e) => {
                setRate(e.target.value)
                clearServerOverpayment()
              }}
              error={rateError}
            />
            <p className="text-caption text-text-secondary">
              1 {currency} settles how many {settlesCurrency || 'of the currency owed'}. Leave empty to use today&rsquo;s
              rate.
            </p>
          </div>
        )}
        {notOwedHint && (
          <p className="text-caption text-text-secondary">
            If the money reached the bank in a different currency from the one owed, tick &ldquo;It arrived in another
            currency&rdquo;.
          </p>
        )}
        {(isOverpayment || serverSaysOverpayment) && (
          <div className="flex flex-col gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
            <p className="text-body-sm text-text-primary">
              {serverSaysOverpayment ? (
                refusal?.message
              ) : (
                <>That&rsquo;s {money({ amount: overpaymentBy, currency: effectiveCurrency })} more than is outstanding.</>
              )}
            </p>
            <label className="flex items-center gap-sm text-body-sm text-text-primary">
              <input
                type="checkbox"
                checked={allowOverpayment}
                onChange={(e) => setAllowOverpayment(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              Record it anyway — this is a genuine over-payment
            </label>
          </div>
        )}
        <div className="flex flex-col gap-xs">
          <label htmlFor="receive-due-date" className="pl-lg text-caption text-text-secondary">
            Received on
          </label>
          <input
            id="receive-due-date"
            type="date"
            required
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
            className="h-12 rounded-full border border-border bg-surface px-5 text-body text-text-primary outline-none focus:border-2 focus:border-primary"
          />
        </div>
        <TextField label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} />
        <TextAreaField label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-caption text-text-secondary">
          Records the money as received — no declaration from the consultancy is needed. They&rsquo;re told.
        </p>
      </div>
    </Modal>
  )
}
