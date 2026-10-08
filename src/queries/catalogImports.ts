import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useMutation } from '@/lib/useSave'
import { api } from '@/api/client'
import { ApiError, isRetryable } from '@/api/errors'
import { isAlreadyApplied } from '@/lib/useIdempotencyKey'
import { guardedFetch } from '@/api/http'
import { fileNameFrom, saveBlob } from '@/lib/saveFile'
import { useAuthStore } from '@/stores/authStore'
import type { components } from '@/api/schema'

// Bulk import of campuses and courses (owner-approved plan, 2026-10-09;
// docs/review/work/BULK_IMPORT_SPEC.md). The console shows what the server worked out and decides
// nothing itself: every count, every sentence and the two switches (`can_apply`, `can_undo`) come
// from the server. An upload is checked in the background, then previewed, then applied (all or
// nothing), and can be undone for seven days.

export type CatalogImport = components['schemas']['CatalogImport']
export type CatalogImportRow = components['schemas']['CatalogImportRow']
export type CatalogImportError = components['schemas']['CatalogImportError']
export type CatalogImportWarning = components['schemas']['CatalogImportWarning']
export type CatalogImportUndoRecord = components['schemas']['CatalogImportUndoRecord']
export type CatalogImportSheet = CatalogImportRow['sheet']
export type CatalogImportRowKind = CatalogImportRow['kind']
export type CatalogImportUndoOutcome = CatalogImportUndoRecord['outcome']

/** How often an import is asked for while the server is checking, applying or undoing it. */
export const CATALOG_IMPORT_POLL_MS = 2000
/** How often the history is read again while an import on it (a colleague's, say) is in progress. */
const HISTORY_POLL_MS = 10_000
/** A file of up to 5 MB, or a workbook built at the moment of the call, may honestly take a while. */
const FILE_TIMEOUT_MS = 120_000
const fileFetch = (request: Request) => guardedFetch(request, { timeoutMs: FILE_TIMEOUT_MS })

/** The server is working on it: the import is read again every two seconds until this is false. */
export function isInProgress(item: Pick<CatalogImport, 'status'> | undefined | null): boolean {
  return item?.status === 'checking' || item?.status === 'applying' || item?.status === 'undoing'
}

const HISTORY_KEY = ['catalog-imports'] as const
const importKey = (id: string | undefined) => ['catalog-import', id] as const

/** Import history, newest first, one page at a time. */
export function useCatalogImports({ cursor, limit = 20 }: { cursor?: string; limit?: number } = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: [...HISTORY_KEY, { cursor, limit }],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports', { signal, params: { query: { cursor, limit } } })
      if (error) throw new ApiError('Could not load the import history.', error)
      return data
    },
    enabled: isAuthed,
    refetchInterval: (query) => (query.state.data?.items.some(isInProgress) ? HISTORY_POLL_MS : false),
  })
}

/**
 * One import: its state, progress and counts. While the server is checking, applying or undoing
 * it, it is asked again every two seconds. The asking stops while the browser tab is hidden and
 * starts again (at once) when the person comes back; it also stops for good on an answer that
 * will not change by asking again (a 404).
 *
 * When the work finishes, the history is read again, and the catalogue lists too once an import
 * has been applied or undone, so every screen shows what the import did.
 */
