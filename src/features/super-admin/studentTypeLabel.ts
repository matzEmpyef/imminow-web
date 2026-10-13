// Platform-staff wording for a student's type (owner ruling, 2026-10): the stored value stays
// 'aspirant' (API enum), but staff read "lead". Lower-case on purpose — callers add `capitalize`.
export function studentTypeLabel(type: string): string {
  return type === 'aspirant' ? 'lead' : type
}
