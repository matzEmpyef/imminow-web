import { useMemo, useState, type FormEvent } from 'react'
import { Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Toggle } from '@/components/Toggle'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { PersonListModal } from '@/features/super-admin/PersonListModal'
import { useAdminCoupons, useCouponRedemptions, useCreateCoupon, useUpdateCoupon } from '@/queries/couponsAdmin'
import { useRedemptionPartners } from '@/queries/redemptionPartners'
import { formatDateTime } from '@/lib/time'
import type { components } from '@/api/schema'

type Coupon = components['schemas']['Coupon']
type RelevanceScope = NonNullable<Coupon['relevance_scope']>
type CouponType = NonNullable<Coupon['type']>

const relevanceScopeLabels: Record<RelevanceScope, string> = {
  city: 'City',
  district: 'District',
  state: 'State',
  country: 'Country',
}

// User-requested (2026-08-18) — "in Coupons, what is type... i think it should be drop down!!!"
// Was a free-text TextField with no enum anywhere in the schema, despite build reference 1.19's
// student-facing Coupons Catalog saying it "filters for type" — a filter only makes sense against
// a closed list. Fixed at the schema level too (openapi.yaml's Coupon/CouponInput/PATCH body,
// erd.md's coupons row), not just the UI — seed data's old "Discount"/"Voucher" values lowercased
// to match. Discount/Voucher/Freebie/Cashback confirmed with the user rather than invented.
const couponTypeLabels: Record<CouponType, string> = {
  discount: 'Discount',
  voucher: 'Voucher',
  freebie: 'Freebie',
  cashback: 'Cashback',
}

