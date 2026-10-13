// T4-22 remainder: two designations of one organisation may not share a name. The check is on the
// list the page has already loaded (the server's own list is already scoped to the organisation),
// ignoring case and the spaces round the name, so "Counsellor" and " counsellor " are the same.

export const DESIGNATION_NAME_TAKEN = 'A designation with this name already exists. Choose a different name.'

/**
 * True when another designation already carries this name. Pass `exceptId` when renaming, so a
 * designation is never in conflict with itself.
 */
export function designationNameTaken(
  name: string,
  designations: readonly { id: string; name: string }[] | null | undefined,
  exceptId?: string,
): boolean {
  const wanted = name.trim().toLowerCase()
  if (!wanted) return false
  return (designations ?? []).some((d) => d.id !== exceptId && d.name.trim().toLowerCase() === wanted)
}
