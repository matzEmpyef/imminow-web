import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

// Decision 154, ruling 14 and the search rule: the course search shows the server's sentence when it
// fails, and sends nothing below two characters.
const finder = vi.hoisted(() => ({ calls: [] as unknown[][], error: null as Error | null }))

vi.mock('@/queries/courseFinder', () => ({
  useCourseFinder: (...args: unknown[]) => {
    finder.calls.push(args)
    return { isLoading: false, isError: finder.error !== null, error: finder.error, data: undefined }
  },
}))
vi.mock('@/queries/leads', () => ({
  useLead: () => ({ data: undefined }),
  useLeadMessages: () => ({ items: [] }),
  useSuggestCourseToLead: () => ({ mutate: vi.fn(), isPending: false }),
}))
vi.mock('@/queries/clients', () => ({
  useAddApplication: () => ({ mutate: vi.fn(), isPending: false }),
  useApplications: () => ({ data: [] }),
}))
vi.mock('@/lib/toast', () => ({ showToast: vi.fn() }))

import { SuggestCourseInChat } from './SuggestCourseInChat'

function open() {
  const client = new QueryClient()
  render(
    <QueryClientProvider client={client}>
      <SuggestCourseInChat person={{ id: 'l1', kind: 'lead', firstName: 'Asha', hasApp: true }} />
    </QueryClientProvider>,
  )
  fireEvent.click(screen.getByRole('button', { name: 'Suggest a course' }))
}

describe('Suggest a course in the chat', () => {
  it('asks the course search only from two characters on', () => {
    open()
    fireEvent.change(screen.getByLabelText(/^Course, college or field/), { target: { value: 'a' } })
    expect(finder.calls.at(-1)?.[1]).toBe(false)
    fireEvent.change(screen.getByLabelText(/^Course, college or field/), { target: { value: 'ab' } })
    expect(finder.calls.at(-1)?.[1]).toBe(true)
  })

  it('stops the search box at 100 characters', () => {
    open()
    const box = screen.getByLabelText(/^Course, college or field/) as HTMLInputElement
    fireEvent.change(box, { target: { value: 'x'.repeat(130) } })
    expect(box.value).toHaveLength(100)
  })

  it("shows the server's sentence when the search fails", () => {
    finder.error = new Error('Course search is paused while the catalogue is being updated.')
    open()
    fireEvent.change(screen.getByLabelText(/^Course, college or field/), { target: { value: 'law' } })
    expect(screen.getByRole('alert')).toHaveTextContent('Course search is paused while the catalogue is being updated.')
    expect(screen.queryByText('The course search did not work. Try again.')).not.toBeInTheDocument()
    finder.error = null
  })
})
