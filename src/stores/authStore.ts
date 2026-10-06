import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  /**
   * Stores the two tokens a sign-in returns. The `user` that comes with them is deliberately NOT
   * kept (review F-036): who the caller is and what they may do is `GET /me`'s answer, held in
   * the query cache only (`queries/me.ts`), so a revoked permission or a changed role is never
   * read from a copy made at sign-in.
   */
  setSession: (session: { access_token: string; refresh_token: string }) => void
  /**
   * Stores what `/auth/refresh` returns (`TokenRefresh`): always a new access token, and a new
   * refresh token only when the server rotated it — then the old one is spent and MUST be replaced
   * (openapi.yaml, TokenRefresh.refresh_token). Without one, the refresh token already held stays.
   */
  setAccessToken: (accessToken: string, rotatedRefreshToken?: string) => void
  clear: () => void
}

type Tokens = Pick<AuthState, 'accessToken' | 'refreshToken'>

// Counts sessions in this tab: it moves on every sign-in and every sign-out, and stays put when a
// token is merely renewed. A request remembers the number it was sent under, so an answer that
// comes back after the session changed (a late refusal from the account that just signed out) can
// be recognised and left alone (review F-165). In memory only: no request outlives a reload.
let sessionEpoch = 0

/** Which session of this tab is current. Compare with the value read when a request was sent. */
export function currentSessionEpoch(): number {
  return sessionEpoch
}

// Session persists to sessionStorage only (cleared on tab close) — a pragmatic Phase 2 choice
// while auth runs against the mock server; Phase 6 swaps this for real Cognito token handling
// (TRD Section 9), not just a longer-lived storage mechanism. Tokens only: `partialize` and
// `merge` both name the two fields, so a `user` left in storage by an older build is neither read
// back nor written again.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      setSession: ({ access_token, refresh_token }) => {
        sessionEpoch += 1
        set({ accessToken: access_token, refreshToken: refresh_token })
      },
      setAccessToken: (accessToken, rotatedRefreshToken) =>
        set((state) => ({ accessToken, refreshToken: rotatedRefreshToken || state.refreshToken })),
      clear: () => {
        sessionEpoch += 1
        set({ accessToken: null, refreshToken: null })
      },
    }),
    {
      name: 'imminow-auth',
      partialize: (state): Tokens => ({ accessToken: state.accessToken, refreshToken: state.refreshToken }),
      merge: (persisted, current) => {
        const stored = (persisted ?? {}) as Partial<Tokens>
        return { ...current, accessToken: stored.accessToken ?? null, refreshToken: stored.refreshToken ?? null }
      },
      storage: {
        getItem: (name) => {
          const value = sessionStorage.getItem(name)
          return value ? JSON.parse(value) : null
        },
        setItem: (name, value) => sessionStorage.setItem(name, JSON.stringify(value)),
        removeItem: (name) => sessionStorage.removeItem(name),
      },
    },
  ),
)
