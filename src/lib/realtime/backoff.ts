/**
 * Reconnect backoff for the realtime socket (asyncapi.yaml "Liveness, reconnect, drain": "1 s
 * doubling to 30 s, with full jitter"). Full jitter (AWS's own term for it) means the delay is a
 * uniform random draw between 0 and the exponential ceiling, not the ceiling itself — spreads a
 * fleet of reconnecting clients out instead of having them all retry in lockstep.
 *
 * `attempt` is 0 on the first reconnect after a clean connection, incrementing with each further
 * failure; the caller resets it to 0 once `hello` arrives on a fresh connection.
 */
export function fullJitterBackoffMs(
  attempt: number,
  random: () => number = Math.random,
  baseMs = 1000,
  capMs = 30000,
): number {
  const ceiling = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt))
  return Math.floor(random() * ceiling)
}
