import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { components } from '@/api/schema'

type User = components['schemas']['User']

interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  user: User | null
  setSession: (session: { access_token: string; refresh_token: string; user: User }) => void
  setUser: (user: User) => void
  /**
   * Replaces the access token alone, leaving the refresh token and user untouched — what
   * `/auth/refresh` returns. Deliberately separate from `setSession`, which requires all three and
   * would force the refresh path to re-supply a user it never fetched.
   */
  setAccessToken: (accessToken: string) => void
  clear: () => void
}

// Session persists to sessionStorage only (cleared on tab close) — a pragmatic Phase 2 choice
// while auth runs against the mock server; Phase 6 swaps this for real Cognito token handling
// (TRD Section 9), not just a longer-lived storage mechanism.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      setSession: ({ access_token, refresh_token, user }) =>
        set({ accessToken: access_token, refreshToken: refresh_token, user }),
      setUser: (user) => set({ user }),
      setAccessToken: (accessToken) => set({ accessToken }),
      clear: () => set({ accessToken: null, refreshToken: null, user: null }),
    }),
    {
      name: 'imminow-auth',
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
