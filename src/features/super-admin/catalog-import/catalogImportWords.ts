import type {
  CatalogImport,
  CatalogImportRowKind,
  CatalogImportSheet,
  CatalogImportUndoOutcome,
} from '@/queries/catalogImports'

// The console's own short labels for the import's fixed values (a sheet, a row's kind, a state).
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

/** The state of an import as a badge: the server's `status`, and for a preview why Apply is off. */
export function importState(item: Pick<CatalogImport, 'status' | 'apply_blocked_reason'>): {
  label: string
  color: BadgeColor
} {
  switch (item.status) {
    case 'checking':
      return { label: 'Checking…', color: 'info' }
    case 'failed':
      return { label: 'Could not be read', color: 'error' }
    case 'applying':
      return { label: 'Applying…', color: 'info' }
    case 'applied':
      return { label: 'Applied', color: 'success' }
    case 'stale':
      return { label: 'Not applied', color: 'warning' }
    case 'undoing':
      return { label: 'Undoing…', color: 'info' }
    case 'undone':
      return { label: 'Undone', color: 'secondary' }
    case 'ready':
      if (item.apply_blocked_reason === 'errors') return { label: 'Needs fixing', color: 'warning' }
      if (item.apply_blocked_reason === 'nothing_to_change' || item.apply_blocked_reason === 'already_imported') {
        return { label: 'Nothing to change', color: 'secondary' }
      }
      if (item.apply_blocked_reason === 'expired') return { label: 'Preview ended', color: 'secondary' }
      return { label: 'Preview ready', color: 'primary' }
  }
}

/**
 * The steps of "How to fill it", in order. Kept as plain data so the wording can be swapped in
 * one place (for the server's own text, should it supply one later).
 */
export const HOW_TO_FILL_STEPS: readonly string[] = [
  'Colleges must already be in the catalogue. Add any missing college on the Colleges page first.',
  'Fill the Campuses sheet for each new campus, then the Courses sheet. Use one row per campus or course.',
  'A cell with a small arrow is a list. Pick a value from it; don’t type a new one.',
  'Dark blue columns are needed for a new record. The other columns are optional.',
  'Put each course’s intake months on the Intakes sheet, and its tests (IELTS, PTE and others) on the Tests sheet.',
  'Leave “Record ID” empty for a new row. Don’t change it on rows you downloaded.',
  'To change an existing record, fill only the cells that change. An empty cell is left as it is. Type CLEAR to empty a cell.',
  'Upload the file. You see a preview first. Nothing is saved until you press Apply.',
  'If anything needs fixing, the whole file waits and every problem is listed with its sheet, row and column. Fix the file and upload it again.',
  'You can undo an import for 7 days.',
]
