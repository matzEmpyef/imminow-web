import { Link } from 'react-router-dom'

/**
 * The standard "Page not found" page: the words, and the way back to the person's own home page.
 * Used for an address no route matches and for a staff address typed by a freelancer (T4-36), who
 * used to be sent to their referrals page without a word.
 */
export function PageNotFound({ homePath }: { homePath: string }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-md bg-background p-lg text-center">
      <h1 className="text-h2 font-semibold text-text-primary">Page not found</h1>
      <p className="max-w-[28rem] text-body text-text-secondary">
        There is nothing at this address. It may have been mistyped, or the page may have moved.
      </p>
      <Link
        to={homePath}
        replace
        className="rounded-md bg-primary px-lg py-sm text-body-sm font-medium text-white hover:bg-primary/90"
      >
        Go to your home page
      </Link>
    </main>
  )
}
