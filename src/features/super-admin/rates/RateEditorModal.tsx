import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { useAdminConsultancy } from '@/queries/adminConsultancies'
import { useCommissionRates, useSaveCommissionRateRows } from '@/queries/commissionRates'
import { useCountries } from '@/queries/countries'
import { ConsultancySearchSelect } from '../finance/ConsultancySearchSelect'
import { showToast } from '@/lib/toast'
import type { components } from '@/api/schema'

type CommissionRate = components['schemas']['CommissionRate']
type PayerMethod = NonNullable<CommissionRate['payer_method']>

const RATE_GROUPS: { key: PayerMethod; label: string }[] = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'college', label: 'College' },
  { key: 'split', label: 'Split' },
  // Rates-config-only dimension (2026-08-28): prices PR cases for the country. Journeys never
  // carry `pr` as a payer — a PR entry's payer is always the applicant.
  { key: 'pr', label: 'PR case' },
]

interface MatrixRow {
  direct: string
  freelancer: string
}
type MatrixState = Record<PayerMethod, MatrixRow>
type RateIdState = Partial<Record<PayerMethod, string>>

function blankMatrix(): MatrixState {
  return {
    applicant: { direct: '', freelancer: '' },
    college: { direct: '', freelancer: '' },
    split: { direct: '', freelancer: '' },
    pr: { direct: '', freelancer: '' },
  }
}

// Builds the matrix's starting values from whatever rows already exist for this country — one
// payer group may be set and the other three blank, which is exactly the case this modal exists
// to make easy to finish. Also hands back each row's id, keyed by payer method — needed so Save
// knows which filled rows are an update (PATCH) versus a brand-new one (POST).
function fromExistingRates(rates: CommissionRate[], country: string): { matrix: MatrixState; ids: RateIdState } {
  const matrix = blankMatrix()
  const ids: RateIdState = {}
  for (const rate of rates) {
    if (rate.destination_country !== country) continue
    const method = rate.payer_method as PayerMethod
    if (!matrix[method]) continue
    matrix[method] = {
      direct: String(rate.direct_rate ?? ''),
      freelancer: String(rate.freelancer_sourced_rate ?? ''),
    }
    if (rate.id) ids[method] = rate.id
  }
  return { matrix, ids }
}

/**
 * The one edit path for commission rates (Commission Rates rebuild, 2026-09-11 — the old page had
 * two: an inline per-row Save that never showed errors and saved 0 when cleared, plus this matrix
 * popup; the inline path is gone, this is now the only way to change a rate).
 *
 * Two changes from the version this replaces:
 * - The consultancy picker is a searchable {@link ConsultancySearchSelect} instead of a plain
 *   `<select>` of the first 100 consultancies — a name past that page was previously unreachable.
 * - The country select defaults to only the chosen account's SERVED countries (the whole reason a
 *   gap exists is a served country with no rate — showing the full country catalogue by default
 *   buried that handful of countries in a hundred irrelevant ones) with a "Show all countries"
 *   escape hatch for the rare case of pre-configuring a country before the consultancy adds it.
 *
 * Rates are fetched scoped to the chosen consultancy only (`useCommissionRates(consultancyId)`),
 * never the whole platform's rate table — the thing the old page's summary list did and this
 * rebuild's coverage table exists specifically to stop doing.
 */
