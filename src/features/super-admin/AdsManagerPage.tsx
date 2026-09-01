import { useMemo, useState, type FormEvent } from 'react'
import { Ban, Pencil } from 'lucide-react'
import { AdminShell } from '@/features/auth/AdminShell'
import { SelectField } from '@/components/SelectField'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { FieldLabel } from '@/components/FieldLabel'
import { Table, type TableColumn } from '@/components/Table'
import { Modal } from '@/components/Modal'
import { ImageUploadField } from '@/components/ImageUploadField'
import { SearchSelect, type SearchSelectOption } from '@/components/SearchSelect'
import { TargetingFilter } from '@/components/TargetingFilter'
import { hasAnyTargeting } from '@/lib/targeting'
import { useAdAudienceCount, useAdClicks, useAdminAds, useCreateAd, useUpdateAd } from '@/queries/adsAdmin'
import { PersonListModal } from '@/components/PersonListModal'
import { useAdminEvents } from '@/queries/eventsAdmin'
import { useAdminConsultancies } from '@/queries/adminConsultancies'
import { useCountries } from '@/queries/countries'
import { formatEventDateTime, formatDateTime } from '@/lib/time'
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
function AdFormModal({ editingAd, onClose }: { editingAd?: AdBanner; onClose: () => void }) {
  const isEditing = Boolean(editingAd)
  const createAd = useCreateAd()
  const updateAd = useUpdateAd(editingAd?.id ?? '')
  const events = useAdminEvents()
  const consultancies = useAdminConsultancies({ limit: 100 })
  const [step, setStep] = useState<1 | 2>(1)
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

  const step1Valid =
    Boolean(imageUrl) &&
    (destinationType !== 'external_url' || Boolean(destinationUrl)) &&
    (destinationType === 'external_url' || Boolean(destinationId))

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!step1Valid) return
    const body = {
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
      updateAd.mutate(body, { onSuccess: () => onClose() })
    } else {
      createAd.mutate(body, { onSuccess: () => onClose() })
    }
  }

  return (
    <Modal
      onClose={onClose}
      title={isEditing ? 'Edit Ad' : 'Add Ad'}
      widthRem={36}
      footer={
        step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={!step1Valid}>
            Next: Targeting →
          </Button>
        ) : (
          <>
            {mutation.isError && (
              <p className="mr-auto self-center text-body-sm text-error">{mutation.error.message}</p>
            )}
            <Button variant="secondary" onClick={() => setStep(1)}>
              ← Back
            </Button>
            <Button type="submit" form="ad-form" loading={mutation.isPending} disabled={!step1Valid}>
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
                <FieldLabel htmlFor="dest-event" required>
                  Event
                </FieldLabel>
                <SearchSelect
                  id="dest-event"
                  options={eventOptions}
                  value={destinationId}
                  onChange={setDestinationId}
                  placeholder={events.isLoading ? 'Loading events…' : 'Search quiz, webinar, or meeting…'}
                />
              </div>
            )}
            {destinationType === 'internal' && (
              <div className="flex flex-col gap-xs">
                <FieldLabel htmlFor="dest-consultancy" required>
                  Consultancy
                </FieldLabel>
                <SearchSelect
                  id="dest-consultancy"
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
              Leave either date blank to run with no start/end limit. Outside this window the ad is shown as
              Scheduled/Expired instead of Live.
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

function isLiveAd(ad: AdBanner): boolean {
  const now = Date.now()
  if (ad.active_from && new Date(ad.active_from).getTime() > now) return false
  if (ad.active_to && new Date(ad.active_to).getTime() < now) return false
  return true
}

// Retired (2026-08-18: "We also need to retire an ad") takes precedence over the date-computed
// Live/Scheduled/Expired state — a retired ad stays retired even if its active_from/active_to
// window would otherwise say it's live.
function adStatus(ad: AdBanner): { label: string; color: 'success' | 'secondary' | 'error' } {
  if (ad.active === false) return { label: 'Retired', color: 'error' }
  return isLiveAd(ad) ? { label: 'Live', color: 'success' } : { label: 'Scheduled/Expired', color: 'secondary' }
}

// Row-level component, same reasoning as QuizAdminPage's VoidQuizAction: useUpdateAd() must be
// called at its own render top level, not inside Table's `render: (row) => ...` callback.
// One-directional in the UI (no "un-retire" button offered) even though PATCH /ads/:id's `active`
// field would technically support flipping back.
function RetireAdAction({ ad }: { ad: AdBanner }) {
  const updateAd = useUpdateAd(ad.id!)
  const [confirming, setConfirming] = useState(false)

  if (ad.active === false) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirming(true)}
        aria-label={`Retire ad for ${ad.destination_type}`}
        title="Retire Ad"
        className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
      >
        <Ban className="h-4 w-4" />
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Retire Ad"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={updateAd.isPending}
                onClick={() => updateAd.mutate({ active: false }, { onSuccess: () => setConfirming(false) })}
              >
                Retire
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Retire this ad? It will stop showing in the mobile app's home carousel. This can't be undone from here.
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

  const rows = useMemo(() => {
    let items = ads.data ?? []
    if (search) {
      const q = search.toLowerCase()
      items = items.filter((a) => a.destination_type?.toLowerCase().includes(q))
    }
    if (sort) {
      const dir = sort.direction === 'desc' ? -1 : 1
      items = [...items].sort((a, b) => {
        const av =
          sort.field === 'priority'
            ? (a.priority ?? 0)
            : sort.field === 'clicks_count'
              ? (a.clicks_count ?? 0)
              : (a.destination_type ?? '')
        const bv =
          sort.field === 'priority'
            ? (b.priority ?? 0)
            : sort.field === 'clicks_count'
              ? (b.clicks_count ?? 0)
              : (b.destination_type ?? '')
        return av < bv ? -1 * dir : av > bv ? 1 * dir : 0
      })
    } else {
      items = [...items].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    }
    return items
  }, [ads.data, search, sort])

  const editingAd = editingId ? rows.find((a) => a.id === editingId) : undefined

  const columns: TableColumn<AdBanner>[] = [
    {
      key: 'destination_type',
      header: 'Ad',
      sortable: true,
      render: (ad) => {
        const status = adStatus(ad)
        return (
          <div className="flex items-center gap-sm">
            <img
              src={mediaUrl(ad.image_url)}
              alt=""
              className="h-10 w-16 shrink-0 rounded-md object-cover bg-background"
            />
            <div className="min-w-0">
              <p className="font-medium capitalize text-text-primary">{ad.destination_type?.replace('_', ' ')}</p>
              <div className="flex items-center gap-xs">
                <Badge color={status.color}>{status.label}</Badge>
                {typeof ad.event_countdown_seconds === 'number' && (
                  <Badge color="warning">Starts in {Math.round(ad.event_countdown_seconds / 3600)}h</Badge>
                )}
              </div>
            </div>
          </div>
        )
      },
    },
    {
      key: 'clicks_count',
      header: 'Clicks / Impressions',
      sortable: true,
      align: 'right',
      // Clicks drill down to who clicked (name / Aspirant-Applicant / time); impressions stay a
      // bare count — nobody asked to identify viewers, only clickers.
      render: (ad) => (
        <span>
          <button
            type="button"
            onClick={() => setClicksAdId(ad.id!)}
            className="font-medium text-primary hover:underline"
          >
            {ad.clicks_count ?? 0}
          </button>
          {` / ${ad.impressions_count ?? 0}`}
        </span>
      ),
    },
    { key: 'priority', header: 'Priority', sortable: true, align: 'right', render: (ad) => ad.priority ?? 0 },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (ad) => (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setEditingId(ad.id!)}
            aria-label={`Edit ad for ${ad.destination_type}`}
            title="Edit"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-text-primary"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <RetireAdAction ad={ad} />
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
          emptyMessage="No ads yet."
          sort={sort}
          onSortChange={(field, direction) => setSort({ field, direction })}
          search={{ value: search, onChange: setSearch, placeholder: 'Search destination type…' }}
        />
      </div>
    </AdminShell>
  )
}
