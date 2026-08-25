import createClient from 'openapi-fetch'
import type { paths } from './schema'
import { useAuthStore } from '@/stores/authStore'

export const api = createClient<paths>({ baseUrl: import.meta.env.VITE_API_BASE_URL })

api.use({
  onRequest({ request }) {
    const token = useAuthStore.getState().accessToken
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  onResponse({ response }) {
    if (response.status === 401) useAuthStore.getState().clear()
    return response
  },
})
