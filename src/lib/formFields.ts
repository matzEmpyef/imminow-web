import type { components } from '@/api/schema'

export type FormFieldInput = components['schemas']['FormFieldInput']
export type FieldType = FormFieldInput['type']
export type Width = 'full' | 'half' | 'third'

// Types selectable from "Add Field" — group is created separately via "Add Group" (a group isn't
// itself a data field), and a table's own columns can't recurse into another table or a group.
export const FIELD_TYPES = ['text', 'long_text', 'single_select', 'multi_select', 'yes_no', 'date', 'table'] as const
export const NON_TABLE_TYPES = FIELD_TYPES.filter((t) => t !== 'table') as Exclude<
  (typeof FIELD_TYPES)[number],
  'table'
>[]

export function isSelectType(type: FieldType) {
  return type === 'single_select' || type === 'multi_select'
}

export function isGroup(field: FormFieldInput) {
  return field.type === 'group'
}

// User-requested: fields can sit side by side on desktop (Form Builder/consultant view) but
// always stack full-width below the md breakpoint, so the same field looks right on mobile
// without a separate per-device setting — plain responsive Tailwind classes, not stored state.
// CSS Grid (6 columns) rather than flexbox: a flex row with `gap` and two 50%-width children
// overflows its own 100% by the gap amount and wraps anyway, defeating the point — grid's `gap`
// is factored into track sizing correctly, so two col-span-3 items on a 6-col grid always fit
// one row. col-span-N are standard Tailwind utilities, not arbitrary values (those are known to
// generate zero CSS in this project's Tailwind v4 setup). The pairing container must render
// `grid grid-cols-6 gap-md` for these spans to apply.
//
// Container queries (`@md:`), not viewport media queries (`md:`) — caught live while testing the
// preview's Desktop/Mobile toggle: that toggle shrinks the preview's own container, not the
// actual browser viewport, so viewport-based `md:` classes never actually changed (the real
// browser window was still well past the md breakpoint regardless of the toggle). `@md:` reacts
// to the nearest `@container` ancestor's width instead, so the toggle genuinely resizes what the
// classes respond to. Tailwind v4 ships container queries natively — no plugin/config needed,
// just an ancestor with the `@container` class (FormFieldsPreview.tsx's preview wrapper). This is
// also the more correct choice long-term: whatever eventually renders a form for real (student
// mobile app or a consultant-side viewer) should size against its own container, not assume it's
// the only content in the browser viewport.
export const WIDTH_CLASSES: Record<Width, string> = {
  full: 'col-span-6',
  half: 'col-span-6 @md:col-span-3',
  third: 'col-span-6 @md:col-span-2',
}

// Where a form is FILLED IN (the client's Forms tab) rather than built, a table and a long text
// need the room, so they ignore a narrower width and take the whole row; a group is a section
// heading with its own grid inside, so it does too. Any other field honours its width. The row
// must be a `grid grid-cols-6` inside an `@container`, as in the builder's preview.
const ALWAYS_FULL_WHEN_FILLING = new Set<string>(['table', 'long_text', 'group'])

export function fillWidthClass(field: { type: string; width?: Width | string | null }): string {
  if (ALWAYS_FULL_WHEN_FILLING.has(field.type)) return WIDTH_CLASSES.full
  return WIDTH_CLASSES[(field.width as Width | null | undefined) ?? 'full'] ?? WIDTH_CLASSES.full
}

export const WIDTH_LABELS: Record<Width, string> = {
  full: 'Full width',
  half: 'Half width',
  third: 'Third width',
}

// New fields get a client-generated id immediately (rather than leaving it undefined until
// save) so drag-and-drop has a stable identity to track from the moment a field is created —
// the server already accepts a client-supplied id as "preserve this one," per
// FormFieldInput.id's own description, so this isn't a special case for it.
export function newFieldId() {
  return crypto.randomUUID()
}

/**
 * How many fields a person fills in on a form: every field inside a group, each field outside
 * one, and a table as one. A group is a heading, not a field, so it is not counted itself.
 */
export function countFillableFields(
  fields: readonly { type: FieldType; fields?: readonly unknown[] }[] | undefined,
): number {
  let count = 0
  for (const f of fields ?? []) {
    if (f.type === 'group') count += f.fields?.length ?? 0
    else count += 1
  }
  return count
}

export function listGroups(fields: FormFieldInput[]): { id: string; label: string }[] {
  return fields.filter((f) => isGroup(f) && f.id).map((f) => ({ id: f.id!, label: f.label }))
}

function isFilledCell(value: unknown): boolean {
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  return value !== undefined && value !== null
}

/** A table row with nothing answered in it: not an object, or every cell empty. */
export function isBlankTableRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return true
  return !Object.values(row as Record<string, unknown>).some(isFilledCell)
}

/**
 * The answers as they are SENT on Save: every table's blank rows are left out (review 2.63). The
 * row dialog will not add a blank row, but one can still arrive (saved from the app, or a row
 * edited down to nothing), and the server is about to refuse them. Dropping them is silent and
 * keeps the row order of the rest. Everything else in the answers goes through untouched, and the
 * original object is not changed.
 */
export function withoutBlankTableRows(
  fields: readonly { id: string; type: string; fields?: readonly { id: string; type: string }[] }[],
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...answers }
  const visit = (list: readonly { id: string; type: string; fields?: readonly { id: string; type: string }[] }[]) => {
    for (const f of list) {
      if (f.type === 'group') visit(f.fields ?? [])
      else if (f.type === 'table' && Array.isArray(out[f.id])) {
        out[f.id] = (out[f.id] as unknown[]).filter((row) => !isBlankTableRow(row))
      }
    }
  }
  visit(fields)
  return out
}

/** The id of a table field's box on the page, so a refused save can scroll to it. */
export function tableFieldDomId(fieldId: string): string {
  return `form-field-${fieldId}`
}
