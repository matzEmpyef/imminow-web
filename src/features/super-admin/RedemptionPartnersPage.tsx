import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Settings } from 'lucide-react'
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
  useUpdateLocation,
  useUpdatePartner,
} from '@/queries/redemptionPartners'
import type { components } from '@/api/schema'

type RedemptionPartner = components['schemas']['RedemptionPartner']
type CodeMode = NonNullable<RedemptionPartner['code_mode']>

// Custom merchant codes (2026-09-11): at least 6 characters, capital letters/digits/dashes only,
// and unique across every branch on the server (409 code_taken if it collides) — validated here
// first so the admin gets an answer before the round trip, then the server's own message covers
// the case this can't catch (someone else already holding the code).
const CUSTOM_CODE_PATTERN = /^[A-Z0-9-]+$/
function customCodeError(code: string): string | undefined {
  if (!code) return undefined
  if (code.length < 6 || !CUSTOM_CODE_PATTERN.test(code)) {
    return 'At least 6 characters — capital letters, digits and dashes only.'
  }
  return undefined
}

// User-requested (2026-08-15) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
// `district`/`state` added (2026-09-11) — PartnerLocationInput has always carried them; the form
// only ever collected city + country. City and country stay required, matching the server.
function AddLocationForm({ partnerId, onClose }: { partnerId: string; onClose: () => void }) {
  const addLocation = useAddLocation(partnerId)
  const [city, setCity] = useState('')
  const [district, setDistrict] = useState('')
  const [state, setState] = useState('')
  const [country, setCountry] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!city || !country) return
    addLocation.mutate(
      { city, district: district || undefined, state: state || undefined, country },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Location"
      widthRem={26}
      footer={
        <>
          {addLocation.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{addLocation.error.message}</p>
          )}
          <Button
            type="submit"
            form="add-location-form"
            variant="secondary"
            loading={addLocation.isPending}
            disabled={!city || !country}
          >
            Add Location
          </Button>
        </>
      }
    >
      <form id="add-location-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="City" required value={city} onChange={(e) => setCity(e.target.value)} />
        <TextField label="District/County" value={district} onChange={(e) => setDistrict(e.target.value)} />
        <TextField label="State/Province" value={state} onChange={(e) => setState(e.target.value)} />
        <CountrySelect label="Country" required value={country} onChange={setCountry} />
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
// Custom codes are uppercased as typed and validated client-side (2026-09-11); the server's own
// 409 (code_taken — a duplicate across branches) surfaces below as rotateCode.error.message.
function PartnerDetailModal({ partner, onClose }: { partner: RedemptionPartner; onClose: () => void }) {
  const updatePartner = useUpdatePartner(partner.id!)
  const rotateCode = useRotateCode(partner.id!)
  const [showAddLocation, setShowAddLocation] = useState(false)
  const [sharedCodeDraft, setSharedCodeDraft] = useState('')
  const [locationCodeDrafts, setLocationCodeDrafts] = useState<Record<string, string>>({})
  // Confirm before switching code_mode (2026-09-11) — PATCHing a different code_mode now issues a
  // brand-new merchant code for every branch immediately, and every old code stops working right
  // then. `pendingCodeMode` holds the target value while the confirm is open; the select itself
  // stays bound to `partner.code_mode` so it visually reverts if the admin cancels.
  const [pendingCodeMode, setPendingCodeMode] = useState<CodeMode | null>(null)
  // Soft retire (user, 2026-09-03 — DB audit H4). Partners and locations are never deleted:
  // coupons and redemption history point at them. Retiring hides the partner from the coupon
  // picker and the student catalog and stops redemptions; reactivating brings it all back.
  // Retire gets a confirm (user: "wherever there is delete, confirm popup is needed" — this is
  // the closest thing to one); reactivate is a plain click, since it only restores.
  const updateLocation = useUpdateLocation(partner.id!)
  const [confirmRetire, setConfirmRetire] = useState<{ locationId?: string; label: string } | null>(null)
  const retired = partner.active === false

  function commitRetire() {
    if (!confirmRetire) return
    const done = { onSuccess: () => setConfirmRetire(null) }
    if (confirmRetire.locationId) updateLocation.mutate({ locationId: confirmRetire.locationId, active: false }, done)
    else updatePartner.mutate({ active: false }, done)
  }

  return (
    <Modal onClose={onClose} title={`${partner.name} — Manage`} widthRem={34}>
      <div className="flex flex-col gap-md">
        <div className="flex items-center justify-between gap-sm rounded-md border border-border bg-background p-sm">
          <div className="min-w-0">
            <p className="text-body-sm font-medium text-text-primary">
              {retired ? 'Retired' : 'Active'}{' '}
              {retired && <Badge color="secondary">not accepting coupons</Badge>}
            </p>
            <p className="text-caption text-text-secondary">
              {retired
                ? 'Hidden from the coupon picker and the student catalog. Coupons and redemption history are kept.'
                : 'Retire this partner if the merchant leaves the programme — nothing is deleted.'}
            </p>
          </div>
          {retired ? (
            <Button variant="secondary" loading={updatePartner.isPending} onClick={() => updatePartner.mutate({ active: true })}>
              Reactivate
            </Button>
          ) : (
            <Button variant="destructive" onClick={() => setConfirmRetire({ label: partner.name! })}>
              Retire Partner
            </Button>
          )}
        </div>
        {confirmRetire && (
          <Modal
            onClose={() => setConfirmRetire(null)}
            title={confirmRetire.locationId ? 'Retire Location' : 'Retire Partner'}
            widthRem={24}
            footer={
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" onClick={() => setConfirmRetire(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" loading={updatePartner.isPending || updateLocation.isPending} onClick={commitRetire}>
                  Retire
                </Button>
              </div>
            }
          >
            <p className="text-body-sm text-text-secondary">
              Retire <span className="font-medium text-text-primary">{confirmRetire.label}</span>?{' '}
              {confirmRetire.locationId
                ? 'Its merchant code will stop redeeming. Past redemptions are kept.'
                : 'All its coupons disappear from the student catalog and stop redeeming. Coupons and past redemptions are kept, and you can reactivate it later.'}
            </p>
          </Modal>
        )}
        <SelectField
          label="Code mode"
          id={`code-mode-${partner.id}`}
          value={partner.code_mode}
          onChange={(e) => {
            const next = e.target.value as CodeMode
            if (next !== partner.code_mode) setPendingCodeMode(next)
          }}
        >
          <option value="shared">Shared (one code, all locations)</option>
          <option value="per_location">Per location (independent codes)</option>
        </SelectField>
        {pendingCodeMode && (
          <Modal
            onClose={() => setPendingCodeMode(null)}
            title={pendingCodeMode === 'per_location' ? 'Switch to per-branch codes?' : 'Switch to one shared code?'}
            widthRem={24}
            footer={
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" onClick={() => setPendingCodeMode(null)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  loading={updatePartner.isPending}
                  onClick={() =>
                    updatePartner.mutate({ code_mode: pendingCodeMode }, { onSuccess: () => setPendingCodeMode(null) })
                  }
                >
                  Switch
                </Button>
              </div>
            }
          >
            <p className="text-body-sm text-text-secondary">
              {pendingCodeMode === 'per_location'
                ? 'Every branch gets its own brand-new merchant code right now.'
                : 'Every branch moves to one brand-new shared merchant code right now.'}{' '}
              The old codes stop working immediately — anyone still holding one can&rsquo;t redeem with it.
            </p>
            {updatePartner.isError && <p className="mt-sm text-body-sm text-error">{updatePartner.error.message}</p>}
          </Modal>
        )}
        {partner.code_mode === 'shared' && (
          <div className="flex flex-col gap-xs">
            <div className="flex items-end gap-sm">
              <TextField
                label="Custom code"
                value={sharedCodeDraft}
                onChange={(e) => setSharedCodeDraft(e.target.value.toUpperCase())}
                className="max-w-[12rem]"
              />
              <Button
                variant="secondary"
                loading={rotateCode.isPending}
                disabled={!sharedCodeDraft.trim() || Boolean(customCodeError(sharedCodeDraft.trim()))}
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
            {customCodeError(sharedCodeDraft.trim()) && (
              <p className="text-caption text-error">{customCodeError(sharedCodeDraft.trim())}</p>
            )}
          </div>
        )}
        {rotateCode.isError && <p className="text-body-sm text-error">{rotateCode.error.message}</p>}

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
                {loc.active === false ? (
                  <>
                    <Badge color="secondary">Retired</Badge>
                    <button
                      type="button"
                      onClick={() => updateLocation.mutate({ locationId: loc.id!, active: true })}
                      className="text-caption text-primary hover:underline"
                    >
                      Reactivate
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmRetire({ locationId: loc.id!, label: `${loc.city}${loc.state ? `, ${loc.state}` : ''}, ${loc.country}` })
                    }
                    className="text-caption text-error hover:underline"
                  >
                    Retire
                  </button>
                )}
              </div>
              {partner.code_mode === 'per_location' && (
                <div className="flex flex-col gap-xs">
                  <div className="flex items-end gap-sm">
                    <TextField
                      label="Custom code"
                      value={locationCodeDrafts[loc.id!] ?? ''}
                      onChange={(e) =>
                        setLocationCodeDrafts((prev) => ({ ...prev, [loc.id!]: e.target.value.toUpperCase() }))
                      }
                      className="max-w-[12rem]"
                    />
                    <Button
                      variant="secondary"
                      loading={rotateCode.isPending}
                      disabled={
                        !locationCodeDrafts[loc.id!]?.trim() ||
                        Boolean(customCodeError((locationCodeDrafts[loc.id!] ?? '').trim()))
                      }
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
                  {customCodeError((locationCodeDrafts[loc.id!] ?? '').trim()) && (
                    <p className="text-caption text-error">{customCodeError((locationCodeDrafts[loc.id!] ?? '').trim())}</p>
                  )}
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
// `contact_person`/`contact_phone` added (2026-09-11) — RedemptionPartnerInput has always carried
// them; Add Partner only ever collected name + category.
function AddPartnerForm({ onClose }: { onClose: () => void }) {
  const createPartner = useCreatePartner()
  const [name, setName] = useState('')
  const [category, setCategory] = useState('')
  const [contactPerson, setContactPerson] = useState('')
  const [contactPhone, setContactPhone] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createPartner.mutate(
      { name, category, contact_person: contactPerson, contact_phone: contactPhone },
      { onSuccess: () => onClose() },
    )
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
        <TextField label="Partner name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <TextField label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        <TextField label="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </form>
    </Modal>
  )
}

// Edit partner details (2026-09-11) — name/category/contact person/contact phone previously had
// no way to change past creation; code mode, locations and retire stay on the "Manage" popup,
// same split Coupons/Earn Rules use (Pencil = edit the record's own fields, a separate icon = the
// more involved management flow).
function EditPartnerModal({ partner, onClose }: { partner: RedemptionPartner; onClose: () => void }) {
  const updatePartner = useUpdatePartner(partner.id!)
  const [name, setName] = useState(partner.name ?? '')
  const [category, setCategory] = useState(partner.category ?? '')
  const [contactPerson, setContactPerson] = useState(partner.contact_person ?? '')
  const [contactPhone, setContactPhone] = useState(partner.contact_phone ?? '')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    updatePartner.mutate(
      { name, category, contact_person: contactPerson, contact_phone: contactPhone },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Edit Partner"
      widthRem={26}
      footer={
        <>
          {updatePartner.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updatePartner.error.message}</p>
          )}
          <Button type="submit" form="edit-partner-form" loading={updatePartner.isPending} disabled={!name}>
            Save Changes
          </Button>
        </>
      }
    >
      <form id="edit-partner-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <TextField label="Partner name" required value={name} onChange={(e) => setName(e.target.value)} />
        <TextField label="Category" value={category} onChange={(e) => setCategory(e.target.value)} />
        <TextField label="Contact person" value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
        <TextField label="Contact phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
      </form>
    </Modal>
  )
}