export function useCatalogImport(id: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  const queryClient = useQueryClient()
  const query = useQuery({
    queryKey: importKey(id),
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports/{id}', { signal, params: { path: { id: id! } } })
      if (error) throw new ApiError('Could not load this import.', error)
      return data
    },
    enabled: isAuthed && Boolean(id),
    // The answer to an upload, an apply or an undo seeds this; the next read waits one interval.
    staleTime: CATALOG_IMPORT_POLL_MS,
    refetchInterval: (q) => {
      if (!isInProgress(q.state.data)) return false
      return q.state.error && !isRetryable(q.state.error) ? false : CATALOG_IMPORT_POLL_MS
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  const status = query.data?.status
  useEffect(() => {
    if (!status || status === 'checking' || status === 'applying' || status === 'undoing') return
    void queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
    if (status === 'applied' || status === 'undone') {
      void queryClient.invalidateQueries({ queryKey: ['admin-colleges'] })
      void queryClient.invalidateQueries({ queryKey: ['admin-college'] })
      void queryClient.invalidateQueries({ queryKey: ['courses'] })
      void queryClient.invalidateQueries({ queryKey: ['course'] })
      void queryClient.invalidateQueries({ queryKey: ['picker', 'courses'] })
    }
  }, [status, queryClient])

  return query
}

/**
 * Upload a filled-in workbook, or one sheet as CSV (`sheet` says which). Answered 202 with the
 * import in `checking`; nothing is saved to the catalogue. Refusals (no file, the wrong kind of
 * file, a CSV with no sheet, a file over 5 MB) carry the server's own sentence. One
 * `Idempotency-Key` per chosen file, made by the caller, so a retry after a lost reply replays the
 * first answer instead of uploading twice.
 */
export function useUploadCatalogImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      file,
      sheet,
      idempotencyKey,
    }: {
      file: File
      sheet?: CatalogImportSheet
      idempotencyKey: string
    }) => {
      const formData = new FormData()
      formData.append('file', file)
      if (sheet) formData.append('sheet', sheet)
      const { data, error, response } = await api.POST('/catalog-imports', {
        params: { header: { 'Idempotency-Key': idempotencyKey } },
        body: formData as unknown as { file: string },
        bodySerializer: () => formData,
        fetch: fileFetch,
      })
      if (error || !data) {
        throw new ApiError('Could not upload this file.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    onSuccess: (created) => {
      queryClient.setQueryData(importKey(created.id), created)
      void queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
    },
    // The upload already went through (the first reply was lost): show it in the history.
    onError: (err) => {
      if (isAlreadyApplied(err)) void queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
    },
  })
}

/** One page of the preview's rows, narrowed by sheet and by kind. */
export function useCatalogImportRows(
  id: string,
  filters: { sheet?: CatalogImportSheet; kind?: CatalogImportRowKind; cursor?: string; limit?: number },
  enabled = true,
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['catalog-import-rows', id, filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports/{id}/rows', {
        signal,
        params: { path: { id }, query: filters },
      })
      if (error) throw new ApiError('Could not load the preview.', error)
      return data
    },
    enabled: isAuthed && enabled,
    placeholderData: (previous) => previous,
  })
}

/** One page of the problems found in the file, in file order. */
export function useCatalogImportErrors(id: string, filters: { cursor?: string; limit?: number }, enabled = true) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['catalog-import-errors', id, filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports/{id}/errors', {
        signal,
        params: { path: { id }, query: filters },
      })
      if (error) throw new ApiError('Could not load the list of problems.', error)
      return data
    },
    enabled: isAuthed && enabled,
    placeholderData: (previous) => previous,
  })
}

/** Every near match of this import (the server keeps at most 500, so they are not paged). */
export function useCatalogImportWarnings(id: string, enabled = true) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['catalog-import-warnings', id],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports/{id}/warnings', { signal, params: { path: { id } } })
      if (error) throw new ApiError('Could not load the near matches.', error)
      return data
    },
    enabled: isAuthed && enabled,
  })
}

/** One page of what an undo did, record by record, narrowed by outcome. */
export function useCatalogImportUndoReport(
  id: string,
  filters: { outcome?: CatalogImportUndoOutcome; cursor?: string; limit?: number },
  enabled = true,
) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['catalog-import-undo-report', id, filters],
    queryFn: async ({ signal }) => {
      const { data, error } = await api.GET('/catalog-imports/{id}/undo-report', {
        signal,
        params: { path: { id }, query: filters },
      })
      if (error) throw new ApiError('Could not load the undo report.', error)
      return data
    },
    enabled: isAuthed && enabled,
    placeholderData: (previous) => previous,
  })
}

/** Why the server refused an Apply with a 409 (`error.details.reason`). */
export type CatalogImportApplyReason =
  | 'not_ready'
  | 'errors'
  | 'nothing_to_change'
  | 'already_imported'
  | 'warnings_not_accepted'
  | 'stale'
  | 'another_import_running'
  | 'expired'

