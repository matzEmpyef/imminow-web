import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'

/**
 * The token of an emailed link (Set Your Password, the guardian's approval page), read ONCE from
 * the page address and then taken out of it (review F-123).
 *
 * Where it is read from: the fragment when there is one (`/set-password#<token>`, the shape links
 * are mailed in once the server's `LINK_TOKENS_IN_FRAGMENT` is on), else the last path segment
 * (`/set-password/<token>`, the shape of every link already in an inbox), else `?token=` (the
 * password-reset link's old shape, F-295). A fragment is never sent
 * to a server, so it reaches no access log; a path is written to the log of every server between
 * the browser and the console.
 *
 * Why the address is replaced: the token is a working credential for a week, and an address stays
 * in the browser history and is what a person copies when they share "the page I am on". The
 * token lives on in this component's state only, so a reload of the cleaned address has no token
 * and the page says the link cannot be used; the person opens the link from their email again.
 *
 * The route must be declared with an optional segment (`/set-password/:token?`) so the page stays
 * mounted, and keeps the token, when the address changes under it.
 */
export function useLinkToken(cleanPath: string): string {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [token] = useState(
    () => location.hash.replace(/^#/, '') || params.token || searchParams.get('token') || '',
  )

  useEffect(() => {
    if (location.pathname !== cleanPath || location.hash || location.search) {
      navigate(cleanPath, { replace: true })
    }
    // Once, on arrival: the address this page was opened with is the only one that carries a token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return token
}
