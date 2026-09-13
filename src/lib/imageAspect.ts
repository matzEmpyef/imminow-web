/**
 * Fixed image shapes, enforced before upload (user decision, 2026-09-13 — "image SIZES are fixed
 * on immiNow"). The mobile app draws every image at its OWN aspect ratio with no fixed height, so
 * a wrong-shaped creative is never letterboxed by the client — it just looks wrong once it is
 * live, which is why the console refuses it at pick time rather than offering advice.
 *
 * Lives in lib/ rather than beside ImageUploadField so the rule is importable (and testable)
 * without pulling in a component — and so Fast Refresh keeps working on the field itself.
 */
export interface AspectRequirement {
  width: number
  height: number
  /** Allowed ABSOLUTE drift on the w/h ratio itself — 0.05 on a 3:1 placement accepts 2.95–3.05. */
  tolerance: number
  /** The exact pixel size to aim for, e.g. "1200×400" — quoted back in the refusal message. */
  idealLabel: string
  /** Below this the image is refused outright: upscaled on a phone it looks soft. */
  minWidth?: number
  /** Names the placement in the refusal message ("Ads need 3:1"). */
  subject?: string
}

// A ratio printed the way a person says it: "3:1", "1.78:1" — never "3.00:1".
function ratioLabel(width: number, height: number): string {
  return `${Number((width / height).toFixed(2))}:1`
}

/**
 * The whole dimension rule as a pure function — returns the message to show, or null when the
 * image is usable. Size is checked before shape: a 300×100 banner is exactly 3:1 and still
 * unusable, and being told to "crop it" would be misleading.
 */
export function validateImageDimensions(
  width: number,
  height: number,
  aspect: AspectRequirement,
): string | null {
  const subject = aspect.subject ?? 'This placement'
  if (!width || !height) {
    return 'Could not read this image’s size. Try a JPG or PNG.'
  }
  if (aspect.minWidth && width < aspect.minWidth) {
    return `This image is ${width}×${height} — too small to look sharp. ${subject} need at least ${aspect.minWidth}px wide — ideal ${aspect.idealLabel}. Use a larger one.`
  }
  const target = aspect.width / aspect.height
  if (Math.abs(width / height - target) > aspect.tolerance) {
    return `This image is ${width}×${height} (${ratioLabel(width, height)}). ${subject} need ${aspect.width}:${aspect.height} — ideal ${aspect.idealLabel}. Crop it and try again.`
  }
  return null
}

/** The requirement in one line, shown under the field's label so the rule is stated up front. */
export function aspectHintLine(aspect: AspectRequirement): string {
  const minWidth = aspect.minWidth ? `, at least ${aspect.minWidth}px wide` : ''
  return `Must be ${aspect.width}:${aspect.height} — ideal ${aspect.idealLabel}${minWidth}. Other sizes are refused.`
}

// The browser is the only thing that knows a file's real pixel size, and only once it has decoded
// it — hence an Image() against an object URL rather than reading the header ourselves. Revoked on
// both paths so a rejected pick doesn't leak the blob for the life of the tab.
export function readImageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('unreadable'))
    }
    img.src = objectUrl
  })
}
