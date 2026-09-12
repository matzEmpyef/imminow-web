import { useMemo, useState, type FormEvent } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { Toggle } from '@/components/Toggle'
import { CompactSelect } from '@/components/CompactSelect'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect'
import { TargetingFilter } from '@/features/super-admin/TargetingFilter'
import { hasAnyTargeting } from '@/lib/targeting'
import { showToast } from '@/lib/toast'
import {
  useAdAudienceCount,
  useAdClicks,
  useAdminAds,
  useCreateAd,
  useDeleteAd,
  useUpdateAd,
} from '@/queries/adsAdmin'
import { PersonListModal } from '@/features/super-admin/PersonListModal'
import { useAdminEvents } from '@/queries/eventsAdmin'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { useCountries } from '@/queries/countries'
import { formatEventDateTime, formatDateTime, formatDate } from '@/lib/time'
import type { components } from '@/api/schema'
import { mediaUrl } from '@/lib/mediaUrl'

type AdBanner = components['schemas']['AdBanner']
type DestinationType = AdBanner['destination_type']
type AdTargeting = components['schemas']['Targeting']

const eventTypeLabels: Record<string, string> = {
  quiz: 'Quiz',
  webinar: 'Webinar',
  physical_meeting: 'In-person Meeting',
}

// User-requested (2026-08-18) — "wherever there is add button, use popup, instead of inline
// form." Was an inline Card that expanded below the page header; now a Modal, same fields.
// Image field upgraded from a typed-in "Image URL" text box to a real ImageUploadField picker
// (2026-08-18, same ask as Quiz Branding — "We should be able to upload the image. No point just
// giving image name") — unlike Quiz Branding's placements, an ad's creative is mandatory (banners
// with no image don't make sense), so Create Ad still stays disabled until one is uploaded.
// Rewritten into a combined Add/Edit popup + real Event/Consultancy pickers same day (user: "in
// Ads Manager, where do i get event id... ? It would have been easier if i could select the event
// from dropdown.."). Was a raw "Event ID"/"Consultancy ID" TextField the admin had to type a UUID
// into by hand — replaced with `SearchSelect` sourced from the real events/consultancies lists,
// same pattern already used everywhere else a client/lead/event needs picking. Editing an existing
// ad (e.g. swapping the image for a new campaign) deliberately keeps the same record — and
// therefore the same clicks_count/impressions_count — rather than delete-and-recreate, answering
// the user's own question ("even if I replace the image, the click count and all will continue
// right?"): yes, PATCH /ads/{id} only ever touches the fields listed in its body, never the
// counters (mock-server/server.js).
//
// Split into a 2-page wizard (user-requested, 2026-08-19 — "can we show targeting as second page.
// make sure user knows targeting page is there") — page 1 is the ad's own details, page 2 is
// Targeting. The "Next: Targeting →" button's own label is the "make sure user knows" affordance
// (rather than a separate hint), and a small "Step N of 2" caption in the body echoes it. Both
// pages' fields stay mounted in the same component/state (not two separate modals), so Back
// preserves everything already entered — only which page's fields render changes.
//
// `name` (2026-09-11) — an admin-only label so a row reads as "Diwali offer" instead of "External
// url" when there are several live ads with the same destination type. Never shown to students.
function AdFormModal({ editingAd, onClose }: { editingAd?: AdBanner; onClose: () => void }) {
  const isEditing = Boolean(editingAd)
  const createAd = useCreateAd()
  const updateAd = useUpdateAd(editingAd?.id ?? '')
  const events = useAdminEvents()
  const consultancies = useAdminConsultancies({ limit: 100 })
  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState(editingAd?.name ?? '')
  const [imageUrl, setImageUrl] = useState(editingAd?.image_url ?? '')
  const [destinationType, setDestinationType] = useState<DestinationType>(editingAd?.destination_type ?? 'external_url')
  const [destinationId, setDestinationId] = useState(editingAd?.destination_id ?? '')
  const [destinationUrl, setDestinationUrl] = useState(editingAd?.destination_url ?? '')
  const [priority, setPriority] = useState(editingAd?.priority ?? 1)
  const [activeFrom, setActiveFrom] = useState(editingAd?.active_from ?? '')
  const [activeTo, setActiveTo] = useState(editingAd?.active_to ?? '')
  const [targeting, setTargeting] = useState<AdTargeting>(editingAd?.targeting ?? {})
  const countries = useCountries()
  const audienceCount = useAdAudienceCount(targeting)

  const mutation = isEditing ? updateAd : createAd
  // User-requested (2026-08-18) — "Don't let replace ad image if impression is more than 1."
  // Mirrors the server-side rejection in PATCH /ads/:id; disabled here too so the admin isn't led
  // into a doomed submission and sees why up front.
  const imageLocked = isEditing && (editingAd?.impressions_count ?? 0) > 1

  const eventOptions: SearchSelectOption[] = (events.data?.items ?? []).map((e) => ({
    id: e.id!,
    label: e.title ?? '',
    // Venue-aware: a date-only label still shifts by a whole DAY when a near-midnight event in
    // another zone gets converted to the browser's. Same rule as every other event surface.
    sublabel: formatEventDateTime(e) || undefined,
    group: e.type ? eventTypeLabels[e.type] : undefined,
  }))
  const consultancyOptions: SearchSelectOption[] = (consultancies.data?.items ?? []).map((c) => ({
    id: c.id!,
    label: c.name ?? '',
  }))

  const [attemptedStep1, setAttemptedStep1] = useState(false)
  const missingStep1Fields = useMemo(() => {
    const missing: string[] = []
    if (!imageUrl) missing.push('Image')
    if (destinationType === 'external_url' && !destinationUrl) missing.push('Destination URL')
    if (destinationType === 'event' && !destinationId) missing.push('Event')
    if (destinationType === 'internal' && !destinationId) missing.push('Consultancy')
    return missing
  }, [imageUrl, destinationType, destinationUrl, destinationId])
  const step1Valid = missingStep1Fields.length === 0
  const step1Error =
    attemptedStep1 && !step1Valid
      ? `Missing: ${missingStep1Fields.join(', ')}.`
      : undefined

  function handleNext() {
    if (!step1Valid) {
      setAttemptedStep1(true)
      return
    }
    setStep(2)
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!step1Valid) {
      setAttemptedStep1(true)
      setStep(1)
      return
    }
    const body = {
      name: name.trim() || null,
      image_url: imageUrl,
      destination_type: destinationType,
      destination_id: destinationType === 'external_url' ? undefined : destinationId || undefined,
      destination_url: destinationType === 'external_url' ? destinationUrl : undefined,
      priority,
      active_from: activeFrom || null,
      active_to: activeTo || null,
      targeting: hasAnyTargeting(targeting) ? targeting : null,
    }
    if (isEditing) {
      updateAd.mutate(body, {
        onSuccess: () => {
          showToast(name.trim() ? `${name.trim()} updated` : 'Ad updated')
          onClose()
        },
      })
    } else {
      createAd.mutate(body, {
        onSuccess: () => {
          showToast(name.trim() ? `${name.trim()} created` : 'Ad created')
          onClose()
        },
      })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Ad' : 'Add Ad'}
      widthRem={36}
      footer={
        step === 1 ? (
          <>
            {step1Error && <p className="mr-auto self-center text-body-sm text-error">{step1Error}</p>}
            <Button onClick={handleNext}>Next: Targeting →</Button>
          </>
        ) : (
          <>
            {mutation.isError && (
              <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>
            )}
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button type="submit" form="ad-form" loading={mutation.isPending}>
              {isEditing ? 'Save Changes' : 'Create Ad'}
            </Button>
          </>
        )
      }
    >
      <form id="ad-form" onSubmit={handleSubmit} className="flex flex-col gap-md">
        <p className="text-caption text-text-secondary">
          Step {step} of 2 — {step === 1 ? 'Ad Details' : 'Targeting'}
        </p>
        {step === 1 && (
          <>
            <p className="text-body-sm text-text-secondary">
              Shown in a rotating carousel on the mobile app's home screen.
            </p>
            <TextField
              label="Name — only you see this"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              placeholder="e.g. Diwali offer"
            />
            <ImageUploadField
              label="Image"
              required
              value={imageUrl}
              onChange={setImageUrl}
              disabled={imageLocked}
              hint="Wide banner, 3:1 — shown full-width on the app's home screen. Ideal size 1200×400px."
            />
            {imageLocked && (
              <p className="text-caption text-text-secondary">
                This ad already has {editingAd?.impressions_count} impressions, so its image is locked. Retire it and
                create a new ad instead of replacing the creative.
              </p>
            )}
            {/* Live preview at the app's real 3:1 aspect ratio (2026-09-11) — the "ideal size
                1200x400" hint above is a number nobody can picture; this shows what it actually
                looks like, "Sponsored" label included, so a cropped or stretched creative is
                visible before it goes live. Padding-bottom percentage rather than an arbitrary
                `aspect-[3/1]` class — this project's Tailwind v4 setup silently drops arbitrary
                bracket values (see Toggle.tsx). */}
            <div className="flex flex-col gap-xs">
              <span className="text-body-sm font-medium text-text-primary">Preview</span>
              <div className="relative w-full overflow-hidden rounded-md bg-background" style={{ paddingBottom: '33.333%' }}>
                {imageUrl ? (
                  <img src={mediaUrl(imageUrl)} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-caption text-text-secondary">
                    No image yet
                  </div>
                )}
                <span className="absolute bottom-xs left-xs rounded-full bg-text-primary/60 px-sm py-[2px] text-caption text-surface">
                  Sponsored
                </span>
              </div>
            </div>
            <SelectField
              label="Destination type"
              required
              id="dest-type"
              value={destinationType}
              onChange={(e) => {
                setDestinationType(e.target.value as DestinationType)
                setDestinationId('')
              }}
            >
              <option value="internal">Internal (consultancy)</option>
              <option value="event">Event</option>
              <option value="external_url">External URL</option>
            </SelectField>
            {destinationType === 'external_url' && (
              <TextField
                label="Destination URL"
                required
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
              />
            )}
            {destinationType === 'event' && (
              <div className="flex flex-col gap-xs">
                <SearchSelect
                  id="dest-event"
                  label="Event"
                  required
                  options={eventOptions}
                  value={destinationId}
                  onChange={setDestinationId}
                  placeholder={events.isLoading ? 'Loading events…' : 'Search quiz, webinar, or meeting…'}
                />
              </div>
            )}
            {destinationType === 'internal' && (
              <div className="flex flex-col gap-xs">
                <SearchSelect
                  id="dest-consultancy"
                  label="Consultancy"
                  required
                  options={consultancyOptions}
                  value={destinationId}
                  onChange={setDestinationId}
                  placeholder={consultancies.isLoading ? 'Loading consultancies…' : 'Search consultancy…'}
                />
              </div>
            )}
            <TextField
              label="Priority"
              type="number"
              required
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value))}
            />
            <p className="text-caption text-text-secondary">1 shows first in the app's carousel.</p>
            <div className="flex gap-md">
              <TextField
                label="Start date"
                type="date"
                value={activeFrom}
                onChange={(e) => setActiveFrom(e.target.value)}
                className="flex-1"
              />
              <TextField
                label="End date"
                type="date"
                value={activeTo}
                onChange={(e) => setActiveTo(e.target.value)}
                className="flex-1"
              />
            </div>
            <p className="text-caption text-text-secondary">
              Leave either date blank to run with no start/end limit. Outside this window the ad shows as Scheduled
              or Expired instead of Live.
            </p>
          </>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-sm">
            <TargetingFilter
              value={targeting}
              onChange={setTargeting}
              countries={countries.data ?? []}
              unknownDataPolicy="includes"
            />
            <p className="text-body-sm text-text-secondary">
              {audienceCount.isLoading
                ? 'Checking how many people match…'
                : audienceCount.data
                  ? `~${audienceCount.data.count} ${audienceCount.data.count === 1 ? 'person' : 'people'} currently match this targeting.`
                  : 'Could not check the matching audience.'}
              {audienceCount.data?.count === 0 &&
                ' This ad would currently show to nobody — consider widening the targeting.'}
            </p>
          </div>
        )}
      </form>
    </Modal>
  )
}

