import { renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider, useMutation } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import type { ReactNode } from 'react'

// Several effects (mark-a-conversation-read on open, in the three conversation pages and the
// floating chat window) list `mutation.mutate` as a dependency so the exhaustive-deps rule is
// satisfied without a suppression (B5, 2026-09-03). That only holds if `mutate` keeps its identity
// across renders — React Query v5 does this — so this pins the assumption: if a future upgrade
// changed it, those effects would refire on every render and this test would fail first.
describe('useMutation().mutate', () => {
  it('keeps the same identity across re-renders', () => {
    const client = new QueryClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(() => useMutation({ mutationFn: async (id: string) => id }), { wrapper })
    const first = result.current.mutate
    rerender()
    rerender()
    expect(result.current.mutate).toBe(first)
  })
})
