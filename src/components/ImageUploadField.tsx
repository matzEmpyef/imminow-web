import { useRef, useState, type ChangeEvent } from 'react'
import { X } from 'lucide-react'
import { Button } from './Button'
import { useUploadMedia } from '@/queries/uploads'
import { mediaUrl } from '@/lib/mediaUrl'

interface ImageUploadFieldProps {
  label: string
  value: string
  onChange: (url: string) => void
  hint?: string
  disabled?: boolean
  required?: boolean
}

// User-requested (2026-08-18) — "We should be able to upload the image. No point just giving
// image name.. these are not mandatory images." A real file-picker + preview instead of a plain
// "Image URL" text field the admin had to type into by hand. Every image field defaults to
// optional; callers that do require one (Ads Manager) pass `required` for the tomato asterisk,
// on top of their own Save-button disabled state which is what actually blocks submission.
// `hint` added same day (user: "In quiz banner, ideal dimension 320×50 px. Pre-load screen
// image - 320×250 px") — a plain caption under the label, not enforced client-side (no crop tool,
// no rejected uploads); just tells the admin what to aim for before they pick a file.
// `disabled` added (2026-08-18) — Ads Manager needs to lock the image once an ad has real
// impressions ("Don't let replace ad image if impression is more than 1"); added here rather
// than as an Ads-only wrapper so the same lock affordance is available to any future caller.
export function ImageUploadField({ label, value, onChange, hint, disabled, required }: ImageUploadFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const uploadMedia = useUploadMedia()
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    uploadMedia.mutate(file, {
      onSuccess: (url) => onChange(url),
      onError: () => setError('Could not upload this image.'),
    })
  }

  return (
    <div className="flex flex-col gap-xs">
      <div>
        <span className="text-body-sm font-medium text-text-primary">
          {label}
          {required && <span className="text-required"> *</span>}
        </span>
        {hint && <p className="text-caption text-text-secondary">Ideal size: {hint}</p>}
      </div>
      <div className="flex items-center gap-sm">
        {value ? (
          <img
            src={mediaUrl(value)}
            alt=""
            className="h-14 w-24 shrink-0 rounded-md border border-border bg-background object-cover"
          />
        ) : (
          <div className="flex h-14 w-24 shrink-0 items-center justify-center rounded-md border border-dashed border-border text-caption text-text-secondary">
            No image
          </div>
        )}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          loading={uploadMedia.isPending}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          {value ? 'Replace' : 'Upload'}
        </Button>
        {value && !disabled && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label={`Remove ${label}`}
            title="Remove"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-background hover:text-error"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        disabled={disabled}
        className="hidden"
      />
      {error && <span className="text-caption text-error">{error}</span>}
    </div>
  )
}
