// What a case file or a Document Library file may be: the server's own list
// (backend `app/journey/uploads/content.py`, DOCUMENT_TYPES). One copy here, so the file chooser,
// the type filter and the type label cannot drift apart (review F-305).
export const DOCUMENT_MIME_LABELS: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'Word (DOCX)',
}

/** The `accept` value for a file input that takes those types. */
export const DOCUMENT_ACCEPT = Object.keys(DOCUMENT_MIME_LABELS).join(',')
