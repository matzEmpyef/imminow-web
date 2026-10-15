import { describe, expect, it } from 'vitest'
import { CATEGORY_LABELS } from './labels'

// The complaint categories read the way the Sentpo app words them. Only the labels changed: the
// values the server sends and accepts stay as they were.
describe('complaint category labels', () => {
  it('uses the names the app shows, keeping the values', () => {
    expect(CATEGORY_LABELS).toEqual({
      consultancy_dispute: 'A problem with a consultancy or college',
      payment_issue: 'A problem with a payment',
      app_problem: 'A problem with the app',
      other: 'Other',
    })
  })
})