// User-requested (2026-08-18) — "Coupons - give option to edit not inline edit... give all
// option in edit mode." The old CouponEditor crammed a Stock field + Save button into the table
// row itself (an inline mini-form) and only ever exposed Stock — every other field the schema/
// backend has always supported (type, description, terms, thumbnail, expiry date, relevance
// scope) had no way to be set past creation, and even Add Coupon only collected 4 of the ~9
// fields. Rewritten as a combined Add/Edit popup (editingCoupon prop, same pattern as
// WebinarFormModal/JobFormModal) covering the full field set; Active stays a quick inline Toggle
// in the list, same convention Jobs/Earn Rules already use, since flipping a switch isn't the
// "inline edit" this request was about. Partner is only selectable at creation — PATCH
// /coupons/{id} deliberately excludes partner_id (a coupon belongs to the partner it was created
// for), so the edit view shows it as a read-only line instead of a field.
function CouponFormModal({ editingCoupon, onClose }: { editingCoupon?: Coupon; onClose: () => void }) {
  const isEditing = Boolean(editingCoupon)
  const createCoupon = useCreateCoupon()
  const updateCoupon = useUpdateCoupon(editingCoupon?.id ?? '')
  const partners = useRedemptionPartners()
  const [partnerId, setPartnerId] = useState('')
  const [pointCost, setPointCost] = useState(editingCoupon?.point_cost ?? 100)
  const [type, setType] = useState<CouponType>(editingCoupon?.type ?? 'discount')
  // Renamed from "Amount" to "Offer" (user-requested, 2026-08-19) — the schema field itself
  // stays `amount` (no backend/openapi change needed, just the label), since it's always held
  // free text like "10% off" or "Free consultation," not a currency amount.
  const [offer, setOffer] = useState(editingCoupon?.amount ?? '')
  const [description, setDescription] = useState(editingCoupon?.description ?? '')
  const [terms, setTerms] = useState(editingCoupon?.terms ?? '')
  const [thumbnailUrl, setThumbnailUrl] = useState(editingCoupon?.thumbnail_url ?? '')
  const [stock, setStock] = useState(editingCoupon?.stock ?? 50)
  const [expiryDate, setExpiryDate] = useState(editingCoupon?.expiry_date ?? '')
  const [relevanceScope, setRelevanceScope] = useState<RelevanceScope>(editingCoupon?.relevance_scope ?? 'district')

  const mutation = isEditing ? updateCoupon : createCoupon

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!isEditing && !partnerId) return
    const body = {
      point_cost: pointCost,
      type,
      amount: offer,
      description,
      terms,
      thumbnail_url: thumbnailUrl || null,
      stock,
      expiry_date: expiryDate || null,
      relevance_scope: relevanceScope,
    }
    if (isEditing) {
      updateCoupon.mutate(body, { onSuccess: () => onClose() })
    } else {
      createCoupon.mutate({ partner_id: partnerId, ...body, active: true }, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Coupon' : 'Add Coupon'}
      widthRem={38}
      footer={
        <>
          {mutation.isError && <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>}
          <Button type="submit" form="coupon-form" loading={mutation.isPending} disabled={!isEditing && !partnerId}>
            {isEditing ? 'Save Changes' : 'Create Coupon'}
          </Button>
        </>
      }
    >
      <form id="coupon-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        {editingCoupon ? (
          <p className="text-body-sm text-text-secondary">
            Partner: <span className="font-medium text-text-primary">{editingCoupon.partner_name}</span>
          </p>
        ) : (
          <SelectField
            label="Partner"
            required
            id="coupon-partner"
            value={partnerId}
            onChange={(e) => setPartnerId(e.target.value)}
          >
            <option value="">Select partner…</option>
            {/* Retired partners (2026-09-03) can't take new coupons — the server rejects it too. */}
            {partners.data?.filter((p) => p.active !== false).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        )}
        {/* User-requested (2026-08-19) — "add/edit popup... alignment of boxes in a row should
            be correct." TextField's label floats inside its own input box; FieldLabel+select
            puts the label in its own row above a shorter box — without `items-end` the two
            controls' boxes don't share a bottom edge. */}
        <div className="grid grid-cols-2 items-end gap-sm">
          <TextField label="Offer (e.g. 10% off)" required value={offer} onChange={(e) => setOffer(e.target.value)} />
          <SelectField
            label="Type"
            required
            id="coupon-type"
            value={type}
            onChange={(e) => setType(e.target.value as CouponType)}
          >
            <option value="discount">Discount</option>
            <option value="voucher">Voucher</option>
            <option value="freebie">Freebie</option>
            <option value="cashback">Cashback</option>
          </SelectField>
        </div>
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="coupon-description">Description</FieldLabel>
          <textarea
            id="coupon-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="coupon-terms">Terms &amp; conditions</FieldLabel>
          <textarea
            id="coupon-terms"
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            rows={2}
            className="rounded-md border border-border bg-surface p-sm text-body text-text-primary"
          />
        </div>
        <ImageUploadField
          label="Thumbnail"
          value={thumbnailUrl ?? ''}
          onChange={setThumbnailUrl}
          hint="Shown at 64×64 in the catalog and full-width (about 2:1) on the coupon page — keep the subject centred. Ideal size 800×400px."
        />
        <div className="grid grid-cols-3 items-end gap-sm">
          <TextField
            label="Point cost"
            type="number"
            required
            value={pointCost}
            onChange={(e) => setPointCost(Number(e.target.value))}
          />
          <TextField
            label="Stock"
            type="number"
            required
            value={stock}
            onChange={(e) => setStock(Number(e.target.value))}
          />
          <TextField
            label="Expiry date"
            type="date"
            value={expiryDate ?? ''}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
        <SelectField
          label="Relevance scope"
          required
          id="coupon-relevance"
          value={relevanceScope}
          onChange={(e) => setRelevanceScope(e.target.value as RelevanceScope)}
        >
          <option value="city">City</option>
          <option value="district">District</option>
          <option value="state">State</option>
          <option value="country">Country</option>
        </SelectField>
        <p className="text-caption text-text-secondary">
          How broadly this coupon sorts as relevant beyond the partner's own location. Doesn't hide it elsewhere — every
          coupon stays visible everywhere, this only affects sort order.
        </p>
      </form>
    </Modal>
  )
}