// Status is server-computed now (2026-09-11) — AdBanner.status folds active/active_from/active_to
// into one readonly enum, so the client stopped re-deriving Live/Scheduled/Expired/Off itself (the
// two used to be able to disagree at the exact hour a window opened or closed, since the client's
// version only re-evaluated on a re-render). Always show what the server says.
const STATUS_BADGE: Record<NonNullable<AdBanner['status']>, { label: string; color: 'success' | 'info' | 'secondary' }> = {
  live: { label: 'Live', color: 'success' },
  scheduled: { label: 'Scheduled', color: 'info' },
  expired: { label: 'Expired', color: 'secondary' },
  off: { label: 'Off', color: 'secondary' },
}

// "Diwali offer" if named, else what it points to — a row always reads as *something*, even for
// the many ads nobody bothered to name before this field existed (2026-09-11).
function adDestinationLabel(ad: AdBanner): string {
  if (ad.destination_type === 'external_url') return 'External URL'
  if (ad.destination_type === 'event') return 'Event'
  return 'Consultancy'
}

function adDisplayName(ad: AdBanner): string {
  return ad.name?.trim() || adDestinationLabel(ad)
}

// "—" until there have been any impressions to divide by — a 0/0 CTR reads as "0%", which claims
// to know something about an ad nobody has seen yet, rather than saying there's no data.
function ctrLabel(ad: AdBanner): string {
  const impressions = ad.impressions_count ?? 0
  if (impressions === 0) return '—'
  const clicks = ad.clicks_count ?? 0
  return `${((clicks / impressions) * 100).toFixed(1)}%`
}

