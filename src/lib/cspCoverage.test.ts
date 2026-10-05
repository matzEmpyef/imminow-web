import { describe, expect, it } from 'vitest'
import vercelConfig from '../../vercel.json'
import {
  STORAGE_ORIGIN_PLACEHOLDER,
  checkConnectSrc,
  connectSources,
  cspFromVercelConfig,
  isCovered,
} from './cspCoverage'

const POLICY =
  "default-src 'self'; script-src 'self'; connect-src 'self' https://api.example.org wss://api.example.org https://files.example.org; object-src 'none'"

describe('connectSources', () => {
  it('reads the connect-src list', () => {
    expect(connectSources(POLICY)).toEqual([
      "'self'",
      'https://api.example.org',
      'wss://api.example.org',
      'https://files.example.org',
    ])
  })

  it('falls back to default-src when there is no connect-src', () => {
    expect(connectSources("default-src 'self' https://a.example")).toEqual(["'self'", 'https://a.example'])
  })
})

describe('isCovered', () => {
  it('an https entry does not cover the wss form of the same host', () => {
    expect(isCovered('https://api.example.org', ['https://api.example.org'])).toBe(true)
    expect(isCovered('wss://api.example.org', ['https://api.example.org'])).toBe(false)
    expect(isCovered('wss://api.example.org', ['wss://api.example.org'])).toBe(true)
  })

  it("does not count 'self', another host, or another port", () => {
    expect(isCovered('https://api.example.org', ["'self'"])).toBe(false)
    expect(isCovered('https://api.example.org', ['https://other.example.org'])).toBe(false)
    expect(isCovered('https://api.example.org:8443', ['https://api.example.org'])).toBe(false)
    expect(isCovered('https://api.example.org', ['https://api.example.org:443'])).toBe(true)
  })

  it('understands a bare scheme and a wildcard host', () => {
    expect(isCovered('https://bucket.s3.ap-south-1.amazonaws.com', ['https:'])).toBe(true)
    expect(isCovered('https://bucket.s3.ap-south-1.amazonaws.com', ['https://*.amazonaws.com'])).toBe(true)
    expect(isCovered('https://amazonaws.com.evil.example', ['https://*.amazonaws.com'])).toBe(false)
    expect(isCovered('wss://api.example.org', ['https:'])).toBe(false)
  })
})

describe('checkConnectSrc', () => {
  it('passes when the API, its wss form and the storage origin are all listed', () => {
    const result = checkConnectSrc({
      policy: POLICY,
      apiBaseUrl: 'https://api.example.org/v1',
      uploadOrigin: 'https://files.example.org',
    })
    expect(result).toEqual({ errors: [], warnings: [] })
  })

  it('fails when the API origin is not listed', () => {
    const { errors } = checkConnectSrc({ policy: POLICY, apiBaseUrl: 'https://api.elsewhere.org/v1' })
    expect(errors).toHaveLength(2) // the https origin and its wss form
    expect(errors[0]).toContain('https://api.elsewhere.org')
    expect(errors[1]).toContain('wss://api.elsewhere.org')
  })

  it('fails when only the https form of the API is listed', () => {
    const { errors } = checkConnectSrc({
      policy: "connect-src 'self' https://api.example.org",
      apiBaseUrl: 'https://api.example.org/v1',
    })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('wss://api.example.org')
  })

  it('fails when the configured storage origin is not listed', () => {
    const { errors } = checkConnectSrc({
      policy: POLICY,
      apiBaseUrl: 'https://api.example.org/v1',
      uploadOrigin: 'https://bucket.s3.ap-south-1.amazonaws.com',
    })
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('https://bucket.s3.ap-south-1.amazonaws.com')
  })

  it('fails on a value that is not an address at all', () => {
    expect(checkConnectSrc({ policy: POLICY, apiBaseUrl: '/v1' }).errors).toHaveLength(1)
    expect(
      checkConnectSrc({ policy: POLICY, apiBaseUrl: 'https://api.example.org', uploadOrigin: 'bucket' }).errors,
    ).toHaveLength(1)
  })

  it('warns, without failing, when no storage origin is configured or the placeholder is still there', () => {
    const { errors, warnings } = checkConnectSrc({
      policy: `${POLICY.replace('https://files.example.org', STORAGE_ORIGIN_PLACEHOLDER)}`,
      apiBaseUrl: 'https://api.example.org/v1',
    })
    expect(errors).toEqual([])
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('VITE_UPLOAD_ORIGIN')
    expect(warnings[1]).toContain(STORAGE_ORIGIN_PLACEHOLDER)
  })

  it('the placeholder never satisfies a real storage origin', () => {
    const { errors } = checkConnectSrc({
      policy: `connect-src 'self' https://api.example.org wss://api.example.org ${STORAGE_ORIGIN_PLACEHOLDER}`,
      apiBaseUrl: 'https://api.example.org/v1',
      uploadOrigin: 'https://files.example.org',
    })
    expect(errors).toHaveLength(1)
  })
})

// The policy actually shipped. These pin what the repo can know; the storage origin is DevOps's.
describe('vercel.json', () => {
  const policy = cspFromVercelConfig(vercelConfig)

  it('has a Content-Security-Policy', () => {
    expect(policy).toBeTruthy()
  })

  it.each(['https://api-staging.imminow.org/v1', 'https://api.imminow.org/v1'])(
    'allows %s over both https and wss',
    (apiBaseUrl) => {
      expect(checkConnectSrc({ policy: policy!, apiBaseUrl }).errors).toEqual([])
    },
  )

  it('never allows a local address on the hosted policy', () => {
    for (const source of connectSources(policy!)) expect(source).not.toMatch(/localhost|127\.0\.0\.1/)
  })
})
