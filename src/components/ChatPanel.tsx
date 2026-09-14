import { ArrowUp, CalendarClock, Lock, Search, Undo2 } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { CourseDetailModal } from '@/features/clients/CourseDetailModal'
import { courseFinderUrlForSharedSearch } from '@/features/clients/courseFinderState'
import { Button } from './Button'
import { Modal } from './Modal'
import { formatDate, formatDayLabel, formatTime, isSameCalendarDay } from '@/lib/time'
import { formatMoney } from '@/lib/money'
import type { components } from '@/api/schema'

type Course = components['schemas']['Course']
type College = components['schemas']['College']
type SharedSearch = components['schemas']['SharedSearch']

interface ChatMessage {
  id: string
  fromMe: boolean
  content: string
  created_at: string
  // Only rendered for messages that aren't `fromMe` — omit it (a DM's own header already says
  // who the other side is) or set it (a multi-participant conversation like Whole Team, where
  // bubble alignment alone doesn't say which colleague sent it) per caller.
  senderName?: string
  // User-requested (2026-08-19) — "we need ability for consultant to see the shortlisted courses
  // when student decides to [share]." Set only on a `type: shortlist_share` message; renders as a
  // card of courses instead of the plain text bubble. `content` still carries the fallback text.
  sharedCourses?: Course[]
  // User #18 (2026-08-19) — "we want option to share college search via chat." Set only on a
  // `type: college_share` message (student-sent from Sentpo Mobile's College Detail); renders as
  // a college card instead of a plain bubble. `content` still carries the fallback text.
  sharedCollege?: College
  // "Ask a consultancy about your chances" (COURSES_MODULE_PLAN.md §3.5, workstream E) — set
  // only on a `type: course_share` message. The course resolves at read; fitSummary is the
  // student's standing SNAPSHOTTED at send time, so the consultant reads exactly what was asked.
  sharedCourse?: Course
  fitSummary?: string | null
  // User-requested (2026-08-19) — "there should be a distinguishable break between the two
  // sessions [lead and client chat]. So the consultant knows." True only for the one synthetic
  // `session_break` marker message the server inserts when a client's history was spliced
  // together from an origin lead — renders as a labeled divider, not a bubble.
  isSessionBreak?: boolean
  // Call-tracking ping (2026-09-01, user — "we need to know calls triggered too"). Set only on a
  // `type: call_initiated` message — student-sent, fired right before the mobile device's own
  // phone dialer opens, from the "Call" option in the same two-option sheet `visit_request` below
  // comes from. Renders as a small system-style line (same family as the `isSessionBreak`
  // divider, not a bubble): it's not something the student "said," and `content`'s own INTENT
  // wording ("Tapped to call", never "Called you" — the device can't confirm the call connected)
  // is echoed there rather than reused verbatim, so this line can name who tapped.
  isCallInitiated?: boolean
  // A student requesting an in-person office visit (user, 2026-08-24: "a student should be able
  // to request for a in-person visit to consultancy office... from the chat window"). Set only on
  // a `type: visit_request` message — renders as a card with the proposed date/time and note,
  // same family as sharedCourse/sharedCollege. One proposed time, not a slot-picker; confirming or
  // countering happens as ordinary follow-up messages, so there is no status on this card at all.
  visitRequest?: { proposed_date?: string; proposed_time?: string; note?: string | null } | null
  // A course search shared in chat (2026-09-14) — set only on a `type: search_share` message.
  // Renders as a card that reopens the search in Course Finder for this person.
  sharedSearch?: SharedSearch | null
}

