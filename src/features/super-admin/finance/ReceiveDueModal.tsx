import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { CompactSelect } from '@/components/CompactSelect'
import { TextField } from '@/components/TextField'
import { MoneyField } from '@/components/MoneyField'
import { TextAreaField } from '@/components/TextAreaField'
import { ApiError, fieldMessages } from '@/api/errors'
import { currencyOptions, money } from './money'
import { CaseOwesRows } from './CaseOwesRows'
import { formatRate } from '@/lib/money'
import {
  useReceiveCommissionDue,
  useReceivePreview,
  type CommissionDuePart,
  type FinanceCaseRow,
} from '@/queries/financeDashboard'
import { localDateISO } from '@/lib/time'
import { PAYMENT_REFERENCE_MAX, moneyError } from '@/lib/validation'
import { StillNeeded } from '@/components/StillNeeded'
import { useDebouncedValue } from '@/lib/useDebounce'
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
 *
 * NOTHING IS WORKED OUT HERE (review F-300, 2026-10-10). As the draft changes — after a short
 * pause in typing — it is sent to `POST /commission-entries/{id}/receive/preview`, which writes
 * nothing and answers with the figures: what is outstanding, what the amount settles, whether it
 * is an over-payment and by how much. The warning, the tick and the amount offered in the box are
 * those answers. The server judges a receipt against the WHOLE case's ceiling (what is still
 * unpaid in the owed currency on the case, less credit already held), not against one part, and
 * the wording below says "on this case" for that reason.
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
  // What is offered in the amount box: the part's own unpaid amount. The server's figure
  // (`part_outstanding` of the preview) replaces this as soon as it arrives, until the amount is
  // touched.
  const [amount, setAmount] = useState(part ? String(part.outstanding ?? part.amount ?? '') : '')
  const [amountTouched, setAmountTouched] = useState(false)
  const [currency, setCurrency] = useState(part?.currency ?? currencies[0] ?? 'INR')
  const [receivedOn, setReceivedOn] = useState(localDateISO())
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const { keyFor, settle } = usePayloadIdempotencyKey()
  // Overpayment guard (review C5, 2026-09-12) — the preview says before the round trip whether
  // the amount is an over-payment, rather than waiting on the server's 409. Only ticking the
  // checkbox sends allow_overpayment: true.
  const [allowOverpayment, setAllowOverpayment] = useState(false)

  // "It arrived in another currency": what it settles, and at what rate.
  const [crossCurrency, setCrossCurrency] = useState(false)
  const [owedCurrency, setOwedCurrency] = useState(owedCurrencies.length === 1 ? owedCurrencies[0] : '')
  const [rate, setRate] = useState('')

  // With a part the dues settled are the part's own; otherwise the one chosen here.
  const settlesCurrency = part ? (part.currency ?? 'INR') : owedCurrency

  const parsed = Number(amount)
  const isValidAmount = amount.trim() !== '' && Number.isFinite(parsed) && moneyError(amount) === undefined

  const parsedRate = Number(rate)
  const rateGiven = rate.trim() !== ''
  const rateError = rateGiven && !(Number.isFinite(parsedRate) && parsedRate > 0) ? 'Enter a rate above zero.' : undefined
  const sameCurrencyError =
    crossCurrency && settlesCurrency !== '' && currency === settlesCurrency
      ? `Choose the currency the money arrived in. ${settlesCurrency} is the currency owed.`
      : undefined
  const crossInvalid = crossCurrency && (settlesCurrency === '' || Boolean(sameCurrencyError) || Boolean(rateError))

  // The draft as the receipt would be sent: asked of the server after a short pause in typing.
  // No amount goes while it is not a valid one; the answer then carries only what is outstanding.
  const sentCurrency = crossCurrency ? currency : part ? (part.currency ?? undefined) : currency
  const draft = useMemo(
    () => ({
      part_key: part?.key,
      currency: sentCurrency,
      amount: isValidAmount ? parsed : undefined,
      ...(crossCurrency
        ? {
            allow_cross_currency: true,
            owed_currency: part ? undefined : owedCurrency || undefined,
            rate: rateGiven && !rateError ? parsedRate : undefined,
          }
        : {}),
    }),
    [part, sentCurrency, isValidAmount, parsed, crossCurrency, owedCurrency, rateGiven, rateError, parsedRate],
  )
  const draftKey = JSON.stringify(draft)
  const settledDraftKey = useDebouncedValue(draftKey)
  const settledDraft = useMemo(() => JSON.parse(settledDraftKey) as typeof draft, [settledDraftKey])
  const previewReady = !crossInvalid && !(crossCurrency && !part && owedCurrency === '')
  const preview = useReceivePreview(caseRow.id, settledDraft, previewReady)
  // Only currencies that have an exchange rate today can be received (T4-10): any other is refused
  // by the server ("There is no exchange rate for …"). Until the first answer arrives the case's own
  // currencies and the common codes are listed, as before.
  const withRate = preview.data?.currencies_with_rate
  const offeredCurrencies = withRate && withRate.length > 0 ? withRate : currencies
  const picksCurrency = !part || crossCurrency
  useEffect(() => {
    // A held currency that is not on the served list is not offered, so the picker moves to one that is.
    if (picksCurrency && withRate && withRate.length > 0 && !withRate.includes(currency)) setCurrency(withRate[0])
  }, [picksCurrency, withRate, currency])
  // The figures belong to the draft they were asked for: not shown while the draft has moved on.
  const previewCurrent = settledDraftKey === draftKey && !preview.isFetching ? preview.data : undefined
  const previewRefusal =
    settledDraftKey === draftKey &&
    preview.error instanceof ApiError &&
    preview.error.status != null &&
    preview.error.status < 500
      ? preview.error
      : null

  // The amount offered in the box is the server's figure for the part, until the amount is touched.
  const offered = !crossCurrency && !amountTouched ? preview.data?.part_outstanding?.amount : undefined
  useEffect(() => {
    if (offered != null) setAmount(String(offered))
  }, [offered])

  // The server's own refusals. `more_than_outstanding` (the preview normally says so first): its
  // sentence names what is outstanding, and the same "record it anyway" tick answers it.
  const refusal = receiveDue.error instanceof ApiError ? receiveDue.error : null
  const serverSaysOverpayment = refusal?.code === 'more_than_outstanding'
  // Nothing is owed in the currency given: point at the other-currency path when it is not on.
  const notOwedHint = !crossCurrency && refusal?.code === 'currency_not_owed'
  // The same reference is already on a payment for this case (409 `already_exists`, review
  // I-026): the server's sentence is shown beside the Reference field.
  const duplicateReference = refusal?.code === 'already_exists' ? refusal.message : undefined

  const isOverpayment = previewCurrent?.is_overpayment === true
  const stillNeeded = [
    ...(isValidAmount ? [] : ['an amount']),
    ...(receivedOn ? [] : ['the date received']),
    ...(crossCurrency && settlesCurrency === '' ? ['the currency owed'] : []),
    ...(sameCurrencyError ? ['a currency different from the one owed'] : []),
    ...(crossCurrency && rateError ? ['a valid rate'] : []),
    ...((isOverpayment || serverSaysOverpayment) && !allowOverpayment ? ['the over-payment tick'] : []),
  ]
  const invalid = stillNeeded.length > 0

  // The server's sentence for the amount field (`details.fields`), when a save was refused on it.
  const amountFieldMessage = fieldMessages(receiveDue.error).amount

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
    setAmountTouched(false)
    if (!next && part) setCurrency(part.currency ?? 'INR')
  }

  return (
    <Modal
      onClose={onClose}
      title={part ? 'Mark as received' : 'Record a payment'}
      widthRem={26}
      footer={
        <>
          {receiveDue.isError && !serverSaysOverpayment && !duplicateReference && !amountFieldMessage && (
            <p role="alert" className="mr-auto self-center text-body-sm text-error">
              {receiveDue.error.message}
            </p>
          )}
          <StillNeeded items={stillNeeded} />
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
                currency: sentCurrency,
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
          <MoneyField
            label={crossCurrency ? 'Amount received' : 'Amount'}
            required
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value)
              setAmountTouched(true)
              clearServerOverpayment()
              if (amountFieldMessage) receiveDue.reset()
            }}
            error={amountFieldMessage}
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
              {offeredCurrencies.map((c) => (
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
        {previewCurrent && crossCurrency && previewCurrent.settles && (
          <p className="text-caption text-text-secondary">
            That settles {money(previewCurrent.settles)} of the {previewCurrent.owed_currency} dues
            {previewCurrent.rate != null && (
              <>
                {' '}
                {/* The rounded figure the server serves for showing (T4-10), as served. */}
                (1 {previewCurrent.currency} = {previewCurrent.rate_display ?? formatRate(previewCurrent.rate)}{' '}
                {previewCurrent.owed_currency})
              </>
            )}
            .
          </p>
        )}
        {previewCurrent && (
          <div className="flex flex-col gap-xs rounded-md border border-border bg-background px-sm py-xs">
            <CaseOwesRows
              dueNow={previewCurrent.due_now}
              dueNowInr={previewCurrent.due_now_inr}
              stillToCome={previewCurrent.still_to_come}
              stillToComeInr={previewCurrent.still_to_come_inr}
            />
          </div>
        )}
        {previewRefusal && !isOverpayment && !serverSaysOverpayment && (
          <p role="status" className="text-caption text-text-secondary">
            {previewRefusal.message}
          </p>
        )}
        {(isOverpayment || serverSaysOverpayment) && (
          <div className="flex flex-col gap-sm rounded-md border border-warning bg-warning-subtle p-sm">
            <p className="text-body-sm text-text-primary">
              {serverSaysOverpayment ? (
                refusal?.message
              ) : (
                <>
                  That&rsquo;s {money(previewCurrent?.overpaid_by)} more than this case can still receive (
                  {money(previewCurrent?.outstanding)}).
                </>
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
        <TextField
          label="Reference"
          value={reference}
          onChange={(e) => {
            setReference(e.target.value)
            // The refusal was about the reference as it was sent.
            if (duplicateReference) receiveDue.reset()
          }}
          maxLength={PAYMENT_REFERENCE_MAX}
          error={duplicateReference}
        />
        <TextAreaField kind="note" label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        <p className="text-caption text-text-secondary">
          Records the money as received — no declaration from the consultancy is needed. They&rsquo;re told.
        </p>
      </div>
    </Modal>
  )
}
