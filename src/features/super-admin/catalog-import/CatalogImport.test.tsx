import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider, focusManager } from '@tanstack/react-query'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Bulk import of campuses and courses (owner-approved plan, 2026-10-09). Pinned here:
//   - "How to fill it" opens when the template is downloaded, and from its link;
//   - an upload is handed to the server (a CSV with the sheet it is) and then followed every two
//     seconds until the check ends, pausing while the tab is hidden;
//   - the preview: counts, old → new, a clickable course link, the "already imported" notice;
//   - any error blocks Apply, with the server's sentence and the list to download;
//   - every near match must be ticked, and the ticks are what Apply sends;
//   - a refused Apply (409) shows the server's sentence, and `details.reason` picks the next step:
//     "Upload again" for stale, "Try again" for another import running, the unticked boxes marked
//     for warnings not accepted, the sentence alone for the rest;
//   - the state badge shows the server's `state_label`, and the Undo box the server's `undo_effect`;
//   - the upload carries one Idempotency-Key per chosen file, and files are saved under the name
//     in Content-Disposition;
//   - a bell notification's deep link to an import's page is one the console follows;
//   - Undo asks first, is followed, and ends on the report of what was left alone and why;
//   - the pages open only for the `catalog` permission.
vi.mock('@/api/client', () => ({ api: { GET: vi.fn(), POST: vi.fn() } }))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))
vi.mock('@/queries/me', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/queries/me')>()),
  useMe: vi.fn(),
}))
vi.mock('@/lib/saveFile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/saveFile')>()),
  saveBlob: vi.fn(),
}))
// The console's frame is not under test, only the pages inside it.
vi.mock('@/features/auth/AdminShell', () => ({ AdminShell: ({ children }: { children: ReactNode }) => <div>{children}</div> }))

import { api } from '@/api/client'
import { PlatformRoute } from '@/features/auth/PlatformRoute'
import { saveBlob } from '@/lib/saveFile'
import { formatDateTime } from '@/lib/time'
import { useMe } from '@/queries/me'
import { CATALOG_IMPORT_POLL_MS, type CatalogImport } from '@/queries/catalogImports'
import { useAuthStore } from '@/stores/authStore'
import { meAnswered, platformMe } from '@/test/me'
import { CollegesCoursesPage } from '../CollegesCoursesPage'
import { CatalogImportDetailPage } from './CatalogImportDetailPage'
import { CatalogImportPage } from './CatalogImportPage'
import { HOW_TO_FILL_STEPS } from './catalogImportWords'
import { isAllowedDeepLink } from '@/lib/deepLinks'

const mockedGet = vi.mocked(api.GET)
const mockedPost = vi.mocked(api.POST)

const SUMMARY = {
  rows: 5,
  new: 2,
  changed: 1,
  unchanged: 2,
  errors: 0,
  warnings: 0,
  sheets: [
    { sheet: 'campuses' as const, rows: 1, new: 1, changed: 0, unchanged: 0, errors: 0 },
    { sheet: 'courses' as const, rows: 4, new: 1, changed: 1, unchanged: 2, errors: 0 },
  ],
}

function anImport(overrides: Partial<CatalogImport> = {}): CatalogImport {
  return {
    id: 'imp-1',
    status: 'ready',
    state_label: 'Preview ready',
    message: 'Preview ready: 2 new and 1 changed. Nothing is saved until you press Apply.',
    file_name: 'autumn-courses.xlsx',
    file_format: 'xlsx',
    csv_sheet: null,
    created_at: '2026-10-09T09:00:00Z',
    uploaded_by: { id: 'op-1', name: 'Ananya Rao' },
    progress: null,
    summary: SUMMARY,
    can_apply: true,
    apply_blocked_reason: null,
    apply_blocked_message: null,
    already_imported: null,
    applied_at: null,
    applied_by: null,
    can_undo: false,
    undo_until: null,
    undo_effect: null,
    undone_at: null,
    undone_by: null,
    undo_summary: null,
    purged: false,
    purge_after: null,
    has_error_file: false,
    ...overrides,
  }
}

const CHECKING = anImport({
  status: 'checking',
  state_label: 'Checking',
  message: 'Checking your file.',
  summary: null,
  can_apply: false,
  apply_blocked_reason: 'not_ready',
  progress: { phase: 'check', done: 1200, total: 4000, percent: 30 },
})

const ROWS = [
  {
    sheet: 'courses',
    row_number: 2,
    kind: 'changed',
    record_type: 'course',
    record_id: 'course-1',
    college_id: 'col-1',
    college_name: 'Maple College',
    label: 'MSc Data Science · Master’s',
    changes: [
      { column: 'Tuition fee', old: '18,000', new: '19,500' },
      { column: 'Course link', old: 'https://maple.example/old', new: 'https://maple.example/msc-data', link: true },
    ],
  },
  {
    sheet: 'campuses',
    row_number: 2,
    kind: 'new',
    record_type: 'campus',
    record_id: null,
    college_id: 'col-1',
    college_name: 'Maple College',
    label: 'Harbour Campus',
    changes: [{ column: 'City', old: null, new: 'Halifax' }],
  },
]

