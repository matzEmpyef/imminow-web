import { useState, type FormEvent } from 'react'
import { AdminShell } from '@/features/auth/AdminShell'
import { Card } from '@/components/Card'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Modal } from '@/components/Modal'
import { useCountries, useCreateCountry, useDeleteCountry } from '@/queries/countries'

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." Was a bare
// ✕ that removed the country immediately.
function DeleteCountryTrigger({ country }: { country: string }) {
  const deleteCountry = useDeleteCountry()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-caption text-error hover:underline"
        aria-label={`Remove ${country}`}
      >
        ✕
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Remove Country"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteCountry.isPending}
                onClick={() => deleteCountry.mutate(country, { onSuccess: () => setConfirming(false) })}
              >
                Remove
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Remove <span className="font-medium text-text-primary">{country}</span> from the shared list? Consultancies
            and catalog entries already using it are unaffected.
          </p>
        </Modal>
      )}
    </>
  )
}

// User-requested — the shared countries list (Consultancy Profile's Countries Served multiselect,
// Colleges & Courses' campus country, Commission Rates' destination country, Redemption Partners'
// location country) needed a place to actually manage it, not just read it. Same list+add+delete
// shape the old Tag Management page used before it got folded into Consultancy Management.
export function CountriesPage() {
  const countries = useCountries()
  const createCountry = useCreateCountry()
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    createCountry.mutate(name.trim(), { onSuccess: () => setName('') })
  }

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div>
          <h1 className="text-h1 text-text-primary">Countries</h1>
          <p className="text-body-sm text-text-secondary">
            The shared list every consultancy picks from for Countries Served, and every catalog country field
            (campuses, commission rates, redemption partners) draws from.
          </p>
        </div>

        <Card className="max-w-[32rem]">
          <form onSubmit={handleSubmit} className="flex items-end gap-sm">
            <TextField label="New country" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
            <Button type="submit" loading={createCountry.isPending} disabled={!name.trim()}>
              Add
            </Button>
          </form>
          {createCountry.isError && <p className="mt-sm text-body-sm text-error">{createCountry.error.message}</p>}
        </Card>

        <Card>
          {countries.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
          {countries.data?.length === 0 && <p className="text-body-sm text-text-secondary">No countries yet.</p>}
          <div className="flex flex-wrap gap-sm">
            {countries.data?.map((country) => (
              <div key={country} className="flex items-center gap-xs">
                <Badge color="secondary">{country}</Badge>
                <DeleteCountryTrigger country={country} />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </AdminShell>
  )
}
