import { SelectField } from '@/components/SelectField'
import { Toggle } from '@/components/Toggle'
import { WEEKDAYS, timezoneOptions, type VisitingHoursState, type VisitingDayRow } from './visitingHoursState'

/**
 * When this office actually takes visits, in its own timezone (assumptions audit H12, approved
 * 2026-09-19).
 *
 * Every consultancy used to be assumed open Mon–Sat 10–17 in no timezone at all: a Sunday-morning
 * office could not be booked, "10:00" meant something different in Perth and in Toronto, and the
 * app re-derived the same rule from the student's device clock. This is the answer bookings are
 * actually checked against — the free-text `visiting_hours` beside it stays as the sentence
 * students read.
 */
export function VisitingHoursEditor({
  value,
  onChange,
  error,
}: {
  value: VisitingHoursState
  onChange: (next: VisitingHoursState) => void
  /** The server's own message when it refused the schedule — shown where it was typed. */
  error?: string
}) {
  function setDay(weekday: number, patch: Partial<VisitingDayRow>) {
    onChange({ ...value, days: value.days.map((d, i) => (i === weekday ? { ...d, ...patch } : d)) })
  }

  const noneOpen = value.days.every((d) => !d.open)

  return (
    <div className="flex flex-col gap-sm rounded-md border border-border p-md lg:col-span-2">
      <div>
        <p className="text-body font-medium text-text-primary">Visiting hours</p>
        <p className="text-body-sm text-text-secondary">
          When students can book a visit. Times are in the timezone you pick here, so a student
          abroad is offered your hours, not theirs.
        </p>
      </div>

      <div className="max-w-[24rem]">
        <SelectField
          label="Timezone"
          id="visiting-timezone"
          value={value.timezone}
          onChange={(e) => onChange({ ...value, timezone: e.target.value })}
        >
          {timezoneOptions(value.timezone).map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </SelectField>
      </div>

      <ul className="flex flex-col gap-xs">
        {WEEKDAYS.map((name, weekday) => {
          const day = value.days[weekday]
          return (
            <li key={name} className="flex items-center gap-sm">
              <Toggle
                id={`visiting-day-${weekday}`}
                size="sm"
                checked={day.open}
                onChange={(checked) => setDay(weekday, { open: checked })}
                label={`${name} open`}
              />
              <label htmlFor={`visiting-day-${weekday}`} className="w-24 shrink-0 text-body-sm text-text-primary">
                {name}
              </label>
              {day.open ? (
                <span className="flex items-center gap-xs">
                  <input
                    type="time"
                    aria-label={`${name} opens`}
                    value={day.from}
                    onChange={(e) => setDay(weekday, { from: e.target.value })}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-body text-text-primary"
                  />
                  <span className="text-body-sm text-text-secondary">to</span>
                  <input
                    type="time"
                    aria-label={`${name} closes`}
                    value={day.to}
                    onChange={(e) => setDay(weekday, { to: e.target.value })}
                    className="h-10 rounded-md border border-border bg-surface px-3 text-body text-text-primary"
                  />
                </span>
              ) : (
                <span className="text-body-sm text-text-secondary">Closed</span>
              )}
            </li>
          )
        })}
      </ul>

      {noneOpen && (
        <p className="text-caption text-text-secondary">
          No days set, so the platform default applies — Monday to Saturday, 10:00 to 17:00, in your own timezone.
        </p>
      )}
      {error && <p className="text-body-sm text-error">{error}</p>}
    </div>
  )
}
