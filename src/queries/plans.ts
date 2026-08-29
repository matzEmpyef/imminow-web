import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'
import type { components } from '@/api/schema'

type ComponentInput = components['schemas']['ComponentInput']
type StepTemplateInput = components['schemas']['StepTemplateInput']

export function usePlanTemplates() {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['plan-templates'],
    queryFn: async () => {
      const { data, error } = await api.GET('/plan-templates')
      if (error) throw new ApiError('Could not load plan templates.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function usePlan(clientId: string | undefined) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['clients', clientId, 'plan'],
    queryFn: async () => {
      const { data, error } = await api.GET('/clients/{id}/plan', {
        params: { path: { id: clientId! } },
      })
      if (error) throw new ApiError('Could not load the plan.', error)
      return data
    },
    enabled: isAuthed && Boolean(clientId),
    retry: false,
  })
}

export function useAssignPlan(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (templateId: string) => {
      const { data, error } = await api.POST('/clients/{id}/plan/assign', {
        params: { path: { id: clientId }, header: { 'Idempotency-Key': crypto.randomUUID() } },
        body: { template_id: templateId },
      })
      if (error) throw new ApiError('Could not assign this plan.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] })
      queryClient.invalidateQueries({ queryKey: ['clients', clientId] })
      queryClient.invalidateQueries({ queryKey: ['clients'] })
      // Assigning a plan derives the first step's expected_end_date and can move the client out
      // of "pending plan assignment" — both feed Activity now (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

export function useCreatePlanTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { name: string; steps: StepTemplateInput[] }) => {
      const { data, error } = await api.POST('/plan-templates', { body })
      if (error) throw new ApiError('Could not create this plan template.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan-templates'] }),
  })
}

export function useUpdatePlanTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, name, steps }: { id: string; name?: string; steps?: StepTemplateInput[] }) => {
      const { data, error } = await api.PATCH('/plan-templates/{id}', {
        params: { path: { id } },
        body: { name, steps },
      })
      if (error) throw new ApiError('Could not update this plan template.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan-templates'] }),
  })
}

export function useDuplicatePlanTemplate() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await api.POST('/plan-templates/{id}/duplicate', {
        params: { path: { id } },
      })
      if (error) throw new ApiError('Could not duplicate this plan template.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['plan-templates'] }),
  })
}

export function useAddStep(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { title: string; expected_duration_days?: number; components?: ComponentInput[] }) => {
      const { data, error } = await api.POST('/clients/{id}/plan/steps', {
        params: { path: { id: clientId } },
        body,
      })
      if (error) throw new ApiError('Could not add this step.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] }),
  })
}

// User-requested follow-up (2026-08-15) on the Plan Template step-builder rework — "Hope what
// you have done is for client plan also." Restricted server-side to `locked` steps only for
// title/components (a step the student may already be working in, `active`, or has finished,
// `done`, can't have those edited) — see `PATCH /steps/{id}`'s 409 in openapi.yaml. Relaxed
// 2026-08-29: an `active` step's `expected_end_date` alone stays editable, and an optional
// `reason` rides along — the server notifies the applicant when the date actually changes.
// Parameterized by clientId rather than stepId so it can invalidate the right
// `['clients', clientId, 'plan']` query, same shape as useAddStep.
export function useUpdateStep(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      stepId,
      ...body
    }: {
      stepId: string
      title?: string
      expected_end_date?: string | null
      components?: ComponentInput[]
      reason?: string
    }) => {
      const { data, error } = await api.PATCH('/steps/{id}', {
        params: { path: { id: stepId } },
        body,
      })
      if (error) throw new ApiError('Could not update this step.', error)
      return data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] })
      // A date change on an active step now feeds Activity's overdue/Coming Up sections
      // (2026-08-29).
      queryClient.invalidateQueries({ queryKey: ['activity-feed'] })
    },
  })
}

// Same `locked`-only restriction as useUpdateStep — see `DELETE /steps/{id}`'s 409.
export function useDeleteStep(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (stepId: string) => {
      const { error } = await api.DELETE('/steps/{id}', { params: { path: { id: stepId } } })
      if (error) throw new ApiError('Could not remove this step.', error)
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] }),
  })
}

// The step's live fill state (user, 2026-08-20: "both consultant and applicant should be able
// to fill the page and save it… Both can see the details and edit") — merged per component id
// server-side, so each control saves just its own component. Active steps only (409 otherwise).
export function useSaveStepResponses(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ stepId, responses }: { stepId: string; responses: Record<string, unknown> }) => {
      const { data, error } = await api.PATCH('/steps/{id}/responses', {
        params: { path: { id: stepId } },
        body: { responses },
      })
      if (error) throw new ApiError('Could not save.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] }),
  })
}

// Upload a real file against a step's file_upload component — POST /uploads with the journey and
// step linked, so the file lands in the journey's upload history like any other document.
export function useUploadStepFile(clientId: string) {
  return useMutation({
    mutationFn: async ({ stepId, file }: { stepId: string; file: File }) => {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('journey_id', clientId)
      formData.append('linked_step_id', stepId)
      const { data, error } = await api.POST('/uploads', {
        // openapi-fetch serializes plain objects to JSON; hand it real FormData and neutralize
        // the serializer so the multipart boundary header is set by the browser.
        body: formData as unknown as { file: string; journey_id: string },
        bodySerializer: (b: unknown) => b as FormData,
      })
      if (error) throw new ApiError('Could not upload this file.', error)
      return data
    },
  })
}

// Latest saved response for a linked form (user, 2026-08-20 — the Forms tab is fillable, and
// what the applicant saved from the app shows here). 404 = nothing saved yet, surfaced as null.
export function useLatestFormResponse(formId: string, clientId: string) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['forms', formId, 'responses', clientId],
    queryFn: async () => {
      const { data, error, response } = await api.GET('/forms/{id}/responses', {
        params: { path: { id: formId }, query: { journey_id: clientId } },
      })
      if (response.status === 404) return null
      if (error) throw new ApiError('Could not load the saved answers.', error)
      return data ?? null
    },
    enabled: isAuthed && Boolean(formId) && Boolean(clientId),
    retry: false,
  })
}

// Save the form on the applicant's behalf — same POST /forms/{id}/submit the app itself uses;
// the newest response wins.
export function useSaveFormResponse(formId: string, clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (answers: Record<string, unknown>) => {
      const { data, error } = await api.POST('/forms/{id}/submit', {
        params: { path: { id: formId } },
        body: { journey_id: clientId, answers },
      })
      if (error) throw new ApiError('Could not save the form.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['forms', formId, 'responses', clientId] }),
  })
}

export function useReorderSteps(clientId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (stepIds: string[]) => {
      const { data, error } = await api.POST('/clients/{id}/plan/reorder', {
        params: { path: { id: clientId } },
        body: { step_ids: stepIds },
      })
      if (error) throw new ApiError('Could not reorder the steps.', error)
      return data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clients', clientId, 'plan'] }),
  })
}