interface ChatPanelProps {
  name: string
  typeLabel: string
  typeLabelTone?: 'primary' | 'neutral'
  messages: ChatMessage[] | undefined
  isLoading: boolean
  // H10 fix (frontend review, 1 Sep 2026) — a failed message fetch used to render as an empty
  // "say hello" thread, indistinguishable from a genuinely new conversation. Optional because a
  // few callers don't wire it (yet); when set, takes priority over both the loading and empty
  // states below.
  isError?: boolean
  onRetryMessages?: () => void
  draft: string
  onDraftChange: (value: string) => void
  onSend: (e: FormEvent) => void
  sending: boolean
  headerActions?: ReactNode
  className?: string
  heightClassName?: string
  // Unsend-while-unread (user request 13, 2026-08-19) — internal chat only, so the prop is
  // optional and Lead/Client conversations simply never pass it. Rejects (e.g. the server's
  // 409 already_read) surface inside the confirm popup, which stays open so the reader sees why.
  onUnsend?: (messageId: string) => Promise<unknown>
  // When set, the composer is replaced by this notice and nothing can be sent — a lead still in
  // the pool, which no one on staff may reply to until it is allocated (user, 2026-09-10). The
  // server refuses those replies too; this only says why before anyone types.
  composerLocked?: ReactNode
  // The lead or client this conversation is with. Lets a shared search card reopen Course Finder
  // for them; internal conversations leave it unset.
  person?: { id: string; kind: 'lead' | 'client' }
  // Sits beside the message box — the lead and client chats put Suggest a course here.
  composerAction?: ReactNode
}

