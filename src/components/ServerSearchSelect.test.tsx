import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuthStore } from '@/stores/authStore'
import type { ServerSearchSource } from '@/lib/useServerSearch'
import { ServerSearchSelect } from './ServerSearchSelect'

// F-038: the searchable dropdowns loaded one page of 100 and filtered it in the browser, so a
// record past the first page could not be picked. Pinned here for the shared replacement: what is
// typed goes to the server (once, after the pause), a late answer to an earlier term is never
// shown, further pages load with the cursor, a saved value outside the loaded page still shows,
// and the whole thing works from the keyboard.
interface Row {
  id: string
  name: string
}
type Page = { items: Row[]; nextCursor?: string | null }
type FetchArgs = { search: string; cursor: string | undefined; signal: AbortSignal }

const row = (id: string, name: string): Row => ({ id, name })

function makeSource(fetchPage: (args: FetchArgs) => Promise<Page>, fetchById?: (id: string) => Promise<Row | null>) {
  const source: ServerSearchSource<Row> = {
    queryKey: ['picker', 'test'],
    fetchPage: vi.fn(fetchPage),
    fetchById: fetchById ? vi.fn(fetchById) : undefined,
    toOption: (r) => ({ id: r.id, label: r.name }),
  }
  return source
}

function renderPicker(source: ServerSearchSource<Row>, props: { value?: string; onChange?: (id: string, row: Row | undefined) => void } = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <ServerSearchSelect
        source={source}
        value={props.value ?? ''}
        onChange={props.onChange ?? vi.fn()}
        label="College"
        id="college"
      />
    </QueryClientProvider>,
  )
  return screen.getByRole('combobox', { name: /College/ }) as HTMLInputElement
}

const optionNames = () => screen.queryAllByRole('option').map((o) => o.textContent)

beforeEach(() => {
  useAuthStore.setState({ accessToken: 'test-token' })
})

describe('ServerSearchSelect', () => {
  it('asks the server for the first page on focus, then once for the typed term', async () => {
    const source = makeSource(async ({ search }) => ({
      items: search ? [row('z', 'Zenith College')] : [row('a', 'Acadia'), row('b', 'Bishop')],
    }))
    const input = renderPicker(source)
    expect(source.fetchPage).not.toHaveBeenCalled()

    fireEvent.focus(input)
    await waitFor(() => expect(optionNames()).toEqual(['Acadia', 'Bishop']))
    expect(source.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', cursor: undefined }))

    // Three keystrokes inside the pause are one request, for the final text.
    fireEvent.change(input, { target: { value: 'z' } })
    fireEvent.change(input, { target: { value: 'ze' } })
    fireEvent.change(input, { target: { value: 'zen' } })
    // The previous term's rows are not offered while the new answer is awaited.
    expect(optionNames()).toEqual([])
    expect(screen.getByText('Searching…')).toBeInTheDocument()

    await waitFor(() => expect(optionNames()).toEqual(['Zenith College']))
    expect(source.fetchPage).toHaveBeenCalledTimes(2)
    expect(source.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'zen', cursor: undefined }))
  })

  it('never shows a late answer to an earlier term, and cancels its request', async () => {
    const pending = new Map<string, { resolve: (page: Page) => void; signal: AbortSignal }>()
    const source = makeSource(
      ({ search, signal }) => new Promise<Page>((resolve) => pending.set(search, { resolve, signal })),
    )
    const input = renderPicker(source)
    fireEvent.focus(input)
    await waitFor(() => expect(pending.has('')).toBe(true))
    pending.get('')!.resolve({ items: [] })

    fireEvent.change(input, { target: { value: 'ab' } })
    await waitFor(() => expect(pending.has('ab')).toBe(true))
    fireEvent.change(input, { target: { value: 'abc' } })
    await waitFor(() => expect(pending.has('abc')).toBe(true))
    expect(pending.get('ab')!.signal.aborted).toBe(true)

    // The answers arrive out of order: the newer term first, the older one after it.
    pending.get('abc')!.resolve({ items: [row('1', 'Abc Institute')] })
    await waitFor(() => expect(optionNames()).toEqual(['Abc Institute']))
    pending.get('ab')!.resolve({ items: [row('2', 'Abbey School')] })
    await new Promise((r) => setTimeout(r, 20))
    expect(optionNames()).toEqual(['Abc Institute'])
  })

  it('loads the next page with the cursor, from the button and on scrolling to the end', async () => {
    const source = makeSource(async ({ cursor }) => {
      if (!cursor) return { items: [row('1', 'One'), row('2', 'Two')], nextCursor: 'c2' }
      if (cursor === 'c2') return { items: [row('2', 'Two'), row('3', 'Three')], nextCursor: 'c3' }
      return { items: [row('4', 'Four')], nextCursor: null }
    })
    const input = renderPicker(source)
    fireEvent.focus(input)
    await waitFor(() => expect(optionNames()).toEqual(['One', 'Two']))

    fireEvent.click(screen.getByRole('button', { name: 'Load more' }))
    // A row the second page repeats is listed once.
    await waitFor(() => expect(optionNames()).toEqual(['One', 'Two', 'Three']))
    expect(source.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ search: '', cursor: 'c2' }))

    fireEvent.scroll(screen.getByRole('listbox').parentElement!)
    await waitFor(() => expect(optionNames()).toEqual(['One', 'Two', 'Three', 'Four']))
    expect(source.fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'c3' }))
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument()
  })

  it('shows a saved value that is not in the loaded page by fetching it by id', async () => {
    const source = makeSource(
      async () => ({ items: [row('a', 'Acadia')] }),
      async (id) => row(id, 'Far Down College'),
    )
    const input = renderPicker(source, { value: 'x-501' })
    await waitFor(() => expect(input.value).toBe('Far Down College'))
    expect(source.fetchById).toHaveBeenCalledWith('x-501', expect.anything())
    // Nothing was searched to show it: the list is asked only once the picker is opened.
    expect(source.fetchPage).not.toHaveBeenCalled()
  })

  it('is a combobox: arrows move the active option, Enter chooses it, Escape closes', async () => {
    const onChange = vi.fn()
    const source = makeSource(async () => ({ items: [row('a', 'Acadia'), row('b', 'Bishop'), row('c', 'Carleton')] }))
    const input = renderPicker(source, { onChange })
    expect(input).toHaveAttribute('aria-expanded', 'false')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(input).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(optionNames()).toHaveLength(3))
    expect(input).toHaveAttribute('aria-controls', screen.getByRole('listbox').id)
    expect(input).not.toHaveAttribute('aria-activedescendant')

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    const active = screen.getByRole('option', { name: 'Bishop' })
    expect(input).toHaveAttribute('aria-activedescendant', active.id)

    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith('b', row('b', 'Bishop'))
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    await waitFor(() => expect(optionNames()).toHaveLength(3))
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('says so when nothing matches', async () => {
    const source = makeSource(async () => ({ items: [] }))
    fireEvent.focus(renderPicker(source))
    expect(await screen.findByText('No matches.')).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('No matches.')
  })

  it('shows a failed search as an error with a retry, not as an empty list', async () => {
    let fail = true
    const source = makeSource(async () => {
      if (fail) throw new Error('offline')
      return { items: [row('a', 'Acadia')] }
    })
    fireEvent.focus(renderPicker(source))
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load results.')
    expect(screen.queryByText('No matches.')).not.toBeInTheDocument()

    fail = false
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(optionNames()).toEqual(['Acadia']))
  })
})
