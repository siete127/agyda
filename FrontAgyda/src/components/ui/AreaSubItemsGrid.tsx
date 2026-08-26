import { Link } from 'react-router-dom'
import { ArrowRight } from 'lucide-react'
import type { AreaSubItem } from '@/config/areaSubItems'

interface AreaSubItemsGridProps {
  areaPath: string
  items: AreaSubItem[]
}

export function AreaSubItemsGrid({ areaPath, items }: AreaSubItemsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((item) => {
        const to = item.kind === 'link' ? item.linkTo! : `${areaPath}/${item.slug}`
        return (
          <Link
            key={item.slug}
            to={to}
            className="group flex items-start justify-between gap-2 rounded-2xl border border-gray-100 bg-white p-4 shadow-card transition-all hover:shadow-card-lg hover:border-brand/30"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">{item.label}</p>
              <p className="mt-0.5 truncate text-xs text-ink-tertiary">{item.description}</p>
            </div>
            <ArrowRight className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-ink-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
          </Link>
        )
      })}
    </div>
  )
}