// Shared conversation UI for Lead (Aspirant), Client (Applicant), and Internal (colleague/Team)
// conversations alike — a floating-card chat widget look (rounded bubbles, avatar header, pill
// input + round send button) instead of the flatter inline panel this replaced, styled from our
// own tokens rather than the reference's teal. Used both inline (full conversation pages) and
// inside FloatingChatWindow — `headerActions` is how the floating window adds its
// minimize/close/open-full-page controls without ChatPanel itself knowing anything about
// windowing. `fromMe`/`typeLabelTone` are deliberately generic (not "consultant"/"student" or a
// hardcoded Aspirant/Applicant check) so this component carries no client-chat-specific
// vocabulary — each caller maps its own domain sender enum to `fromMe` and picks its own tone.
export function ChatPanel({
  name,
  typeLabel,
  typeLabelTone = 'neutral',
  messages,
  isLoading,
  isError,
  onRetryMessages,
  draft,
  onDraftChange,
  onSend,
  sending,
  headerActions,
  className,
  heightClassName = 'h-96',
  onUnsend,
  composerLocked,
  person,
  composerAction,
}: ChatPanelProps) {
  // Confirm-gated per the platform's standing delete rule; owned here (not per caller) so both
  // the Internal Messaging page and the floating window get one identical implementation.
  const [unsendTarget, setUnsendTarget] = useState<string | null>(null)
  const [unsendBusy, setUnsendBusy] = useState(false)
  const [unsendError, setUnsendError] = useState<string | null>(null)
  // Course cards open the same course popup Course Finder uses (2026-09-14) — a card that
  // looks like a course but does nothing when clicked was a dead end.
  const [openCourse, setOpenCourse] = useState<Course | null>(null)
  const navigate = useNavigate()

  // Auto-scroll to the latest message (user, 2026-08-24: "chat auto scroll to last message" — the
  // mobile app already gets this for free from its reversed ListView; web had no scroll behavior
  // at all). Keyed on message COUNT, not the array reference, so a same-length background refetch
  // (React Query polling) never yanks the view if nothing new actually arrived. One shared effect
  // covers every caller — inline conversation pages and the floating window alike.
  const bottomRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' })
  }, [messages?.length])

  async function confirmUnsend() {
    if (!onUnsend || !unsendTarget) return
    setUnsendBusy(true)
    setUnsendError(null)
    try {
      await onUnsend(unsendTarget)
      setUnsendTarget(null)
    } catch (error) {
      setUnsendError(error instanceof Error ? error.message : 'Could not unsend this message.')
    } finally {
      setUnsendBusy(false)
    }
  }

  return (
    <div
      className={`flex ${heightClassName} flex-col overflow-hidden rounded-lg border border-border bg-surface shadow-card ${className ?? ''}`}
    >
      <div className="flex shrink-0 items-center gap-sm border-b border-border px-md py-sm">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-body font-semibold text-primary">
          {name.charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-body font-semibold text-text-primary">{name}</p>
          <span
            className={`inline-flex rounded-full px-xs py-0.5 text-caption font-medium ${
              typeLabelTone === 'primary' ? 'bg-primary-subtle text-primary' : 'bg-background text-text-secondary'
            }`}
          >
            {typeLabel}
          </span>
        </div>
        {headerActions && <div className="flex shrink-0 items-center gap-xs">{headerActions}</div>}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-sm overflow-y-auto px-md py-md">
        {isLoading && !isError && (
          <div className="flex h-full items-center justify-center">
            <p className="text-body-sm text-text-secondary">Loading…</p>
          </div>
        )}
        {isError && (
          <div className="flex h-full flex-col items-center justify-center gap-sm">
            <p className="text-body-sm text-error">Could not load messages.</p>
            {onRetryMessages && (
              <Button variant="secondary" size="sm" onClick={onRetryMessages}>
                Retry
              </Button>
            )}
          </div>
        )}
        {!isLoading && !isError && messages?.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-body-sm text-text-secondary">No messages yet — say hello.</p>
          </div>
        )}
        {!isError &&
          messages?.map((m, i) => {
            const prev = messages[i - 1]
            const showDayDivider = !prev || !isSameCalendarDay(prev.created_at, m.created_at)
            return (
              // `display: contents` so the divider (centered) and the bubble (self-end/self-start)
              // can each set their own alignment as direct children of the flex column below,
              // instead of being pinned to whatever this wrapper's own alignment would be.
              <div key={m.id} className="contents">
                {showDayDivider && (
                  <span className="self-center rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                    {formatDayLabel(m.created_at)}
                  </span>
                )}
                {!m.fromMe && m.senderName && !m.isSessionBreak && (
                  <span className="self-start px-xs text-caption font-medium text-text-secondary">{m.senderName}</span>
                )}
                {m.isSessionBreak ? (
                  <div className="my-xs flex items-center gap-sm self-stretch">
                    <span className="h-px flex-1 bg-border" />
                    <span className="shrink-0 rounded-full border border-primary bg-primary-subtle px-sm py-0.5 text-caption font-medium text-primary">
                      {m.content}
                    </span>
                    <span className="h-px flex-1 bg-border" />
                  </div>
                ) : m.isCallInitiated ? (
                  <span className="self-center rounded-full bg-background px-sm py-0.5 text-caption font-medium text-text-secondary">
                    {name} tapped to call you · {formatTime(m.created_at)}
                  </span>
                ) : m.sharedCourse ? (
                  // The ask-a-consultancy context card (plan §3.5) — course + the student's fit
                  // at the moment they asked, so the consultant can answer without digging.
                  <div
                    style={{ maxWidth: '85%' }}
                    className={`flex flex-col gap-sm rounded-2xl border border-border bg-surface px-md py-sm ${
                      m.fromMe ? 'self-end' : 'self-start'
                    }`}
                  >
                    <p className="text-caption font-medium text-text-secondary">{m.content}</p>
                    <button
                      type="button"
                      onClick={() => setOpenCourse(m.sharedCourse ?? null)}
                      className="block w-full rounded-md bg-background px-sm py-xs text-left hover:bg-primary-subtle"
                    >
                      <span className="block text-body-sm font-medium text-text-primary">{m.sharedCourse.name}</span>
                      <span className="block text-caption text-text-secondary">
                        {[m.sharedCourse.college_name, m.sharedCourse.country].filter(Boolean).join(' · ') || 'Course'}
                      </span>
                      {m.fitSummary && (
                        <span className="mt-xs block text-caption font-medium text-warning">{m.fitSummary}</span>
                      )}
                    </button>
                    <span className="self-end text-caption text-text-secondary">{formatTime(m.created_at)}</span>
                  </div>
                ) : m.sharedCollege ? (
                  // User #18 (2026-08-19) — a shared college renders as a card, same treatment as
                  // the shared-Shortlist block below, so the consultant sees what was shared.
                  <div
                    style={{ maxWidth: '85%' }}
                    className={`flex flex-col gap-sm rounded-2xl border border-border bg-surface px-md py-sm ${
                      m.fromMe ? 'self-end' : 'self-start'
                    }`}
                  >
                    <p className="text-caption font-medium text-text-secondary">{m.content}</p>
                    <div className="rounded-md bg-background px-sm py-xs">
                      <p className="text-body-sm font-medium text-text-primary">{m.sharedCollege.name}</p>
                      <p className="text-caption text-text-secondary">
                        {(m.sharedCollege.campuses ?? [])
                          .map((c) => [c.province_state, c.country].filter(Boolean).join(', '))
                          .filter(Boolean)
                          .join(' · ') || 'College'}
                        {m.sharedCollege.website ? ` · ${m.sharedCollege.website}` : ''}
                      </p>
                    </div>
                    <span className="self-end text-caption text-text-secondary">{formatTime(m.created_at)}</span>
                  </div>
                ) : m.visitRequest ? (
                  // In-person visit request (2026-08-24) — one proposed date/time, no status: any
                  // confirming/countering is just the next ordinary message in the thread.
                  <div
                    style={{ maxWidth: '85%' }}
                    className={`flex flex-col gap-sm rounded-2xl border border-border bg-surface px-md py-sm ${
                      m.fromMe ? 'self-end' : 'self-start'
                    }`}
                  >
                    <p className="text-caption font-medium text-text-secondary">Requested an in-person visit</p>
                    <div className="flex items-center gap-xs rounded-md bg-background px-sm py-xs">
                      <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                      <p className="text-body-sm font-medium text-text-primary">
                        {m.visitRequest.proposed_date ? formatDate(m.visitRequest.proposed_date) : '—'} at{' '}
                        {m.visitRequest.proposed_time}
                      </p>
                    </div>
                    {m.visitRequest.note && <p className="text-caption text-text-secondary">{m.visitRequest.note}</p>}
                    <span className="self-end text-caption text-text-secondary">{formatTime(m.created_at)}</span>
                  </div>
                ) : m.sharedSearch ? (
                  // A shared search (2026-09-14). Opens Course Finder for this person with the same
                  // filters; anything the other side could not apply is named, never silently lost.
                  <div
                    style={{ maxWidth: '85%' }}
                    className={`flex flex-col gap-sm rounded-2xl border border-border bg-surface px-md py-sm ${
                      m.fromMe ? 'self-end' : 'self-start'
                    }`}
                  >
                    <p className="text-caption font-medium text-text-secondary">
                      {m.fromMe ? 'You sent a search' : 'Shared a search'}
                    </p>
                    <button
                      type="button"
                      disabled={!person}
                      onClick={() => {
                        if (person && m.sharedSearch) navigate(courseFinderUrlForSharedSearch(person, m.sharedSearch.filters))
                      }}
                      className="flex w-full flex-col items-start gap-xs rounded-md bg-background px-sm py-xs text-left enabled:hover:bg-primary-subtle"
                    >
                      <span className="flex items-center gap-xs text-body-sm font-medium text-text-primary">
                        <Search className="h-4 w-4 shrink-0 text-primary" />
                        {m.sharedSearch.summary}
                      </span>
                      <span className="text-caption text-text-secondary">
                        {m.sharedSearch.match_count} course{m.sharedSearch.match_count === 1 ? '' : 's'} matched when
                        shared
                      </span>
                      {m.sharedSearch.left_out.length > 0 && (
                        <span className="text-caption text-warning">
                          Not carried over: {m.sharedSearch.left_out.join(', ')}
                        </span>
                      )}
                      {person && <span className="text-caption font-medium text-primary">Open these results</span>}
                    </button>
                    <span className="self-end text-caption text-text-secondary">{formatTime(m.created_at)}</span>
                  </div>
                ) : m.sharedCourses ? (
                  // User-requested (2026-08-19) — a shared Shortlist renders as a card of courses,
                  // not a plain text bubble, so the consultant can actually see what was shared.
                  <div
                    style={{ maxWidth: '85%' }}
                    className={`flex flex-col gap-sm rounded-2xl border border-border bg-surface px-md py-sm ${
                      m.fromMe ? 'self-end' : 'self-start'
                    }`}
                  >
                    <p className="text-caption font-medium text-text-secondary">{m.content}</p>
                    <div className="flex flex-col gap-xs">
                      {m.sharedCourses.map((course) => (
                        <button
                          type="button"
                          key={course.id}
                          onClick={() => setOpenCourse(course)}
                          className="block w-full rounded-md bg-background px-sm py-xs text-left hover:bg-primary-subtle"
                        >
                          <span className="block text-body-sm font-medium text-text-primary">{course.name}</span>
                          <span className="block text-caption text-text-secondary">
                            {course.college_name}
                            {course.country ? ` · ${course.country}` : ''}
                            {course.fee?.amount ? ` · ${formatMoney(course.fee.currency, course.fee.amount)}` : ''}
                          </span>
                        </button>
                      ))}
                    </div>
                    <span className="self-end text-caption text-text-secondary">{formatTime(m.created_at)}</span>
                  </div>
                ) : (
                  // `group` wrapper so the unsend affordance appears on hover of the whole row —
                  // always-visible icons on every own bubble would read as clutter.
                  <div
                    style={{ maxWidth: '75%' }}
                    className={`group flex items-center gap-xs ${m.fromMe ? 'self-end' : 'self-start'}`}
                  >
                    {m.fromMe && onUnsend && (
                      <button
                        onClick={() => {
                          setUnsendError(null)
                          setUnsendTarget(m.id)
                        }}
                        aria-label="Unsend message"
                        title="Unsend"
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-text-secondary opacity-0 hover:bg-background hover:text-text-primary focus:opacity-100 group-hover:opacity-100"
                      >
                        <Undo2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <div
                      // Arbitrary bracket classes (`max-w-[75%]`) silently generate zero CSS in this
                      // project's Tailwind v4 setup — inline style sidesteps it (see GlobalSearch.tsx).
                      className={`rounded-2xl px-md py-sm text-body-sm ${
                        m.fromMe ? 'bg-primary text-text-on-primary' : 'bg-background text-text-primary'
                      }`}
                    >
                      {m.content}
                      {/* WhatsApp's trick: a floated, trailing time stamp tucks into the end of the
                        last line instead of sitting on its own row. */}
                      <span
                        className={`float-right ml-sm mt-0.5 text-caption ${
                          m.fromMe ? 'text-text-on-primary/70' : 'text-text-secondary'
                        }`}
                      >
                        {formatTime(m.created_at)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        <div ref={bottomRef} />
      </div>

      {openCourse && <CourseDetailModal course={openCourse} onClose={() => setOpenCourse(null)} />}

      {unsendTarget && (
        <Modal
          onClose={() => setUnsendTarget(null)}
          title="Unsend Message"
          widthRem={24}
          footer={
            <>
              {unsendError && <p className="mr-auto self-center text-body-sm text-error">{unsendError}</p>}
              <Button variant="secondary" onClick={() => setUnsendTarget(null)}>
                Cancel
              </Button>
              <Button variant="destructive" loading={unsendBusy} onClick={confirmUnsend}>
                Unsend
              </Button>
            </>
          }
        >
          <p className="text-body-sm text-text-secondary">
            Unsend this message? It disappears for everyone — only possible while it hasn't been read yet.
          </p>
        </Modal>
      )}

      {composerLocked ? (
        <div className="flex shrink-0 items-center gap-sm border-t border-border bg-background px-md py-md text-body-sm text-text-secondary">
          <Lock className="h-4 w-4 shrink-0" aria-hidden />
          <span>{composerLocked}</span>
        </div>
      ) : (
        <form onSubmit={onSend} className="flex shrink-0 flex-col gap-xs border-t border-border px-md py-sm">
          <div className="flex items-end gap-sm">
            {composerAction}
            {/* A textarea, not an input (console review M2, 2026-09-13) — Enter sends and
                Shift+Enter starts a new line, the convention every chat app trains people on.
                An `<input>` could not hold a newline at all, so a multi-line message was
                impossible; `requestSubmit` routes Enter through the same submit handler the
                send button uses, so nothing needs a second code path. */}
            <textarea
              value={draft}
              onChange={(e) => onDraftChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey) return
                // Leave IME composition alone — mid-composition Enter commits the candidate.
                if (e.nativeEvent.isComposing) return
                e.preventDefault()
                e.currentTarget.form?.requestSubmit()
              }}
              rows={1}
              placeholder="Write a message…"
              className="max-h-24 min-h-11 flex-1 resize-none rounded-2xl border border-border bg-background px-md py-sm text-body text-text-primary outline-none focus:border-2 focus:border-primary"
            />
            <button
              type="submit"
              disabled={sending || !draft.trim()}
              aria-label="Send message"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-text-on-primary disabled:opacity-40"
            >
              <ArrowUp className="h-5 w-5" />
            </button>
          </div>
          <p className="text-caption text-text-secondary">Enter to send · Shift+Enter for a new line</p>
        </form>
      )}
    </div>
  )
}
