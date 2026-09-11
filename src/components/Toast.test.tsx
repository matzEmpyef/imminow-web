import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showToast, useToastStore } from '@/lib/toast'
import { ToastViewport } from './Toast'

describe('Toast', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows a message sent from outside any component', () => {
    render(<ToastViewport />)
    act(() => showToast('Invite sent to meera@example.com'))
    expect(screen.getByRole('status')).toHaveTextContent('Invite sent to meera@example.com')
  })

  it('announces errors as alerts', () => {
    render(<ToastViewport />)
    act(() => showToast('Could not save', 'error'))
    expect(screen.getByRole('alert')).toHaveTextContent('Could not save')
  })

  it('goes away on its own after five seconds', () => {
    vi.useFakeTimers()
    render(<ToastViewport />)
    act(() => showToast('Saved'))
    act(() => vi.advanceTimersByTime(4999))
    expect(screen.getByText('Saved')).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('can be dismissed', () => {
    render(<ToastViewport />)
    act(() => showToast('Saved'))
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(screen.queryByText('Saved')).not.toBeInTheDocument()
  })

  it('keeps only the latest three', () => {
    render(<ToastViewport />)
    act(() => {
      for (const n of [1, 2, 3, 4]) showToast(`Message ${n}`)
    })
    expect(screen.queryByText('Message 1')).not.toBeInTheDocument()
    expect(screen.getAllByRole('status')).toHaveLength(3)
  })
})
