/** The server counts the days (India's calendar, its own clock); the page never uses the browser's clock. */
export function waitingText(days: number): string {
  return days === 0 ? 'Today' : `${days} day${days === 1 ? '' : 's'}`
}
