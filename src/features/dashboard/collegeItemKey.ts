import type { components } from '@/api/schema'

/**
 * The key for one row of "Offers awaiting decision" or "Ready to apply". The feed gives these
 * rows no id of their own, and a student who adds two colleges in one go has two rows with the
 * same case and the same moment, so the case and the moment alone are not unique: React then
 * warned of "two children with the same key" and could drop or double a row (UL19 / T4-35). The
 * college, the course and the row's place in the list make each key different.
 */
export function collegeItemKey(item: components['schemas']['ActivityCollegeItem'], index: number): string {
  return [item.journey_id, item.since, item.college_name ?? '', item.course_name ?? '', index].join('|')
}
