/**
 * Shared CSV export helpers (2026-09-12) — every export on the platform (Audit Log, event
 * registrant lists, the Quiz leaderboard) had grown its own copy of "quote a cell if it has a
 * comma/quote/newline" plus its own Blob-and-object-URL download dance. One column-name/quoting
 * bug fixed in one copy left the others carrying it. This is the one place both live now; new
 * exports (Sentpo Users / immiNow Users, still to come) should build on this rather than adding a
 * fourth copy.
 */

export interface CsvColumn<T> {
  header: string
  /** Anything stringifiable; `null`/`undefined` render as an empty cell, never "null" or "undefined". */
  value: (row: T) => string | number | null | undefined
}

function csvCell(raw: string | number | null | undefined): string {
  const value = raw == null ? '' : String(raw)
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Builds a CSV string (CRLF line endings, RFC 4180 quoting) from rows and a column spec. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => c.header).join(',')
  const lines = rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(','))
  return [header, ...lines].join('\r\n')
}

/**
 * Triggers a browser download of CSV text — a throwaway Blob + object URL + click'd anchor, no
 * server round trip, revoked right after so the URL doesn't linger.
 */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
