import { Button } from './Button'
import { Modal } from './Modal'
import { idleLockManager, useIdleLockStore } from '@/lib/idleLock'

function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * The 28-minute idle warning (PROGRESS.md Pre-Production Checklist "Idle auto-lock"; TRD Section 9
 * — console sessions only). Mounted once at the app root (`main.tsx`), alongside `ToastViewport`,
 * so it can appear over whatever page is open when the warning fires, and renders nothing the rest
 * of the time. `dismissible` stays false (Modal's default): the countdown is the whole point, so
 * neither the backdrop nor Escape should make it go away without that counting as "still here" —
 * only the X and "Stay signed in" do, and both run the same handler.
 */
export function IdleWarningModal() {
  const warning = useIdleLockStore((s) => s.warning)
  const secondsRemaining = useIdleLockStore((s) => s.secondsRemaining)
  if (!warning) return null

  function staySignedIn() {
    idleLockManager.staySignedIn()
  }

  return (
    <Modal title="Still there?" onClose={staySignedIn}>
      <p className="text-body text-text-primary">
        You&apos;ll be signed out in {formatCountdown(secondsRemaining)} for security.
      </p>
      <div className="mt-lg flex justify-end">
        <Button onClick={staySignedIn}>Stay signed in</Button>
      </div>
    </Modal>
  )
}
