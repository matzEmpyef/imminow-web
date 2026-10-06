import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useToastStore } from '@/lib/toast'
import { ContactLink, CopyButton } from './CopyButton'

function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('CopyButton', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
  })

  it('is a real button labelled for what it copies', () => {
    render(
      <>
        <CopyButton value="a@b.com" kind="email" />
        <CopyButton value="+91 98765 43210" kind="phone" />
      </>,
    )
    expect(screen.getByRole('button', { name: 'Copy email address' }).getAttribute('type')).toBe('button')
    expect(screen.getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
  })

  it('copies the exact value', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    stubClipboard(writeText)
    render(<CopyButton value="meera.k@example.com" kind="email" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))
    })
    expect(writeText).toHaveBeenCalledWith('meera.k@example.com')
  })

  it('confirms with a tick for about two seconds, then goes back', async () => {
    vi.useFakeTimers()
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    render(<CopyButton value="a@b.com" kind="email" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))
    })
    expect(screen.getByRole('status').textContent).toBe('Copied')
    expect(screen.getByRole('button').getAttribute('title')).toBe('Copied')
    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('status').textContent).toBe('Copied')
    act(() => vi.advanceTimersByTime(2))
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows the error toast and does not throw when the clipboard refuses', async () => {
    stubClipboard(vi.fn().mockRejectedValue(new Error('denied')))
    render(<CopyButton value="a@b.com" kind="email" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))
    })
    expect(useToastStore.getState().toasts).toEqual([expect.objectContaining({ message: 'Could not copy', tone: 'error' })])
    expect(screen.getByRole('status').textContent).toBe('')
  })

  it('shows the error toast when there is no clipboard at all', async () => {
    render(<CopyButton value="a@b.com" kind="email" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))
    })
    expect(useToastStore.getState().toasts[0]).toMatchObject({ message: 'Could not copy', tone: 'error' })
  })

  it('does not pass the click on to the row or card around it', async () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined))
    const onRowClick = vi.fn()
    render(
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- test stand-in for a clickable row
      <div onClick={onRowClick}>
        <CopyButton value="a@b.com" kind="email" />
      </div>,
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy email address' }))
    })
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('ContactLink', () => {
  it('shows a mailto link with a copy button beside it', () => {
    render(<ContactLink kind="email" value="a@b.com" />)
    expect(screen.getByRole('link', { name: 'a@b.com' }).getAttribute('href')).toBe('mailto:a@b.com')
    expect(screen.getByRole('button', { name: 'Copy email address' })).toBeTruthy()
  })

  it('shows a tel link with a copy button beside it', () => {
    render(<ContactLink kind="phone" value="+91 98765 43210" />)
    expect(screen.getByRole('link', { name: '+91 98765 43210' }).getAttribute('href')).toBe('tel:+91 98765 43210')
    expect(screen.getByRole('button', { name: 'Copy phone number' })).toBeTruthy()
  })
})