// Row-level component so useUpdateCoupon(coupon.id) can be called at its own render top level —
// Table's `render: (row) => ...` runs as a callback, not a component body.
function CouponToggle({ coupon }: { coupon: Coupon }) {
  const updateCoupon = useUpdateCoupon(coupon.id!)

  return (
    <div>
      <Toggle
        checked={Boolean(coupon.active)}
        onChange={(checked) => updateCoupon.mutate({ active: checked })}
        label={`${coupon.partner_name} coupon active`}
      />
    </div>
  )
}

// User-requested (2026-08-18) — "in Coupons - we need to see how many people claimed it," a bare
// count with no way to see who had no admin answer before this, same gap Quiz's leaderboard and
// Webinar/Physical Meeting's RSVP-Attended lists closed earlier this session. The full list is
// fetched lazily (only once the count is actually clicked, via `enabled`) and rendered on the
// shared PersonListModal — the same primitive built for exactly this shape of problem — rather
// than a new one-off popup.
// User-requested (2026-08-22) — "it would be great if we could see the count of consumed coupon
// per branch (if there are multiple branches)." Rendered inside the existing Claimed drill-down
// rather than as a new column: it is a breakdown OF that number, and a column of its own would
// have to summarise a variable-length list into a cell.
//
// `unattributed` is always shown when non-zero. Redemptions only name a branch when the partner
// issues a code per location, so hiding the remainder would let the branch rows read as the whole
// picture when they are a subset of it.
function BranchBreakdown({ breakdown }: { breakdown: NonNullable<Coupon['redemptions_by_location']> }) {
  const rows = breakdown.locations ?? []
  return (
    <div className="rounded-md border border-border bg-background p-sm">
      <p className="mb-xs text-body-sm font-medium text-text-primary">Claimed per branch</p>
      <ul className="flex flex-col gap-xs">
        {rows.map((l) => (
          <li key={l.location_id} className="flex items-baseline justify-between gap-sm text-body-sm">
            <span className="text-text-primary">
              {l.city || l.district || 'Unnamed branch'}
              {l.merchant_code && <span className="ml-xs text-caption text-text-secondary">{l.merchant_code}</span>}
            </span>
            <span className="tabular-nums text-text-primary">{l.count}</span>
          </li>
        ))}
        {breakdown.unattributed > 0 && (
          <li className="flex items-baseline justify-between gap-sm border-t border-border pt-xs text-body-sm">
            <span className="text-text-secondary">Not attributed to a branch</span>
            <span className="tabular-nums text-text-secondary">{breakdown.unattributed}</span>
          </li>
        )}
      </ul>
      {!breakdown.attributable && (
        <p className="mt-xs text-caption text-text-secondary">
          This partner uses one shared merchant code, so claims can&rsquo;t be traced to a branch. Give each location
          its own code under Redemption Partners to split this.
        </p>
      )}
    </div>
  )
}

function CouponClaimsCell({
  coupon,
  isOpen,
  onOpen,
  onClose,
}: {
  coupon: Coupon
  isOpen: boolean
  onOpen: () => void
  onClose: () => void
}) {
  const redemptions = useCouponRedemptions(isOpen ? coupon.id : undefined)

  return (
    <div>
      <button type="button" onClick={onOpen} className="text-body-sm text-primary hover:underline">
        {coupon.redemption_count ?? 0} claimed
      </button>

      {isOpen && (
        <PersonListModal
          title={`${coupon.partner_name} — Claimed`}
          rows={
            redemptions.isLoading
              ? []
              : (redemptions.data?.redemptions ?? []).map((r) => ({
                  name: r.student_name ?? '',
                  email: r.email ?? '',
                  studentType: r.student_type ?? 'aspirant',
                  updatedAt: r.redeemed_at ? formatDateTime(r.redeemed_at) : '',
                }))
          }
          emptyMessage={redemptions.isLoading ? 'Loading…' : 'No claims yet.'}
          intro={
            coupon.redemptions_by_location ? <BranchBreakdown breakdown={coupon.redemptions_by_location} /> : undefined
          }
          onClose={onClose}
        />
      )}
    </div>
  )
}

