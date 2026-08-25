import { useState } from 'react'

// Cursor-stack bookkeeping for Table's Next/Previous controls — the server hands back an opaque
// next_cursor (docs/sentpo_build_reference.md ~1361-1369), so "Previous" can't compute anything;
// it has to remember the cursor it came from. Pages own this (not Table itself) since the cursor
// value is a query param their own fetch hook needs — Table only ever sees hasNext/hasPrevious.
export function useCursorPagination() {
  const [stack, setStack] = useState<string[]>([])
  const [cursor, setCursor] = useState<string | undefined>(undefined)

  function next(nextCursor: string) {
    setStack((s) => [...s, cursor ?? ''])
    setCursor(nextCursor)
  }

  function previous() {
    setStack((s) => {
      if (s.length === 0) return s
      const copy = [...s]
      const prevCursor = copy.pop()
      setCursor(prevCursor || undefined)
      return copy
    })
  }

  // Call whenever sort/filter/search changes — those invalidate the cursor chain.
  function reset() {
    setStack([])
    setCursor(undefined)
  }

  return { cursor, hasPrevious: stack.length > 0, next, previous, reset }
}