export function RedemptionPartnersPage() {
  const partners = useRedemptionPartners()
  const [editingId, setEditingId] = useState<string | null>(null)
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

  const editingPartner = editingId ? rows.find((p) => p.id === editingId) : undefined
  const managingPartner = managingId ? rows.find((p) => p.id === managingId) : undefined

  const columns: TableColumn<RedemptionPartner>[] = [
    {
      key: 'name',
      header: 'Partner',
      sortable: true,
      render: (p) => (
        <span className="flex items-center gap-xs">
          <span className={p.active === false ? 'font-medium text-text-secondary' : 'font-medium text-text-primary'}>{p.name}</span>
          {p.active === false && <Badge color="secondary">Retired</Badge>}
        </span>
      ),
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
        <div className="flex justify-end gap-xs">
          <button
            type="button"
            onClick={() => setEditingId(p.id!)}
            aria-label={`Edit ${p.name}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
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
        {editingPartner && <EditPartnerModal partner={editingPartner} onClose={() => setEditingId(null)} />}
        {managingPartner && <PartnerDetailModal partner={managingPartner} onClose={() => setManagingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id!}
          loading={partners.isLoading}
          error={partners.isError ? 'Could not load redemption partners.' : undefined}
          emptyMessage="No redemption partners yet. Add one so students have somewhere to spend their points."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search partner or category…' }}
        />
      </div>
    </AdminShell>
  )
}
