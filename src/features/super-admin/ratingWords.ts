// Wording shared by the Ratings list, its drawer and the review drawer (owner decision 16).

/** How the student came to this consultancy: the case's channel (A, B or C). */
export function channelLabel(source: string | null | undefined): string | null {
  return source ? `Channel ${source}` : null
}

/** One decimal, as the server rounds it: 3.5, 4.0. */
export function formatStars(stars: number): string {
  return stars.toFixed(1)
}
