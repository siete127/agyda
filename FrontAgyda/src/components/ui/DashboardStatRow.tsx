import { clsx } from 'clsx'

export type StatTone = 'brand' | 'success' | 'warn' | 'critical'

const TONE_CLASSES: Record<StatTone, { bg: string; text: string }> = {
  brand: { bg: 'bg-brand/10', text: 'text-brand' },
  success: { bg: 'bg-emerald-100', text: 'text-emerald-600' },
  warn: { bg: 'bg-amber-100', text: 'text-amber-600' },
  critical: { bg: 'bg-red-100', text: 'text-red-600' },
}

export interface DashboardStat {
  key: string
  icon: React.ElementType
  label: string
  value: string | number
  tone?: StatTone
}

interface DashboardStatRowProps {
  stats: DashboardStat[]
}

export function DashboardStatRow({ stats }: DashboardStatRowProps) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {stats.map((s) => {
        const tone = TONE_CLASSES[s.tone ?? 'brand']
        const Icon = s.icon
        return (
          <div key={s.key} className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
            <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', tone.bg)}>
              <Icon className={clsx('h-4.5 w-4.5', tone.text)} />
            </div>
            <div className="min-w-0">
              <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">{s.label}</p>
              <p className="text-base font-bold text-ink truncate">{s.value}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
