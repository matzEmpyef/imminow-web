import { CountryFlag } from '@/components/CountryFlag'
import { useCountryIso2 } from '@/lib/countryFlags'

/**
 * A country NAME with its flag beside it (user, 2026-09-09: "use the country flag everywhere there
 * is country name").
 *
 * Callers pass the NAME they already hold; {@link useCountryIso2} resolves the code.
 *
 * Before the lookup resolves, and for any name the shared list does not carry, the NAME RENDERS
 * ALONE — no globe placeholder, because a
 * table of identical grey globes is worse than no flags at all, and a flag that pops in late is
 * less jarring than one that changes shape.
 */
export function CountryLabel({
  name,
  className = '',
  textClassName = '',
}: {
  name?: string | null
  className?: string
  /** Applied to the name only, so a caller can keep its own colour and size. */
  textClassName?: string
}) {
  const iso2 = useCountryIso2()
  if (!name) return null
  const code = iso2.get(name.trim().toLowerCase())
  return (
    <span className={`inline-flex items-center gap-xs align-middle ${className}`}>
      {code && <CountryFlag iso2={code} />}
      <span className={textClassName}>{name}</span>
    </span>
  )
}

/**
 * The same thing for a LIST of countries — `countries_served`, a case spanning several
 * destinations. Renders as flagged chips rather than a comma-joined string: the join was
 * unreadable past three, and the flags are what make a row of them scannable.
 */
export function CountryLabelList({
  names,
  className = '',
  empty = null,
}: {
  names?: (string | null | undefined)[] | null
  className?: string
  empty?: React.ReactNode
}) {
  const list = (names ?? []).filter(Boolean) as string[]
  if (list.length === 0) return <>{empty}</>
  return (
    <span className={`inline-flex flex-wrap items-center gap-xs ${className}`}>
      {list.map((n) => (
        <span
          key={n}
          className="inline-flex items-center gap-xs rounded-md border border-border bg-surface px-xs py-[1px] text-caption text-text-secondary"
        >
          <CountryLabel name={n} />
        </span>
      ))}
    </span>
  )
}