const WARNINGS = [
  {
    id: 11,
    sheet: 'courses',
    row_number: 3,
    column: 'Course name',
    value: 'MSc Data Sciences',
    message: 'Row 3 looks like “MSc Data Science”, which is already in the catalogue.',
    near_match: {
      record_type: 'course',
      record_id: 'course-1',
      name: 'MSc Data Science',
      college_id: 'col-1',
      college_name: 'Maple College',
    },
  },
  {
    id: 12,
    sheet: 'campuses',
    row_number: 2,
    column: 'Campus name',
    value: 'Harbor Campus',
    message: 'Row 2 looks like “Harbour Campus”, which is already in the catalogue.',
    near_match: {
      record_type: 'campus',
      record_id: 'campus-9',
      name: 'Harbour Campus',
      college_id: 'col-2',
      college_name: 'Cedar College',
    },
  },
]

function ok<T>(data: T, status = 200) {
  return { data, error: undefined, response: { status, headers: new Headers() } } as never
}
function refused(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return {
    data: undefined,
    error: { error: { code, message, request_id: 'r1', status, details } },
    response: { status },
  } as never
}
const page = <T,>(items: T[]) => ok({ items, meta: { next_cursor: null, total: items.length } })

/** What the server holds; each test sets these. */
let history: CatalogImport[]
/** The answers GET /catalog-imports/{id} gives, in order; the last one repeats. */
let states: unknown[]
let rows: unknown
let errors: unknown
let warnings: unknown
let undoReport: unknown
let uploadAnswer: unknown
let applyAnswer: unknown
let undoAnswer: unknown

function gets(path: string) {
  return (mockedGet.mock.calls as unknown[][]).filter((call) => call[0] === path)
}
function posts(path: string) {
  return (mockedPost.mock.calls as unknown[][]).filter((call) => call[0] === path)
}

function Where() {
  const location = useLocation()
  return <p data-testid="where">{`${location.pathname}${location.hash}`}</p>
}

/** The two pages behind the same permission gate the console's routes give them. */
function renderAt(path: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Where />
        <Routes>
          <Route
            element={
              <PlatformRoute permission="catalog">
                <Outlet />
              </PlatformRoute>
            }
          >
            <Route path="/admin/colleges" element={<CollegesCoursesPage />} />
            <Route path="/admin/colleges/import" element={<CatalogImportPage />} />
            <Route path="/admin/colleges/import/:id" element={<CatalogImportDetailPage />} />
          </Route>
          <Route path="/admin/dashboard" element={<p>Console home</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function signInAs(permissions: Record<string, boolean>) {
  useAuthStore.setState({ accessToken: 'test-token' })
  vi.mocked(useMe).mockReturnValue(meAnswered(platformMe(permissions)))
}

/** One polling interval passes. */
async function tick() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CATALOG_IMPORT_POLL_MS + 50)
  })
}

function chooseFile(container: HTMLElement, name: string) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['x'], name)
  fireEvent.change(input, { target: { files: [file] } })
  return file
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mockedGet.mockReset()
  mockedPost.mockReset()
  vi.mocked(saveBlob).mockReset()
  signInAs({ catalog: true })
  history = []
  states = [ok(anImport())]
  rows = page(ROWS)
  errors = page([])
  warnings = ok({ items: [] })
  undoReport = page([])
  uploadAnswer = ok(CHECKING, 202)
  applyAnswer = ok(anImport({ status: 'applying', can_apply: false, progress: { phase: 'apply', done: 0, total: 3, percent: 0 } }), 202)
  undoAnswer = ok(anImport({ status: 'undoing', progress: { phase: 'undo', done: 0, total: 3, percent: 0 } }), 202)
  mockedGet.mockImplementation((async (path: string) => {
    if (path === '/catalog-imports') return page(history)
    if (path === '/catalog-imports/{id}') return states.length > 1 ? states.shift() : states[0]
    if (path === '/catalog-imports/{id}/rows') return rows
    if (path === '/catalog-imports/{id}/errors') return errors
    if (path === '/catalog-imports/{id}/warnings') return warnings
    if (path === '/catalog-imports/{id}/undo-report') return undoReport
    if (path === '/catalog-imports/template' || path === '/catalog-imports/catalogue' || path === '/catalog-imports/{id}/errors/download') {
      return ok(new Blob(['file']))
    }
    return page([])
  }) as never)
  mockedPost.mockImplementation((async (path: string) => {
    if (path === '/catalog-imports') return uploadAnswer
    if (path === '/catalog-imports/{id}/apply') return applyAnswer
    if (path === '/catalog-imports/{id}/undo') return undoAnswer
    return ok({})
  }) as never)
})

afterEach(() => {
  focusManager.setFocused(undefined)
  vi.useRealTimers()
})

