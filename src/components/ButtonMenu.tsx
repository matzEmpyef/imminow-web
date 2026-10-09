import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Button } from './Button'

export interface ButtonMenuItem {
  label: string
  onSelect: () => void
  disabled?: boolean
}

interface ButtonMenuProps {
  label: string
  items: ButtonMenuItem[]
  variant?: 'primary' | 'secondary'
  loading?: boolean
}

// One button that opens a short list of actions (owner, 2026-10-09: one "Import" button with two
// items). Same open/close behaviour as the account menu in FreelancerShell — closes on outside
// click and Esc — plus Arrow keys / Home / End between items, and focus returns to the button on
// Esc. Items are plain buttons, so Enter and Space activate them.
export function ButtonMenu({ label, items, variant = 'secondary', loading }: ButtonMenuProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  function menuItems(): HTMLButtonElement[] {
    return Array.from(containerRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)') ?? [])
  }

  function focusItem(index: number) {
    const list = menuItems()
    if (list.length) list[(index + list.length) % list.length].focus()
  }

  function openAndFocus(index: number) {
    setOpen(true)
    // The list is not in the DOM until the next render.
    requestAnimationFrame(() => focusItem(index))
  }

  function onTriggerKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      openAndFocus(0)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      openAndFocus(-1)
    }
  }

  function onMenuKeyDown(e: React.KeyboardEvent) {
    const list = menuItems()
    const current = list.indexOf(document.activeElement as HTMLButtonElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      focusItem(current + 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      focusItem(current - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focusItem(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focusItem(-1)
    } else if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Button
        ref={triggerRef}
        variant={variant}
        loading={loading}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
      >
        <span className="inline-flex items-center gap-xs">
          {label}
          <ChevronDown className="h-4 w-4" aria-hidden />
        </span>
      </Button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          style={{ minWidth: '14rem' }}
          className="absolute right-0 top-11 z-50 overflow-hidden rounded-lg border border-border bg-surface shadow-card"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false)
                item.onSelect()
              }}
              className="flex w-full items-center px-md py-sm text-left text-body-sm text-text-primary hover:bg-background focus:bg-background focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
