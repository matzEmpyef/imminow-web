import { useEffect, useState, type ReactNode } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useCommissionDefaults, useUpdateCommissionDefaults } from '@/queries/commissionRates'
import { showToast } from '@/lib/toast'

// Narrow inline number field — a full TextField's 48px pill with a floating label reads as its
// own form row, which is too heavy for a compact "value next to its hint" card row. No visible
// label of its own; the row's own label text (and aria-label) carries that instead. Width is
// inline style, not a max-w-[Nrem] class — arbitrary bracket values generate zero CSS in this
// project's Tailwind setup (see Modal.tsx).
function InlineNumberInput({
  value,
  onChange,
  ariaLabel,
  max = 100,
  step = '0.1',
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
  max?: number
  step?: string
}) {
  return (
    <input
      type="number"
      min={0}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{ width: '4.5rem' }}
      className="h-9 rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary outline-none focus:border-2 focus:border-primary"
    />
  )
}

function DefaultRow({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2xs rounded-md border border-border px-sm py-sm">
      <div className="flex items-center justify-between gap-sm">
        <span className="text-body-sm font-medium text-text-primary">{label}</span>
        {children}
      </div>
      <p className="text-caption text-text-secondary">{hint}</p>
    </div>
  )
}

type DefaultKey = 'consultancy_percent' | 'freelancer_percent' | 'institute_percent' | 'payment_terms_days'

const FIELDS: { key: DefaultKey; label: string; hint: string; unit: '%' | 'days'; ariaLabel: string; summary: (v: string) => string }[] = [
  {
    key: 'consultancy_percent',
    label: 'Consultancy',
    hint: '% of what the consultancy earns on a case — from the college, the student, or both.',
    unit: '%',
    ariaLabel: 'Default percent for consultancies',
    summary: (v) => `${v}% of what the consultancy earns`,
  },
  {
    key: 'freelancer_percent',
    label: 'Freelancer-brought',
    hint: '% of what the consultancy earns, when a freelancer brought the student.',
    unit: '%',
    ariaLabel: 'Default percent for freelancer-brought cases',
    summary: (v) => `${v}% when a freelancer brought the student`,
  },
  {
    key: 'institute_percent',
    label: 'University',
    hint: "% of the tuition fee — the course's listed fee, one year's when it's listed per year.",
    unit: '%',
    ariaLabel: 'Default percent for universities',
    summary: (v) => `${v}% of the tuition fee for universities`,
  },
  {
    key: 'payment_terms_days',
    label: 'Payment terms',
    hint: 'Days a consultancy has to pay a part of the share after it falls due.',
    unit: 'days',
    ariaLabel: 'Payment terms in days',
    summary: (v) => `${v} days to pay`,
  },
]

/**
 * The defaults used when no CommissionRate row covers a case, plus the payment terms — never shown
 * anywhere on the old page, so a gap in coverage silently priced cases at a number nobody could see
 * (Commission Rates rebuild, 2026-09-11). All four are editable, with a confirm step spelling out
 * that a rate change only prices cases accepted from now on — the same "applies going forward" rule
 * the rate editor's caption states for a single rate. Payment terms apply to parts falling due from
 * now on.
 *
 * Moved off the page into a Drawer (2026-09-11, user-requested — the page-level "Set rates" flow
 * was getting crowded): `variant="drawer"` drops the Card wrapper and the repeated "When no rate is
 * set" heading (the Drawer's own title bar already carries it) and forces the fields to one column,
 * since Tailwind's `sm:` breakpoint reads the viewport, not the Drawer's fixed 24rem panel — left as
 * `sm:grid-cols-2` in drawer mode it would still go two columns on a normal-width screen and squeeze
 * every field.
 */