export function CouponsAdminPage() {
  const coupons = useAdminCoupons()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Which coupon's claims drill-down is open — page-level, so opening one closes any other.
  const [claimsId, setClaimsId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    let items = coupons.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((c) => c.partner_name?.toLowerCase().includes(q) || c.amount?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'point_cost'
            ? (a.point_cost ?? 0)
            : sort.field === 'stock'
              ? (a.stock ?? 0)
              : sort.field === 'redemption_count'
                ? (a.redemption_count ?? 0)
                : (a.partner_name ?? '').toLowerCase()
        const bv =
          sort.field === 'point_cost'
            ? (b.point_cost ?? 0)
            : sort.field === 'stock'
              ? (b.stock ?? 0)
              : sort.field === 'redemption_count'
                ? (b.redemption_count ?? 0)
                : (b.partner_name ?? '').toLowerCase()
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    }
    return items
  }, [coupons.data, search, sort])

  const editingCoupon = editingId ? rows.find((c) => c.id === editingId) : undefined

  const columns: TableColumn<Coupon>[] = [
    {
      key: 'partner_name',
      header: 'Partner',
      sortable: true,
      render: (c) => (
        <div className="flex flex-col gap-xs">
          <div className="flex items-center gap-sm">
            <span className="font-medium text-text-primary">{c.partner_name}</span>
            {c.stock === 0 && <Badge color="error">Out of stock</Badge>}
          </div>
          <p className="text-caption text-text-secondary">{c.amount || 'No offer set'}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Type', render: (c) => (c.type ? couponTypeLabels[c.type] : '—') },
    { key: 'point_cost', header: 'Points', sortable: true, align: 'right', render: (c) => `${c.point_cost} pts` },
    {
      key: 'stock',
      header: 'Stock',
      sortable: true,
      align: 'right',
      // User-requested (2026-08-19) — "if someone claims will stock reduce? if so show 39/40."
      // Today it doesn't: there's no student-facing claim flow anywhere yet (that's a Sentpo
      // Mobile screen, not built — same gap class as Earn Rules' profile-completion milestones),
      // so `POST /coupons/{id}/redeem` stays documented-but-unreachable from this web console.
      // Shown here as remaining/total anyway, computed from the real (if currently static) seed
      // redemption count against `stock` — genuinely correct today, and automatically live once
      // Mobile's claim flow exists and starts appending real redemptions.
      render: (c) => `${Math.max(0, (c.stock ?? 0) - (c.redemption_count ?? 0))}/${c.stock ?? 0}`,
    },
    {
      key: 'redemption_count',
      header: 'Claimed',
      sortable: true,
      align: 'right',
      render: (c) => (
        <CouponClaimsCell
          coupon={c}
          isOpen={claimsId === c.id}
          onOpen={() => setClaimsId(c.id ?? null)}
          onClose={() => setClaimsId(null)}
        />
      ),
    },
    {
      key: 'relevance_scope',
      header: 'Relevance',
      render: (c) => (c.relevance_scope ? relevanceScopeLabels[c.relevance_scope] : '—'),
    },
    { key: 'active', header: 'Status', render: (c) => <CouponToggle coupon={c} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingId(c.id!)}
            aria-label={`Edit ${c.partner_name} coupon`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
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
            <h1 className="text-h1 text-text-primary">Coupons</h1>
            <p className="text-body-sm text-text-secondary">
              Redeemable rewards, including out-of-stock and inactive ones.
            </p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Coupon</Button>
        </div>

        {showAdd && <CouponFormModal onClose={() => setShowAdd(false)} />}
        {editingCoupon && <CouponFormModal editingCoupon={editingCoupon} onClose={() => setEditingId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id!}
          loading={coupons.isLoading}
          error={coupons.isError ? 'Could not load coupons.' : undefined}
          emptyMessage="No coupons yet. Add one for students to claim with their points."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search partner or amount…' }}
        />
      </div>
    </AdminShell>
  )
}