describe('who may open the import', () => {
  it('opens for the catalog permission', async () => {
    renderAt('/admin/colleges/import')
    expect(await screen.findByRole('heading', { name: 'Import campuses and courses' })).toBeInTheDocument()
  })

  it('is reached from the one Import menu on Colleges & Courses', async () => {
    renderAt('/admin/colleges')
    expect(screen.queryByRole('button', { name: 'Import campuses and courses' })).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    expect(screen.getByRole('menuitem', { name: 'Colleges (CSV)' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Campuses and courses' }))
    expect(await screen.findByRole('heading', { name: 'Import campuses and courses' })).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/colleges/import')
  })

  it('opens the college CSV file picker from the same menu', async () => {
    renderAt('/admin/colleges')
    const picker = document.querySelector<HTMLInputElement>('input[type=file][accept=".csv"]')
    expect(picker).not.toBeNull()
    const click = vi.spyOn(picker!, 'click').mockImplementation(() => {})
    fireEvent.click(await screen.findByRole('button', { name: 'Import' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Colleges (CSV)' }))
    expect(click).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('tells anyone without it they have no access, and asks the server nothing', async () => {
    signInAs({ finance: true })
    renderAt('/admin/colleges/import')
    expect(await screen.findByText('You don’t have access to this page.')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Import campuses and courses' })).not.toBeInTheDocument()

    renderAt('/admin/colleges/import/imp-1')
    expect(screen.queryByText('autumn-courses.xlsx')).not.toBeInTheDocument()
    expect(mockedGet).not.toHaveBeenCalled()
  })
})

describe('getting the spreadsheet', () => {
  it('saves the template and opens “How to fill it” by itself', async () => {
    renderAt('/admin/colleges/import')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /Download template/ }))

    const dialog = await screen.findByRole('dialog', { name: 'How to fill it' })
    expect(saveBlob).toHaveBeenCalledWith('catalogue-import-template.xlsx', expect.any(Blob))
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(HOW_TO_FILL_STEPS.length)
    expect(within(dialog).getByText(/Type CLEAR to empty a cell/)).toBeInTheDocument()
    expect(within(dialog).getByText(/Dates are written YYYY-MM-DD/)).toBeInTheDocument()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Got it' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('saves the template under the name in Content-Disposition', async () => {
    mockedGet.mockImplementation((async (path: string) =>
      path === '/catalog-imports/template'
        ? {
            data: new Blob(['file']),
            error: undefined,
            response: {
              status: 200,
              headers: new Headers({ 'Content-Disposition': 'attachment; filename="catalogue-import-template-2026-10-09.xlsx"' }),
            },
          }
        : page([])) as never)
    renderAt('/admin/colleges/import')
    fireEvent.click(await screen.findByRole('button', { name: /Download template/ }))
    await screen.findByRole('dialog', { name: 'How to fill it' })
    expect(saveBlob).toHaveBeenCalledWith('catalogue-import-template-2026-10-09.xlsx', expect.any(Blob))
  })

  it('opens the same guide from its link, without a download', async () => {
    renderAt('/admin/colleges/import')
    fireEvent.click(await screen.findByRole('button', { name: 'How to fill it' }))
    expect(await screen.findByRole('dialog', { name: 'How to fill it' })).toBeInTheDocument()
    expect(saveBlob).not.toHaveBeenCalled()
  })

  it('does not open the guide when the template could not be downloaded, and says why', async () => {
    mockedGet.mockImplementation((async (path: string) =>
      path === '/catalog-imports/template' ? refused(503, 'unavailable', 'The template is not ready. Try again in a minute.') : page([])) as never)
    renderAt('/admin/colleges/import')
    fireEvent.click(await screen.findByRole('button', { name: /Download template/ }))
    expect(await screen.findByText('The template is not ready. Try again in a minute.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('downloads the current catalogue, and shows the server’s sentence when a college must be picked', async () => {
    mockedGet.mockImplementation((async (path: string) =>
      path === '/catalog-imports/catalogue'
        ? refused(400, 'validation_failed', 'The catalogue is too large for one file. Pick a college.')
        : page([])) as never)
    renderAt('/admin/colleges/import')
    fireEvent.click(await screen.findByRole('button', { name: /Download current catalogue/ }))
    expect(await screen.findByText('The catalogue is too large for one file. Pick a college.')).toBeInTheDocument()
    expect(gets('/catalog-imports/catalogue')[0][1]).toMatchObject({ parseAs: 'blob' })
    expect(saveBlob).not.toHaveBeenCalled()
  })
})

describe('uploading a file', () => {
  it('hands an Excel file to the server with no sheet, then follows the check to the preview', async () => {
    states = [ok(anImport({ ...CHECKING, progress: { phase: 'check', done: 3000, total: 4000, percent: 75 } })), ok(anImport())]
    const { container } = renderAt('/admin/colleges/import')
    await screen.findByRole('heading', { name: 'Import campuses and courses' })

    const file = chooseFile(container, 'autumn-courses.xlsx')
    expect(screen.queryByLabelText('Which sheet is this file?')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))

    // The 202 answer is on screen at once: the import's own page, with the server's progress.
    const bar = await screen.findByRole('progressbar', { name: 'Checking your file' })
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/colleges/import/imp-1')
    expect(bar).toHaveAttribute('aria-valuenow', '30')
    expect(screen.getByText('1,200 of 4,000 rows')).toBeInTheDocument()
    const body = (posts('/catalog-imports')[0][1] as { bodySerializer: () => FormData }).bodySerializer()
    expect(body.get('file')).toBe(file)
    expect(body.has('sheet')).toBe(false)
    expect(gets('/catalog-imports/{id}')).toHaveLength(0)

    await tick()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
    expect(gets('/catalog-imports/{id}')).toHaveLength(1)

    await tick()
    expect(await screen.findByRole('heading', { name: 'What this file would do' })).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    const asked = gets('/catalog-imports/{id}').length

    // The check has ended: the import is not asked for again.
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(asked)
  })

  const keyOf = (index: number) =>
    (posts('/catalog-imports')[index][1] as { params: { header: { 'Idempotency-Key': string } } }).params.header[
      'Idempotency-Key'
    ]

  it('sends one Idempotency-Key per chosen file, and the same one when the same file is sent again', async () => {
    uploadAnswer = refused(503, 'unavailable', 'The server is busy. Try again.')
    const { container } = renderAt('/admin/colleges/import')
    await screen.findByRole('heading', { name: 'Import campuses and courses' })
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'autumn-courses.xlsx')
    fireEvent.change(input, { target: { files: [file] } })

    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))
    await screen.findByText('The server is busy. Try again.')
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))
    await waitFor(() => expect(posts('/catalog-imports')).toHaveLength(2))
    expect(keyOf(0)).toMatch(/^[0-9a-f-]{36}$/)
    expect(keyOf(1)).toBe(keyOf(0))

    // Another file is another upload.
    fireEvent.change(input, { target: { files: [new File(['yy'], 'spring-courses.xlsx')] } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))
    await waitFor(() => expect(posts('/catalog-imports')).toHaveLength(3))
    expect(keyOf(2)).not.toBe(keyOf(0))
  })

  it('asks which sheet a CSV file is, and sends it', async () => {
    const { container } = renderAt('/admin/colleges/import')
    await screen.findByRole('heading', { name: 'Import campuses and courses' })

    chooseFile(container, 'intakes.csv')
    const picker = screen.getByLabelText('Which sheet is this file?')
    expect(within(picker).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose a sheet',
      'Campuses',
      'Courses',
      'Intakes',
      'Tests',
    ])
    expect(screen.getByRole('button', { name: 'Upload and check' })).toBeDisabled()

    fireEvent.change(picker, { target: { value: 'intakes' } })
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))
    await screen.findByRole('progressbar')
    const body = (posts('/catalog-imports')[0][1] as { bodySerializer: () => FormData }).bodySerializer()
    expect(body.get('sheet')).toBe('intakes')
  })

  it('shows the server’s sentence for a refused upload and stays on the page', async () => {
    uploadAnswer = refused(400, 'validation_failed', 'This file is larger than 5 MB. Split it and upload each part.')
    const { container } = renderAt('/admin/colleges/import')
    await screen.findByRole('heading', { name: 'Import campuses and courses' })
    chooseFile(container, 'huge.xlsx')
    fireEvent.click(screen.getByRole('button', { name: 'Upload and check' }))
    expect(await screen.findByText('This file is larger than 5 MB. Split it and upload each part.')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/import$/)
  })

  it('stops asking while the tab is hidden and starts again when it is back', async () => {
    states = [ok(CHECKING)]
    renderAt('/admin/colleges/import/imp-1')
    await screen.findByRole('progressbar')
    await tick()
    const before = gets('/catalog-imports/{id}').length
    expect(before).toBeGreaterThan(1)

    act(() => focusManager.setFocused(false))
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(before)

    act(() => focusManager.setFocused(true))
    await tick()
    expect(gets('/catalog-imports/{id}').length).toBeGreaterThan(before)
  })

  it('asks once for an import in a final state and never again, however long the page stays open', async () => {
    states = [
      ok(
        anImport({
          state_label: 'Needs fixing',
          summary: { ...SUMMARY, errors: 2 },
          can_apply: false,
          apply_blocked_reason: 'errors',
          has_error_file: true,
        }),
      ),
    ]
    errors = page([{ sheet: 'courses', row_number: 7, column: 'Level', value: 'x', message: 'Not a study level.' }])
    renderAt('/admin/colleges/import/imp-1')
    await screen.findByText('Needs fixing')
    await tick()
    const settled = gets('/catalog-imports/{id}').length
    expect(settled).toBe(1)
    await tick()
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(settled)
    // Leaving the tab and coming back does not ask again either.
    act(() => focusManager.setFocused(false))
    act(() => focusManager.setFocused(true))
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(settled)
    // The pages of rows and problems are asked for once as well, not on a clock.
    const errorReads = gets('/catalog-imports/{id}/errors').length
    await tick()
    expect(gets('/catalog-imports/{id}/errors')).toHaveLength(errorReads)
  })

  it('stops asking once the import reaches a final state, and asks again after Apply is pressed', async () => {
    const applying = anImport({
      status: 'applying',
      state_label: 'Applying',
      can_apply: false,
      progress: { phase: 'apply', done: 0, total: 3, percent: 0 },
    })
    const applied = anImport({ status: 'applied', state_label: 'Applied', message: 'Applied.', can_apply: false })
    states = [ok(CHECKING), ok(anImport())]
    renderAt('/admin/colleges/import/imp-1')
    await screen.findByRole('progressbar')
    await tick()
    await screen.findByRole('button', { name: 'Apply' })
    const settled = gets('/catalog-imports/{id}').length
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(settled)

    // Apply answers 202 with the import applying; the page follows it until it ends.
    states = [ok(applying), ok(applied)]
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await screen.findByRole('progressbar', { name: 'Applying the import' })
    await tick()
    expect(gets('/catalog-imports/{id}').length).toBeGreaterThan(settled)
    await tick()
    expect(await screen.findByText('Applied')).toBeInTheDocument()

    const ended = gets('/catalog-imports/{id}').length
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(ended)
  })

  it('asks again after Undo is pressed, and stops when the undo ends', async () => {
    const applied = anImport({
      status: 'applied',
      state_label: 'Applied',
      message: 'Applied.',
      can_apply: false,
      can_undo: true,
      applied_at: '2026-10-09T10:00:00Z',
      undo_until: '2026-10-16T10:00:00Z',
    })
    const undoing = anImport({ status: 'undoing', state_label: 'Undoing', can_apply: false, progress: { phase: 'undo', done: 0, total: 3, percent: 0 } })
    const undone = anImport({ status: 'undone', state_label: 'Undone', message: 'Undone.', can_apply: false, undone_at: '2026-10-09T11:00:00Z' })
    states = [ok(applied)]
    renderAt('/admin/colleges/import/imp-1')
    const openUndo = await screen.findByRole('button', { name: 'Undo this import' })
    const settled = gets('/catalog-imports/{id}').length
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(settled)

    states = [ok(undoing), ok(undone)]
    undoAnswer = ok(undoing, 202)
    fireEvent.click(openUndo)
    const dialog = await screen.findByRole('dialog', { name: 'Undo this import?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo this import' }))
    await screen.findByRole('progressbar')
    await tick()
    expect(gets('/catalog-imports/{id}').length).toBeGreaterThan(settled)
    await tick()
    expect(await screen.findByText('Undone')).toBeInTheDocument()
    const ended = gets('/catalog-imports/{id}').length
    await tick()
    await tick()
    expect(gets('/catalog-imports/{id}')).toHaveLength(ended)
  })

  it('shows the server’s sentence for a file that could not be read, with “Upload again”', async () => {
    states = [ok(anImport({ status: 'failed', state_label: 'Could not be read', summary: null, can_apply: false, message: 'This is not an Excel file we can read. Save it as .xlsx and upload it again.' }))]
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('This is not an Excel file we can read. Save it as .xlsx and upload it again.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload again' })).toHaveAttribute('href', '/admin/colleges/import#upload')
  })
})

