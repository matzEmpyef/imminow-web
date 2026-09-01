import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { AppShell } from '@/features/auth/AppShell'
import { Card } from '@/components/Card'
import { ErrorState, Skeleton } from '@/components/QueryState'
import { Button } from '@/components/Button'
import { Badge } from '@/components/Badge'
import { TextField } from '@/components/TextField'
import { MultiSelect } from '@/components/MultiSelect'
import { CountrySelect } from '@/components/CountrySelect'
import { FieldLabel } from '@/components/FieldLabel'
import { ImageUploadField } from '@/components/ImageUploadField'
import { Modal } from '@/components/Modal'
import {
  useAddGalleryImage,
  useDeleteGalleryImage,
  useIssueTransferCode,
  useMyConsultancy,
  useRequestUpgrade,
  useTransferCodes,
  useUpdateConsultancyProfile,
  useUpdateGalleryImage,
} from '@/queries/consultancy'
import { mediaUrl } from '@/lib/mediaUrl'
import { Table, type TableColumn } from '@/components/Table'
import { formatDateTime } from '@/lib/time'
import { useEmployees } from '@/queries/staff'
import { useAllocationRule, useUpdateAllocationRule } from '@/queries/allocationRules'
import { useCreateTag, useDeleteTag, useTags } from '@/queries/tags'
import { useCountries } from '@/queries/countries'
import { useMyCommissionRates } from '@/queries/commissionRates'
import { useMyKyc, useSubmitKyc } from '@/queries/kyc'
import type { components } from '@/api/schema'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'
import { formatDate } from '@/lib/time'
import { usePermission } from '@/lib/permissions'
import { BUSINESS_FEATURES, ULTIMATE_FEATURES, STARTER_CORE_FEATURES, TIER_ORDER, TIER_LABEL } from '@/lib/features'
import { PartnerCollegesPanel } from './PartnerCollegesPanel'

// Feature lists derived from the ONE exported registry (build reference 1.16 made real,
// 2026-08-29) rather than this page's own hand-maintained prose — see @/lib/features for the
// single source of truth also consumed by AppShell's nav gating and the Manage Consultancy
// toggle panel.

// User-requested — Description is the short factual blurb shown in the student-facing browse
// list and near the top of Consultancy Detail, so it needs to stay scannable.
const DESCRIPTION_WORD_LIMIT = 40
function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

const TABS = [
  'Profile',
  'Subscription',
  'Partner Colleges',
  'Commission Rates',
  'Allocation Rule',
  'Tag Management',
  'Incoming Transfers',
] as const
type Tab = (typeof TABS)[number]

