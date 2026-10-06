import { useCallback, useEffect, useState } from 'react'

/**
 * A wait that counts down once a second (a resend timer, a "try again in" from a 429). `start(n)`
 * begins an n-second wait, replacing any running one; `secondsLeft` is 0 when nothing is running.
 */
export function useCountdown() {
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (endsAt === null) return
    const timer = setInterval(() => {
      const t = Date.now()
      setNow(t)
      if (t >= endsAt) setEndsAt(null)
    }, 1000)
    return () => clearInterval(timer)
  }, [endsAt])

  const start = useCallback((seconds: number) => {
    const t = Date.now()
    setNow(t)
    setEndsAt(seconds > 0 ? t + seconds * 1000 : null)
  }, [])

  const secondsLeft = endsAt === null ? 0 : Math.max(0, Math.ceil((endsAt - now) / 1000))
  return { secondsLeft, start }
}