/**
 * What a refused Apply says beyond its sentence: the `reason` (so the screen can offer the right
 * next step) and, for `warnings_not_accepted`, the near matches that were not ticked. Null for
 * anything that is not an Apply 409.
 */
export function applyRefusal(
  error: unknown,
): { reason: CatalogImportApplyReason | null; missingWarningIds: number[] } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null
  const reason = error.details?.reason
  const missing = error.details?.missing_warning_ids
  return {
    reason: typeof reason === 'string' ? (reason as CatalogImportApplyReason) : null,
    missingWarningIds: Array.isArray(missing) ? missing.filter((id): id is number => typeof id === 'number') : [],
  }
}

/**
 * Apply the previewed import, with every near match the person ticked. Answered 202 with the
 * import in `applying`, which `useCatalogImport` then follows. A 409 starts nothing and carries
 * the sentence to show; the import and its near matches are read again, since the refusal means
 * the screen was out of date.
 */
export function useApplyCatalogImport(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (acceptedWarningIds: number[]) => {
      const { data, error, response } = await api.POST('/catalog-imports/{id}/apply', {
        params: { path: { id } },
        body: { accepted_warning_ids: acceptedWarningIds },
      })
      if (error || !data) {
        throw new ApiError('Could not apply this import.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    onSuccess: (started) => queryClient.setQueryData(importKey(id), started),
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: importKey(id) })
      void queryClient.invalidateQueries({ queryKey: ['catalog-import-warnings', id] })
    },
  })
}

/**
 * Undo an applied import. Answered 202 with the import in `undoing`, which `useCatalogImport`
 * then follows. A 409 (not applied, the seven days have passed, another import is running)
 * carries the sentence to show.
 */
export function useUndoCatalogImport() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error, response } = await api.POST('/catalog-imports/{id}/undo', { params: { path: { id } } })
      if (error || !data) {
        throw new ApiError('Could not undo this import.', error, (response as Response | undefined)?.status)
      }
      return data
    },
    onSuccess: (started) => {
      queryClient.setQueryData(importKey(started.id), started)
      void queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
    },
    onError: (_error, id) => {
      void queryClient.invalidateQueries({ queryKey: importKey(id) })
      void queryClient.invalidateQueries({ queryKey: HISTORY_KEY })
    },
  })
}

/** Which file to fetch and save. */
export type CatalogImportFile =
  | { kind: 'template' }
  | { kind: 'catalogue'; collegeId?: string }
  | { kind: 'errors'; importId: string }

const FALLBACK_NAME: Record<CatalogImportFile['kind'], string> = {
  template: 'catalogue-import-template.xlsx',
  catalogue: 'catalogue.xlsx',
  errors: 'import-problems.csv',
}

async function fetchFile(file: CatalogImportFile) {
  if (file.kind === 'template') {
    return api.GET('/catalog-imports/template', { parseAs: 'blob', fetch: fileFetch })
  }
  if (file.kind === 'catalogue') {
    return api.GET('/catalog-imports/catalogue', {
      parseAs: 'blob',
      fetch: fileFetch,
      params: { query: { college_id: file.collegeId } },
    })
  }
  return api.GET('/catalog-imports/{id}/errors/download', {
    parseAs: 'blob',
    fetch: fileFetch,
    params: { path: { id: file.importId } },
  })
}

/**
 * Fetches one of the import's files (the empty workbook, the current catalogue, an import's list
 * of problems) and saves it under the name the server gave it. A refusal carries the server's own
 * sentence: the whole catalogue is over 20,000 rows and a college must be picked (400), there is
 * no such college, or the list of problems is no longer kept (404).
 */
export function useDownloadCatalogImportFile() {
  return useMutation({
    mutationFn: async (file: CatalogImportFile) => {
      const { data, error, response } = await fetchFile(file)
      if (error || !data) {
        throw new ApiError('Could not download this file.', error, (response as Response | undefined)?.status)
      }
      saveBlob(fileNameFrom(response as Response | undefined, FALLBACK_NAME[file.kind]), data as Blob)
      return file
    },
  })
}