// Was three separate pages/sidebar links (Consultancy Profile, Allocation Rules, Tag Management)
// — merged into one tabbed page (user-requested), same in-component tab-state convention
// ClientProfilePage.tsx already uses (no URL sync per tab).
export function ConsultancyProfilePage() {
  const consultancy = useMyConsultancy()
  const [activeTab, setActiveTab] = useState<Tab>('Profile')
  // Incoming Transfers is about accepting cases, not settings — its own permission gate.
  const canAcceptTransfers = usePermission('clients.transfer_applicant')
  const visibleTabs = TABS.filter((tab) => tab !== 'Incoming Transfers' || canAcceptTransfers)

  if (consultancy.isLoading) {
    return (
      <AppShell>
        <Skeleton className="h-64 rounded-lg" />
      </AppShell>
    )
  }

  if (consultancy.isError || !consultancy.data) {
    return (
      <AppShell>
        <ErrorState message="Could not load the consultancy profile." onRetry={() => consultancy.refetch()} />
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-lg">
        <h1 className="text-h1 text-text-primary">Consultancy Management</h1>

        <div className="flex gap-xs overflow-x-auto border-b border-border">
          {visibleTabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 border-b-2 px-md py-sm text-body-sm ${
                activeTab === tab ? 'border-primary font-medium text-primary' : 'border-transparent text-text-secondary'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === 'Profile' && <ProfileTab consultancy={consultancy.data} />}
        {activeTab === 'Subscription' && <SubscriptionTab consultancy={consultancy.data} />}
        {activeTab === 'Partner Colleges' && <PartnerCollegesPanel />}
        {activeTab === 'Commission Rates' && <CommissionRatesTab consultancy={consultancy.data} />}
        {activeTab === 'Allocation Rule' && <AllocationTab />}
        {activeTab === 'Tag Management' && <TagManagementTab />}
        {activeTab === 'Incoming Transfers' && canAcceptTransfers && <IncomingTransfersTab />}
      </div>
    </AppShell>
  )
}

function ProfileTab({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const updateProfile = useUpdateConsultancyProfile()

  const [logoUrl, setLogoUrl] = useState('')
  const [description, setDescription] = useState('')
  const [aboutUs, setAboutUs] = useState('')
  const [countries, setCountries] = useState<string[]>([])
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [publicEmail, setPublicEmail] = useState('')
  const [publicPhone, setPublicPhone] = useState('')
  const countryOptions = useCountries()

  useEffect(() => {
    setLogoUrl(consultancy.logo_url ?? '')
    setDescription(consultancy.description ?? '')
    setAboutUs(consultancy.about_us ?? '')
    setCountries(consultancy.countries_served ?? [])
    setCity(consultancy.city ?? '')
    setCountry(consultancy.country ?? '')
    setPublicEmail(consultancy.public_email ?? '')
    setPublicPhone(consultancy.public_phone ?? '')
  }, [consultancy])

  const publicEmailError = publicEmail && !isValidEmail(publicEmail) ? EMAIL_ERROR : undefined
  const publicPhoneError = publicPhone && !isValidPhone(publicPhone) ? PHONE_ERROR : undefined
  const descriptionWords = wordCount(description)
  const descriptionError =
    descriptionWords > DESCRIPTION_WORD_LIMIT
      ? `Keep it to ${DESCRIPTION_WORD_LIMIT} words or fewer (currently ${descriptionWords}).`
      : undefined

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (publicEmailError || publicPhoneError || descriptionError) return
    updateProfile.mutate({
      logo_url: logoUrl || null,
      description,
      about_us: aboutUs,
      countries_served: countries,
      city,
      country,
      public_email: publicEmail || null,
      public_phone: publicPhone || null,
    })
  }

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        Everything here is what students actually see. Any change notifies Platform Admin.
      </p>

      <Card className="max-w-[42rem]">
        <h2 className="text-h2 text-text-primary">{consultancy.name}</h2>
        <form onSubmit={handleSubmit} className="mt-md flex flex-col gap-md">
          {/* `logo_url` has existed on Consultancy since the original schema but no screen ever
              collected it, so every row shipped null and Sentpo Mobile fell back to a generated
              initial for every consultancy. Added 2026-08-18. */}
          <ImageUploadField
            label="Logo"
            value={logoUrl}
            onChange={setLogoUrl}
            hint="Square works best — shown at 48×48 in the student app. Ideal size 200×200px."
          />
          <TextField label="City" value={city} onChange={(e) => setCity(e.target.value)} />
          {/* Where the consultancy is based, NOT where it sends students — that's Countries
              Served below. Added 2026-08-23: invoices default to this country's currency, which
              until now was hardcoded to INR for everyone. */}
          <CountrySelect label="Country" value={country} onChange={setCountry} />
          <div className="flex flex-col gap-xs">
            <FieldLabel htmlFor="consultancy-description">Description</FieldLabel>
            <textarea
              id="consultancy-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className={`rounded-md border bg-surface px-3 py-2 text-body ${descriptionError ? 'border-error' : 'border-border'}`}
            />
            <p className={`text-caption ${descriptionError ? 'text-error' : 'text-text-secondary'}`}>
              {descriptionWords} / {DESCRIPTION_WORD_LIMIT} words
            </p>
          </div>
          <div className="flex flex-col gap-xs">
            <FieldLabel htmlFor="consultancy-about-us">About Us</FieldLabel>
            <textarea
              id="consultancy-about-us"
              value={aboutUs}
              onChange={(e) => setAboutUs(e.target.value)}
              rows={5}
              className="rounded-md border border-border bg-surface px-3 py-2 text-body"
            />
          </div>
          <MultiSelect
            label="Countries served"
            options={countryOptions.data ?? []}
            selected={countries}
            onChange={setCountries}
          />
          <div className="grid grid-cols-2 gap-md">
            <TextField
              label="Public email"
              type="email"
              value={publicEmail}
              onChange={(e) => setPublicEmail(e.target.value)}
              error={publicEmailError}
            />
            <TextField
              label="Public phone"
              value={publicPhone}
              onChange={(e) => setPublicPhone(e.target.value)}
              error={publicPhoneError}
            />
          </div>
          {updateProfile.isSuccess && <p className="text-body-sm text-success">Profile updated.</p>}
          {updateProfile.isError && <p className="text-body-sm text-error">{updateProfile.error.message}</p>}
          <Button
            type="submit"
            loading={updateProfile.isPending}
            disabled={Boolean(publicEmailError || publicPhoneError || descriptionError)}
            className="w-fit self-end mt-4"
          >
            Save Changes
          </Button>
        </form>
      </Card>

      <GalleryCard consultancy={consultancy} />

      <KycCard />
    </>
  )
}

const GALLERY_MAX_IMAGES = 5
const GALLERY_MAX_BYTES = 2 * 1024 * 1024 // ~2MB, mirrors the server's own cap

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('Could not read this file.'))
    reader.readAsDataURL(file)
  })
}

