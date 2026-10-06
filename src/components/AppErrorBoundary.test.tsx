import { act, fireEvent, render, screen } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { reportFailedSave } from '@/lib/saveErrors'
import { lazyPage, recoverFromMissingPage } from '@/lib/lazyPage'
import { useToastStore } from '@/lib/toast'
import appSource from '@/App.tsx?raw'
import { AppErrorBoundary, PageErrorBoundary } from './AppErrorBoundary'
import { ErrorState } from './QueryState'
import { Table } from './Table'
import { ToastViewport } from './Toast'

// Review F-162 (the part approved for now): the request reference is shown where failures are
// shown, a page file that went missing in a deploy reloads the console once, and a page that
// crashes leaves the menu standing.
const withReference = new ApiError('Could not load.', { error: { message: 'The server failed.', request_id: 'req-7f3a' } }, 500)

beforeEach(() => {
  useToastStore.setState({ toasts: [] })
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the request reference', () => {
  it('is shown under the shared error state', () => {
    render(<ErrorState message="Could not load clients." error={withReference} />)
    expect(screen.getByText('Could not load clients.')).toBeInTheDocument()
    expect(screen.getByText('req-7f3a').parentElement).toHaveTextContent('Reference: req-7f3a')
  })

  it('is left out when the failure has none', () => {
    render(<ErrorState message="Could not load clients." error={new ApiError('No connection.')} />)
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument()
  })

  it("is shown in a table's error row", () => {
    render(
      <Table
        columns={[{ key: 'name', header: 'Name', render: (row: { id: string }) => row.id }]}
        rows={[]}
        rowKey={(row) => row.id}
        error="Could not load the audit log."
        errorSource={withReference}
      />,
    )
    expect(screen.getByText('Could not load the audit log.')).toBeInTheDocument()
    expect(screen.getByText('req-7f3a')).toBeInTheDocument()
  })

  it('is shown on the message for a failed save', () => {
    render(<ToastViewport />)
    act(() => reportFailedSave(withReference, undefined, undefined, { meta: undefined }))
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('The server failed.')
    expect(alert).toHaveTextContent('Reference: req-7f3a')
  })
})

describe('a page file that is missing after a deploy', () => {
  it('reloads the console once and keeps the loading state up meanwhile', async () => {
    const reload = vi.fn()
    const outcome = recoverFromMissingPage(new TypeError('Failed to fetch dynamically imported module'), reload)
    expect(reload).toHaveBeenCalledTimes(1)
    // Never settles: the page is going away, so no error flashes first.
    const settled = await Promise.race([outcome.then(() => 'settled'), new Promise((r) => setTimeout(() => r('pending'), 20))])
    expect(settled).toBe('pending')
  })

  it('does not reload a second time: the failure is shown instead', () => {
    const reload = vi.fn()
    const error = new TypeError('Failed to fetch dynamically imported module')
    void recoverFromMissingPage(error, reload)
    expect(() => recoverFromMissingPage(error, reload)).toThrow(error)
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does not reload while offline, which would swap the console for a browser error page', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    const reload = vi.fn()
    const error = new TypeError('Failed to fetch dynamically imported module')
    expect(() => recoverFromMissingPage(error, reload)).toThrow(error)
    expect(reload).not.toHaveBeenCalled()
  })

  it('loads a page normally when its file is there', async () => {
    const Page = lazyPage(async () => ({ default: () => <p>The page</p> }))
    const { Suspense } = await import('react')
    render(
      <Suspense fallback={<p>Loading</p>}>
        <Page />
      </Suspense>,
    )
    expect(await screen.findByText('The page')).toBeInTheDocument()
  })

  it('every page in the console is loaded this way', () => {
    expect(appSource).not.toMatch(/= lazy\(/)
    expect(appSource.match(/= lazyPage\(/g)?.length).toBeGreaterThan(60)
  })
})

describe('a page that crashes', () => {
  function Shell({ children }: { children: ReactNode }) {
    return (
      <div>
        <nav>
          <Link to="/clients">Clients</Link>
          <Link to="/broken">Broken</Link>
        </nav>
        <main>{children}</main>
      </div>
    )
  }
  let broken = true
  function BrokenPage(): ReactNode {
    if (broken) throw new Error('Cannot read properties of undefined')
    return (
      <Shell>
        <p>Recovered page</p>
      </Shell>
    )
  }

  function renderConsole() {
    return render(
      <AppErrorBoundary>
        <MemoryRouter initialEntries={['/broken']}>
          <PageErrorBoundary shell={Shell}>
            <Routes>
              <Route path="/broken" element={<BrokenPage />} />
              <Route
                path="/clients"
                element={
                  <Shell>
                    <p>Clients list</p>
                  </Shell>
                }
              />
            </Routes>
          </PageErrorBoundary>
        </MemoryRouter>
      </AppErrorBoundary>,
    )
  }

  beforeEach(() => {
    broken = true
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('keeps the menu and says what happened in the page area', () => {
    renderConsole()
    expect(screen.getByRole('heading', { name: 'This page hit a problem' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The rest of the console is still working.')
    expect(screen.getByRole('link', { name: 'Clients' })).toBeInTheDocument()
    // Not the whole-console card.
    expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument()
  })

  it('clears when the person chooses another page from the menu', () => {
    renderConsole()
    fireEvent.click(screen.getByRole('link', { name: 'Clients' }))
    expect(screen.getByText('Clients list')).toBeInTheDocument()
    expect(screen.queryByText('This page hit a problem')).not.toBeInTheDocument()
  })

  it('"Try again" draws the page again', () => {
    renderConsole()
    broken = false
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(screen.getByText('Recovered page')).toBeInTheDocument()
  })

  it('falls back to the whole-console card only when the shell itself cannot be drawn', () => {
    function BrokenShell(): ReactNode {
      throw new Error('shell failed')
    }
    render(
      <AppErrorBoundary>
        <MemoryRouter initialEntries={['/broken']}>
          <PageErrorBoundary shell={BrokenShell}>
            <BrokenPage />
          </PageErrorBoundary>
        </MemoryRouter>
      </AppErrorBoundary>,
    )
    expect(screen.getByText('Something went wrong')).toBeInTheDocument()
  })
})
