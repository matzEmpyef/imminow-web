import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '@/api/client'
import { useAuthStore } from '@/stores/authStore'
import { ApiError } from './auth'

interface InvoiceListFilters {
  journeyId?: string
  status?: 'sent' | 'paid' | 'overdue' | 'void'
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useInvoices(filters: InvoiceListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['invoices', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/invoices', {
        params: {
          query: {
            journey_id: filters.journeyId,
            filter: filters.status ? { status: filters.status } : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load invoices.', error)
      return data
    },
    enabled: isAuthed,
  })
}

function invalidateInvoicing(queryClient: ReturnType<typeof useQueryClient>, journeyId?: string) {
  queryClient.invalidateQueries({ queryKey: ['invoices'] })
  queryClient.invalidateQueries({ queryKey: ['receipts'] })
  if (journeyId) queryClient.invalidateQueries({ queryKey: ['clients', journeyId, 'commissions'] })
}

export function useCreateInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: {
      journey_id: string
      /** Omit to bill in the consultancy's own country currency, which is the normal case. */
      currency?: string
      line_items: { description: string; amount: number }[]
    }) => {
      const { data, error } = await api.POST('/invoices', { body })
      if (error) throw new ApiError('Could not create this invoice.', error)
      return data
    },
    onSuccess: (data) => invalidateInvoicing(queryClient, data?.journey_id),
  })
}

export function useVoidInvoice() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/invoices/{id}/void', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not void this invoice.', error)
      return data
    },
    onSuccess: (data) => invalidateInvoicing(queryClient, data?.journey_id),
  })
}

interface ReceiptListFilters {
  journeyId?: string
  invoiceId?: string
  status?: 'recorded' | 'void'
  search?: string
  sort?: string
  cursor?: string
  limit?: number
}

export function useReceipts(filters: ReceiptListFilters = {}) {
  const isAuthed = useAuthStore((s) => Boolean(s.accessToken))
  return useQuery({
    queryKey: ['receipts', filters],
    queryFn: async () => {
      const { data, error } = await api.GET('/receipts', {
        params: {
          query: {
            journey_id: filters.journeyId,
            invoice_id: filters.invoiceId,
            filter: filters.status ? { status: filters.status } : undefined,
            search: filters.search,
            sort: filters.sort,
            cursor: filters.cursor,
            limit: filters.limit,
          },
        },
      })
      if (error) throw new ApiError('Could not load receipts.', error)
      return data
    },
    enabled: isAuthed,
  })
}

export function useCreateReceipt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { invoice_id: string; amount: number }) => {
      const { data, error } = await api.POST('/receipts', { body })
      if (error) throw new ApiError('Could not record this receipt.', error)
      return data
    },
    onSuccess: () => invalidateInvoicing(queryClient),
  })
}

export function useVoidReceipt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { data, error } = await api.POST('/receipts/{id}/void', {
        params: { path: { id } },
        body: { reason },
      })
      if (error) throw new ApiError('Could not void this receipt.', error)
      return data
    },
    onSuccess: () => invalidateInvoicing(queryClient),
  })
}