export function CommissionDefaultsCard({ variant = 'page' }: { variant?: 'page' | 'drawer' } = {}) {
  const defaults = useCommissionDefaults()
  const updateDefaults = useUpdateCommissionDefaults()
  const [values, setValues] = useState<Record<DefaultKey, string>>({
    consultancy_percent: '',
    freelancer_percent: '',
    institute_percent: '',
    payment_terms_days: '',
  })
  const [initialized, setInitialized] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const fromServer = (data: typeof defaults.data): Record<DefaultKey, string> => ({
    consultancy_percent: String(data?.consultancy_percent ?? ''),
    freelancer_percent: String(data?.freelancer_percent ?? ''),
    institute_percent: String(data?.institute_percent ?? ''),
    payment_terms_days: String(data?.payment_terms_days ?? ''),
  })

  useEffect(() => {
    if (initialized || !defaults.data) return
    setValues(fromServer(defaults.data))
    setInitialized(true)
  }, [defaults.data, initialized])

  const changed = FIELDS.filter(
    (f) => initialized && defaults.data != null && Number(values[f.key]) !== Number(defaults.data[f.key]),
  )
  const valid = (f: (typeof FIELDS)[number]) => {
    const v = values[f.key]
    if (v === '' || Number.isNaN(Number(v)) || Number(v) < 0) return false
    return f.unit === 'days' ? Number.isInteger(Number(v)) && Number(v) <= 365 : Number(v) <= 100
  }
  const dirty = changed.length > 0
  const canSave = dirty && FIELDS.every(valid)

  function handleConfirm() {
    const body: Partial<Record<DefaultKey, number>> = {}
    for (const f of changed) body[f.key] = Number(values[f.key])
    updateDefaults.mutate(body, {
      onSuccess: () => {
        showToast('Commission defaults updated')
        setConfirming(false)
      },
    })
  }

  // Save (and Reset) moved below the fields, not beside the heading (product review L12,
  // 2026-09-12) — a button above the row it acts on reads as if it saves something already
  // visible above it; every other form footer in this console sits after its fields.
  const content = (
    <>
      {variant === 'page' ? (
        <div>
          <h2 className="text-body-sm font-medium text-text-primary">When no rate is set</h2>
          <p className="mt-2xs text-caption text-text-secondary">
            Applied to a case with no Commission Rates row. A change here prices cases accepted from then on — cases
            already accepted keep their rate.
          </p>
        </div>
      ) : (
        <p className="text-caption text-text-secondary">
          Applied to a case with no Commission Rates row. A change here prices cases accepted from then on — cases
          already accepted keep their rate.
        </p>
      )}

      <div className={`mt-md grid grid-cols-1 gap-sm ${variant === 'page' ? 'sm:grid-cols-2' : ''}`}>
        {FIELDS.map((f) => (
          <DefaultRow key={f.key} label={f.label} hint={f.hint}>
            <span className="flex items-center gap-xs">
              <InlineNumberInput
                value={values[f.key]}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))}
                ariaLabel={f.ariaLabel}
                max={f.unit === 'days' ? 365 : 100}
                step={f.unit === 'days' ? '1' : '0.1'}
              />
              <span className="text-body-sm text-text-primary">{f.unit}</span>
            </span>
          </DefaultRow>
        ))}
      </div>

      <div className="mt-md flex items-center justify-end gap-sm">
        {dirty && (
          <button
            type="button"
            onClick={() => setValues(fromServer(defaults.data))}
            className="text-caption text-text-secondary hover:underline"
          >
            Reset
          </button>
        )}
        <Button disabled={!canSave} loading={updateDefaults.isPending} onClick={() => setConfirming(true)}>
          Save
        </Button>
      </div>

      {updateDefaults.isError && <p className="mt-sm text-body-sm text-error">{updateDefaults.error.message}</p>}

      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Change the defaults?"
          widthRem={26}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button loading={updateDefaults.isPending} onClick={handleConfirm}>
                Confirm
              </Button>
            </div>
          }
        >
          <div className="flex flex-col gap-sm text-body-sm text-text-secondary">
            <ul className="flex flex-col gap-2xs">
              {changed.map((f) => (
                <li key={f.key}>
                  <span className="font-medium text-text-primary">{f.summary(values[f.key])}</span>
                </li>
              ))}
            </ul>
            <p>
              Rates apply to cases accepted from now on with no rate set — cases already accepted keep their rate.
              Payment terms apply to parts that fall due from now on.
            </p>
          </div>
        </Modal>
      )}
    </>
  )

  return variant === 'page' ? <Card>{content}</Card> : content
}
