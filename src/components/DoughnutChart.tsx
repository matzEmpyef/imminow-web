import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'

export interface DoughnutChartDatum {
  label: string
  value: number
}

const DEFAULT_COLORS = [
  'var(--color-primary)',
  'var(--color-secondary)',
  'var(--color-success)',
  'var(--color-warning)',
  'var(--color-info)',
  'var(--color-error)',
]

// Shared doughnut/pie primitive (user-requested, 2026-08-18 — "instead of recent activities, give
// me some graphs... may be a doughnut graph") — first pie/doughnut chart in the app, built as a
// reusable component rather than inline per dashboard since both Super Admin and consultancy
// dashboards need one. A left-side color-dot legend renders instead of recharts' own `Legend`
// component, matching this app's existing label conventions (Badge, TagEditorMenu) rather than
// introducing a second legend style.
export function DoughnutChart({ data, colors = DEFAULT_COLORS }: { data: DoughnutChartDatum[]; colors?: string[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0)
  if (total === 0) return <p className="text-body-sm text-text-secondary">No data yet.</p>

  // Zero-value entries are excluded from the chart itself (kept in the legend below) — recharts'
  // `paddingAngle` divides its gap across every entry passed to `<Pie>`, including zero-value
  // ones, which in edge cases (found live, 2026-08-18: 3 zero entries + 1 real one) consumes the
  // entire circle and renders no sectors at all rather than just skipping the zero slices.
  const chartData = data.filter((d) => d.value > 0)

  return (
    <div className="flex items-center gap-md">
      <div className="h-[180px] w-[180px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius="60%"
              outerRadius="90%"
              paddingAngle={chartData.length > 1 ? 2 : 0}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell
                  key={entry.label}
                  fill={colors[data.findIndex((d) => d.label === entry.label) % colors.length]}
                  stroke="var(--color-surface)"
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--color-border)',
                background: 'var(--color-surface)',
                fontSize: 13,
              }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-col gap-xs">
        {data.map((entry, i) => (
          <div key={entry.label} className="flex items-center gap-xs text-body-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: colors[i % colors.length] }}
            />
            <span className="text-text-primary">{entry.label}</span>
            <span className="text-text-secondary">
              {entry.value} ({total > 0 ? Math.round((entry.value / total) * 100) : 0}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
