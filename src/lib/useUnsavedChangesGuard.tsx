import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal } from '@/components/Modal'
import { Button } from '@/components/Button'

interface GuardCopy {
  title: string
  body: string
  discardLabel?: string
}

/**
 * Asks before throwing away unsaved work (user, 2026-09-10: plan templates — "if someone was
 * creating a new plan template and mid way accidently clicked Cancel or exit the page, can we ask
 * confirmation? Only if some creation started"). Pass `dirty` — true only once there is something
 * to lose — and while it is true, every way out asks first:
 *
 * - the page's own Cancel/close: wrap it in `requestLeave(action)`;
 * - any in-app link (sidebar, breadcrumbs, a card): intercepted in the capture phase, since this
 *   app uses `BrowserRouter`, which has no `useBlocker`;
 * - the browser's Back button: a same-URL history entry is pushed so Back lands on it first;
 * - closing or reloading the tab: the browser's own "Leave site?" prompt (its wording can't be
 *   customised).
 *
 * Programmatic `navigate()` calls elsewhere (global search results) are not intercepted.
 * Render the returned `dialog` somewhere in the page.
 */
export function useUnsavedChangesGuard(dirty: boolean, copy: GuardCopy) {
  const navigate = useNavigate()
  const [pending, setPending] = useState<(() => void) | null>(null)
  // Read inside listeners, so a listener registered once always sees the current value.
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const sentinelPushed = useRef(false)

  // Tab close / reload.
  useEffect(() => {
    if (!dirty) return
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault()
      // Legacy browsers only show the prompt when returnValue is set.
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // In-app links.
  useEffect(() => {
    if (!dirty) return
    function onClick(e: MouseEvent) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      const anchor = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const url = new URL(anchor.href, window.location.href)
      if (url.origin !== window.location.origin) return
      const to = url.pathname + url.search + url.hash
      if (to === window.location.pathname + window.location.search + window.location.hash) return
      // A link inside our own confirm dialog (none today) must still work.
      if (anchor.closest('[data-unsaved-guard]')) return
      e.preventDefault()
      e.stopPropagation()
      setPending(() => () => navigate(to))
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty, navigate])

  // Browser Back.
  useEffect(() => {
    if (!dirty) return
    if (!sentinelPushed.current) {
      window.history.pushState(window.history.state, '', window.location.href)
      sentinelPushed.current = true
    }
    function onPopState() {
      if (!dirtyRef.current) return
      // Back consumed the sentinel; put it back and ask. Confirming goes back for real.
      window.history.pushState(window.history.state, '', window.location.href)
      setPending(() => () => {
        sentinelPushed.current = false
        window.history.go(-2)
      })
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [dirty])

  /** Runs `action` straight away when there is nothing to lose, otherwise asks first. */
  const requestLeave = useCallback(
    (action: () => void) => {
      if (dirtyRef.current) setPending(() => action)
      else action()
    },
    [],
  )

  const dialog: ReactNode = pending ? (
    <div data-unsaved-guard>
      <Modal
        onClose={() => setPending(null)}
        title={copy.title}
        widthRem={26}
        footer={
          <div className="flex justify-end gap-sm">
            <Button variant="secondary" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                const leave = pending
                setPending(null)
                // Stop guarding before leaving, so the navigation itself isn't intercepted.
                dirtyRef.current = false
                leave()
              }}
            >
              {copy.discardLabel ?? 'Discard'}
            </Button>
          </div>
        }
      >
        <p className="text-body-sm text-text-secondary">{copy.body}</p>
      </Modal>
    </div>
  ) : null

  return { requestLeave, dialog }
}
