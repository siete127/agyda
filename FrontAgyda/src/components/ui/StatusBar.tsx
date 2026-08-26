interface StatusBarSegment {
  label: string
  count: number
  color: string
}

interface StatusBarProps {
  segments: StatusBarSegment[]
}

export function StatusBar({ segments }: StatusBarProps) {
  const total = segments.reduce((acc, s) => acc + s.count, 0)

  if (total === 0) {
    return (
      <div className="space-y-2">
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100" />
        <p className="text-xs text-ink-tertiary">Sin datos</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        {segments.map((s) => (
          <div
            key={s.label}
            className="h-full transition-all"
            style={{ width: `${(s.count / total) * 100}%`, backgroundColor: s.color }}
            title={`${s.label}: ${s.count}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.label} <span className="font-semibold text-ink">{s.count}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
