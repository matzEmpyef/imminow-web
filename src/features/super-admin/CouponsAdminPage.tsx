import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Pencil, Ticket } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Toggle } from '@/components/Toggle'
import { CompactSelect } from '@/components/CompactSelect'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { PersonListModal } from '@/features/super-admin/PersonListModal'
import {
  useAddVoucherCodes,
  useAdminCoupons,
  useCouponLimits,
  useCouponRedemptions,
  useCreateCoupon,
  useRemoveVoucherCode,
  useUpdateCoupon,
  useUpdateCouponLimits,
  useVoucherCodes,
} from '@/queries/couponsAdmin'
import { useRedemptionPartners } from '@/queries/redemptionPartners'
import { showToast } from '@/lib/toast'
import { formatDate, formatDateTime } from '@/lib/time'
import { mediaUrl } from '@/lib/mediaUrl'
import type { components } from '@/api/schema'

type Coupon = components['schemas']['Coupon']
type RelevanceScope = NonNullable<Coupon['relevance_scope']>
type CouponType = NonNullable<Coupon['type']>
type CouponStatus = NonNullable<Coupon['status']>
type VoucherCode = components['schemas']['VoucherCode']

const relevanceScopeLabels: Record<RelevanceScope, string> = {
  city: 'City',
  district: 'District/County',
  state: 'State/Province',
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

// Server-computed lifecycle state (2026-09-11) — replaces the old client-side `stock === 0`
// guess, which could only ever say "Out of stock" and had no idea about expiry, the Active
// toggle, or a retired partner. The server now derives all five states in one place.
const statusMeta: Record<CouponStatus, { label: string; color: 'success' | 'warning' | 'secondary' }> = {
  live: { label: 'Live', color: 'success' },
  out_of_stock: { label: 'Out of stock', color: 'warning' },
  expired: { label: 'Expired', color: 'secondary' },
  off: { label: 'Off', color: 'secondary' },
  partner_retired: { label: 'Partner retired', color: 'secondary' },
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

  // Digital vouchers (2026-09-15) — stock comes from the code pool (see the Codes modal) and
  // relevance is always country, so both fields are pointless here; the server ignores them if
  // sent anyway, but hiding them is what actually tells the admin not to bother. On create, the
  // partner isn't picked from `editingCoupon` yet, so its kind is looked up from the partner list.
  const selectedPartner = isEditing ? undefined : partners.data?.find((p) => p.id === partnerId)
  const isOnlinePartner = (isEditing ? editingCoupon?.partner_kind : selectedPartner?.kind) === 'online'

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
      expiry_date: expiryDate || null,
      ...(isOnlinePartner ? {} : { stock, relevance_scope: relevanceScope }),
    }
    if (isEditing) {
      updateCoupon.mutate(body, {
        onSuccess: () => {
          showToast('Coupon saved')
          onClose()
        },
      })
    } else {
      createCoupon.mutate(
        { partner_id: partnerId, ...body, active: true },
        {
          onSuccess: () => {
            showToast('Coupon created')
            onClose()
          },
        },
      )
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Coupon' : 'Add Coupon'}
      widthRem={38}
      footer={
        <>
          {/* Server validation (2026-09-11) — point_cost/stock must be whole numbers within
              range, expiry can't be in the past on create, etc. ApiError already surfaces the
              server's own readable error.message here; no need to duplicate its checks client-side. */}
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
        <div className={`grid items-end gap-sm ${isOnlinePartner ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <TextField
            label="Point cost"
            type="number"
            required
            value={pointCost}
            onChange={(e) => setPointCost(Number(e.target.value))}
          />
          {!isOnlinePartner && (
            <TextField
              label="Total stock"
              type="number"
              required
              value={stock}
              onChange={(e) => setStock(Number(e.target.value))}
            />
          )}
          <TextField
            label="Expiry date"
            type="date"
            value={expiryDate ?? ''}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </div>
        {isOnlinePartner ? (
          <p className="text-caption text-text-secondary">Stock is the number of codes you add.</p>
        ) : (
          <p className="text-caption text-text-secondary">
            How many can be claimed in all. Can&rsquo;t go below what&rsquo;s already claimed.
          </p>
        )}
        {!isOnlinePartner && (
          <>
            <SelectField
              label="Relevance scope"
              required
              id="coupon-relevance"
              value={relevanceScope}
              onChange={(e) => setRelevanceScope(e.target.value as RelevanceScope)}
            >
              <option value="city">City</option>
              <option value="district">District/County</option>
              <option value="state">State/Province</option>
              <option value="country">Country</option>
            </SelectField>
            {/* Corrected 2026-09-11 — this used to tell admins relevance was purely cosmetic. The
                student catalog now actually ranks by it (relevant coupons surface first); Country is
                the one scope that still hides, since a coupon a student could never redeem shouldn't
                rank at all. */}
            <p className="text-caption text-text-secondary">
              How closely this coupon must match a student&rsquo;s location. Relevant coupons rank first in their
              catalog — every scope other than Country still shows the coupon everywhere else, just lower down.
              Country is the one exception: it hides the coupon entirely from students resident in a different
              country.
            </p>
          </>
        )}
      </form>
    </Modal>
  )
}

const voucherStatusMeta: Record<VoucherCode['status'], { label: string; color: 'success' | 'secondary' }> = {
  available: { label: 'Available', color: 'success' },
  issued: { label: 'Issued', color: 'secondary' },
}

// Splits pasted/uploaded text into codes: one per line, or comma-separated within a line — the
// upload button also accepts a plain single-column CSV, which is the same shape. Blank lines and
// stray whitespace are dropped here so a paste with trailing newlines doesn't count as a 5000+1.
function splitCodes(text: string): string[] {
  return text
    .split(/[\n,]+/)
    .map((c) => c.trim())
    .filter(Boolean)
}

const MAX_CODES_PER_REQUEST = 5000

// The code pool behind one digital voucher (2026-09-15) — staff buy codes from Amazon/Swiggy/
// Zomato etc. and paste or upload them here; a student redeeming in the app gets one issued
// automatically. Opened from the Codes action on a digital-voucher row; every GET this modal
// triggers is recorded server-side in the audit log (see the caption below the table).
function VoucherCodesModal({ coupon, onClose }: { coupon: Coupon; onClose: () => void }) {
  const codes = useVoucherCodes(coupon.id)
  const addCodes = useAddVoucherCodes(coupon.id!)
  const removeCode = useRemoveVoucherCode(coupon.id!)
  const [pasted, setPasted] = useState('')
  const [tooMany, setTooMany] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState<{ id: string; code: string } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function submitCodes(list: string[]) {
    if (list.length === 0) return
    if (list.length > MAX_CODES_PER_REQUEST) {
      setTooMany(true)
      return
    }
    setTooMany(false)
    addCodes.mutate(
      { codes: list },
      {
        onSuccess: (result) => {
          const extras: string[] = []
          if (result.skipped_duplicates > 0) extras.push(`${result.skipped_duplicates} already added`)
          if (result.skipped_invalid > 0) extras.push(`${result.skipped_invalid} blank or too long`)
          showToast(`Added ${result.added} code${result.added === 1 ? '' : 's'}${extras.length > 0 ? `, skipped ${extras.join(', ')}` : ''}`)
          setPasted('')
        },
      },
    )
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    let rows = text.split(/\r?\n/)
    // Drop a CSV header row whose first cell is literally "code" (case-insensitive) — a plain
    // single-column export from a spreadsheet often carries one, a bare code list never does.
    const firstCell = rows[0]?.split(',')[0]?.trim().toLowerCase()
    if (firstCell === 'code') rows = rows.slice(1)
    submitCodes(rows.flatMap((row) => row.split(',')).map((c) => c.trim()).filter(Boolean))
  }

  function commitRemove() {
    if (!confirmRemove) return
    removeCode.mutate(confirmRemove.id, { onSuccess: () => setConfirmRemove(null) })
  }

  const items = codes.data?.items ?? []
  const codeColumns: TableColumn<VoucherCode>[] = [
    { key: 'code', header: 'Code', render: (c) => <span className="font-mono text-body-sm">{c.code}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (c) => <Badge color={voucherStatusMeta[c.status].color}>{voucherStatusMeta[c.status].label}</Badge>,
    },
    { key: 'issued_to', header: 'Issued to', render: (c) => c.issued_to || '—' },
    { key: 'issued_at', header: 'Issued on', render: (c) => (c.issued_at ? formatDateTime(c.issued_at) : '—') },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) =>
        c.status === 'available' ? (
          <button
            type="button"
            onClick={() => setConfirmRemove({ id: c.id!, code: c.code })}
            className="text-caption text-error hover:underline"
          >
            Remove
          </button>
        ) : null,
    },
  ]

  return (
    <Modal onClose={onClose} title={`${coupon.partner_name} — ${coupon.amount} codes`} widthRem={40}>
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          {codes.isLoading ? 'Loading…' : `${codes.data?.available ?? 0} available · ${codes.data?.issued ?? 0} issued`}
        </p>

        <div className="flex flex-col gap-xs">
          <FieldLabel htmlFor="voucher-codes-paste">Paste codes, one per line</FieldLabel>
          <textarea
            id="voucher-codes-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            rows={5}
            className="rounded-md border border-border bg-surface p-sm font-mono text-body-sm text-text-primary"
          />
          <div className="flex items-center gap-sm">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              loading={addCodes.isPending}
              disabled={!pasted.trim()}
              onClick={() => submitCodes(splitCodes(pasted))}
            >
              Add codes
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
              Upload file
            </Button>
            <input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFileChange} className="hidden" />
          </div>
          {tooMany && (
            <p className="text-caption text-error">
              That&rsquo;s more than {MAX_CODES_PER_REQUEST} codes at once — split the file and try again.
            </p>
          )}
          {addCodes.isError && <p className="text-caption text-error">{addCodes.error.message}</p>}
        </div>

        <Table
          columns={codeColumns}
          rows={items}
          rowKey={(c) => c.id!}
          loading={codes.isLoading}
          error={codes.isError ? 'Could not load codes.' : undefined}
          emptyMessage="No codes yet."
          bare
        />

        <p className="text-caption text-text-secondary">
          Only staff with Points &amp; Coupons access can see codes. Opening this list is recorded in the audit log.
        </p>

        {confirmRemove && (
          <Modal
            onClose={() => setConfirmRemove(null)}
            title="Remove Code"
            widthRem={24}
            footer={
              <div className="flex justify-end gap-sm">
                <Button variant="secondary" onClick={() => setConfirmRemove(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" loading={removeCode.isPending} onClick={commitRemove}>
                  Remove
                </Button>
              </div>
            }
          >
            <p className="text-body-sm text-text-secondary">
              Remove <span className="font-mono text-text-primary">{confirmRemove.code}</span>? It hasn&rsquo;t been
              given to anyone.
            </p>
            {removeCode.isError && <p className="mt-sm text-body-sm text-error">{removeCode.error.message}</p>}
          </Modal>
        )}
      </div>
    </Modal>
  )
}

// Per-student coupon limits (2026-09-15) — one rule for EVERY coupon, in-store and digital, so it
// opens from the page header rather than any one coupon's own form, in a popup (user, 2026-09-15:
// "Limits per student - should be in a popup"). Same load-then-edit shape
// as rates/CommissionDefaultsCard.tsx: fields start blank, fill in once the query resolves
// (`initialized` guards against a loading flash overwriting what the admin already typed), and
// "No limit" is the empty string, not a magic number, mapped to `null` only when actually saved.
function CouponLimitsModal({ onClose }: { onClose: () => void }) {
  const limits = useCouponLimits()
  const updateLimits = useUpdateCouponLimits()
  const [perMonth, setPerMonth] = useState('')
  const [total, setTotal] = useState('')
  const [initialized, setInitialized] = useState(false)

  const fromServer = (data: typeof limits.data) => ({
    perMonth: data?.per_month != null ? String(data.per_month) : '',
    total: data?.total != null ? String(data.total) : '',
  })

  useEffect(() => {
    if (initialized || !limits.data) return
    const v = fromServer(limits.data)
    setPerMonth(v.perMonth)
    setTotal(v.total)
    setInitialized(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fromServer is stable per render, not a real dependency
  }, [limits.data, initialized])

  function fieldError(value: string): string | undefined {
    if (value === '') return undefined
    const n = Number(value)
    return Number.isInteger(n) && n >= 1 && n <= 100 ? undefined : '1–100, or leave blank for no limit.'
  }

  const perMonthError = fieldError(perMonth)
  const totalError = fieldError(total)
  const monthlyAboveTotal =
    !perMonthError && !totalError && perMonth !== '' && total !== '' && Number(perMonth) > Number(total)

  const server = fromServer(limits.data)
  const dirty = initialized && (perMonth !== server.perMonth || total !== server.total)
  const canSave = dirty && !perMonthError && !totalError && !monthlyAboveTotal

  function handleSave() {
    updateLimits.mutate(
      { per_month: perMonth === '' ? null : Number(perMonth), total: total === '' ? null : Number(total) },
      {
        onSuccess: () => {
          showToast('Limits updated')
          onClose()
        },
      },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Limits per student"
      widthRem={30}
      footer={
        <>
          {updateLimits.isError && (
            <p className="mr-auto self-center text-body-sm text-error">{updateLimits.error.message}</p>
          )}
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!canSave} loading={updateLimits.isPending} onClick={handleSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <p className="text-body-sm text-text-secondary">
          Applies to every coupon, in-store and digital. Counts each coupon separately — a student can still redeem
          different coupons. Leave a field blank for no limit.
        </p>
        <TextField
          label="Times per month"
          type="number"
          min={1}
          max={100}
          placeholder="No limit"
          value={perMonth}
          onChange={(e) => setPerMonth(e.target.value)}
          error={perMonthError ?? (monthlyAboveTotal ? 'Can’t be more than the total limit.' : undefined)}
        />
        <TextField
          label="Times in total"
          type="number"
          min={1}
          max={100}
          placeholder="No limit"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          error={totalError}
        />
      </div>
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
        size="sm"
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
// picture when they are a subset of it. For a shared-code partner every claim now reports as
// unattributed (2026-09-11 — attributable stays false there, unchanged behaviour).
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

// The "N claimed" button and its drill-down (build reference: students DO claim coupons on Sentpo
// Mobile's Coupons Catalog / redeem flow) — kept as the one place an admin sees who claimed what.
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
          loading={redemptions.isLoading}
          emptyMessage="No claims yet."
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
  const partners = useRedemptionPartners()
  const [showAdd, setShowAdd] = useState(false)
  const [showLimits, setShowLimits] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Which coupon's claims drill-down is open — page-level, so opening one closes any other.
  const [claimsId, setClaimsId] = useState<string | null>(null)
  // Which digital voucher's Codes modal is open (2026-09-15) — same one-at-a-time pattern.
  const [codesId, setCodesId] = useState<string | null>(null)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<CouponStatus | ''>('')
  const [partnerFilter, setPartnerFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState<CouponType | ''>('')

  const rows = useMemo(() => {
    let items = coupons.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((c) => c.partner_name?.toLowerCase().includes(q) || c.amount?.toLowerCase().includes(q))
    }
    if (statusFilter) items = items.filter((c) => c.status === statusFilter)
    if (partnerFilter) items = items.filter((c) => c.partner_id === partnerFilter)
    if (typeFilter) items = items.filter((c) => c.type === typeFilter)
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
  }, [coupons.data, search, statusFilter, partnerFilter, typeFilter, sort])

  const editingCoupon = editingId ? rows.find((c) => c.id === editingId) : undefined
  const codesCoupon = codesId ? rows.find((c) => c.id === codesId) : undefined

  const columns: TableColumn<Coupon>[] = [
    {
      key: 'partner_name',
      header: 'Partner',
      sortable: true,
      render: (c) => {
        // Digital vouchers (2026-09-15) show the brand's own logo here rather than the coupon's
        // thumbnail — there usually isn't one, since the voucher IS the brand, not a designed
        // asset — falling back to the thumbnail if an admin set one anyway.
        const imageUrl = c.partner_kind === 'online' ? (c.partner_logo_url ?? c.thumbnail_url) : c.thumbnail_url
        return (
          <div className="flex items-center gap-sm">
            {imageUrl && (
              <img src={mediaUrl(imageUrl)} alt="" className={`h-10 w-10 shrink-0 rounded-md bg-background ${c.partner_kind === 'online' ? 'object-contain' : 'object-cover'}`} />
            )}
            <div className="flex flex-col gap-xs">
              <div className="flex items-center gap-sm">
                <span className="font-medium text-text-primary">{c.partner_name}</span>
                {c.status && <Badge color={statusMeta[c.status].color}>{statusMeta[c.status].label}</Badge>}
              </div>
              <p className="text-caption text-text-secondary">{c.amount || 'No offer set'}</p>
            </div>
          </div>
        )
      },
    },
    { key: 'type', header: 'Type', render: (c) => (c.type ? couponTypeLabels[c.type] : '—') },
    { key: 'point_cost', header: 'Points', sortable: true, align: 'right', render: (c) => `${c.point_cost} pts` },
    {
      // Split from one ambiguous "Remaining / Total" fraction into three plainly labelled numbers
      // (2026-09-12, product review H11) — alongside the existing Claimed column below, this and
      // "Total stock" give Claimed / Remaining / Total (stock) each their own clear column instead
      // of a slash nobody can read at a glance.
      // For a digital voucher (2026-09-15) `stock`/`remaining_stock` mean the code pool, not a
      // claim-tracked total, so this column reads "N of M codes left" and Total (stock) below
      // stays blank rather than repeat the same number a second way.
      key: 'remaining_stock',
      header: 'Remaining',
      sortable: true,
      align: 'right',
      // `remaining_stock` is server-computed (stock - redemption_count, or unissued codes for a
      // digital voucher) — no client math needed.
      render: (c) =>
        c.partner_kind === 'online' ? (
          <span className="tabular-nums">
            {c.remaining_stock ?? 0} of {c.stock ?? 0} codes left
          </span>
        ) : (
          (c.remaining_stock ?? Math.max(0, (c.stock ?? 0) - (c.redemption_count ?? 0)))
        ),
    },
    {
      key: 'stock',
      header: 'Total (stock)',
      sortable: true,
      align: 'right',
      render: (c) => (c.partner_kind === 'online' ? <span className="text-text-secondary">—</span> : (c.stock ?? 0)),
    },
    {
      key: 'expiry_date',
      header: 'Expiry',
      render: (c) => (c.expiry_date ? formatDate(c.expiry_date) : 'No expiry'),
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
      header: (
        <span
          className="cursor-help underline decoration-dotted"
          title="How closely a coupon must match a student's location. Relevant coupons rank first in their catalog — every scope other than Country still shows elsewhere, just lower down. Country is the one exception: it hides the coupon entirely from students resident in a different country."
        >
          Relevance
        </span>
      ),
      render: (c) => (c.relevance_scope ? relevanceScopeLabels[c.relevance_scope] : '—'),
    },
    { key: 'active', header: 'Active', render: (c) => <CouponToggle coupon={c} /> },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-xs">
          {c.partner_kind === 'online' && (
            <button
              type="button"
              onClick={() => setCodesId(c.id!)}
              aria-label={`Codes for ${c.partner_name} coupon`}
              title="Codes"
              className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
            >
              <Ticket className="h-4 w-4" />
            </button>
          )}
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
          <div className="flex flex-wrap gap-sm">
            <Button variant="secondary" onClick={() => setShowLimits(true)}>
              Limits per student
            </Button>
            <Button onClick={() => setShowAdd(true)}>Add Coupon</Button>
          </div>
        </div>

        {showLimits && <CouponLimitsModal onClose={() => setShowLimits(false)} />}
        {showAdd && <CouponFormModal onClose={() => setShowAdd(false)} />}
        {editingCoupon && <CouponFormModal editingCoupon={editingCoupon} onClose={() => setEditingId(null)} />}
        {codesCoupon && <VoucherCodesModal coupon={codesCoupon} onClose={() => setCodesId(null)} />}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(c) => c.id!}
          loading={coupons.isLoading}
          error={coupons.isError ? 'Could not load coupons.' : undefined}
          emptyMessage="No coupons yet. Add one for students to claim with their points."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search partner or offer…' }}
          filters={
            <>
              <CompactSelect
                label="Status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as CouponStatus | '')}
              >
                <option value="">All statuses</option>
                {(Object.keys(statusMeta) as CouponStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {statusMeta[s].label}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect label="Partner" value={partnerFilter} onChange={(e) => setPartnerFilter(e.target.value)}>
                <option value="">All partners</option>
                {partners.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </CompactSelect>
              <CompactSelect label="Type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CouponType | '')}>
                <option value="">All types</option>
                {(Object.keys(couponTypeLabels) as CouponType[]).map((t) => (
                  <option key={t} value={t}>
                    {couponTypeLabels[t]}
                  </option>
                ))}
              </CompactSelect>
            </>
          }
        />
      </div>
    </AdminShell>
  )
}
