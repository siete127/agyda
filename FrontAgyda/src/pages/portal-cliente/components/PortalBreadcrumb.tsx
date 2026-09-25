import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'

export function PortalBreadcrumb({ seccion }: { seccion: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <Link to="/portal-cliente" className="transition-colors hover:text-brand hover:underline">Inicio</Link>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">{seccion}</span>
    </div>
  )
}
