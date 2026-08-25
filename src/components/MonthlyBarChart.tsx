import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis } from 'recharts'

export interface MonthlyBarDatum {
  month: string // YYYY-MM
  value: number
}

export interface MonthlySeriesSpec {
  key: string
  label: string
  color: string
}

// Shared monthly bar-chart primitive (user-requested, 2026-08-18, replacing Recent Activity on
// both dashboards) — same recharts shape DashboardPage.tsx's pre-existing `LeadsOverTimeChart`
// established (BarChart/ResponsiveContainer/XAxis/Tooltip styled off CSS vars), extracted here
// since it's now used for month-granularity data across both dashboards rather than duplicated
// per call site.
//
// `series` (user-requested, 2026-08-19 — "if aspirants and applicants can be shown on top of
// another but in different color") — an optional multi-series stacked mode alongside the
// original single-series `data`/`valueLabel`/`color` API, which stays exactly as-is for callers
// with only one number per month (Confirmed Revenue, Completed Cases, New Applicants). Pass
// `series` + `data` shaped as `{month, [seriesKey]: number, ...}[]` instead of `valueLabel`/
// `color` to stack multiple keys with `stackId="stack"`; a small recharts `Legend` renders only
// in that mode, since a single-series bar's meaning is already given by the card's own heading.
export function MonthlyBarChart({
  data,
  valueLabel,
  color = 'var(--color-secondary)',
  series,
}: {
  data: (MonthlyBarDatum | Record<string, string | number>)[]
  valueLabel?: string
  color?: string
  series?: MonthlySeriesSpec[]
}) {
  if (data.length === 0) return <p className="text-body-sm text-text-secondary">No data yet.</p>
  const formatted = data.map((d) => ({
    ...d,
    month: new Intl.DateTimeFormat(undefined, { month: 'short', year: '2-digit' }).format(new Date(`${d.month}-01`)),
  }))
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={formatted} barCategoryGap="30%">
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fill: 'var(--color-text-secondary)', fontSize: 12 }}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-background)' }}
          contentStyle={{
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--color-border)',
            background: 'var(--color-surface)',
            fontSize: 13,
          }}
        />
        {series ? (
          <>
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stackId="stack"
                fill={s.color}
                radius={i === series.length - 1 ? [6, 6, 0, 0] : undefined}
                isAnimationActive={false}
              />
            ))}
          </>
        ) : (
          <Bar dataKey="value" name={valueLabel} fill={color} radius={[6, 6, 0, 0]} isAnimationActive={false} />
        )}
      </BarChart>
    </ResponsiveContainer>
  )
}
