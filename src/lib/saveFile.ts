/**
 * Saving a file the server sent as the body of an answer (the catalogue import's workbook and its
 * error list). Those routes need the signed-in caller, so the file cannot be a plain link: it is
 * fetched like any other answer and handed to the browser from memory.
 */

/**
 * The file name the server gave in `Content-Disposition`, or `fallback` when the header is
 * missing (a browser hides it from the page unless the server exposes it) or names nothing.
 */
export function fileNameFrom(response: { headers?: Headers } | undefined, fallback: string): string {
  const header = response?.headers?.get?.('Content-Disposition') ?? ''
  const encoded = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header)
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim())
    } catch {
      // An unreadable name: fall through to the plain one.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/.exec(header)
  const name = (plain?.[2] ?? plain?.[1] ?? '').trim()
  return name || fallback
}

/** Hands the file to the browser's own download: a throwaway object URL and a clicked link. */
export function saveBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * A title made safe to use in a download's file name: letters of every script (with their vowel
 * signs), digits, spaces, hyphens and underscores stay; everything else (slashes, quotes, colons,
 * emoji) goes. A title in Hindi or Tamil keeps its letters, so the file is not called "-leaderboard.csv".
 * Falls back to `fallback` when nothing is left.
 */
export function fileNameStem(title: string | null | undefined, fallback: string): string {
  const stem = (title ?? '')
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}_ -]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
  return stem || fallback
}
