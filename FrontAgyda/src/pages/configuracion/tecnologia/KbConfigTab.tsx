import { useQuery } from '@tanstack/react-query'
import { BookOpen, FileText, HelpCircle } from 'lucide-react'
import { kbService } from '@/services/kb.service'
import { catalogosTiService } from '@/services/catalogosTi.service'

export function KbConfigTab() {
  const { data: articulos = [], isLoading } = useQuery({
    queryKey: ['kb-articulos-config'],
    queryFn: () => kbService.getArticulos(),
  })
  const { data: categorias = [] } = useQuery({
    queryKey: ['catalogos-ti-categorias'],
    queryFn: () => catalogosTiService.getCategorias(),
  })

  const porCategoria = categorias.map((cat) => ({
    nombre: cat.nombre,
    total: articulos.filter((a) => a.categoria === cat.nombre).length,
  }))
  const sinCategoria = articulos.filter((a) => !a.categoria || !categorias.some((c) => c.nombre === a.categoria)).length

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Base de Conocimiento</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          Los artículos usan las mismas categorías de Tecnología/TI definidas en la pestaña Categorías.
          La creación y edición de artículos se hace en el módulo de Base de Conocimiento completo.
        </p>

        <div className="mb-4 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl bg-surface p-3">
            <FileText className="h-4 w-4 text-ink-tertiary" />
            <span className="text-sm text-ink-secondary">
              {isLoading ? '—' : articulos.filter((a) => a.tipo === 'articulo').length} artículos
            </span>
          </div>
          <div className="flex items-center gap-2 rounded-xl bg-surface p-3">
            <HelpCircle className="h-4 w-4 text-ink-tertiary" />
            <span className="text-sm text-ink-secondary">
              {isLoading ? '—' : articulos.filter((a) => a.tipo === 'faq').length} FAQs
            </span>
          </div>
        </div>

        {!isLoading && (
          <div className="divide-y divide-gray-50">
            {porCategoria.filter((c) => c.total > 0).map((c) => (
              <div key={c.nombre} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-ink-secondary">{c.nombre}</span>
                <span className="text-ink-tertiary">{c.total}</span>
              </div>
            ))}
            {sinCategoria > 0 && (
              <div className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-ink-tertiary">Sin categoría / categoría libre</span>
                <span className="text-ink-tertiary">{sinCategoria}</span>
              </div>
            )}
          </div>
        )}

        <a href="/kb" className="mt-4 inline-block text-xs font-semibold text-brand hover:underline">
          Ir a Base de Conocimiento →
        </a>
      </div>
    </div>
  )
}
