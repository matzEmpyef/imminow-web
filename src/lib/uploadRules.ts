/**
 * What a file may be before it is sent (Phase 9, decision 154, ruling 9). The server holds the same
 * limits and is still the authority; the console says it first, so nobody waits for a large file to
 * travel only to be refused. One kind of mistake, one sentence: the type and the size are said
 * together, because the person's next step is the same either way (choose another file).
 *
 *   document   case files, the document library, a student's locker   15 MB   PDF, JPEG, PNG, WebP, Word
 *   kyc        a consultancy's certificate (kept private)             10 MB   PDF, JPEG, PNG, WebP
 *   image      a banner, a logo, a cover, a blog picture              5 MB    JPEG, PNG, WebP
 *   gallery    a picture in a consultancy's gallery                   2 MB    JPEG, PNG, WebP
 */
export type UploadKind = 'document' | 'kyc' | 'image' | 'gallery'

const MB = 1024 * 1024

const PDF = 'application/pdf'
const JPEG = 'image/jpeg'
const PNG = 'image/png'
const GIF = 'image/gif'
const WEBP = 'image/webp'
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

interface UploadRule {
  maxBytes: number
  types: readonly string[]
  sentence: string
}

export const UPLOAD_RULES: Record<UploadKind, UploadRule> = {
  document: {
    maxBytes: 15 * MB,
    types: [PDF, JPEG, PNG, WEBP, DOCX],
    sentence: 'Choose a PDF, JPEG, PNG, WebP or Word (.docx) file of up to 15 MB.',
  },
  kyc: {
    maxBytes: 10 * MB,
    types: [PDF, PNG, JPEG, WEBP],
    sentence: 'Choose a PDF, JPEG, PNG or WebP file of up to 10 MB.',
  },
  image: {
    maxBytes: 5 * MB,
    types: [JPEG, PNG, GIF, WEBP],
    sentence: 'Choose a JPEG, PNG, GIF or WebP image of up to 5 MB.',
  },
  gallery: {
    maxBytes: 2 * MB,
    types: [JPEG, PNG, GIF, WEBP],
    sentence: 'Choose a JPEG, PNG, GIF or WebP image of up to 2 MB.',
  },
}

/** The one sentence for a file of the wrong type or size. */
export function uploadSentence(kind: UploadKind): string {
  return UPLOAD_RULES[kind].sentence
}

/** The value for an `<input type="file" accept>`: the types the kind allows. */
export function uploadAccept(kind: UploadKind): string {
  return UPLOAD_RULES[kind].types.join(',')
}

/** Why this file cannot be sent as `kind`, or null when it can. An empty file is refused too. */
export function uploadProblem(file: Pick<File, 'type' | 'size'>, kind: UploadKind): string | null {
  const rule = UPLOAD_RULES[kind]
  if (!rule.types.includes(file.type)) return rule.sentence
  if (file.size < 1 || file.size > rule.maxBytes) return rule.sentence
  return null
}
