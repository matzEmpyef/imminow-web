import { dateRangeError } from '@/lib/validation'

/**
 * The sentence under a From / To pair whose end comes before its start (decision 154, ruling 7: every
 * end date is on or after its start). Nothing while either is empty or the pair is in order. The
 * pages also leave a bad pair out of the request, so the list never asks for an empty window.
 */
export function DateRangeProblem({ from, to }: { from: string; to: string }) {
  const problem = dateRangeError(from, to)
  if (!problem) return null
  return (
    <span role="alert" className="text-caption text-error">
      {problem}
    </span>
  )
}
