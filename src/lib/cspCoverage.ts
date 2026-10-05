// Build-time check that the hosted Content-Security-Policy (`vercel.json`) lets the console reach
// what it is built to talk to (review F-031). Imported by `vite.config.ts`, which stops a hosted
// build on an error; nothing in the app imports it, so it is not part of the bundle.
//
// The policy's `connect-src` governs `fetch`, XHR and WebSocket alike. Three kinds of address are
// involved, and only the first was ever listed:
//
//   1. the API (`VITE_API_BASE_URL`) over https;
//   2. the live connection, which is the SAME host over `wss:` — an `https://host` entry does not
//      cover a `wss://host` address, it needs its own entry;
//   3. object storage: document uploads PUT the file straight to the bucket's own origin
//      (`lib/uploads.ts`), which the build learns from `VITE_UPLOAD_ORIGIN`.
//
// `vercel.json` cannot hold comments, so the pending part is marked in the policy itself with
// STORAGE_ORIGIN_PLACEHOLDER (a reserved `.invalid` host that matches nothing): DevOps replaces it
// with the bucket origin that appears in upload addresses — `S3_ENDPOINT_URL`'s origin where that
// is set, `https://<bucket>.s3.<region>.amazonaws.com` on AWS — one entry per environment, and
// sets `VITE_UPLOAD_ORIGIN` to the same value for each hosted environment so this check can hold
// the two together. If the backend sets `REALTIME_PUBLIC_URL`, its `wss://` origin is needed too.

export const STORAGE_ORIGIN_PLACEHOLDER = 'https://REPLACE-WITH-STORAGE-BUCKET-ORIGIN.invalid'

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443', 'ws:': '80', 'wss:': '443' }

/** The `Content-Security-Policy` value out of a parsed `vercel.json`, or null when there is none. */
export function cspFromVercelConfig(config: unknown): string | null {
  const blocks = (config as { headers?: { headers?: { key?: string; value?: string }[] }[] } | null)?.headers ?? []
  for (const block of blocks) {
    for (const header of block.headers ?? []) {
      if (header.key?.toLowerCase() === 'content-security-policy' && header.value) return header.value
    }
  }
  return null
}

/** The source list of `connect-src` (falling back to `default-src`, as browsers do). */
export function connectSources(policy: string): string[] {
  const directives = new Map<string, string[]>()
  for (const part of policy.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/)
    if (name) directives.set(name.toLowerCase(), sources)
  }
  return directives.get('connect-src') ?? directives.get('default-src') ?? []
}

/**
 * Whether one of `sources` allows a request to `origin` (scheme://host[:port]). Understands what a
 * hosted policy realistically contains: `*`, a bare scheme (`https:`), an exact origin, and a
 * leading-wildcard host (`https://*.example.com`). `'self'` is deliberately NOT counted: it is the
 * console's own origin, never the API's or the bucket's.
 */
export function isCovered(origin: string, sources: string[]): boolean {
  const target = new URL(origin)
  const targetPort = target.port || DEFAULT_PORTS[target.protocol]
  return sources.some((source) => {
    if (source === '*') return target.protocol === 'https:' || target.protocol === 'http:'
    if (/^[a-z][a-z0-9+.-]*:$/i.test(source)) return source.toLowerCase() === target.protocol
    const match = /^([a-z][a-z0-9+.-]*:)\/\/([^/:]+)(?::(\d+|\*))?\/?$/i.exec(source)
    if (!match) return false
    const [, scheme, host, port] = match
    if (scheme.toLowerCase() !== target.protocol) return false
    if (port !== '*' && (port ?? DEFAULT_PORTS[target.protocol]) !== targetPort) return false
    const wanted = host.toLowerCase()
    if (wanted.startsWith('*.')) return target.hostname.endsWith(wanted.slice(1))
    return target.hostname === wanted
  })
}

function originOf(value: string): string | null {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? `${url.protocol}//${url.host}` : null
  } catch {
    return null
  }
}

export interface CspCoverageInput {
  /** The `Content-Security-Policy` header value the host will send. */
  policy: string
  /** `VITE_API_BASE_URL` for this build. */
  apiBaseUrl?: string
  /** `VITE_UPLOAD_ORIGIN` for this build — where presigned uploads are sent. */
  uploadOrigin?: string
}

/**
 * `errors` are addresses this build is configured to use that the policy would block — a hosted
 * build stops on any. `warnings` are things the check cannot verify yet.
 */
export function checkConnectSrc({ policy, apiBaseUrl, uploadOrigin }: CspCoverageInput): {
  errors: string[]
  warnings: string[]
} {
  const sources = connectSources(policy)
  const errors: string[] = []
  const warnings: string[] = []

  if (apiBaseUrl) {
    const api = originOf(apiBaseUrl)
    if (!api) {
      errors.push(`VITE_API_BASE_URL (${apiBaseUrl}) is not an http(s) address.`)
    } else {
      const live = api.replace(/^http/, 'ws')
      if (!isCovered(api, sources)) errors.push(`connect-src does not allow the API origin ${api} — every API call would be blocked.`)
      if (!isCovered(live, sources)) {
        errors.push(`connect-src does not allow ${live} — the live connection would be blocked (an ${api} entry does not cover it).`)
      }
    }
  }

  if (uploadOrigin) {
    const storage = originOf(uploadOrigin)
    if (!storage) {
      errors.push(`VITE_UPLOAD_ORIGIN (${uploadOrigin}) is not an http(s) origin.`)
    } else if (!isCovered(storage, sources)) {
      errors.push(`connect-src does not allow the storage origin ${storage} — every document upload would be blocked.`)
    }
  } else {
    warnings.push(
      'VITE_UPLOAD_ORIGIN is not set, so the storage origin cannot be checked against connect-src. ' +
        'Document uploads go straight to the storage bucket and are blocked unless its origin is listed.',
    )
  }

  if (sources.includes(STORAGE_ORIGIN_PLACEHOLDER)) {
    warnings.push(
      `connect-src still carries the placeholder ${STORAGE_ORIGIN_PLACEHOLDER} — replace it in vercel.json with the storage bucket origin.`,
    )
  }

  return { errors, warnings }
}
