import { useEffect, useState } from 'react'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Modal } from '@/components/Modal'
import { useCommissionDefaults, useUpdateCommissionDefaults } from '@/queries/commissionRates'

// Narrow inline number field for "Consultancies [2.5]% · Universities [10]%" — a full TextField's
// 48px pill with a floating label reads as its own form row, which breaks the "one sentence with
// two numbers in it" shape this card is going for. No visible label of its own; the text around it
// (and aria-label) carries that instead. Width is inline style, not a max-w-[Nrem] class — arbitrary
// bracket values generate zero CSS in this project's Tailwind setup (see Modal.tsx).
function InlinePercentInput({
  value,
  onChange,
  ariaLabel,
}: {
  value: string
  onChange: (value: string) => void
  ariaLabel: string
}) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      step="0.1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={ariaLabel}
      style={{ width: '4.5rem' }}
      className="h-9 rounded-md border border-border bg-surface px-sm text-body-sm text-text-primary outline-none focus:border-2 focus:border-primary"
    />
  )
}

/**
 * The platform's cut when no CommissionRate row covers a case — never shown anywhere on the old
 * page, so a gap in coverage silently priced cases at a number nobody could see (Commission Rates
 * rebuild, 2026-09-11). Editable here, with a confirm step spelling out that the change only
 * affects cases accepted from now on — the same "applies going forward" rule the rate editor's
 * caption states for a single rate.
 */
export function CommissionDefaultsCard() {
  const defaults = useCommissionDefaults()
  const updateDefaults = useUpdateCommissionDefaults()
  const [consultancyPercent, setConsultancyPercent] = useState('')
  const [institutePercent, setInstitutePercent] = useState('')
  const [initialized, setInitialized] = useState(false)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    if (initialized || !defaults.data) return
    setConsultancyPercent(String(defaults.data.consultancy_percent))
    setInstitutePercent(String(defaults.data.institute_percent))
    setInitialized(true)
  }, [defaults.data, initialized])

  const consultancyChanged = initialized && Boolean(defaults.data) && Number(consultancyPercent) !== defaults.data!.consultancy_percent
  const instituteChanged = initialized && Boolean(defaults.data) && Number(institutePercent) !== defaults.data!.institute_percent
  const dirty = consultancyChanged || instituteChanged
  const validPercent = (v: string) => v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100
  const canSave = dirty && validPercent(consultancyPercent) && validPercent(institutePercent)

  function handleConfirm() {
    const body: { consultancy_percent?: number; institute_percent?: number } = {}
    if (consultancyChanged) body.consultancy_percent = Number(consultancyPercent)
    if (instituteChanged) body.institute_percent = Number(institutePercent)
    updateDefaults.mutate(body, { onSuccess: () => setConfirming(false) })
  }

  function handleCancelEdit() {
    if (!defaults.data) return
    setConsultancyPercent(String(defaults.data.consultancy_percent))
    setInstitutePercent(String(defaults.data.institute_percent))
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-md">
        <div>
          <h2 className="text-body-sm font-medium text-text-primary">When no rate is set</h2>
          <div className="mt-xs flex flex-wrap items-center gap-sm text-body-sm text-text-primary">
            <span>Consultancies</span>
            <InlinePercentInput value={consultancyPercent} onChange={setConsultancyPercent} ariaLabel="Default percent for consultancies" />
            <span>%</span>
            <span className="text-text-secondary">·</span>
            <span>Universities</span>
            <InlinePercentInput value={institutePercent} onChange={setInstitutePercent} ariaLabel="Default percent for universities" />
            <span>%</span>
          </div>
          <p className="mt-xs text-caption text-text-secondary">
            Consultancies charge students about 10%; immiNow&rsquo;s share is about a quarter of that.
          </p>
        </div>
        <div className="flex items-center gap-sm">
          {dirty && (
            <button type="button" onClick={handleCancelEdit} className="text-caption text-text-secondary hover:underline">
              Reset
            </button>
          )}
          <Button disabled={!canSave} loading={updateDefaults.isPending} onClick={() => setConfirming(true)}>
            Save
          </Button>
        </div>
      </div>
      {updateDefaults.isError && <p className="mt-sm text-body-sm text-error">{updateDefaults.error.message}</p>}

      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Change the default commission rate?"
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
          <p className="text-body-sm text-text-secondary">
            Cases accepted from now on with no rate set will use{' '}
            {consultancyChanged && (
              <>
                <span className="font-medium text-text-primary">{consultancyPercent}%</span> for consultancies
              </>
            )}
            {consultancyChanged && instituteChanged && ' and '}
            {instituteChanged && (
              <>
                <span className="font-medium text-text-primary">{institutePercent}%</span> for universities
              </>
            )}
            . Cases already accepted keep their rate.
          </p>
        </Modal>
      )}
    </Card>
  )
}
