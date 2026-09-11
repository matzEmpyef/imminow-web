/**
 * "Used in" — one line under each Settings tab saying where the list shows up (user, 2026-09-11,
 * the same ask as Applicant Allocation's "where the data is coming from"). A Settings change is
 * felt far from Settings, and the admin making it should see how far before they make it.
 */
export function SettingsUsedIn({ places }: { places: string[] }) {
  return (
    <p className="flex flex-wrap items-center gap-xs text-caption text-text-secondary">
      <span className="font-medium uppercase tracking-wide">Used in</span>
      {places.map((place) => (
        <span key={place} className="rounded-full border border-border bg-surface px-sm py-[1px] text-text-primary">
          {place}
        </span>
      ))}
    </p>
  )
}
