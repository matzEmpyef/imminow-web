/**
 * Whether an address from the server is safe to send the browser to: a web address only. A
 * `javascript:` or `data:` address would run in this page.
 */
export function isWebAddress(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Leave this page for another address. A function of its own so a test can stand in for it. */
export function goTo(address: string): void {
  window.location.assign(address)
}
