import { useQuery } from '@tanstack/react-query'
import { ClipboardList, Star, MessageSquare } from 'lucide-react'
import { ticketsService } from '@/services/tickets.service'

export function EncuestasTab() {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['reporte-satisfaccion'],
    queryFn: () => ticketsService.getReporteSatisfaccion(),
  })

  const conRating = tickets.filter((t) => t.rating != null)
  const promedio = conRating.length ? conRating.reduce((sum, t) => sum + (t.rating ?? 0), 0) / conRating.length : null
  const conComentario = tickets.filter((t) => t.comentario);

  const distribucion = [1, 2, 3, 4, 5].map((n) => ({
    n,
    total: conRating.filter((t) => t.rating === n).length,
  }))

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-1 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Encuestas de satisfacción</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          Calificación que el solicitante deja al validar la resolución de su ticket.
        </p>

        {isLoading ? (
          <p className="text-sm text-ink-tertiary">Cargando...</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-surface p-3">
                <div className="flex items-center gap-1.5 text-ink-tertiary">
                  <Star className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Promedio</span>
                </div>
                <p className="mt-1 text-xl font-bold text-ink">{promedio !== null ? promedio.toFixed(1) : '—'}</p>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <span className="text-xs font-medium text-ink-tertiary">Con calificación</span>
                <p className="mt-1 text-xl font-bold text-ink">{conRating.length}</p>
              </div>
              <div className="rounded-xl bg-surface p-3">
                <div className="flex items-center gap-1.5 text-ink-tertiary">
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span className="text-xs font-medium">Con comentario</span>
                </div>
                <p className="mt-1 text-xl font-bold text-ink">{conComentario.length}</p>
              </div>
            </div>

            <div className="mt-4 space-y-1.5 border-t border-gray-100 pt-4">
              {distribucion.reverse().map((d) => (
                <div key={d.n} className="flex items-center gap-2 text-xs">
                  <span className="w-10 text-ink-tertiary">{d.n} ★</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: conRating.length ? `${(d.total / conRating.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className="w-6 text-right text-ink-tertiary">{d.total}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