function runsLabel(ad: AdBanner): string {
  const from = ad.active_from ? formatDate(ad.active_from) : 'Any time'
  const to = ad.active_to ? formatDate(ad.active_to) : 'No end date'
  return `${from} – ${to}`
}

// Row-level component, same reasoning as QuizAdminPage's VoidQuizAction: useUpdateAd() must be
// called at its own render top level, not inside Table's `render: (row) => ...` callback.
// Replaces the old one-directional "Retire" button (2026-09-11, "we need to reverse ad off") —
// PATCH { active } always supported flipping back, the UI just never offered it. Reversible, so
// no confirm popup: the server's own `status` badge on the same row shows the result immediately.
function AdActiveToggle({ ad }: { ad: AdBanner }) {
  const updateAd = useUpdateAd(ad.id!)
  const isOn = ad.active !== false
  return (
    <Toggle
      size="sm"
      checked={isOn}
      disabled={updateAd.isPending}
      onChange={(checked) => updateAd.mutate({ active: checked })}
      label={isOn ? `Switch off ${adDisplayName(ad)}` : `Switch on ${adDisplayName(ad)}`}
    />
  )
}

// New (2026-09-11) — DELETE /ads/{id} is permanent, unlike the Toggle beside it, so it gets its
// own confirm that spells out the difference and points at the reversible alternative.
function DeleteAdAction({ ad }: { ad: AdBanner }) {
  const deleteAd = useDeleteAd()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Delete ${adDisplayName(ad)}`}
        title="Delete"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Delete Ad"
          widthRem={24}
          footer={
            <>
              {deleteAd.isError && (
                <p className="mr-auto self-center text-body-sm text-error">{deleteAd.error.message}</p>
              )}
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteAd.isPending}
                onClick={() => deleteAd.mutate(ad.id!, { onSuccess: () => setConfirming(false) })}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Delete this ad? It disappears from the app and its numbers are lost. To pause it instead, switch it off.
          </p>
        </Modal>
      )}
    </>
  )
}

export function AdsManagerPage() {
  const ads = useAdminAds()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  // Which ad's click list is open (user 2026-08-20: "see the users who have clicked an ad").
  const [clicksAdId, setClicksAdId] = useState<string | null>(null)
  const adClicks = useAdClicks(clicksAdId)
  const [sort, setSort] = useState<{ field: string; direction: 'asc' | 'desc' } | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'' | NonNullable<AdBanner['status']>>('')

  const rows = useMemo(() => {
    let items = ads.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter(
        (a) => adDisplayName(a).toLowerCase().includes(q) || a.destination_type?.toLowerCase().includes(q),
      )
    }
    if (statusFilter) {
      items = items.filter((a) => a.status === statusFilter)
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'priority'
            ? (a.priority ?? 0)
            : sort.field === 'clicks_count'
              ? (a.clicks_count ?? 0)
              : sort.field === 'impressions_count'
                ? (a.impressions_count ?? 0)
                : adDisplayName(a)
        const bv =
          sort.field === 'priority'
            ? (b.priority ?? 0)
            : sort.field === 'clicks_count'
              ? (b.clicks_count ?? 0)
              : sort.field === 'impressions_count'
                ? (b.impressions_count ?? 0)
                : adDisplayName(b)
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    } else {
      items = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    }
    return items
  }, [ads.data, search, statusFilter, sort])

  const editingAd = editingId ? rows.find((a) => a.id === editingId) : undefined

  const columns: TableColumn<AdBanner>[] = [
    {
      key: 'name',
      header: 'Ad',
      sortable: true,
      render: (ad) => (
        <div className="flex items-center gap-sm">
          <img
            src={mediaUrl(ad.image_url)}
            alt=""
            className="h-10 w-16 shrink-0 rounded-md object-cover bg-background"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-text-primary">{adDisplayName(ad)}</p>
            <div className="flex items-center gap-xs">
              {/* Without a name the destination is already the title — don't say it twice. */}
              {ad.name && <span className="text-caption text-text-secondary">{adDestinationLabel(ad)}</span>}
              {typeof ad.event_countdown_seconds === 'number' && (
                <Badge color="warning">Starts in {Math.round(ad.event_countdown_seconds / 3600)}h</Badge>
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (ad) => {
        const status = ad.status ? STATUS_BADGE[ad.status] : undefined
        return status ? <Badge color={status.color}>{status.label}</Badge> : '—'
      },
    },
    { key: 'priority', header: 'Priority', sortable: true, align: 'right', render: (ad) => ad.priority ?? 0 },
    {
      key: 'impressions_count',
      header: 'Impressions',
      sortable: true,
      align: 'right',
      hideBelow: 'md',
      render: (ad) => ad.impressions_count ?? 0,
    },
    {
      key: 'clicks_count',
      header: 'Clicks',
      sortable: true,
      align: 'right',
      // Drills down to who clicked (name / Aspirant-Applicant / time) — nobody asked to identify
      // viewers, only clickers, so impressions above stay a bare count.
      render: (ad) => (
        <button type="button" onClick={() => setClicksAdId(ad.id!)} className="font-medium text-primary hover:underline">
          {ad.clicks_count ?? 0}
        </button>
      ),
    },
    {
      key: 'ctr',
      header: 'CTR',
      align: 'right',
      hideBelow: 'lg',
      render: (ad) => <span className="tabular-nums text-text-secondary">{ctrLabel(ad)}</span>,
    },
    {
      key: 'runs',
      header: 'Runs',
      hideBelow: 'md',
      render: (ad) => <span className="text-text-secondary">{runsLabel(ad)}</span>,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (ad) => (
        <div className="flex items-center justify-end gap-sm">
          <AdActiveToggle ad={ad} />
          <button
            type="button"
            onClick={() => setEditingId(ad.id!)}
            aria-label={`Edit ${adDisplayName(ad)}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <DeleteAdAction ad={ad} />
        </div>
      ),
    },
  ]

  return (
    <AdminShell>
      <div className="flex flex-col gap-lg">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-h1 text-text-primary">Ads Manager</h1>
            <p className="text-body-sm text-text-secondary">Banner ads shown in the mobile app, ranked by priority.</p>
          </div>
          <Button onClick={() => setShowAdd(true)}>Add Ad</Button>
        </div>

        {showAdd && <AdFormModal onClose={() => setShowAdd(false)} />}
        {editingAd && <AdFormModal editingAd={editingAd} onClose={() => setEditingId(null)} />}
        {clicksAdId && (
          <PersonListModal
            title="Ad clicks"
            rows={(adClicks.data?.items ?? []).map((c) => ({
              name: c.name,
              email: c.email,
              studentType: c.student_type,
              updatedAt: formatDateTime(c.clicked_at),
            }))}
            emptyMessage="No clicks recorded for this ad yet."
            onClose={() => setClicksAdId(null)}
          />
        )}

        <Table
          columns={columns}
          rows={rows}
          rowKey={(ad) => ad.id!}
          loading={ads.isLoading}
          error={ads.isError ? 'Could not load ads.' : undefined}
          emptyMessage={search || statusFilter ? 'No ads match these filters.' : "No ads yet. Add one to place a banner on the app's Home screen."}
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search name or destination…' }}
          filters={
            <CompactSelect label="Status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}>
              <option value="">All statuses</option>
              <option value="live">Live</option>
              <option value="scheduled">Scheduled</option>
              <option value="expired">Expired</option>
              <option value="off">Off</option>
            </CompactSelect>
          }
        />
      </div>
    </AdminShell>
  )
}
