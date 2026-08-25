import { useEffect, useState } from 'react'

// The one debounce implementation in the app — GlobalSearch.tsx and Table.tsx each used to own a
// private setTimeout at the same 300ms constant (Table.tsx's own comment even said "matches
// GlobalSearch.tsx's DEBOUNCE_MS"), which is the kind of duplication that drifts the moment one
// of the two gets tuned and the other doesn't.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timeout)
  }, [value, delayMs])

  return debounced
}