type GalleryImage = components['schemas']['GalleryImage']

/**
 * "Photos" — up to 5 images shown as a hero slideshow at the top of Consultancy Detail in the
 * Sentpo app (student-facing decision, 2026-08-30). If this consultancy has none, that screen's
 * layout is unchanged from today — this card is simply how a consultancy earns the slideshow.
 */
function GalleryCard({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const gallery = consultancy.gallery ?? []
  const [adding, setAdding] = useState(false)
  const atCap = gallery.length >= GALLERY_MAX_IMAGES

  return (
    <Card className="mt-lg max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-h2 text-text-primary">Photos</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            Shown as a slideshow at the top of your profile in the Sentpo app. Up to {GALLERY_MAX_IMAGES} images.
          </p>
        </div>
        <Badge color={atCap ? 'warning' : 'secondary'}>
          {gallery.length}/{GALLERY_MAX_IMAGES}
        </Badge>
      </div>

      <div className="mt-md flex flex-col gap-md">
        {gallery.length === 0 && (
          <p className="text-body-sm text-text-secondary">
            No photos yet — students see today's layout unchanged until you add one.
          </p>
        )}
        {gallery.map((image) => (
          <GalleryImageRow key={image.id} image={image} />
        ))}
      </div>

      <div className="mt-md border-t border-border pt-md">
        {atCap ? (
          <p className="text-caption text-text-secondary">
            Maximum of {GALLERY_MAX_IMAGES} photos reached — remove one to add another.
          </p>
        ) : (
          <Button variant="secondary" onClick={() => setAdding(true)}>
            Add Photo
          </Button>
        )}
      </div>

      {adding && <AddGalleryImageModal onClose={() => setAdding(false)} />}
    </Card>
  )
}

function GalleryImageRow({ image }: { image: GalleryImage }) {
  const updateImage = useUpdateGalleryImage()
  const deleteImage = useDeleteGalleryImage()
  const [title, setTitle] = useState(image.title ?? '')
  const [caption, setCaption] = useState(image.caption ?? '')
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  useEffect(() => {
    setTitle(image.title ?? '')
    setCaption(image.caption ?? '')
  }, [image.title, image.caption])

  const dirty = title !== (image.title ?? '') || caption !== (image.caption ?? '')

  return (
    <div className="flex gap-md rounded-md border border-border p-sm">
      <img
        src={mediaUrl(image.image_url)}
        alt=""
        className="h-24 w-32 shrink-0 rounded-md border border-border bg-background object-cover"
      />
      <div className="flex flex-1 flex-col gap-xs">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        {updateImage.isError && <p className="text-caption text-error">{updateImage.error.message}</p>}
        <div className="mt-xs flex items-center justify-end gap-sm">
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="text-caption text-error hover:underline"
          >
            Delete
          </button>
          {dirty && (
            <Button
              type="button"
              size="sm"
              loading={updateImage.isPending}
              onClick={() => updateImage.mutate({ imageId: image.id, title: title || null, caption: caption || null })}
            >
              Save
            </Button>
          )}
        </div>
      </div>
      {confirmingDelete && (
        <Modal
          onClose={() => setConfirmingDelete(false)}
          title="Delete Photo"
          widthRem={24}
          footer={
            <>
              <Button variant="secondary" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteImage.isPending}
                onClick={() => deleteImage.mutate(image.id, { onSuccess: () => setConfirmingDelete(false) })}
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Delete this photo{image.title ? ` ("${image.title}")` : ''}? It disappears from the slideshow students see
            immediately.
          </p>
          {deleteImage.isError && <p className="mt-sm text-body-sm text-error">{deleteImage.error.message}</p>}
        </Modal>
      )}
    </div>
  )
}

function AddGalleryImageModal({ onClose }: { onClose: () => void }) {
  const addImage = useAddGalleryImage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [caption, setCaption] = useState('')
  const [readError, setReadError] = useState<string | null>(null)

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0]
    e.target.value = ''
    if (!picked) return
    setReadError(null)
    if (picked.size > GALLERY_MAX_BYTES) {
      setReadError('Image is too large — 2MB maximum.')
      setFileName(null)
      setDataUrl(null)
      return
    }
    try {
      const encoded = await readFileAsDataUrl(picked)
      setFileName(picked.name)
      setDataUrl(encoded)
    } catch {
      setReadError('Could not read this file.')
    }
  }

  function handleSubmit() {
    if (!dataUrl) return
    addImage.mutate(
      { image_data: dataUrl, title: title.trim() || null, caption: caption.trim() || null },
      { onSuccess: () => onClose() },
    )
  }

  return (
    <Modal
      onClose={onClose}
      title="Add Photo"
      widthRem={28}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={addImage.isPending} disabled={!dataUrl} onClick={handleSubmit}>
            Add
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-md">
        <div className="flex items-center gap-sm">
          {dataUrl ? (
            <img src={dataUrl} alt="" className="h-24 w-32 shrink-0 rounded-md border border-border object-cover" />
          ) : (
            <div className="flex h-24 w-32 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-caption text-text-secondary">
              No image
            </div>
          )}
          <Button type="button" variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
            {fileName ? 'Replace' : 'Choose file'}
          </Button>
        </div>
        <p className="text-caption text-text-secondary">JPEG, PNG, GIF or WebP · 2MB maximum.</p>
        {readError && <p className="text-caption text-error">{readError}</p>}
        <input ref={inputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <TextField label="Caption" value={caption} onChange={(e) => setCaption(e.target.value)} />
        {addImage.isError && <p className="text-body-sm text-error">{addImage.error.message}</p>}
      </div>
    </Modal>
  )
}

