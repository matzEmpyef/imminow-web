import { useState } from 'react'
import { Globe } from 'lucide-react'

/**
 * A country's flag, from its ISO-3166 alpha-2 code.
 *
 * Added 2026-09-07 (user: "can you also put a flag icon for all countries too"). All 119 rows in
 * the shared list carry an `iso2`, so every one resolves.
 *
 * WHY AN IMAGE AND NOT AN EMOJI FLAG. The obvious zero-dependency trick is to map the ISO letters
 * to regional-indicator code points and render 🇨🇦. That works on macOS, iOS, Android and most
 * Linux — and NOT on Windows, which ships no flag glyphs and renders the pair as boxed letters
 * "CA". This console has a Windows audience, and a column of letter-boxes beside a column that
 * already prints the ISO code would be worse than no flag at all.
 *
 * WHAT THAT COSTS. One external request per row to flagcdn.com. That is a real dependency, and
 * it is deliberately confined to this one component so it can be swapped for bundled SVGs by
 * editing a single `src`. A failed load — CDN down, network blocked, an ISO code the CDN does not
 * have — falls back to a neutral globe rather than a broken-image icon, so the list stays legible
 * either way. Decorative: the country name sits beside it in every use, so the flag is
 * `aria-hidden` and adds nothing for a screen reader to read twice.
 */
export function CountryFlag({ iso2, className = '' }: { iso2?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false)
  const code = iso2?.trim().toLowerCase()

  if (!code || code.length !== 2 || failed) {
    return <Globe aria-hidden className={`h-4 w-4 shrink-0 text-text-secondary ${className}`} />
  }

  return (
    <img
      src={`https://flagcdn.com/w20/${code}.png`}
      srcSet={`https://flagcdn.com/w40/${code}.png 2x`}
      width={20}
      height={15}
      alt=""
      aria-hidden
      loading="lazy"
      onError={() => setFailed(true)}
      className={`h-[15px] w-[20px] shrink-0 rounded-[2px] object-cover ${className}`}
    />
  )
}
