import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageUploadField } from './ImageUploadField'
import { validateImageDimensions, type AspectRequirement } from '@/lib/imageAspect'
import { QUIZ_BANNER_ASPECT, QUIZ_CARD_ASPECT } from '@/features/super-admin/quizShared'

// Image SIZES are fixed on immiNow (user decision, 2026-09-13) and the app renders every image at
// its own aspect ratio with no fixed height — so a wrong-shaped creative is not letterboxed by the
// client, it just looks wrong once it is live. This covers the refusal that stops that reaching
// POST /media at all: the pure rule, and the field actually declining to upload.
//
// A real File can't be put through a file input from this environment's browser tooling, so the
// browser walkthrough could only confirm the hint copy; the behaviour is pinned here instead, with
// `Image` stubbed to report whatever natural size a case needs.

const ADS: AspectRequirement = {
  width: 3,
  height: 1,
  tolerance: 0.05,
  idealLabel: '1200×400',
  minWidth: 600,
  subject: 'Ads',
}

const COVER: AspectRequirement = {
  width: 16,
  height: 9,
  tolerance: 0.05,
  idealLabel: '1280×720',
  minWidth: 960,
  subject: 'Event covers',
}

describe('validateImageDimensions', () => {
  it('accepts the ideal size and anything inside the tolerance', () => {
    expect(validateImageDimensions(1200, 400, ADS)).toBeNull()
    expect(validateImageDimensions(2400, 800, ADS)).toBeNull()
    // 2.97:1 — off by 0.03, inside the 0.05 allowance.
    expect(validateImageDimensions(1188, 400, ADS)).toBeNull()
    expect(validateImageDimensions(1280, 720, COVER)).toBeNull()
    expect(validateImageDimensions(1920, 1080, COVER)).toBeNull()
  })

  it('refuses a wrong ratio with the actual size, the rule and the ideal', () => {
    expect(validateImageDimensions(1200, 900, ADS)).toBe(
      'This image is 1200×900 (1.33:1). Ads need 3:1 — ideal 1200×400. Crop it and try again.',
    )
    // Just outside the allowance (2.9:1), so the message is still the crop one, not a pass.
    expect(validateImageDimensions(1160, 400, ADS)).toContain('Crop it and try again.')
    expect(validateImageDimensions(1280, 800, COVER)).toBe(
      'This image is 1280×800 (1.6:1). Event covers need 16:9 — ideal 1280×720. Crop it and try again.',
    )
  })

  // The quiz branding placements use the real exported constants rather than copies, so a change
  // to the documented sizes (8:3 banner / 8:5 shared card, both min 480 wide) fails here rather
  // than silently letting a differently-shaped creative into the quiz-taking flow.
  it('holds the quiz branding shapes to the sizes QuizBrandingModal documents', () => {
    expect(validateImageDimensions(640, 240, QUIZ_BANNER_ASPECT)).toBeNull()
    expect(validateImageDimensions(1280, 480, QUIZ_BANNER_ASPECT)).toBeNull()
    expect(validateImageDimensions(640, 400, QUIZ_BANNER_ASPECT)).toBe(
      'This image is 640×400 (1.6:1). In-quiz banners need 8:3 — ideal 640×240. Crop it and try again.',
    )

    expect(validateImageDimensions(640, 400, QUIZ_CARD_ASPECT)).toBeNull()
    expect(validateImageDimensions(960, 600, QUIZ_CARD_ASPECT)).toBeNull()
    expect(validateImageDimensions(640, 240, QUIZ_CARD_ASPECT)).toBe(
      'This image is 640×240 (2.67:1). Pre-load and Results images need 8:5 — ideal 640×400. Crop it and try again.',
    )

    // Right shape, too small for either placement.
    expect(validateImageDimensions(320, 120, QUIZ_BANNER_ASPECT)).toContain('at least 480px wide')
    expect(validateImageDimensions(320, 200, QUIZ_CARD_ASPECT)).toContain('at least 480px wide')
  })

  it('refuses an image that is too narrow even when the ratio is right', () => {
    // 300×100 is exactly 3:1 and still unusable — size is reported before shape so the advice
    // ("use a larger one") matches what is actually wrong.
    expect(validateImageDimensions(300, 100, ADS)).toBe(
      'This image is 300×100 — too small to look sharp. Ads need at least 600px wide — ideal 1200×400. Use a larger one.',
    )
    expect(validateImageDimensions(640, 360, COVER)).toContain('at least 960px wide')
  })
})

// The upload hook is the boundary this test is about: it must not be called for a refused image.
const uploadMutate = vi.fn()
vi.mock('@/queries/uploads', () => ({
  useUploadMedia: () => ({ mutate: uploadMutate, isPending: false }),
}))

// A stand-in for the browser's decoder: whatever `nextSize` holds is what the next Image() reports.
let nextSize = { width: 1200, height: 400 }
class StubImage {
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  naturalWidth = 0
  naturalHeight = 0
  set src(_value: string) {
    this.naturalWidth = nextSize.width
    this.naturalHeight = nextSize.height
    queueMicrotask(() => this.onload?.())
  }
}

function pickFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], 'creative.png', { type: 'image/png' })
  fireEvent.change(input, { target: { files: [file] } })
}

describe('ImageUploadField aspect enforcement', () => {
  beforeEach(() => {
    uploadMutate.mockReset()
    vi.stubGlobal('Image', StubImage)
    vi.stubGlobal('URL', { ...URL, createObjectURL: () => 'blob:stub', revokeObjectURL: () => {} })
  })

  it('states the requirement in the field itself', () => {
    render(<ImageUploadField label="Image" value="" onChange={vi.fn()} aspect={ADS} />)
    expect(
      screen.getByText('Must be 3:1 — ideal 1200×400, at least 600px wide. Other sizes are refused.'),
    ).toBeInTheDocument()
  })

  it('refuses a wrong-shaped file inline and never uploads it', async () => {
    const onChange = vi.fn()
    nextSize = { width: 1200, height: 900 }
    const { container } = render(<ImageUploadField label="Image" value="" onChange={onChange} aspect={ADS} />)

    pickFile(container)

    await waitFor(() =>
      expect(
        screen.getByText('This image is 1200×900 (1.33:1). Ads need 3:1 — ideal 1200×400. Crop it and try again.'),
      ).toBeInTheDocument(),
    )
    expect(uploadMutate).not.toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('uploads a correctly-shaped file as before', async () => {
    nextSize = { width: 1200, height: 400 }
    const { container } = render(<ImageUploadField label="Image" value="" onChange={vi.fn()} aspect={ADS} />)

    pickFile(container)

    await waitFor(() => expect(uploadMutate).toHaveBeenCalledTimes(1))
    expect(screen.queryByText(/Crop it and try again/)).not.toBeInTheDocument()
  })

  it('leaves fields with no aspect rule alone — any image still uploads', async () => {
    nextSize = { width: 10, height: 400 }
    const { container } = render(<ImageUploadField label="Logo" value="" onChange={vi.fn()} />)

    pickFile(container)

    await waitFor(() => expect(uploadMutate).toHaveBeenCalledTimes(1))
  })
})
