/**
 * Shared CSV export helpers (2026-09-12) — every export on the platform (Audit Log, event
 * registrant lists, the Quiz leaderboard) had grown its own copy of "quote a cell if it has a
 * comma/quote/newline" plus its own Blob-and-object-URL download dance. One column-name/quoting
 * bug fixed in one copy left the others carrying it. This is the one place both live now; new
 * exports (Sentpo Users / immiNow Users, still to come) should build on this rather than adding a
 * fourth copy.
 *
 * It is also the one place a cell is made SAFE TO OPEN (review F-145). A spreadsheet program runs
 * any cell that begins with `=`, `+`, `-` or `@` as a formula. Names and free text reach every
 * export (a student's name, a consultancy's name, a reason, a note), and whoever typed them can
 * begin them with one of those characters, so the file staff open could run what a stranger
 * wrote. A text cell that begins with one (or with a tab or carriage return, which some programs
 * strip before looking) is written with a single quote in front, which makes the program show it
 * as text. NUMBERS are left alone, so a negative amount stays a number that can be added up: a
 * column that holds an amount hands this helper a number, not a formatted string.
 *
 * Three exports kept private copies of the quoting (payment history, freelancer payouts, a
 * freelancer's own referrals) and so had neither fix. They use this helper now; a test fails if
 * another copy appears.
 */

export interface CsvColumn<T> {
  header: string
  /** Anything stringifiable; `null`/`undefined` render as an empty cell, never "null" or "undefined". */
  value: (row: T) => string | number | null | undefined
}

/** A text cell a spreadsheet program would run as a formula rather than show. */
const STARTS_A_FORMULA = /^[=+\-@\t\r]/

/** One cell: made safe to open, then quoted where its content would break the row. Exported for tests. */
export function csvCell(raw: string | number | null | undefined): string {
  if (raw == null) return ''
  // A number is data, never a formula: -1250.5 must stay -1250.5.
  if (typeof raw === 'number') return String(raw)
  const value = STARTS_A_FORMULA.test(raw) ? `'${raw}` : raw
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** Builds a CSV string (CRLF line endings, RFC 4180 quoting) from rows and a column spec. */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((c) => csvCell(c.header)).join(',')
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
