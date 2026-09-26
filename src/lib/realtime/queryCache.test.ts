import { QueryClient } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyChatMessage,
  applyChatStatus,
  applyConversationUpdated,
  applyNotificationCreated,
  applyResync,
  applyUnreadChanged,
} from './queryCache'
import type { components } from '@/api/schema'

type LeadMessage = components['schemas']['LeadMessage']
type Conversation = components['schemas']['Conversation']

function message(overrides: Partial<LeadMessage> = {}): LeadMessage {
  return {
    id: 'm1',
    sender: 'student',
    content: 'hello',
    created_at: '2026-09-26T10:00:00Z',
    ...overrides,
  }
}

function conversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    type: 'lead',
    name: 'Priya',
    last_message_at: '2026-09-26T09:00:00Z',
    last_message_preview: 'old preview',
    unread: false,
    ...overrides,
  }
}

describe('realtime query cache patches', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    queryClient = new QueryClient()
  })

  describe('applyChatMessage', () => {
    it('appends the new message to a cached thread', () => {
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], { items: [message({ id: 'm0' })], meta: {} })

      applyChatMessage(queryClient, { type: 'lead', id: 'lead-1' }, message({ id: 'm1' }))

      expect(queryClient.getQueryData(['leads', 'lead-1', 'messages'])).toEqual({
        items: [message({ id: 'm0' }), message({ id: 'm1' })],
        meta: {},
      })
    })

    it('de-dupes by id — a message already in the cache is not appended twice', () => {
      queryClient.setQueryData(['clients', 'client-1', 'messages'], { items: [message({ id: 'm1' })], meta: {} })

      applyChatMessage(queryClient, { type: 'client', id: 'client-1' }, message({ id: 'm1' }))

      expect((queryClient.getQueryData(['clients', 'client-1', 'messages']) as { items: LeadMessage[] }).items).toHaveLength(1)
    })

    it('does nothing when the thread is not currently cached (nobody has it open)', () => {
      applyChatMessage(queryClient, { type: 'lead', id: 'lead-9' }, message())
      expect(queryClient.getQueryData(['leads', 'lead-9', 'messages'])).toBeUndefined()
    })
  })

  describe('applyChatStatus', () => {
    it('marks the OTHER side\'s messages read up to the given time, never the viewer\'s own', () => {
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], {
        items: [
          message({ id: 'm1', sender: 'consultant', created_at: '2026-09-26T09:00:00Z', status: 'sent' }),
          message({ id: 'm2', sender: 'student', created_at: '2026-09-26T09:00:00Z', status: 'sent' }),
          message({ id: 'm3', sender: 'consultant', created_at: '2026-09-26T11:00:00Z', status: 'sent' }),
        ],
        meta: {},
      })

      // side: 'student' — the student's read marker moved, so messages the CONSULTANT sent (up to
      // up_to) are now read by them; the student's own message (m2) and the too-new m3 are untouched.
      applyChatStatus(queryClient, { type: 'lead', id: 'lead-1' }, 'read', 'student', '2026-09-26T10:00:00Z')

      const items = (queryClient.getQueryData(['leads', 'lead-1', 'messages']) as { items: LeadMessage[] }).items
      expect(items.find((m) => m.id === 'm1')?.status).toBe('read')
      expect(items.find((m) => m.id === 'm2')?.status).toBe('sent')
      expect(items.find((m) => m.id === 'm3')?.status).toBe('sent')
    })

    it('never downgrades read back to delivered', () => {
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], {
        items: [message({ id: 'm1', sender: 'consultant', created_at: '2026-09-26T09:00:00Z', status: 'read' })],
        meta: {},
      })

      applyChatStatus(queryClient, { type: 'lead', id: 'lead-1' }, 'delivered', 'student', '2026-09-26T12:00:00Z')

      const items = (queryClient.getQueryData(['leads', 'lead-1', 'messages']) as { items: LeadMessage[] }).items
      expect(items[0].status).toBe('read')
    })
  })

  describe('applyConversationUpdated', () => {
    it('patches the matching row in the unpaged badge query', () => {
      queryClient.setQueryData(['conversations'], {
        items: [conversation({ id: 'c1', type: 'lead' }), conversation({ id: 'c2', type: 'lead' })],
        meta: { total: 2, unread_count: 1 },
      })

      applyConversationUpdated(
        queryClient,
        conversation({ id: 'c1', type: 'lead', last_message_preview: 'new message', unread: true }),
      )

      const data = queryClient.getQueryData(['conversations']) as { items: Conversation[] }
      expect(data.items[0].last_message_preview).toBe('new message')
      expect(data.items[0].unread).toBe(true)
      expect(data.items[1].last_message_preview).toBe('old preview') // untouched
    })

    it('patches every page of the paged/searched drawer list', () => {
      queryClient.setQueryData(['conversations', 'list', ''], {
        pages: [
          { items: [conversation({ id: 'c1', type: 'lead' })], meta: { total: 1, unread_count: 1 } },
          { items: [conversation({ id: 'c2', type: 'client' })], meta: { total: 1, unread_count: 1 } },
        ],
        pageParams: [undefined, 'cursor-1'],
      })

      applyConversationUpdated(queryClient, conversation({ id: 'c2', type: 'client', unread: false }))

      const data = queryClient.getQueryData(['conversations', 'list', '']) as {
        pages: { items: Conversation[] }[]
      }
      expect(data.pages[1].items[0].unread).toBe(false)
      expect(data.pages[0].items[0].unread).toBe(false) // c1 was already false — untouched, not flipped
    })
  })

  describe('applyUnreadChanged', () => {
    it('replaces the badge count rather than adding to it', () => {
      queryClient.setQueryData(['conversations'], { items: [], meta: { total: 0, unread_count: 7 } })

      applyUnreadChanged(queryClient, { chat: 2 })

      expect((queryClient.getQueryData(['conversations']) as { meta: { unread_count: number } }).meta.unread_count).toBe(2)
    })

    it('also writes the notifications count when present (Wave 4)', () => {
      queryClient.setQueryData(['notifications-unread-count'], 5)
      applyUnreadChanged(queryClient, { chat: 0, notifications: 3 })
      expect(queryClient.getQueryData(['notifications-unread-count'])).toBe(3)
    })

    it('leaves the notifications count alone while it is null (not yet published)', () => {
      queryClient.setQueryData(['notifications-unread-count'], 5)
      applyUnreadChanged(queryClient, { chat: 0, notifications: null })
      expect(queryClient.getQueryData(['notifications-unread-count'])).toBe(5)
    })
  })

  describe('applyResync', () => {
    it('invalidates conversations and the currently-viewed thread', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyResync(queryClient, { type: 'client', id: 'client-5' })

      expect(spy).toHaveBeenCalledWith({ queryKey: ['conversations'] })
      expect(spy).toHaveBeenCalledWith({ queryKey: ['clients', 'client-5', 'messages'] })
    })

    it('skips the thread invalidation when nothing is being viewed', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyResync(queryClient, null)
      expect(spy).toHaveBeenCalledTimes(1)
    })
  })

  describe('applyNotificationCreated', () => {
    it('invalidates the bell queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyNotificationCreated(queryClient)
      expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications-unread-count'] })
      expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    })
  })
})