export function RateEditorModal({
  onClose,
  defaultConsultancyId,
  defaultConsultancyName,
  defaultCountry,
  lockConsultancy,
  lockCountry,
}: {
  onClose: () => void
  defaultConsultancyId?: string
  /** Avoids waiting on a consultancy detail fetch just to show the name a caller already has (Drawer). */
  defaultConsultancyName?: string
  defaultCountry?: string
  lockConsultancy?: boolean
  lockCountry?: boolean
}) {
  const [consultancyId, setConsultancyId] = useState(defaultConsultancyId ?? '')
  const [country, setCountry] = useState(defaultCountry ?? '')
  const [showAllCountries, setShowAllCountries] = useState(false)
  const [matrix, setMatrix] = useState<MatrixState>(blankMatrix())
  const [existingIds, setExistingIds] = useState<RateIdState>({})
  const [touched, setTouched] = useState(false)
  // Validation is checked ON SAVE, not while typing (user, 2026-08-28: "do not have display
  // 'Direct % must be between 0 and 100' ... just make sure when saving") — errors render only
  // after a save attempt, and clear per row as the values are fixed.
  const [attempted, setAttempted] = useState(false)

  const consultancy = useAdminConsultancy(consultancyId || null)
  const ownRates = useCommissionRates(consultancyId || undefined, { enabled: Boolean(consultancyId) })
  const allCountries = useCountries()
  const saveRows = useSaveCommissionRateRows()

  const consultancyName = consultancy.data?.name ?? defaultConsultancyName
  // The account's answer is only known once the detail fetch lands. An in-flight fetch used to
  // read as `freelancer_enabled: false` — the Freelancer % inputs were hidden and a save made in
  // that window silently persisted freelancer = direct on an account that has the channel on
  // (assumptions audit H15, approved 2026-09-19). So: no matrix at all until the query settles.
  const consultancyPending = Boolean(consultancyId) && consultancy.isPending
  const freelancerEnabled = consultancy.data?.freelancer_enabled ?? false
  const freelancerDisabled = Boolean(consultancyId) && !consultancyPending && !freelancerEnabled
  const servedCountries = useMemo(() => [...(consultancy.data?.countries_served ?? [])].sort(), [consultancy.data])
  const countryOptions = showAllCountries || servedCountries.length === 0 ? (allCountries.data ?? []) : servedCountries

  // The saved rates are only known once this account's rates fetch lands. Seeding before that
  // showed a blank matrix for a country that already had rates, and saving it POSTed a duplicate
  // row per payer group instead of PATCHing the existing ones (Phase 5, W-STATE-1). So the matrix
  // waits behind the same loading state as the account fetch above.
  const ratesPending = Boolean(consultancyId) && ownRates.isPending
  const ratesError = Boolean(consultancyId) && ownRates.isError

  // Seeds the matrix from whatever's already saved once per (consultancy, country) pair, as soon
  // as that account's rates have loaded — covers the unlocked top-level flow, where picking a
  // consultancy and country that already has rates should show the edit form, not a blank one.
  // Not on every later rates refetch (that would wipe an open form back to server values), and
  // never over something the user has already typed.
  const seededFor = useRef<string | null>(null)
  useEffect(() => {
    if (touched) return
    if (!consultancyId || !country || !ownRates.data) return
    const pair = `${consultancyId}|${country}`
    if (seededFor.current === pair) return
    seededFor.current = pair
    const { matrix: seeded, ids } = fromExistingRates(ownRates.data, country)
    setMatrix(seeded)
    setExistingIds(ids)
  }, [consultancyId, country, ownRates.data, touched])

  function setCell(method: PayerMethod, field: 'direct' | 'freelancer', value: string) {
    setTouched(true)
    setMatrix((prev) => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
  }

  // A blank row means "no rate yet" — not a validation error (2026-09-12, product review H3).
  // Only a row with something typed into it gets checked, and mirrors the server's own rule
  // (mock-server/server.js resolveAndValidateFreelancerRate) so a bad value never round-trips to
  // the server just to be told no.
  const filledKeys = useMemo(
    () => RATE_GROUPS.map((g) => g.key).filter((key) => matrix[key].direct !== '' || matrix[key].freelancer !== ''),
    [matrix],
  )

  const errors = useMemo(() => {
    const rowErrors: Partial<Record<PayerMethod, string>> = {}
    for (const key of filledKeys) {
      const direct = Number(matrix[key].direct)
      const freelancer = Number(matrix[key].freelancer)
      if (matrix[key].direct === '' || Number.isNaN(direct) || direct < 0 || direct > 100) {
        rowErrors[key] = 'Direct % must be between 0 and 100.'
        continue
      }
      if (freelancerDisabled) continue
      if (matrix[key].freelancer === '' || Number.isNaN(freelancer) || freelancer < 0 || freelancer > 100) {
        rowErrors[key] = 'Freelancer-sourced % must be between 0 and 100.'
        continue
      }
      if (freelancer <= direct) {
        rowErrors[key] = 'Freelancer-sourced % must be greater than the direct %.'
      }
    }
    return rowErrors
  }, [matrix, freelancerDisabled, filledKeys])

  const canSubmit =
    Boolean(consultancyId) &&
    Boolean(country) &&
    !consultancyPending &&
    !consultancy.isError &&
    !ratesPending &&
    !ratesError
  const noRowsFilledError = attempted && filledKeys.length === 0 ? 'Fill in at least one payer group before saving.' : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (filledKeys.length === 0 || Object.keys(errors).length > 0) {
      setAttempted(true)
      return
    }
    const rows = filledKeys.map((key) => {
      const direct = Number(matrix[key].direct)
      // Still sent even when hidden: freelancer_sourced_rate is required by the contract, and the
      // server auto-fills it equal to direct_rate for a channel-disabled consultancy regardless of
      // what's sent — hiding the input is a display decision, not a data one.
      const freelancer = freelancerDisabled ? direct : Number(matrix[key].freelancer)
      return { id: existingIds[key], payer_method: key, direct_rate: direct, freelancer_sourced_rate: freelancer }
    })
    saveRows.mutate(
      { consultancy_id: consultancyId, destination_country: country, rows },
      {
        onSuccess: () => {
          showToast(`Rates saved for ${consultancyName || 'this account'} — ${country}`)
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title={country ? `Rates — ${country}` : 'Set Rates'}
      widthRem={38}
      footer={
        <>
          {(noRowsFilledError || saveRows.isError) && (
            <p className="mr-auto self-center text-body-sm text-error">
              {noRowsFilledError ?? saveRows.error?.message}
            </p>
          )}
          <Button type="submit" form="rate-editor-form" loading={saveRows.isPending} disabled={!canSubmit}>
            Save
          </Button>
        </>
      }
    >
      <form id="rate-editor-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-caption text-text-secondary">
          Applies to cases accepted from now on. Cases already accepted keep the rate they were priced at.
        </p>
        <p className="text-caption text-text-secondary">
          Direct % is immiNow&rsquo;s share of what the consultancy earns on a case (from the college, the student, or
          both); Freelancer % is that same share of the consultancy&rsquo;s commission on a freelancer-brought case.
        </p>

        {lockConsultancy ? (
          <div className="flex flex-col gap-xs">
            <span className="text-caption text-text-secondary">Consultancy</span>
            <p className="text-body-sm font-medium text-text-primary">{consultancyName}</p>
          </div>
        ) : (
          <ConsultancySearchSelect
            value={consultancyId}
            onChange={(id) => {
              setConsultancyId(id)
              setTouched(false)
              seededFor.current = null
              setCountry('')
            }}
            placeholder="Search consultancy or university…"
          />
        )}

        {lockCountry ? (
          <div className="flex flex-col gap-xs">
            <span className="text-caption text-text-secondary">Destination country</span>
            <p className="text-body-sm font-medium text-text-primary">{country}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-xs">
            <SelectField
              label="Destination country"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              disabled={!consultancyId}
            >
              <option value="">Select…</option>
              {countryOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </SelectField>
            {consultancyId && servedCountries.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllCountries((v) => !v)}
                className="w-fit text-caption text-primary hover:underline"
              >
                {showAllCountries ? 'Show only served countries' : 'Show all countries'}
              </button>
            )}
          </div>
        )}

        {consultancyPending || ratesPending ? (
          <div className="flex flex-col gap-md rounded-md bg-background p-md">
            <p className="text-caption text-text-secondary">Loading this account&rsquo;s settings…</p>
            {RATE_GROUPS.map(({ key }) => (
              <Skeleton key={key} className="h-16 rounded-md" />
            ))}
          </div>
        ) : consultancy.isError ? (
          <ErrorState message="Could not load this account&rsquo;s settings, so the rates cannot be edited safely." onRetry={() => consultancy.refetch()} />
        ) : ratesError ? (
          <ErrorState message="Could not load this account&rsquo;s saved rates, so the rates cannot be edited safely." onRetry={() => ownRates.refetch()} />
        ) : (
        <div className="flex flex-col gap-md rounded-md bg-background p-md">
          {RATE_GROUPS.map(({ key, label }) => (
            <div key={key} className="flex flex-col gap-xs border-b border-border pb-md last:border-0 last:pb-0">
              <div className="flex items-center gap-sm">
                {/* PR rows get their own tint so student pricing and PR pricing read apart at a
                    glance — same convention the account drawer uses for the read-only view. */}
                <Badge color={key === 'pr' ? 'primary' : 'info'} className="w-24 shrink-0 justify-center">
                  {label}
                </Badge>
                {/* flex-1, not a max-w bracket class — arbitrary bracket values generate zero
                    CSS in this project's Tailwind setup (see Modal.tsx), so the old cap never
                    applied and the row's flex squeezed these narrow. */}
                <TextField
                  label="Direct %"
                  type="number"
                  min={0}
                  max={100}
                  value={matrix[key].direct}
                  onChange={(e) => setCell(key, 'direct', e.target.value)}
                  className="flex-1"
                />
                {!freelancerDisabled && (
                  <TextField
                    label="Freelancer %"
                    type="number"
                    min={0}
                    max={100}
                    value={matrix[key].freelancer}
                    onChange={(e) => setCell(key, 'freelancer', e.target.value)}
                    className="flex-1"
                    // Hint added 2026-09-11 (user): this is what immiNow charges the CONSULTANCY on a
                    // freelancer-brought case, not the freelancer's own cut — that's set separately.
                    title="What immiNow charges the consultancy when a freelancer brought the student. The freelancer's own share is set on the Freelancers page."
                  />
                )}
              </div>
              {attempted && errors[key] && <p className="text-caption text-error">{errors[key]}</p>}
            </div>
          ))}
          {freelancerDisabled && (
            <p className="text-caption text-text-secondary">
              Freelancer channel is off for this consultancy — every freelancer-sourced % is auto-set equal to its
              direct %.
            </p>
          )}
        </div>
        )}
      </form>
    </Modal>
  )
}
