// Split out of ConsultancyProfilePage.tsx (Phase 3 plan, Tier B2, 2026-09-03) — pure movement, no logic change.
import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
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
import { useAddGalleryImage, useDeleteGalleryImage, useMyConsultancy, useUpdateConsultancyProfile, useUpdateGalleryImage } from '@/queries/consultancy'
import { mediaUrl } from '@/lib/mediaUrl'
import { useCountries } from '@/queries/countries'
import { useMyKyc, useSubmitKyc } from '@/queries/kyc'
import type { components } from '@/api/schema'
import { EMAIL_ERROR, PHONE_ERROR, isValidEmail, isValidPhone } from '@/lib/validation'

// User-requested — Description is the short factual blurb shown in the student-facing browse
// list and near the top of Consultancy Detail, so it needs to stay scannable.
const DESCRIPTION_WORD_LIMIT = 40
function wordCount(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length
}

export function ProfileTab({ consultancy }: { consultancy: NonNullable<ReturnType<typeof useMyConsultancy>['data']> }) {
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
              className="rounded-md border border-border bg-surface px-3 py-sm text-body"
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
            className="w-fit self-end mt-md"
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
