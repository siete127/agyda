import { Link } from 'react-router-dom'
import { ArrowLeft, Construction } from 'lucide-react'

interface SubModuloPlaceholderProps {
  areaLabel: string
  areaPath: string
  itemLabel: string
  description: string
}

export function SubModuloPlaceholder({ areaLabel, areaPath, itemLabel, description }: SubModuloPlaceholderProps) {
  return (
    <div className="space-y-6">
      <Link to={areaPath} className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-tertiary hover:text-brand transition-colors">
        <ArrowLeft className="h-3.5 w-3.5" />
        Volver a {areaLabel}
      </Link>

      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-white p-16 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/10">
          <Construction className="h-7 w-7 text-brand" />
        </div>
        <div className="space-y-1.5">
          <h1 className="text-lg font-bold text-ink">{itemLabel}</h1>
          <p className="max-w-md text-sm text-ink-tertiary">{description}</p>
        </div>
        <span className="chip bg-amber-100 text-amber-700">En construcción</span>
      </div>
    </div>
  )
}
