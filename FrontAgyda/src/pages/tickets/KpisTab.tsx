import { useQuery } from '@tanstack/react-query'
import { Gauge, BarChart3, Star } from 'lucide-react'
import { ticketsService } from '@/services/tickets.service'
import { DashboardStatRow } from '@/components/ui/DashboardStatRow'
import { Spinner } from '@/components/ui/Spinner'
import { ESTADO_LABELS, PRIORIDAD_LABELS, type TicketEstado, type TicketPrioridad } from '@/types/ticket.types'

function formatMinutos(min: number) {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h < 24) return m > 0 ? `${h}h ${m}min` : `${h}h`
  const d = Math.floor(h / 24)
  const hRestantes = h % 24
  return hRestantes > 0 ? `${d}d ${hRestantes}h` : `${d}d`
}

export function KpisTab() {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ['tickets-kpis'],
    queryFn: () => ticketsService.getKpis(),
  })

  if (isLoading || !kpis) {
    return (
      <div className="flex justify-center py-16"><Spinner size="lg" /></div>
    )
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Gauge className="h-4 w-4 text-brand" /> KPIs de Tickets
        </h2>
        <p className="mt-0.5 text-xs text-ink-tertiary">Indicadores clave del área de soporte, calculados sobre todos los tickets</p>
      </div>

      <DashboardStatRow
        stats={[
          { key: 'abiertos', icon: BarChart3, label: 'Tickets abiertos', value: kpis.totalAbiertos, tone: 'brand' },
          { key: 'sla', icon: Gauge, label: '% Cumplimiento SLA', value: kpis.pctCumplimientoSla !== null ? `${kpis.pctCumplimientoSla}%` : '—', tone: kpis.pctCumplimientoSla === null ? 'brand' : kpis.pctCumplimientoSla >= kpis.umbralSlaBueno ? 'success' : 'warn' },
          { key: 'resolucion', icon: BarChart3, label: 'Tiempo prom. resolución', value: kpis.promedioResolucionMin !== null ? formatMinutos(kpis.promedioResolucionMin) : '—', tone: 'brand' },
          { key: 'reabiertos', icon: BarChart3, label: '% Reabiertos', value: kpis.pctReabiertos !== null ? `${kpis.pctReabiertos}%` : '—', tone: (kpis.pctReabiertos ?? 0) > kpis.umbralReabiertosMalo ? 'warn' : 'success' },
          { key: 'satisfaccion', icon: Star, label: 'Satisfacción promedio', value: kpis.satisfaccionPromedio !== null ? `${kpis.satisfaccionPromedio}/5` : '—', tone: kpis.satisfaccionPromedio === null ? 'brand' : kpis.satisfaccionPromedio >= kpis.umbralSatisfaccionBueno ? 'success' : 'warn' },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink">Tickets abiertos por estado</h3>
          {kpis.porEstado.length === 0 ? (
            <p className="text-xs text-ink-tertiary">Sin tickets abiertos.</p>
          ) : (
            <div className="space-y-2">
              {kpis.porEstado.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{ESTADO_LABELS[g.key as TicketEstado] ?? g.key}</span>
                  <span className="font-semibold text-gray-600">{g.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4">
          <h3 className="mb-3 text-sm font-bold text-ink">Volumen histórico por prioridad</h3>
          {kpis.volumenPorPrioridad.length === 0 ? (
            <p className="text-xs text-ink-tertiary">Sin tickets cerrados aún.</p>
          ) : (
            <div className="space-y-2">
              {kpis.volumenPorPrioridad.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{PRIORIDAD_LABELS[g.key as TicketPrioridad] ?? g.key}</span>
                  <span className="font-semibold text-gray-600">{g.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card p-4 lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold text-ink">Volumen histórico por área</h3>
          {kpis.volumenPorArea.length === 0 ? (
            <p className="text-xs text-ink-tertiary">Sin tickets cerrados aún.</p>
          ) : (
            <div className="space-y-2">
              {kpis.volumenPorArea.map((g) => (
                <div key={g.key} className="flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">{g.key}</span>
                  <span className="font-semibold text-gray-600">{g.total}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {kpis.satisfaccionTotal > 0 && (
        <p className="text-xs text-ink-tertiary">Satisfacción calculada sobre {kpis.satisfaccionTotal} calificación{kpis.satisfaccionTotal === 1 ? '' : 'es'}.</p>
      )}
    </div>
  )
}
