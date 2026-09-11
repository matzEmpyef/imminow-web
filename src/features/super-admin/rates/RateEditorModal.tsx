import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { SelectField } from '@/components/SelectField'
import { useAdminConsultancy } from '@/queries/adminConsultancies'
import { useCommissionRates, useBulkSetCommissionRates } from '@/queries/commissionRates'
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
// to make easy to finish.
function matrixFromExistingRates(rates: CommissionRate[], country: string): MatrixState {
  const matrix = blankMatrix()
  for (const rate of rates) {
    if (rate.destination_country !== country) continue
    const method = rate.payer_method as PayerMethod
    if (!matrix[method]) continue
    matrix[method] = {
      direct: String(rate.direct_rate ?? ''),
      freelancer: String(rate.freelancer_sourced_rate ?? ''),
    }
  }
  return matrix
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
  const [touched, setTouched] = useState(false)
  // Validation is checked ON SAVE, not while typing (user, 2026-08-28: "do not have display
  // 'Direct % must be between 0 and 100' ... just make sure when saving") — errors render only
  // after a save attempt, and clear per row as the values are fixed.
  const [attempted, setAttempted] = useState(false)

  const consultancy = useAdminConsultancy(consultancyId || null)
  const ownRates = useCommissionRates(consultancyId || undefined, { enabled: Boolean(consultancyId) })
  const allCountries = useCountries()
  const bulkSet = useBulkSetCommissionRates()

  const consultancyName = consultancy.data?.name ?? defaultConsultancyName
  const freelancerEnabled = consultancy.data?.freelancer_enabled ?? false
  const freelancerDisabled = Boolean(consultancyId) && !freelancerEnabled
  const servedCountries = useMemo(() => [...(consultancy.data?.countries_served ?? [])].sort(), [consultancy.data])
  const countryOptions = showAllCountries || servedCountries.length === 0 ? (allCountries.data ?? []) : servedCountries

  // Re-seeds the matrix from whatever's already saved whenever the (consultancy, country) pair
  // resolves to a new one — covers the unlocked top-level flow, where picking a consultancy and
  // country that already has rates should show the edit form, not a blank one.
  useEffect(() => {
    if (touched) return
    if (consultancyId && country) {
      setMatrix(matrixFromExistingRates(ownRates.data ?? [], country))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ownRates and touched are read, not triggers: re-seeding on every rates refetch would wipe an open, untouched form back to server values
  }, [consultancyId, country])

  function setCell(method: PayerMethod, field: 'direct' | 'freelancer', value: string) {
    setTouched(true)
    setMatrix((prev) => ({ ...prev, [method]: { ...prev[method], [field]: value } }))
  }

  // Mirrors the server's own rule (mock-server/server.js resolveAndValidateFreelancerRate) so a
  // bad value never round-trips to the server just to be told no.
  const errors = useMemo(() => {
    const rowErrors: Partial<Record<PayerMethod, string>> = {}
    for (const { key } of RATE_GROUPS) {
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
  }, [matrix, freelancerDisabled])

  const canSubmit = Boolean(consultancyId) && Boolean(country)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSubmit) return
    if (Object.keys(errors).length > 0) {
      setAttempted(true)
      return
    }
    const rates = Object.fromEntries(
      RATE_GROUPS.map(({ key }) => {
        const direct = Number(matrix[key].direct)
        // Still sent even when hidden: freelancer_sourced_rate is required by the contract, and
        // the server auto-fills it equal to direct_rate for a channel-disabled consultancy
        // regardless of what's sent — hiding the input is a display decision, not a data one.
        const freelancer = freelancerDisabled ? direct : Number(matrix[key].freelancer)
        return [key, { direct_rate: direct, freelancer_sourced_rate: freelancer }]
      }),
    ) as {
      applicant: components['schemas']['CommissionRateBulkGroup']
      college: components['schemas']['CommissionRateBulkGroup']
      split: components['schemas']['CommissionRateBulkGroup']
      pr: components['schemas']['CommissionRateBulkGroup']
    }
    bulkSet.mutate(
      { consultancy_id: consultancyId, destination_country: country, rates },
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
          {bulkSet.isError && <p className="mr-auto self-center text-body-sm text-error">{bulkSet.error.message}</p>}
          <Button type="submit" form="rate-editor-form" loading={bulkSet.isPending} disabled={!canSubmit}>
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
      </form>
    </Modal>
  )
}
