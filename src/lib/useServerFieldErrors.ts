import { useState } from 'react'
import { fieldMessages } from '@/api/errors'

/**
 * Puts the server's own sentence beside the field it is about (decision 154, ruling 14). A refused
 * save names the fields it refused in `details.fields`; this hook gives each form
 *
 *   - `messageFor(field)`: the sentence for that field, until its value changes (a sentence about
 *     what was sent says nothing about what is typed now);
 *   - `allBesideFields`: true when every field the server named is one of this form's own, so the
 *     form need not repeat the general sentence in its footer (it is never repeated once the field
 *     has been edited either).
 *
 * `values` maps the server's field names to the form's current values. An alias is allowed:
 * `messageFor('email', 'new_email')` looks under either name.
 */
export function useServerFieldErrors(error: unknown, values: Record<string, string>) {
  const messages = fieldMessages(error)
  // The values as they stood when this refusal arrived: the form is re-read against them.
  const [seen, setSeen] = useState<{ error: unknown; values: Record<string, string> } | null>(null)
  if (error && seen?.error !== error) setSeen({ error, values })
  const sent = seen && seen.error === error ? seen.values : values

  function messageFor(field: string, ...aliases: string[]): string | undefined {
    const key = [field, ...aliases].find((name) => messages[name])
    if (!key) return undefined
    return values[field] === sent[field] ? messages[key] : undefined
  }

  const named = Object.keys(messages)
  const known = new Set(Object.keys(values))
  const allBesideFields = named.length > 0 && named.every((name) => known.has(name))
  return { messageFor, allBesideFields }
}
