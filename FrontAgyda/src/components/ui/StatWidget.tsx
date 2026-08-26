import { clsx } from 'clsx'

interface StatWidgetProps {
  icon: React.ElementType
  label: string
  value: string | number
  iconBg?: string
  iconColor?: string
}

export function StatWidget({ icon: Icon, label, value, iconBg = 'bg-brand/10', iconColor = 'text-brand' }: StatWidgetProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={clsx('flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl', iconBg)}>
        <Icon className={clsx('h-4.5 w-4.5', iconColor)} />
      </div>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</p>
        <p className="text-[0.85rem] font-bold text-ink truncate">{value}</p>
      </div>
    </div>
  )
}