/**
 * KYC certificate card (2026-08-19 — "option for consultancy to upload their certificate").
 * The student app's Verified badge is earned here: upload → Platform Admin reviews in Manage
 * Consultancies → badge flips. Re-uploading a certificate resets verification server-side, so
 * the pending state after a re-submit is honest, not a bug.
 */
function KycCard() {
  const kyc = useMyKyc()
  const submitKyc = useSubmitKyc()
  const [documentUrl, setDocumentUrl] = useState<string | null>(null)

  // T6 (third-pass review): loading and error used to default to 'not_submitted', showing a
  // VERIFIED consultancy the "upload your certificate" pitch — and a re-upload from there
  // genuinely resets verification (see the doc comment above). Neither state may claim a status
  // nobody has fetched yet.
  if (kyc.isLoading) {
    return (
      <Card className="mt-lg max-w-[42rem]">
        <Skeleton className="h-24 rounded-lg" />
      </Card>
    )
  }
  if (kyc.isError) {
    return (
      <Card className="mt-lg max-w-[42rem]">
        <ErrorState message="Could not load your KYC status." onRetry={() => kyc.refetch()} />
      </Card>
    )
  }

  const status = kyc.data?.status ?? 'not_submitted'

  return (
    <Card className="mt-lg max-w-[42rem]">
      <div className="flex items-center gap-sm">
        <h2 className="text-h2 text-text-primary">KYC Verification</h2>
        <Badge
          color={status === 'verified' ? 'success' : status === 'pending' ? 'warning' : 'secondary'}
          className="capitalize"
        >
          {status.replace(/_/g, ' ')}
        </Badge>
      </div>
      <p className="mt-xs text-body-sm text-text-secondary">
        {status === 'verified'
          ? 'Your certificate is verified — students see the Verified badge on your profile.'
          : status === 'pending'
            ? 'Your certificate is with the Platform Admin for review.'
            : 'Upload your registration certificate to earn the Verified badge students see.'}
      </p>
      <div className="mt-md flex flex-col gap-md">
        {kyc.data?.document_url && (
          <a
            href={kyc.data.document_url}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-body-sm text-primary underline"
          >
            View submitted certificate
          </a>
        )}
        <ImageUploadField
          label={status === 'not_submitted' ? 'Certificate' : 'Replace certificate'}
          value={documentUrl ?? ''}
          onChange={setDocumentUrl}
          hint="Image of your registration/incorporation certificate. Re-uploading restarts verification."
        />
        {submitKyc.isError && <p className="text-body-sm text-error">{submitKyc.error.message}</p>}
        {submitKyc.isSuccess && <p className="text-body-sm text-success">Submitted — pending verification.</p>}
        <Button
          className="w-fit"
          loading={submitKyc.isPending}
          disabled={!documentUrl}
          onClick={() => documentUrl && submitKyc.mutate(documentUrl, { onSuccess: () => setDocumentUrl(null) })}
        >
          Submit for verification
        </Button>
      </div>
    </Card>
  )
}

