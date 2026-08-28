import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { clsx } from 'clsx'

interface SectionCardProps {
  title: string
  icon?: React.ElementType
  barColor?: string
  action?: { label: string; to?: string; onClick?: () => void }
  className?: string
  children: React.ReactNode
}

export function SectionCard({ title, icon: Icon, barColor = 'bg-brand', action, className, children }: SectionCardProps) {
  return (
    <div className={clsx('rounded-2xl border border-surface-border bg-card overflow-hidden', className)}>
      <div className="flex items-center justify-between px-4 py-3 border-b border-surface-border">
        <div className="flex items-center gap-2">
          {Icon ? (
            <div className={clsx('flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg', barColor.replace('bg-', 'bg-') + '/10')}>
              <Icon className={clsx('h-3.5 w-3.5', barColor.replace('bg-', 'text-'))} />
            </div>
          ) : (
            <div className={clsx('h-4 w-1 rounded-full', barColor)} />
          )}
          <h3 className="text-[0.85rem] font-bold text-ink">{title}</h3>
        </div>
        {action && (
          action.to ? (
            <Link to={action.to} className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:text-brand-dark transition-colors">
              {action.label} <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <button onClick={action.onClick} className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:text-brand-dark transition-colors">
              {action.label} <ChevronRight className="h-3.5 w-3.5" />
            </button>
          )
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
