/**
 * Resolves an image URL the API may return either absolute or host-relative.
 *
 * `POST /media` returns `/media/<id>` rather than an absolute URL, because in development the two
 * clients reach the same API on different origins — this console at `localhost:4000`, the Android
 * emulator at `10.0.2.2:4000` — so an absolute URL baked at upload time loads in whichever client
 * uploaded it and 404s in the other. (Found 2026-08-18: an ad uploaded here was invisible in the
 * app.)
 *
 * A bare relative path would also be wrong *here*, because this app is served from :5174 while the
 * API is on :4000 — the browser would resolve it against the dev server and 404. So it is joined
 * to `VITE_API_BASE_URL` explicitly.
 *
 * Absolute URLs pass through untouched, so seeded third-party images keep working and the Phase 6
 * move to real CDN URLs needs no change here. Mirrors `resolveMediaUrl` in the Flutter client.
 */
export function mediaUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url
  if (!url.startsWith('/')) return url
  return `${import.meta.env.VITE_API_BASE_URL}${url}`
}
