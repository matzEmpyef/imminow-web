import { create } from 'zustand'

export interface ChatWindowConversation {
  id: string
  type: 'lead' | 'client' | 'internal'
  name: string
  // Optional role/kind pill text (e.g. "Admin", "Team") — carried through from whichever list
  // the window was opened from so the floating header matches without re-deriving it.
  badge?: string | null
}

interface ChatWindowState {
  conversation: ChatWindowConversation | null
  minimized: boolean
  open: (conversation: ChatWindowConversation) => void
  close: () => void
  toggleMinimize: () => void
}

// One floating chat window at a time (not Facebook's multi-window stacking — this app doesn't
// need to juggle several simultaneous conversations). In-memory only, not persisted — closing the
// tab or reloading clears it, same as the window itself would disappear. (The Global Chat Drawer
// was removed 2026-08-19 and restored 2026-08-20; its open state lives in the component now, and
// the window always sits at the right edge — the drawer overlays it briefly while open, which is
// fine since picking a conversation closes the drawer.)
export const useChatWindowStore = create<ChatWindowState>((set) => ({
  conversation: null,
  minimized: false,
  open: (conversation) => set({ conversation, minimized: false }),
  close: () => set({ conversation: null, minimized: false }),
  toggleMinimize: () => set((s) => ({ minimized: !s.minimized })),
}))
