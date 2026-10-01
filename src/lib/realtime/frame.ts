import type { components } from '@/api/schema'

export type RealtimeThreadRef = components['schemas']['RealtimeThreadRef']
export type RealtimeChatMessageData = components['schemas']['RealtimeChatMessageData']
export type RealtimeChatStatusData = components['schemas']['RealtimeChatStatusData']
export type RealtimeConversationUpdatedData = components['schemas']['RealtimeConversationUpdatedData']
export type RealtimeUnreadChangedData = components['schemas']['RealtimeUnreadChangedData']
export type RealtimePresenceData = components['schemas']['RealtimePresenceData']
export type RealtimeReconnectData = components['schemas']['RealtimeReconnectData']
export type RealtimeHelloData = components['schemas']['RealtimeHelloData']
export type RealtimeInternalRef = components['schemas']['RealtimeInternalRef']
export type RealtimeInternalMessageData = components['schemas']['RealtimeInternalMessageData']
export type RealtimeInternalUnsentData = components['schemas']['RealtimeInternalUnsentData']

/** A frame this client can receive (server → client, per asyncapi.yaml `receiveServerFrames`). */
export type KnownServerFrameType =
  | 'hello'
  | 'ping'
  | 'chat.message'
  | 'chat.delivered'
  | 'chat.read'
  | 'internal.message'
  | 'internal.unsent'
  | 'conversation.updated'
  | 'unread.changed'
  | 'presence'
  | 'notification.created'
  | 'resync'
  | 'reconnect'

const KNOWN_SERVER_FRAME_TYPES = new Set<string>([
  'hello',
  'ping',
  'chat.message',
  'chat.delivered',
  'chat.read',
  'internal.message',
  'internal.unsent',
  'conversation.updated',
  'unread.changed',
  'presence',
  'notification.created',
  'resync',
  'reconnect',
])

/** The envelope every frame shares (`RealtimeFrame` in openapi.yaml), loosely typed — `data` is
 * validated per `type` by the caller, not here. */
export interface RawRealtimeFrame {
  v: number
  type: string
  id?: string | null
  ts: string
  data: unknown
}

export type OutgoingFrameType = 'resume' | 'viewing' | 'ack' | 'pong'

export interface OutgoingFrame {
  v: 1
  type: OutgoingFrameType
  ts: string
  data: unknown
}

/**
 * Parses a raw socket message into an envelope shape, or returns null for anything that doesn't
 * even look like a frame (malformed JSON, wrong envelope version). The contract requires a client
 * to check `type` as a string before decoding further and to ignore whatever it doesn't recognise
 * (asyncapi.yaml: "A client ignores a `type` it does not know … and a frame whose `v` is not 1") —
 * `isKnownServerFrameType` below is the second half of that: a frame that parses fine but names a
 * type this client doesn't act on (a future signal, or one of the client→server types echoed back)
 * is dropped by the caller rather than throwing.
 */
export function parseRealtimeFrame(raw: string): RawRealtimeFrame | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const candidate = parsed as Record<string, unknown>
  if (candidate.v !== 1) return null
  if (typeof candidate.type !== 'string') return null
  if (typeof candidate.ts !== 'string') return null
  if (typeof candidate.data !== 'object' || candidate.data === null) return null
  return {
    v: candidate.v,
    type: candidate.type,
    id: typeof candidate.id === 'string' ? candidate.id : null,
    ts: candidate.ts,
    data: candidate.data,
  }
}

export function isKnownServerFrameType(type: string): type is KnownServerFrameType {
  return KNOWN_SERVER_FRAME_TYPES.has(type)
}

export function threadKey(thread: RealtimeThreadRef): string {
  return `${thread.type}:${thread.id}`
}

/** `RealtimeInternalRef` → the `idOrTeam` string `queries/internalMessages.ts` already keys its
 * queries and routes by (`'team'`, or the other employee's id for a DM) — the same convention
 * `GET /internal-conversations` uses, which is exactly why the frame's own description says a
 * client can match it straight to a row it already has. */
export function internalThreadIdOrTeam(thread: RealtimeInternalRef): string {
  return thread.kind === 'team' ? 'team' : (thread.colleague_id ?? 'team')
}
