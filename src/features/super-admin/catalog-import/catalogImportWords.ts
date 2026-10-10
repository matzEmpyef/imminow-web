import type {
  CatalogImport,
  CatalogImportRowKind,
  CatalogImportSheet,
  CatalogImportUndoOutcome,
} from '@/queries/catalogImports'

// The console's own short labels for the import's fixed values (a sheet, a row's kind).
// Every sentence that explains something comes from the server and is shown as it is.

export const IMPORT_HOME = '/admin/colleges/import'
export const importPath = (id: string) => `${IMPORT_HOME}/${id}`

export const SHEETS: readonly CatalogImportSheet[] = ['campuses', 'courses', 'intakes', 'tests']

export const SHEET_LABEL: Record<CatalogImportSheet, string> = {
  campuses: 'Campuses',
  courses: 'Courses',
  intakes: 'Intakes',
  tests: 'Tests',
}

export const KINDS: readonly CatalogImportRowKind[] = ['new', 'changed', 'unchanged']

export const KIND_LABEL: Record<CatalogImportRowKind, string> = {
  new: 'New',
  changed: 'Changed',
  unchanged: 'Unchanged',
}

export const KIND_COLOR: Record<CatalogImportRowKind, 'success' | 'info' | 'secondary'> = {
  new: 'success',
  changed: 'info',
  unchanged: 'secondary',
}

export const OUTCOMES: readonly CatalogImportUndoOutcome[] = ['left_alone', 'restored', 'removed', 'retired']

export const OUTCOME_LABEL: Record<CatalogImportUndoOutcome, string> = {
  restored: 'Put back',
  removed: 'Removed',
  retired: 'Switched off',
  left_alone: 'Left alone',
}

export const OUTCOME_COLOR: Record<CatalogImportUndoOutcome, 'success' | 'secondary' | 'warning'> = {
  restored: 'success',
  removed: 'secondary',
  retired: 'secondary',
  left_alone: 'warning',
}

/** What each undo outcome means, under its count. */
export const OUTCOME_NOTE: Record<CatalogImportUndoOutcome, string> = {
  restored: 'Changed records, back to their earlier values',
  removed: 'New records that were still untouched drafts',
  retired: 'New records already in use, now switched off',
  left_alone: 'Edited by hand since the import, not touched',
}

type BadgeColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info'

/**
 * The colour of an import's state badge. The words come from the server (`state_label`) and are
 * shown as they are; only the colour is picked here, from the server's `status` and, for a
 * preview, why Apply is off.
 */
export function importStateColor(item: Pick<CatalogImport, 'status' | 'apply_blocked_reason'>): BadgeColor {
  switch (item.status) {
    case 'checking':
    case 'applying':
    case 'undoing':
      return 'info'
    case 'failed':
      return 'error'
    case 'applied':
      return 'success'
    case 'stale':
      return 'warning'
    case 'undone':
      return 'secondary'
    case 'ready':
      if (item.apply_blocked_reason === 'errors') return 'warning'
      if (
        item.apply_blocked_reason === 'nothing_to_change' ||
        item.apply_blocked_reason === 'already_imported' ||
        item.apply_blocked_reason === 'expired'
      ) {
        return 'secondary'
      }
      return 'primary'
  }
}

/**
 * The steps of "How to fill it", in order. Kept as plain data so the wording can be swapped in
 * one place.
 */
export const HOW_TO_FILL_STEPS: readonly string[] = [
  'Colleges must already be in the catalogue. Add any missing college on the Colleges page first, and type its name exactly.',
  'Fill only the sheets you need: Campuses, Courses, Intakes, Tests. Use one row per campus or course.',
  'A cell with a small arrow is a list. Pick a value from it; don’t type a new one.',
  'Dark blue columns are needed for a new record. The other columns are optional.',
  'Dates are written YYYY-MM-DD. Money is numbers only, with at most two decimal places, and the currency in its own column.',
  'For a new row, leave “Record ID” empty. To change existing records, download the current catalogue and edit that file. Don’t change “Record ID”.',
  'An empty cell is left as it is. Type CLEAR to empty a cell.',
  'Nothing is ever deleted. Set Active to No to retire a record, or “Remove this intake” to Yes to take a month off.',
  'Upload the file. You see a preview first. If anything needs fixing, the whole file waits and every problem is listed with its sheet, row and column.',
  'When there are no problems, press Apply. New courses start as drafts. You can undo an import for 7 days.',
]