function SubscriptionTab({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const requestUpgrade = useRequestUpgrade(consultancy.id)
  const employees = useEmployees()

  const tier = consultancy.tier
  const tierIndex = TIER_ORDER.indexOf(tier)
  const nextTier = TIER_ORDER[tierIndex + 1]
  // T2: meta.total when the server provides it — items.length is only ever one page, so a
  // consultancy over one page of employees under-reported its own seat usage.
  const seatsUsed = employees.data?.meta.total ?? employees.data?.items.length ?? 0
  const seatPct = consultancy.seat_limit > 0 ? Math.min(100, (seatsUsed / consultancy.seat_limit) * 100) : 0

  // The ACTUAL effective feature set (build reference 1.16 made real, 2026-08-29) — resolved
  // preset ⊕ Super Admin override, off `consultancy.features`, rather than a static per-tier
  // list. A per-tier list would show the wrong thing the moment an override is in play (e.g. a
  // Starter consultancy with an individually-granted flag) — this always matches what's actually
  // reachable.
  const enabledFeatures = [...BUSINESS_FEATURES, ...ULTIMATE_FEATURES].filter((f) => consultancy.features?.[f.key])

  // Reflects the RECORDED request (persisted server-side via upgrade_requested_tier/_at), not
  // local-only mutation state — survives a reload instead of forgetting the moment the page
  // refreshes.
  const upgradeRequested = Boolean(consultancy.upgrade_requested_tier)

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        Your current plan, what it includes, and how many of your seats are in use.
      </p>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Membership</h2>
          <Badge color={tier === 'ultimate' ? 'primary' : tier === 'business' ? 'secondary' : 'info'}>
            {TIER_LABEL[tier] ?? tier} plan
          </Badge>
        </div>
        <ul className="mt-sm flex flex-col gap-xs">
          {STARTER_CORE_FEATURES.map((feature) => (
            <li key={feature} className="text-body-sm text-text-secondary">
              ✓ {feature}
            </li>
          ))}
          {enabledFeatures.map((feature) => (
            <li key={feature.key} className="text-body-sm text-text-secondary">
              ✓ {feature.label}
            </li>
          ))}
        </ul>
        {nextTier && (
          <div className="mt-md border-t border-border pt-md">
            {upgradeRequested ? (
              <p className="text-body-sm text-success">
                Requested — immiNow will contact you about upgrading to {TIER_LABEL[consultancy.upgrade_requested_tier!]}.
              </p>
            ) : (
              <Button
                variant="secondary"
                loading={requestUpgrade.isPending}
                onClick={() => requestUpgrade.mutate(nextTier as 'business' | 'ultimate')}
              >
                Upgrade to {TIER_LABEL[nextTier] ?? nextTier}
              </Button>
            )}
            {requestUpgrade.isError && (
              <p className="mt-xs text-body-sm text-error">{requestUpgrade.error.message}</p>
            )}
          </div>
        )}
      </Card>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Seats</h2>
          <span className="text-body-sm text-text-secondary">
            {seatsUsed} of {consultancy.seat_limit} used
          </span>
        </div>
        <div className="mt-sm h-2 rounded-full bg-background">
          <div className="h-2 rounded-full bg-primary" style={{ width: `${seatPct}%` }} />
        </div>
        <p className="mt-sm text-caption text-text-secondary">
          Each active employee account counts as one seat. Platform Admin adjusts your seat limit.
        </p>
      </Card>

      <BillingCard consultancy={consultancy} />
    </>
  )
}

