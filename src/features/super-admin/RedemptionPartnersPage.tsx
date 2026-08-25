import { useMemo, useState, type FormEvent } from 'react'
import { Settings } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { CountrySelect } from '@/components/CountrySelect'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import {
  useAddLocation,
  useCreatePartner,
  useRedemptionPartners,
  useRotateCode,
  useUpdatePartner,
} from '@/queries/redemptionPartners'
import type { components } from '@/api/schema'

type RedemptionPartner = components['schemas']['RedemptionPartner']
type CodeMode = NonNullable<RedemptionPartner['code_mode']>

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function AddLocationForm({ partnerId, onClose }: { partnerId: string; onClose: () => void }) {
  const addLocation = useAddLocation(partnerId)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!city || !country) return
    addLocation.mutate({ city, country }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Location"
      widthRem={26}
      footer={
        <Button type="submit" form="add-location-form" variant="secondary" loading={addLocation.isPending}>
          Add Location
        </Button>
      }
    >
      <form id="add-location-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
        <CountrySelect label="Country" value={country} onChange={setCountry} />
      </form>
    </Modal>
  )
}

// User-requested (2026-08-18) — "in Redemption Partners, manage should happen on popup." Was a
// Table `expandable` row (PartnerDetail rendered inline below the partner's own row); now a
// Modal, same content — matching the popup convention every other "Manage"/"Edit" action in this
// admin console already uses.
// Custom-code inputs added same day (user: "if possible redemption code can be set by us") —
// after being shown the leaked-code/rotation tradeoff (build reference 1.8) the user confirmed
// they still want it, so "Set Code" now sits next to "Rotate" for both shared and per-location
// modes: Rotate always generates a random one (unchanged default), Set uses whatever's typed.
function PartnerDetailModal({ partner, onClose }: { partner: RedemptionPartner; onClose: () => void }) {
  const updatePartner = useUpdatePartner(partner.id!)
  const rotateCode = useRotateCode(partner.id!)
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [sharedCodeDraft, setSharedCodeDraft] = useState('')
  const [locationCodeDrafts, setLocationCodeDrafts] = useState<Record<string, string>>({})

  return (
    <Modal onClose={onClose} title={`${partner.name} — Manage`} widthRem={34}>
      <div className="flex flex-col gap-md">
        <SelectField
          label="Code mode"
          id={`code-mode-${partner.id}`}
          value={partner.code_mode}
          onChange={(e) => updatePartner.mutate({ code_mode: e.target.value as CodeMode })}
        >
          <option value="shared">Shared (one code, all locations)</option>
          <option value="per_location">Per location (independent codes)</option>
        </SelectField>
        {partner.code_mode === 'shared' && (
          <div className="flex items-end gap-sm">
            <TextField
              label="Custom code"
              value={sharedCodeDraft}
              onChange={(e) => setSharedCodeDraft(e.target.value)}
              className="max-w-[12rem]"
            />
            <Button
              variant="secondary"
              loading={rotateCode.isPending}
              disabled={!sharedCodeDraft.trim()}
              onClick={() =>
                rotateCode.mutate({ code: sharedCodeDraft.trim() }, { onSuccess: () => setSharedCodeDraft('') })
              }
            >
              Set Code
            </Button>
            <Button variant="secondary" loading={rotateCode.isPending} onClick={() => rotateCode.mutate({})}>
              Rotate Shared Code
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-xs">
          <p className="text-body-sm font-medium text-text-primary">Locations</p>
          {partner.locations?.length === 0 && <p className="text-caption text-text-secondary">No locations yet.</p>}
          {partner.locations?.map((loc) => (
            <div key={loc.id} className="flex flex-col gap-xs rounded-md border border-border p-sm">
              <div className="flex items-center gap-sm">
                <span className="min-w-0 flex-1 text-body-sm text-text-primary">
                  {loc.city}
                  {loc.state ? `, ${loc.state}` : ''}, {loc.country}
                </span>
                <Badge color="info">{loc.merchant_code}</Badge>
              </div>
              {partner.code_mode === 'per_location' && (
                <div className="flex items-end gap-sm">
                  <TextField
                    label="Custom code"
                    value={locationCodeDrafts[loc.id!] ?? ''}
                    onChange={(e) => setLocationCodeDrafts((prev) => ({ ...prev, [loc.id!]: e.target.value }))}
                    className="max-w-[12rem]"
                  />
                  <Button
                    variant="secondary"
                    loading={rotateCode.isPending}
                    disabled={!locationCodeDrafts[loc.id!]?.trim()}
                    onClick={() =>
                      rotateCode.mutate(
                        { locationId: loc.id, code: locationCodeDrafts[loc.id!]!.trim() },
                        { onSuccess: () => setLocationCodeDrafts((prev) => ({ ...prev, [loc.id!]: '' })) },
                      )
                    }
                  >
                    Set Code
                  </Button>
                  <Button
                    variant="secondary"
                    loading={rotateCode.isPending}
                    onClick={() => rotateCode.mutate({ locationId: loc.id })}
                  >
                    Rotate Code
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>

        <button onClick={() => setShowAddLocation(true)} className="w-fit text-caption text-primary hover:underline">
          + Add location
        </button>
        {showAddLocation && <AddLocationForm partnerId={partner.id!} onClose={() => setShowAddLocation(false)} />}
      </div>
    </Modal>
  )
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
function AddPartnerForm({ onClose }: { onClose: () => void }) {
  const createPartner = useCreatePartner()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createPartner.mutate({ name, category }, { onSuccess: () => onClose() })
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Partner"
      widthRem={26}
      footer={
        <>
          {createPartner.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{createPartner.error.message}</p>
          )}
          <Button type="submit" form="add-partner-form" loading={createPartner.isPending} disabled={!name}>
            Create Partner
          </Button>
        </>
      }
    >
      <form id="add-partner-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Partner name" value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
      </form>
    </Modal>
  )
}

export function RedemptionPartnersPage() {
  const partners = useRedemptionPartners()
  const [managingId, setManagingId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = partners.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((p) => p.name?.toLowerCase().includes(q) || p.category?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av = sort.field === 'locations' ? (a.locations?.length ?? 0) : (a.name ?? '').toLowerCase()
        const bv = sort.field === 'locations' ? (b.locations?.length ?? 0) : (b.name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [partners.data, search, sort])

  const managingPartner = managingId ? rows.find((p) => p.id === managingId) : undefined

  const columns: TableColumn<RedemptionPartner>[] = [
    {
      key: 'name',
      header: 'Partner',
      sortable: true,
      render: (p) => <span className="font-medium text-text-primary">{p.name}</span>,
    },
    {
      key: 'category',
      header: 'Category',
      render: (p) => <Badge color="secondary">{p.category || 'Uncategorized'}</Badge>,
    },
    {
      key: 'code_mode',
      header: 'Code Mode',
      render: (p) => <Badge color="primary">{p.code_mode === 'shared' ? 'Shared code' : 'Per-location codes'}</Badge>,
    },
    { key: 'locations', header: 'Locations', sortable: true, align: 'right', render: (p) => p.locations?.length ?? 0 },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (p) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setManagingId(p.id!)}
            aria-label={`Manage ${p.name}`}
            title="Manage"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Redemption Partners</h1>
            <p className="text-body-sm text-text-secondary">Merchants and their locations behind the coupon catalog.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Partner</Button>
        </div>

        {showAdd && <AddPartnerForm onClose={() => setShowAdd(false)} />}
        {managingPartner && <PartnerDetailModal partner={managingPartner} onClose={() => setManagingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id!}
          loading={partners.isLoading}
          emptyMessage="No redemption partners yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search partner or category…' }}
        />
      </div>
    </AdminShell>
  )
}
