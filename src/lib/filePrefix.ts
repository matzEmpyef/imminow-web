/**
 * The file-number prefix of a consultancy: up to three letters A to Z that start every client file
 * number it generates ("DEL0000001"). The server keeps it to those letters.
 *
 * It is suggested from the account's name. A name in another script (Hindi, Tamil, Bengali…) has no
 * letters A to Z, so nothing can be suggested: the admin types one, and the form says why (Phase 9,
 * decision 154, ruling 13). Letters with accents are folded to their plain letter first ("Éire"
 * gives "EIR"), which is all the suggestion needs.
 */
export const FILE_PREFIX_LENGTH = 3

/** Strips accents, then keeps the letters A to Z, in capitals. */
function plainLetters(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
}

/** The prefix suggested by a name: its first three letters A to Z. Empty for a name in another script. */
export function suggestedFilePrefix(name: string): string {
  return plainLetters(name).slice(0, FILE_PREFIX_LENGTH)
}

/** What is kept of a prefix as it is typed: letters A to Z only, in capitals, at most three. */
export function cleanFilePrefix(typed: string): string {
  return plainLetters(typed).slice(0, FILE_PREFIX_LENGTH)
}

/** Said under the field when the name gives nothing to suggest, so the admin knows why it is empty. */
export const FILE_PREFIX_NEEDS_TYPING =
  'This name has no letters A to Z, so no prefix can be suggested. Type up to 3 letters A to Z of your own.'

/** Said when a typed character was left out. */
export const FILE_PREFIX_LETTERS_ONLY = 'Only the letters A to Z can be used in a prefix.'

/** True when something typed cannot be part of a prefix (a letter of another script, a digit, a symbol). */
export function droppedFromPrefix(typed: string): boolean {
  return plainLetters(typed).length < typed.replace(/\s/g, '').length
}
