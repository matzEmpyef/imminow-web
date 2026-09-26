import { create } from 'zustand'

interface IdleLockState {
  /** True from the 28-minute mark until activity clears it or the 30-minute lock fires. */
  warning: boolean
  /** Live countdown to the 30-minute lock, in whole seconds — 0 when `warning` is false. */
  secondsRemaining: number
}

// The idle lock's own UI state, separate from `authStore` (signed-in/out) — mirrors
// `lib/realtime/store.ts`'s split between "the manager's lifecycle" and "the data it drives."
// `IdleWarningModal` (mounted once at the app root, like `ToastViewport`) reads this to decide
// whether to render at all.
export const useIdleLockStore = create<IdleLockState>(() => ({
  warning: false,
  secondsRemaining: 0,
}))

export function setIdleWarning(warning: boolean, secondsRemaining = 0): void {
  useIdleLockStore.setState({ warning, secondsRemaining })
}
