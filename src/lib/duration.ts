/**
 * A length of time given in hours, in words (T4-34). "2862h" meant nothing at a glance; this reads
 * "119 days 6 hours". Under an hour it says so, under two days it stays in hours, and from two
 * days it gives whole days and the hours left over.
 */
export function hoursInWords(hours: number): string {
  const total = Math.max(0, Math.round(hours))
  if (total < 1) return 'less than an hour'
  const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`
  if (total < 48) return plural(total, 'hour')
  const days = Math.floor(total / 24)
  const rest = total % 24
  return rest === 0 ? plural(days, 'day') : `${plural(days, 'day')} ${plural(rest, 'hour')}`
}

/**
 * A whole number of days, in words: "1 day", "5 days". Used where a median is shown as a count of
 * days, so it never reads "5d" or "40days".
 */
export function daysInWords(days: number): string {
  const total = Math.max(0, Math.round(days))
  return `${total} ${total === 1 ? 'day' : 'days'}`
}
