const AVATAR_THEMES = [
  { bg: 'bg-primary-subtle', text: 'text-primary' },
  { bg: 'bg-secondary-subtle', text: 'text-secondary' },
  { bg: 'bg-success-subtle', text: 'text-success' },
  { bg: 'bg-warning-subtle', text: 'text-warning' },
  { bg: 'bg-info-subtle', text: 'text-info' },
] as const

// Deterministic per-person color (not random) so the same conversation always gets the same
// tint — shared between GlobalChatDrawer and InternalMessagingPage (both list conversation rows
// with a colored initial-letter avatar).
export function avatarTheme(key: string) {
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash + key.charCodeAt(i)) % AVATAR_THEMES.length
  return AVATAR_THEMES[hash]
}
