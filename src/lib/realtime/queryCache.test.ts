import { QueryClient, type InfiniteData } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  applyChatMessage,
  applyChatStatus,
  applyConversationUpdated,
  applyNotificationCreated,
  applyResync,
  applyUnreadChanged,
  mergeNewestMessages,
  type MessagesPage,
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

/** The thread cache as `useThreadMessages` holds it: newest page first, older pages after it. */
function thread(...pages: LeadMessage[][]): InfiniteData<MessagesPage> {
  return { pages: pages.map((items) => ({ items, meta: {} })), pageParams: pages.map(() => undefined) }
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
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], thread([message({ id: 'm0' })]))

      applyChatMessage(queryClient, { type: 'lead', id: 'lead-1' }, message({ id: 'm1' }))

      expect(queryClient.getQueryData(['leads', 'lead-1', 'messages'])).toEqual(
        thread([message({ id: 'm0' }), message({ id: 'm1' })]),
      )
    })

    // F-029: the thread is paged. A live message belongs at the end of the NEWEST page
    // (`pages[0]`), whatever older pages have been loaded after it.
    it('appends to the newest page and leaves the older pages alone', () => {
      const older = [message({ id: 'm0' })]
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], thread([message({ id: 'm5' })], older))

      applyChatMessage(queryClient, { type: 'lead', id: 'lead-1' }, message({ id: 'm6' }))

      const data = queryClient.getQueryData(['leads', 'lead-1', 'messages']) as InfiniteData<MessagesPage>
      expect(data.pages[0].items.map((m) => m.id)).toEqual(['m5', 'm6'])
      expect(data.pages[1].items).toBe(older)
    })

    it('de-dupes by id — a message already in any loaded page is not appended twice', () => {
      const cached = thread([message({ id: 'm2' })], [message({ id: 'm1' })])
      queryClient.setQueryData(['clients', 'client-1', 'messages'], cached)

      applyChatMessage(queryClient, { type: 'client', id: 'client-1' }, message({ id: 'm1' }))
      applyChatMessage(queryClient, { type: 'client', id: 'client-1' }, message({ id: 'm2' }))

      expect(queryClient.getQueryData(['clients', 'client-1', 'messages'])).toBe(cached)
    })

    it('does nothing when the thread is not currently cached (nobody has it open)', () => {
      applyChatMessage(queryClient, { type: 'lead', id: 'lead-9' }, message())
      expect(queryClient.getQueryData(['leads', 'lead-9', 'messages'])).toBeUndefined()
    })
  })

  describe('applyChatStatus', () => {
    it('marks the OTHER side\'s messages read up to the given time, never the viewer\'s own', () => {
      // m1 sits on an older page: the marker reaches every loaded page, not only the newest.
      queryClient.setQueryData(
        ['leads', 'lead-1', 'messages'],
        thread(
          [
            message({ id: 'm2', sender: 'student', created_at: '2026-09-26T09:00:00Z', status: 'sent' }),
            message({ id: 'm3', sender: 'consultant', created_at: '2026-09-26T11:00:00Z', status: 'sent' }),
          ],
          [message({ id: 'm1', sender: 'consultant', created_at: '2026-09-26T09:00:00Z', status: 'sent' })],
        ),
      )

      // side: 'student' — the student's read marker moved, so messages the CONSULTANT sent (up to
      // up_to) are now read by them; the student's own message (m2) and the too-new m3 are untouched.
      applyChatStatus(queryClient, { type: 'lead', id: 'lead-1' }, 'read', 'student', '2026-09-26T10:00:00Z')

      const items = (
        queryClient.getQueryData(['leads', 'lead-1', 'messages']) as InfiniteData<MessagesPage>
      ).pages.flatMap((p) => p.items)
      expect(items.find((m) => m.id === 'm1')?.status).toBe('read')
      expect(items.find((m) => m.id === 'm2')?.status).toBe('sent')
      expect(items.find((m) => m.id === 'm3')?.status).toBe('sent')
    })

    it('never downgrades read back to delivered', () => {
      queryClient.setQueryData(
        ['leads', 'lead-1', 'messages'],
        thread([message({ id: 'm1', sender: 'consultant', created_at: '2026-09-26T09:00:00Z', status: 'read' })]),
      )

      applyChatStatus(queryClient, { type: 'lead', id: 'lead-1' }, 'delivered', 'student', '2026-09-26T12:00:00Z')

      const data = queryClient.getQueryData(['leads', 'lead-1', 'messages']) as InfiniteData<MessagesPage>
      expect(data.pages[0].items[0].status).toBe('read')
    })
  })

  // F-029: the fallback poll's patch once older pages are loaded — the newest page only is asked
  // for, and folded in without moving anything that is already there.
  describe('mergeNewestMessages', () => {
    it('appends what is new to the newest page and updates a status in place, on whichever page', () => {
      const untouched = message({ id: 'm1' })
      queryClient.setQueryData(
        ['leads', 'lead-1', 'messages'],
        thread([message({ id: 'm3', status: 'sent' })], [untouched, message({ id: 'm2', status: 'sent' })]),
      )

      mergeNewestMessages(queryClient, { type: 'lead', id: 'lead-1' }, [
        message({ id: 'm2', status: 'read' }),
        message({ id: 'm3', status: 'sent' }),
        message({ id: 'm4' }),
        message({ id: 'm5' }),
      ])

      const data = queryClient.getQueryData(['leads', 'lead-1', 'messages']) as InfiniteData<MessagesPage>
      expect(data.pages[0].items.map((m) => m.id)).toEqual(['m3', 'm4', 'm5'])
      expect(data.pages[1].items.map((m) => [m.id, m.status])).toEqual([
        ['m1', undefined],
        ['m2', 'read'],
      ])
      expect(data.pages[1].items[0]).toBe(untouched)
    })

    it('changes nothing when the newest page holds nothing new', () => {
      const cached = thread([message({ id: 'm2' })], [message({ id: 'm1' })])
      queryClient.setQueryData(['leads', 'lead-1', 'messages'], cached)

      mergeNewestMessages(queryClient, { type: 'lead', id: 'lead-1' }, [message({ id: 'm1' }), message({ id: 'm2' })])

      expect(queryClient.getQueryData(['leads', 'lead-1', 'messages'])).toBe(cached)
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
    // Review F-142: frames were missed, nobody knows how many, so EVERY chat-shaped read the
    // console holds is asked for again — not the conversation list and one thread, as before.
    function seedStale(key: readonly unknown[]) {
      queryClient.setQueryData(key, { pages: [], pageParams: [] })
      return () => queryClient.getQueryState(key)?.isInvalidated
    }

    it('marks every lead, client and internal thread stale, and both conversation lists', () => {
      const stale = [
        seedStale(['conversations']),
        seedStale(['conversations', 'list', '']),
        seedStale(['conversations', 'list', 'asha']),
        seedStale(['leads', 'lead-1', 'messages']),
        seedStale(['leads', 'lead-2', 'messages']),
        seedStale(['clients', 'client-5', 'messages']),
        seedStale(['internal-conversations']),
        seedStale(['internal-conversations', 'team', 'messages']),
        seedStale(['internal-conversations', 'emp-9', 'messages']),
      ]
      applyResync(queryClient)
      expect(stale.map((isStale) => isStale())).toEqual(stale.map(() => true))
    })

    it('leaves everything that is not chat alone', () => {
      const untouched = [
        seedStale(['leads', 'lead-1']),
        seedStale(['leads', 'lead-1', 'notes']),
        seedStale(['clients', 'client-5']),
        seedStale(['clients', 'client-5', 'plans']),
        seedStale(['employees']),
      ]
      applyResync(queryClient)
      expect(untouched.map((isStale) => isStale())).toEqual(untouched.map(() => false))
    })
  })

  describe('a conversation the console has never listed (F-142)', () => {
    const fresh = { id: 'lead-new', type: 'lead', name: 'New Student', unread: 1 } as never

    it('asks for the conversation lists again instead of dropping the update', () => {
      queryClient.setQueryData(['conversations'], {
        items: [{ id: 'lead-1', type: 'lead' }],
        meta: { total: 1, unread_count: 0 },
      })
      queryClient.setQueryData(['conversations', 'list', ''], {
        pages: [{ items: [{ id: 'lead-1', type: 'lead' }], meta: { total: 1, unread_count: 0 } }],
        pageParams: [undefined],
      })
      applyConversationUpdated(queryClient, fresh)
      expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(true)
      expect(queryClient.getQueryState(['conversations', 'list', ''])?.isInvalidated).toBe(true)
    })

    it('does not refetch for a conversation that is already listed: the row is patched in place', () => {
      queryClient.setQueryData(['conversations'], {
        items: [{ id: 'lead-new', type: 'lead', unread: 0 }],
        meta: { total: 1, unread_count: 0 },
      })
      applyConversationUpdated(queryClient, fresh)
      expect(queryClient.getQueryState(['conversations'])?.isInvalidated).toBe(false)
      expect(queryClient.getQueryData<{ items: { unread: number }[] }>(['conversations'])?.items[0].unread).toBe(1)
    })

    it('does not read a searched list as proof the conversation is new', () => {
      queryClient.setQueryData(['conversations', 'list', 'asha'], {
        pages: [{ items: [{ id: 'lead-1', type: 'lead' }], meta: { total: 1, unread_count: 0 } }],
        pageParams: [undefined],
      })
      applyConversationUpdated(queryClient, fresh)
      expect(queryClient.getQueryState(['conversations', 'list', 'asha'])?.isInvalidated).toBe(false)
    })

    it('does nothing when no conversation list is loaded at all', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyConversationUpdated(queryClient, fresh)
      expect(spy).not.toHaveBeenCalled()
    })
  })

  describe('applyNotificationCreated', () => {
    it('invalidates the bell queries', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyNotificationCreated(queryClient)
      expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications-unread-count'] })
      expect(spy).toHaveBeenCalledWith({ queryKey: ['notifications'] })
    })

    it('marks the waiting-for-the-student panel stale, since a student answers through a notification', () => {
      const spy = vi.spyOn(queryClient, 'invalidateQueries')
      applyNotificationCreated(queryClient)
      expect(spy).toHaveBeenCalledWith({ queryKey: ['applicant-requests'] })
    })
  })
})
