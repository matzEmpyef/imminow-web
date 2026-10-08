// Router state the Forms list sends along with "Edit anyway", so the editor does not ask the same
// question a second time. Opening the editor any other way (a link, a reload of a fresh tab)
// carries no state, and the editor asks.
export const EDIT_DEFAULT_CONFIRMED = { editDefaultConfirmed: true } as const

export function isEditDefaultConfirmed(state: unknown): boolean {
  return Boolean(state && typeof state === 'object' && 'editDefaultConfirmed' in state && state.editDefaultConfirmed)
}
