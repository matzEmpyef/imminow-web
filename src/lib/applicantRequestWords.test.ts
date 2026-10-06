import { describe, expect, it } from 'vitest'
import { ApiError } from '@/api/errors'
import {
  PROPOSAL_ENDED_LABEL,
  REQUEST_STATUS_LABEL,
  createApplicantErrorMessage,
  dailyLimitLine,
  requestStatusLabel,
} from './applicantRequestWords'

function refusal(status: number, code: string, message: string) {
  return new ApiError('Could not create this applicant.', { error: { code, message } }, status)
}

describe('request and proposal status words', () => {
  it('names every way a request can end', () => {
    expect(REQUEST_STATUS_LABEL).toMatchObject({
      approved: 'Accepted',
      declined: 'Declined',
      expired: 'Expired',
      cancelled: 'Cancelled',
      withdrawn: 'Withdrawn',
    })
  })

  it('words the two statuses a taken-back proposal can have', () => {
    expect(PROPOSAL_ENDED_LABEL.withdrawn).toBe('The student withdrew their request')
    expect(PROPOSAL_ENDED_LABEL.cancelled).toBe('Cancelled')
  })

  it('a request whose typed details were erased reads Expired, whatever its status', () => {
    expect(requestStatusLabel({ status: 'declined', requested: null })).toBe('Expired')
    expect(requestStatusLabel({ status: 'approved', requested: null })).toBe('Expired')
    expect(
      requestStatusLabel({ status: 'declined', requested: { first_name: 'A', last_name: 'B', email: 'a@example.com' } }),
    ).toBe('Declined')
  })
})

describe('dailyLimitLine', () => {
  it('is null when the server sent no daily_limit', () => {
    expect(dailyLimitLine(undefined)).toBeNull()
  })

  it('counts what is left', () => {
    const resets_at = '2026-10-06T18:30:00Z'
    expect(dailyLimitLine({ remaining: 5, resets_at })).toBe(
      '5 requests to existing students left today. The limit resets tomorrow.',
    )
    expect(dailyLimitLine({ remaining: 1, resets_at })).toBe(
      '1 request to existing students left today. The limit resets tomorrow.',
    )
    expect(dailyLimitLine({ remaining: 0, resets_at })).toBe(
      '0 requests to existing students left today. The limit resets tomorrow.',
    )
  })
})

describe('createApplicantErrorMessage', () => {
  it('uses the server message for the limit, the wait, the chat conflict and a suspended consultancy', () => {
    for (const code of ['limit_reached', 'request_cooldown', 'conflict', 'consultancy_unavailable']) {
      expect(createApplicantErrorMessage(refusal(409, code, `server says ${code}`))).toBe(`server says ${code}`)
    }
  })

  it('never repeats the server text for a held email or phone', () => {
    expect(createApplicantErrorMessage(refusal(409, 'identifier_in_use', 'This person already has an account.'))).toBe(
      "This email or phone is already in use on Sentpo and can't be added here.",
    )
  })

  it('words a rate limit by status or by code', () => {
    expect(createApplicantErrorMessage(refusal(429, 'rate_limited', 'slow down'))).toBe(
      'Too many attempts. Please try again later.',
    )
    expect(createApplicantErrorMessage(new ApiError('x', { error: { code: 'rate_limited' } }))).toBe(
      'Too many attempts. Please try again later.',
    )
  })

  it('falls back to the error message for anything else', () => {
    expect(createApplicantErrorMessage(new Error('Failed to fetch'))).toBe('Failed to fetch')
  })
})
