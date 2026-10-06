import type { components } from '@/api/schema'

type Course = components['schemas']['Course']

/**
 * What a college's own switch on one of its courses may do, read off the row alone (owner
 * decision 18):
 *
 *   on                                  → may be switched off
 *   off, switched off by this college   → may be switched back on
 *   off, switched off by immiNow        → locked
 *   off, never published                → locked
 *
 * The college switches back on only what it switched off itself. The server enforces the same
 * rule (409 `hidden_by_platform`); this decides what is OFFERED.
 */
export type CourseSwitchState = 'on' | 'off_by_college' | 'off_by_platform' | 'not_published'

export function courseSwitchState(course: Pick<Course, 'active' | 'hidden_by'>): CourseSwitchState {
  if (course.active !== false) return 'on'
  if (course.hidden_by === 'institute') return 'off_by_college'
  if (course.hidden_by === 'platform') return 'off_by_platform'
  return 'not_published'
}
