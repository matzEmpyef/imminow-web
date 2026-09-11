import { create } from 'zustand'

// The console's one toast (2026-09-12, user: "make toast a shared component"). Call
// `showToast('Invite sent to …')` from anywhere — a mutation's onSuccess, after a modal closes —
// and the single <ToastViewport /> (components/Toast.tsx) mounted at the app root shows it. It
// lives in a store rather than page state so the message survives the modal or drawer that
// triggered it closing. Kept apart from the component so that file exports components only
// (fast refresh).
//
// For short confirmations of something that just happened. Anything the person must act on, or
// an error tied to a field, stays inline where the problem is.

export type ToastTone = 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

interface ToastState {
  toasts: ToastItem[]
  push: (message: string, tone: ToastTone) => void
  dismiss: (id: number) => void
}

// A burst of actions shows the latest few, not a growing stack.
const MAX_VISIBLE = 3

let nextId = 1

export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],
  push: (message, tone) =>
    set((state) => ({ toasts: [...state.toasts, { id: nextId++, message, tone }].slice(-MAX_VISIBLE) })),
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export function showToast(message: string, tone: ToastTone = 'success') {
  useToastStore.getState().push(message, tone)
}
