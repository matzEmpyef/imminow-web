// Counts the server may have stopped counting (contract gate 6; product owner, 2026-09-25). The
// course search counts a result only up to its cap of 10,000 and says so with
// `meta.total_capped` / `meta.below_count_capped`; such a count reads "10,000+". The cap itself is
// the SERVER's — nothing here hard-codes 10,000, the flag alone adds the "+".
//
// Every count the console prints through this reads the same way, grouped in threes ("1,250" — a
// count, not a rupee amount, so no lakh grouping; the student app formats counts the same way), so a
// capped "10,000+" never sits beside an ungrouped "9999".

/** "1,250", or "10,000+" when the server stopped counting there. */
export function formatCount(count: number, capped?: boolean): string {
  return `${count.toLocaleString('en-US')}${capped ? '+' : ''}`
}

/**
 * The count with its noun: "1 course", "1,250 courses", "10,000+ courses". A capped count is
 * always plural (there are more than it says).
 */
export function countOf(count: number, capped: boolean | undefined, one: string, many = `${one}s`): string {
  return `${formatCount(count, capped)} ${count === 1 && !capped ? one : many}`
}