function BillingCard({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
  const { subscription_started_at, subscription_expires_at, billing_cycle, subscription_amount, billing_currency } =
    consultancy

  const daysLeft = subscription_expires_at
    ? Math.ceil((new Date(subscription_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : undefined

  return (
    <Card className="max-w-[42rem]">
      <h2 className="text-h3 text-text-primary">Billing</h2>
      <dl className="mt-sm flex flex-col gap-xs text-body-sm">
        <div className="flex justify-between">
          <dt className="text-text-secondary">Plan started</dt>
          <dd className="text-text-primary">{subscription_started_at ? formatDate(subscription_started_at) : '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Renews / expires</dt>
          <dd className="text-text-primary">
            {subscription_expires_at ? formatDate(subscription_expires_at) : '—'}
            {daysLeft !== undefined && (
              <span className={`ml-xs ${daysLeft <= 30 ? 'text-error' : 'text-text-secondary'}`}>
                ({daysLeft >= 0 ? `${daysLeft} days left` : `expired ${Math.abs(daysLeft)} days ago`})
              </span>
            )}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Billing cycle</dt>
          <dd className="capitalize text-text-primary">{billing_cycle ?? '—'}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-text-secondary">Amount</dt>
          <dd className="text-text-primary">
            {subscription_amount != null
              ? `${billing_currency ?? ''} ${subscription_amount.toLocaleString()}`.trim()
              : '—'}
          </dd>
        </div>
      </dl>
      <p className="mt-sm text-caption text-text-secondary">
        Billing terms are set by immiNow — contact Platform Admin for changes or renewal.
      </p>
    </Card>
  )
}

type CommissionRate = components['schemas']['CommissionRate']

// User-requested (2026-08-19) — "the commission rates set must be visible for consultancy under
// Consultancy Management tab." Read-only mirror of Super Admin's own Commission Rates drill-down
// (`ConsultancyRatesModal`) — these rates are immiNow-set (build reference 1.17), so there's no
// edit affordance here, just visibility into what's currently configured.
function CommissionRatesTab({
  consultancy,
}: {
  consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']>
}) {
  const rates = useMyCommissionRates()

  const ratesByCountry = new Map<string, CommissionRate[]>()
  for (const rate of rates.data ?? []) {
    if (!rate.destination_country) continue
    const list = ratesByCountry.get(rate.destination_country) ?? []
    list.push(rate)
    ratesByCountry.set(rate.destination_country, list)
  }

  return (
    <>
      <p className="text-body-sm text-text-secondary">
        The commission rates immiNow has configured for your consultancy — set on your behalf, not editable here.
      </p>

      <Card className="max-w-[42rem]">
        <div className="flex items-center justify-between">
          <h2 className="text-h3 text-text-primary">Freelancer channel</h2>
          <Badge color={consultancy.freelancer_enabled ? 'success' : 'secondary'}>
            {consultancy.freelancer_enabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <p className="mt-sm text-caption text-text-secondary">
          {consultancy.freelancer_enabled
            ? 'Freelancer-sourced applicants can be allocated to you, and the freelancer-sourced rate below applies.'
            : 'Freelancer-sourced applicants cannot be allocated to you, and any freelancer-sourced rate below is not applicable. Contact Platform Admin to enable it.'}
        </p>
      </Card>

      <Card className="max-w-[42rem]">
        <h2 className="text-h3 text-text-primary">Rates by country</h2>
        {rates.isLoading && <p className="mt-sm text-body-sm text-text-secondary">Loading…</p>}
        {rates.data?.length === 0 && <p className="mt-sm text-body-sm text-text-secondary">No rates configured yet.</p>}
        <div className="mt-sm flex flex-col gap-md">
          {[...ratesByCountry.entries()].map(([country, countryRates]) => (
            <div key={country} className="flex flex-col gap-xs border-b border-border pb-md last:border-0 last:pb-0">
              <Badge color="secondary" className="w-fit">
                {country}
              </Badge>
              {countryRates.map((rate) => (
                <div key={rate.id} className="flex items-center justify-between text-body-sm">
                  <span className="capitalize text-text-secondary">{rate.payer_method}</span>
                  <span className="text-text-primary">
                    Direct {rate.direct_rate}% · Freelancer {rate.freelancer_sourced_rate}%
                    {!consultancy.freelancer_enabled && (
                      <span className="text-caption text-text-secondary"> (not applicable)</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function AllocationTab() {
  const rule = useAllocationRule()
  const employees = useEmployees()
  const updateRule = useUpdateAllocationRule()

  const [mode, setMode] = useState<'manual' | 'round_robin'>('manual')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!rule.data) return
    setMode(rule.data.mode)
    setSelected(new Set(rule.data.participating_employee_ids))
  }, [rule.data])

  function toggleEmployee(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    updateRule.mutate({ mode, participating_employee_ids: [...selected] })
  }

  if (rule.isLoading) {
    return <Skeleton className="h-40 rounded-lg" />
  }

  return (
    <Card className="max-w-[36rem]">
      <p className="text-body-sm font-medium text-text-primary">Incoming leads are allocated</p>
      <div className="mt-sm flex gap-md">
        <label className="flex items-center gap-xs text-body-sm">
          <input type="radio" checked={mode === 'manual'} onChange={() => setMode('manual')} />
          Manually
        </label>
        <label className="flex items-center gap-xs text-body-sm">
          <input type="radio" checked={mode === 'round_robin'} onChange={() => setMode('round_robin')} />
          Automatically (round-robin)
        </label>
      </div>

      {mode === 'round_robin' && (
        <div className="mt-md border-t border-border pt-md">
          <p className="text-body-sm font-medium text-text-primary">Participating consultants</p>
          <p className="text-caption text-text-secondary">
            New leads rotate between these employees, balanced by current load.
          </p>
          <div className="mt-sm flex flex-col gap-xs">
            {employees.data?.items.map((emp) => (
              <label key={emp.id} className="flex items-center gap-xs text-body-sm">
                <input
                  type="checkbox"
                  checked={selected.has(emp.id)}
                  onChange={() => toggleEmployee(emp.id)}
                  className="h-4 w-4"
                />
                {emp.user.first_name} {emp.user.last_name}
              </label>
            ))}
          </div>
        </div>
      )}

      {updateRule.isSuccess && <p className="mt-md text-body-sm text-success">Saved.</p>}
      <Button className="mt-md" loading={updateRule.isPending} onClick={handleSave}>
        Save
      </Button>
    </Card>
  )
}

// User-requested (2026-08-15) — "wherever there is delete, confirm popup is needed." Was a bare
// ✕ that removed the tag immediately.
function DeleteTagTrigger({ tagId, tagName }: { tagId: string; tagName: string }) {
  const deleteTag = useDeleteTag()
  const [confirming, setConfirming] = useState(false)

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        className="text-caption text-error hover:underline"
        aria-label={`Delete ${tagName}`}
      >
        ✕
      </button>
      {confirming && (
        <Modal
          onClose={() => setConfirming(false)}
          title="Delete Tag"
          widthRem={24}
          footer={
            <div className="flex justify-end gap-sm">
              <Button variant="secondary" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                loading={deleteTag.isPending}
                onClick={() => deleteTag.mutate(tagId, { onSuccess: () => setConfirming(false) })}
              >
                Delete
              </Button>
            </div>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Delete <span className="font-medium text-text-primary">{tagName}</span>? It won't be offered for new
            tagging, but leads and clients already tagged with it keep it.
          </p>
        </Modal>
      )}
    </>
  )
}

function TagManagementTab() {
  const tags = useTags()
  const createTag = useCreateTag()
  const [name, setName] = useState('')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name) return
    createTag.mutate(name, { onSuccess: () => setName('') })
  }

  return (
    <>
      <p className="text-body-sm text-text-secondary">Tags applied to leads and clients, filterable in list views.</p>

      <Card className="max-w-[32rem]">
        <form onSubmit={handleSubmit} className="flex items-end gap-sm">
          <TextField label="New tag" value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button type="submit" loading={createTag.isPending} disabled={!name}>
            Add
          </Button>
        </form>
        {createTag.isError && <p className="mt-sm text-body-sm text-error">{createTag.error.message}</p>}
      </Card>

      <Card className="max-w-[32rem]">
        {tags.isLoading && <p className="text-body-sm text-text-secondary">Loading…</p>}
        {tags.data?.length === 0 && <p className="text-body-sm text-text-secondary">No tags yet.</p>}
        <div className="flex flex-wrap gap-sm">
          {tags.data?.map((tag) => (
            <div key={tag.id} className="flex items-center gap-xs">
              <Badge color="secondary">{tag.name}</Badge>
              <DeleteTagTrigger tagId={tag.id} tagName={tag.name} />
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

type TransferCode = components['schemas']['TransferCode']

const CODE_STATUS_META: Record<string, { label: string; color: 'success' | 'secondary' | 'warning' }> = {
  active: { label: 'Active', color: 'success' },
  used: { label: 'Used', color: 'secondary' },
  expired: { label: 'Expired', color: 'warning' },
}

// Incoming Transfers (build reference 1.18, reworked 2026-08-20 — "Transfer code should come
// from receiving consultancy... do not involve immiNow admin"): THIS consultancy mints the
// one-time code that lets another consultancy transfer a student in. Issuing a code is this
// consultancy's consent to accept the case, which is why it lives here and not in any admin
// console. The code is bound to the student's registered email — the only cross-tenant key the
// receiving side has.
function IncomingTransfersTab() {
  const codes = useTransferCodes(true)
  const issueCode = useIssueTransferCode()
  const [studentEmail, setStudentEmail] = useState('')
  const [reason, setReason] = useState('')
  const emailError = studentEmail && !isValidEmail(studentEmail) ? EMAIL_ERROR : undefined

  function handleIssue(e: FormEvent) {
    e.preventDefault()
    if (!studentEmail.trim() || Boolean(emailError) || !reason.trim()) return
    issueCode.mutate(
      { student_email: studentEmail.trim(), reason: reason.trim() },
      {
        onSuccess: () => {
          setStudentEmail('')
          setReason('')
        },
      },
    )
  }

  const columns: TableColumn<TransferCode>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (c) => <span className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold">{c.code}</span>,
    },
    { key: 'student_email', header: 'Student email', render: (c) => c.student_email },
    {
      key: 'status',
      header: 'Status',
      render: (c) => {
        const meta = CODE_STATUS_META[c.status] ?? { label: c.status, color: 'secondary' as const }
        return <Badge color={meta.color}>{meta.label}</Badge>
      },
    },
    { key: 'expires_at', header: 'Expires', render: (c) => formatDateTime(c.expires_at) },
    { key: 'created_at', header: 'Issued', render: (c) => formatDateTime(c.created_at) },
  ]

  return (
    <div className="flex flex-col gap-md">
      <Card className="flex flex-col gap-md">
        <div>
          <h2 className="text-h3 text-text-primary">Accept an incoming transfer</h2>
          <p className="mt-xs text-body-sm text-text-secondary">
            When another consultancy wants to transfer an applicant to you, issue a code here and share it with them —
            they need it to complete the transfer. Issuing a code is your consent to take the case. Codes are single-use
            and expire after 72 hours.
          </p>
        </div>
        <form onSubmit={handleIssue} className="flex flex-wrap items-end gap-sm">
          <TextField
            label="Student's registered email"
            required
            type="email"
            value={studentEmail}
            onChange={(e) => setStudentEmail(e.target.value)}
            error={emailError}
            className="max-w-[20rem]"
          />
          <TextField
            label="Reason"
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="max-w-[20rem]"
          />
          <Button
            type="submit"
            loading={issueCode.isPending}
            disabled={!studentEmail.trim() || Boolean(emailError) || !reason.trim()}
          >
            Issue Code
          </Button>
          {issueCode.isError && <span className="self-center text-body-sm text-error">{issueCode.error.message}</span>}
        </form>
        {issueCode.isSuccess && issueCode.data && (
          <p className="text-body-sm text-text-primary">
            Code{' '}
            <span className="rounded bg-background px-1.5 py-0.5 font-mono font-semibold">{issueCode.data.code}</span>{' '}
            <span className="text-text-secondary">
              issued for {issueCode.data.student_email} — share it with the sending consultancy. Valid until{' '}
              {formatDateTime(issueCode.data.expires_at)}.
            </span>
          </p>
        )}
      </Card>

      <Table
        columns={columns}
        rows={codes.data?.items ?? []}
        rowKey={(c) => c.code}
        loading={codes.isLoading}
        emptyMessage="No transfer codes issued yet."
      />
    </div>
  )
}