describe('the preview', () => {
  it('shows the counts, old → new per field, and the course link opening in a new tab', async () => {
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByRole('heading', { name: 'What this file would do' })).toBeInTheDocument()
    expect(screen.getByText('5 rows read')).toBeInTheDocument()
    const perSheet = screen.getByRole('table', { name: 'Rows per sheet' })
    expect(within(within(perSheet).getByRole('row', { name: /Courses/ })).getAllByRole('cell').map((c) => c.textContent)).toEqual([
      '4',
      '1',
      '1',
      '2',
      '0',
    ])

    expect(await screen.findByText('MSc Data Science · Master’s')).toBeInTheDocument()
    expect(screen.getByText('18,000')).toBeInTheDocument()
    expect(screen.getByText('19,500')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'https://maple.example/msc-data' })
    expect(link).toHaveAttribute('href', 'https://maple.example/msc-data')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')

    // A new row's fields open on request.
    expect(screen.queryByText('Halifax')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Show 1 filled field' }))
    expect(screen.getByText('Halifax')).toBeInTheDocument()
  })

  it('asks the server for one page at a time, narrowed by sheet and kind', async () => {
    renderAt('/admin/colleges/import/imp-1')
    await screen.findByText('MSc Data Science · Master’s')
    expect(gets('/catalog-imports/{id}/rows')[0][1]).toMatchObject({
      params: { path: { id: 'imp-1' }, query: { sheet: undefined, kind: undefined, cursor: undefined, limit: 50 } },
    })

    fireEvent.click(screen.getByRole('tab', { name: /Courses/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Changed 1' }))
    await waitFor(() =>
      expect(gets('/catalog-imports/{id}/rows').at(-1)![1]).toMatchObject({
        params: { query: { sheet: 'courses', kind: 'changed', limit: 50 } },
      }),
    )
  })

  it('does not make a link of a value that is not a web address', async () => {
    rows = page([{ ...ROWS[0], changes: [{ column: 'Course link', old: null, new: 'javascript:alert(1)', link: true }] }])
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('javascript:alert(1)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'javascript:alert(1)' })).not.toBeInTheDocument()
  })

  it('shows the server’s state label in the badge, as it is', async () => {
    states = [ok(anImport({ state_label: 'Preview ready' }))]
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('Preview ready')).toBeInTheDocument()
    expect(screen.getByText('Preview ready: 2 new and 1 changed. Nothing is saved until you press Apply.')).toBeInTheDocument()
  })

  it('says a file was already imported, in the server’s words, with Apply off', async () => {
    states = [
      ok(
        anImport({
          state_label: 'Already imported',
          can_apply: false,
          apply_blocked_reason: 'already_imported',
          apply_blocked_message: 'Nothing to change.',
          already_imported: {
            import_id: 'imp-0',
            applied_at: '2026-10-08T10:00:00Z',
            applied_by_name: 'Dev Shah',
            message: 'This file was already imported on 08/10/2026 by Dev Shah.',
          },
        }),
      ),
    ]
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('This file was already imported on 08/10/2026 by Dev Shah.')).toBeInTheDocument()
    expect(screen.getByText('Nothing to change.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled()
  })
})

describe('a file with errors', () => {
  beforeEach(() => {
    states = [
      ok(
        anImport({
          state_label: 'Needs fixing',
          summary: { ...SUMMARY, errors: 2 },
          can_apply: false,
          apply_blocked_reason: 'errors',
          apply_blocked_message: 'Fix the 2 problems in your file and upload it again. Nothing was saved.',
          has_error_file: true,
        }),
      ),
    ]
    errors = page([
      {
        sheet: 'courses',
        row_number: 7,
        column: 'Level',
        value: 'Mastres',
        message: '“Mastres” is not a study level.',
        allowed_values: ['Bachelor’s', 'Master’s', 'PhD'],
        allowed_values_total: 3,
        did_you_mean: 'Master’s',
      },
      { sheet: null, row_number: null, column: null, value: null, message: 'The Intakes sheet is missing.' },
    ])
  })

  it('lists every problem with its sheet, row, column, value, allowed values and did-you-mean', async () => {
    renderAt('/admin/colleges/import/imp-1')
    const section = await screen.findByRole('region', { name: 'Things to fix' })
    expect(within(section).getByRole('heading', { name: 'Things to fix (2)' })).toBeInTheDocument()
    const row = (await within(section).findByText('“Mastres” is not a study level.')).closest('tr')!
    expect(within(row).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      'Courses',
      '7',
      'Level',
      'Mastres',
      '“Mastres” is not a study level.',
      'Bachelor’s, Master’s, PhD',
      'Master’s',
    ])
    const whole = within(section).getByText('The Intakes sheet is missing.').closest('tr')!
    expect(within(whole).getAllByRole('cell')[0]).toHaveTextContent('Whole file')
    expect(gets('/catalog-imports/{id}/errors')[0][1]).toMatchObject({ params: { query: { limit: 50 } } })
  })

  it('keeps Apply off, shows the server’s sentence beside it, and sends nothing', async () => {
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('Fix the 2 problems in your file and upload it again. Nothing was saved.')).toBeInTheDocument()
    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()
    fireEvent.click(apply)
    expect(mockedPost).not.toHaveBeenCalled()
    expect(screen.getByRole('link', { name: 'Upload again' })).toHaveAttribute('href', '/admin/colleges/import#upload')
  })

  it('downloads the list as a file', async () => {
    renderAt('/admin/colleges/import/imp-1')
    fireEvent.click(await screen.findByRole('button', { name: /Download the list/ }))
    await waitFor(() => expect(saveBlob).toHaveBeenCalledWith('import-problems.csv', expect.any(Blob)))
    expect(gets('/catalog-imports/{id}/errors/download')[0][1]).toMatchObject({
      parseAs: 'blob',
      params: { path: { id: 'imp-1' } },
    })
  })
})

describe('near matches', () => {
  beforeEach(() => {
    states = [ok(anImport({ summary: { ...SUMMARY, warnings: 2 } })), ok(anImport({ status: 'applied', state_label: 'Applied', can_apply: false, can_undo: true, message: 'Applied. 2 added, 1 changed.' }))]
    warnings = ok({ items: WARNINGS })
  })

  it('leaves the "Ready to apply once…" headline to the server and does not say it a second time', async () => {
    const headline = 'Ready to apply once the 1 near match is confirmed: 2 new and 1 changed.'
    states = [ok(anImport({ message: headline, summary: { ...SUMMARY, warnings: 1 } }))]
    warnings = ok({ items: [WARNINGS[0]] })
    renderAt('/admin/colleges/import/imp-1')
    const box = await screen.findByLabelText(WARNINGS[0].message)
    expect(screen.getAllByText(/Ready to apply/)).toHaveLength(1)
    expect(screen.getByText(headline)).toBeInTheDocument()
    fireEvent.click(box)
    expect(screen.getByRole('button', { name: 'Apply' })).toBeEnabled()
    expect(screen.getAllByText(/Ready to apply/)).toHaveLength(1)
    expect(screen.getByText(/saved as drafts/)).toBeInTheDocument()
  })

  it('keeps Apply off until every one is ticked, then sends the ticked ids and follows the apply', async () => {
    renderAt('/admin/colleges/import/imp-1')
    const first = await screen.findByLabelText(WARNINGS[0].message)
    const second = screen.getByLabelText(WARNINGS[1].message)
    const apply = screen.getByRole('button', { name: 'Apply' })
    expect(apply).toBeDisabled()
    expect(screen.getByText('Tick every near match above to continue. 2 left.')).toBeInTheDocument()
    expect(screen.getByText(/already in the catalogue: “MSc Data Science”/)).toBeInTheDocument()

    fireEvent.click(first)
    expect(apply).toBeDisabled()
    expect(screen.getByText('Tick every near match above to continue. 1 left.')).toBeInTheDocument()

    fireEvent.click(second)
    expect(apply).toBeEnabled()
    fireEvent.click(apply)

    expect(await screen.findByRole('progressbar', { name: 'Applying the import' })).toBeInTheDocument()
    expect(posts('/catalog-imports/{id}/apply')[0][1]).toMatchObject({
      params: { path: { id: 'imp-1' } },
      body: { accepted_warning_ids: [11, 12] },
    })

    await tick()
    expect(await screen.findByText(/Applied\. 2 added, 1 changed\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Undo this import' })).toBeInTheDocument()
  })

  it('names the college of each existing record and links its page', async () => {
    renderAt('/admin/colleges/import/imp-1')
    await screen.findByLabelText(WARNINGS[0].message)
    const section = screen.getByRole('region', { name: 'Near matches' })
    const maple = within(section).getByRole('link', { name: 'Maple College' })
    expect(maple).toHaveAttribute('href', '/admin/colleges/col-1')
    expect(maple).toHaveAttribute('target', '_blank')
    expect(within(section).getByRole('link', { name: 'Cedar College' })).toHaveAttribute('href', '/admin/colleges/col-2')
  })

  it('sends an empty list when the file has none', async () => {
    states = [ok(anImport())]
    renderAt('/admin/colleges/import/imp-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    await screen.findByRole('progressbar', { name: 'Applying the import' })
    expect(posts('/catalog-imports/{id}/apply')[0][1]).toMatchObject({ body: { accepted_warning_ids: [] } })
    expect(gets('/catalog-imports/{id}/warnings')).toHaveLength(0)
  })
})

describe('a refused apply', () => {
  it('shows the server’s sentence for a 409 and offers “Upload again”', async () => {
    applyAnswer = refused(409, 'conflict', 'A course in this file was changed after the preview. Upload the file again for a new preview.', {
      reason: 'stale',
    })
    renderAt('/admin/colleges/import/imp-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('A course in this file was changed after the preview. Upload the file again for a new preview.')
    fireEvent.click(within(alert).getByRole('link', { name: 'Upload again' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/colleges/import#upload')
    expect(await screen.findByRole('heading', { name: 'Upload your file' })).toBeInTheDocument()
  })

  it('offers “Try again”, and no upload, when another import is running, and sends the apply again', async () => {
    applyAnswer = refused(409, 'conflict', 'Another import is being applied. Wait for it to finish, then try again.', {
      reason: 'another_import_running',
    })
    renderAt('/admin/colleges/import/imp-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Another import is being applied. Wait for it to finish, then try again.')
    expect(within(alert).queryByRole('link', { name: 'Upload again' })).not.toBeInTheDocument()
    applyAnswer = ok(anImport({ status: 'applying', can_apply: false, progress: { phase: 'apply', done: 0, total: 3, percent: 0 } }), 202)
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('progressbar', { name: 'Applying the import' })).toBeInTheDocument()
    expect(posts('/catalog-imports/{id}/apply')).toHaveLength(2)
  })

  it.each([
    ['not_ready', 'This import is not ready to apply.'],
    ['errors', 'The file still has problems. Fix them and upload it again.'],
    ['nothing_to_change', 'There is nothing to change.'],
    ['already_imported', 'This file was already imported.'],
    ['expired', 'This preview has expired.'],
  ])('shows only the server’s sentence for a %s refusal', async (reason, message) => {
    applyAnswer = refused(409, 'conflict', message, { reason })
    renderAt('/admin/colleges/import/imp-1')
    fireEvent.click(await screen.findByRole('button', { name: 'Apply' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(message)
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument()
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument()
  })

  it('marks the near matches the server says are not ticked, until they are ticked', async () => {
    states = [ok(anImport({ summary: { ...SUMMARY, warnings: 2 } }))]
    warnings = ok({ items: WARNINGS })
    applyAnswer = refused(409, 'conflict', 'Tick every near match before applying.', {
      reason: 'warnings_not_accepted',
      missing_warning_ids: [12],
    })
    renderAt('/admin/colleges/import/imp-1')
    const first = await screen.findByLabelText(WARNINGS[0].message)
    const second = screen.getByLabelText(WARNINGS[1].message)
    fireEvent.click(first)
    fireEvent.click(second)
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Tick every near match before applying.')
    // Both are ticked on the page, so nothing is marked; untick the one the server named.
    expect(second).not.toHaveAttribute('aria-invalid')
    fireEvent.click(second)
    expect(second).toHaveAttribute('aria-invalid', 'true')
    expect(first).not.toHaveAttribute('aria-invalid')
    fireEvent.click(second)
    expect(second).not.toHaveAttribute('aria-invalid')
  })

  it('shows the server’s sentence when the apply ends stale', async () => {
    states = [ok(anImport({ status: 'stale', state_label: 'Not applied', can_apply: false, message: 'Nothing was saved: a record changed after the preview. Upload the file again.' }))]
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByText('Nothing was saved: a record changed after the preview. Upload the file again.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Upload again' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Apply' })).not.toBeInTheDocument()
  })
})

describe('import history and undo', () => {
  const APPLIED = anImport({
    id: 'imp-7',
    status: 'applied',
    state_label: 'Applied',
    message: 'Applied: 2 added and 1 changed.',
    can_apply: false,
    applied_at: '2026-10-09T09:30:00Z',
    applied_by: { id: 'op-1', name: 'Ananya Rao' },
    can_undo: true,
    undo_until: '2026-10-16T09:30:00Z',
    undo_effect: {
      created: 2,
      changed: 1,
      message: 'Undo will remove the 2 records this import added and put back the 1 it changed.',
    },
  })
  const UNDONE = anImport({
    id: 'imp-7',
    status: 'undone',
    state_label: 'Undone',
    message: 'This import was undone.',
    can_apply: false,
    undone_at: '2026-10-09T11:00:00Z',
    undone_by: { id: 'op-1', name: 'Ananya Rao' },
    undo_summary: { restored: 1, removed: 1, retired: 0, left_alone: 1 },
  })

  it('lists who, when, the file, its counts and its state, with Undo only where the server offers it', async () => {
    history = [APPLIED, anImport({ id: 'imp-6', file_name: 'intakes.csv', file_format: 'csv', csv_sheet: 'intakes', status: 'undone', state_label: 'Undone' })]
    renderAt('/admin/colleges/import')
    const row = (await screen.findByText('autumn-courses.xlsx')).closest('tr')!
    expect(within(row).getByText('Ananya Rao')).toBeInTheDocument()
    expect(within(row).getByText(formatDateTime('2026-10-09T09:00:00Z'))).toBeInTheDocument()
    expect(within(row).getByText('2 new · 1 changed · 2 unchanged')).toBeInTheDocument()
    expect(within(row).getByText('Applied')).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Undo autumn-courses.xlsx' })).toBeInTheDocument()

    const other = screen.getByText('intakes.csv').closest('tr')!
    expect(within(other).getByText('Intakes sheet')).toBeInTheDocument()
    expect(within(other).getByText('Undone')).toBeInTheDocument()
    expect(within(other).queryByRole('button', { name: /Undo/ })).not.toBeInTheDocument()
    expect(gets('/catalog-imports')[0][1]).toMatchObject({ params: { query: { limit: 20 } } })
  })

  it('asks before undoing, follows the undo, and ends on the report of what was left alone and why', async () => {
    history = [APPLIED]
    undoAnswer = ok({ ...APPLIED, status: 'undoing', can_undo: false, progress: { phase: 'undo', done: 1, total: 3, percent: 33 } }, 202)
    states = [ok(UNDONE)]
    undoReport = page([
      {
        record_type: 'course',
        record_id: 'course-1',
        college_name: 'Maple College',
        label: 'MSc Data Science · Master’s',
        outcome: 'left_alone',
        message: 'Edited by Dev Shah on 09/10/2026, after the import.',
      },
    ])
    renderAt('/admin/colleges/import')
    fireEvent.click(await screen.findByRole('button', { name: 'Undo autumn-courses.xlsx' }))

    // Nothing is sent until the person confirms, and the box says what the server says.
    const dialog = await screen.findByRole('dialog', { name: 'Undo this import?' })
    expect(mockedPost).not.toHaveBeenCalled()
    expect(
      within(dialog).getByText('Undo will remove the 2 records this import added and put back the 1 it changed.'),
    ).toBeInTheDocument()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo this import' }))

    const bar = await screen.findByRole('progressbar', { name: 'Undoing the import' })
    expect(bar).toHaveAttribute('aria-valuenow', '33')
    expect(posts('/catalog-imports/{id}/undo')[0][1]).toMatchObject({ params: { path: { id: 'imp-7' } } })
    expect(screen.getByTestId('where')).toHaveTextContent('/admin/colleges/import/imp-7')

    await tick()
    const report = await screen.findByRole('region', { name: 'Undo report' })
    expect(within(report).getByText('Edited by Dev Shah on 09/10/2026, after the import.')).toBeInTheDocument()
    expect(within(report).getByRole('button', { name: 'Left alone 1' })).toHaveAttribute('aria-pressed', 'true')
    // It opens on the records that were left alone, asked of the server a page at a time.
    expect(gets('/catalog-imports/{id}/undo-report')[0][1]).toMatchObject({
      params: { path: { id: 'imp-7' }, query: { outcome: 'left_alone', limit: 50 } },
    })

    fireEvent.click(within(report).getByRole('button', { name: 'Put back 1' }))
    await waitFor(() =>
      expect(gets('/catalog-imports/{id}/undo-report').at(-1)![1]).toMatchObject({ params: { query: { outcome: 'restored' } } }),
    )
  })

  it('shows the server’s sentence when an undo is refused, and keeps the dialog open', async () => {
    states = [ok(APPLIED)]
    undoAnswer = refused(409, 'conflict', 'The 7 days to undo this import have passed.', { reason: 'undo_window_passed' })
    renderAt('/admin/colleges/import/imp-7')
    fireEvent.click(await screen.findByRole('button', { name: 'Undo this import' }))
    const dialog = await screen.findByRole('dialog', { name: 'Undo this import?' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Undo this import' }))
    expect(await within(dialog).findByText('The 7 days to undo this import have passed.')).toBeInTheDocument()
  })
})

describe('the bell notification for an import', () => {
  it('links to the import’s own page, which the console follows and routes', async () => {
    // The notice carries /admin/colleges/import/{import_id}.
    expect(isAllowedDeepLink('/admin/colleges/import/imp-1')).toBe(true)
    renderAt('/admin/colleges/import/imp-1')
    expect(await screen.findByRole('heading', { name: 'autumn-courses.xlsx' })).toBeInTheDocument()
    expect(gets('/catalog-imports/{id}')[0][1]).toMatchObject({ params: { path: { id: 'imp-1' } } })
  })
})
