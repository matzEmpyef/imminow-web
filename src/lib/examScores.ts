/**
 * A score typed for an exam is checked against the range that exam is set up with in Catalog
 * Settings (its minimum and maximum value), so a course cannot ask for an IELTS 65 or a GRE of 3.1
 * (decision 154: course score inputs are tied to the exam's range). An exam with no range set asks
 * nothing more than that the score is a number.
 */
export interface ExamRange {
  name?: string | null
  min_value?: number | null
  max_value?: number | null
}

function plain(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(4)))
}

/** The sentence for a score outside its exam's range, else undefined. Empty is not an error here. */
export function examScoreError(value: string, exam: ExamRange | undefined): string | undefined {
  if (value.trim() === '') return undefined
  const score = Number(value)
  if (!Number.isFinite(score)) return 'Enter a score as a number.'
  const min = exam?.min_value ?? null
  const max = exam?.max_value ?? null
  const forExam = exam?.name ? ` for ${exam.name}` : ''
  if (min !== null && max !== null && (score < min || score > max)) {
    return `Enter a score from ${plain(min)} to ${plain(max)}${forExam}.`
  }
  if (min !== null && max === null && score < min) return `Enter a score of ${plain(min)} or more${forExam}.`
  if (max !== null && min === null && score > max) return `Enter a score of ${plain(max)} or less${forExam}.`
  return undefined
}
