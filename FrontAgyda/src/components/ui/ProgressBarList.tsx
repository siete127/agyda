interface ProgressBarItem {
  key: string
  label: string
  value: number
  max: number
  color?: string
}

interface ProgressBarListProps {
  items: ProgressBarItem[]
}

const RANK_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706']

export function ProgressBarList({ items }: ProgressBarListProps) {
  if (items.length === 0) {
    return <p className="text-xs text-ink-tertiary">Sin datos</p>
  }

  return (
    <div className="space-y-3">
      {items.map((item, i) => {
        const pct = item.max > 0 ? Math.min(100, (item.value / item.max) * 100) : 0
        const color = item.color ?? RANK_COLORS[i % RANK_COLORS.length]
        return (
          <div key={item.key} className="flex items-center gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-[0.65rem] font-bold text-ink-secondary">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-xs font-medium text-ink-secondary">{item.label}</span>
                <span className="flex-shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-ink">
                  {item.value}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
