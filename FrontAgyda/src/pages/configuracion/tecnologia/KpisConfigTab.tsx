import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Gauge, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { ticketsService } from '@/services/tickets.service'

export function KpisConfigTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['tickets-kpis-config'],
    queryFn: () => ticketsService.getKpisConfig(),
  })

  const [umbralSlaBueno, setUmbralSlaBueno] = useState(80)
  const [umbralReabiertosMalo, setUmbralReabiertosMalo] = useState(10)
  const [umbralSatisfaccionBueno, setUmbralSatisfaccionBueno] = useState(4)

  useEffect(() => {
    if (data) {
      setUmbralSlaBueno(data.umbralSlaBueno)
      setUmbralReabiertosMalo(data.umbralReabiertosMalo)
      setUmbralSatisfaccionBueno(data.umbralSatisfaccionBueno)
    }
  }, [data])

  const guardar = useMutation({
    mutationFn: () => ticketsService.actualizarKpisConfig({ umbralSlaBueno, umbralReabiertosMalo, umbralSatisfaccionBueno }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets-kpis-config'] })
      qc.invalidateQueries({ queryKey: ['tickets-kpis'] })
      toast.success('Umbrales de KPIs guardados')
    },
    onError: () => toast.error('No se pudo guardar la configuración'),
  })

  if (isLoading) {
    return <p className="text-sm text-ink-tertiary">Cargando...</p>
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Gauge className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Umbrales del panel de KPIs de Tickets</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          Los indicadores del panel de KPIs (dentro de Tickets) siempre se calculan en vivo — acá solo se
          define a partir de qué valor cada uno se muestra en verde (bien) o en amarillo (necesita atención).
        </p>

        <div className="space-y-5">
          <div>
            <label className="text-xs font-medium text-gray-600">
              % Cumplimiento de SLA a partir del cual se considera "bueno"
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range" min={50} max={100} step={5}
                value={umbralSlaBueno}
                onChange={(e) => setUmbralSlaBueno(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm font-semibold text-ink">{umbralSlaBueno}%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              % de tickets reabiertos a partir del cual se considera "alto"
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range" min={0} max={50} step={5}
                value={umbralReabiertosMalo}
                onChange={(e) => setUmbralReabiertosMalo(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm font-semibold text-ink">{umbralReabiertosMalo}%</span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600">
              Satisfacción promedio (sobre 5) a partir de la cual se considera "buena"
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="range" min={1} max={5} step={0.5}
                value={umbralSatisfaccionBueno}
                onChange={(e) => setUmbralSatisfaccionBueno(Number(e.target.value))}
                className="flex-1"
              />
              <span className="w-12 text-right text-sm font-semibold text-ink">{umbralSatisfaccionBueno}/5</span>
            </div>
          </div>
        </div>

        <div className="mt-4 flex justify-end border-t border-gray-100 pt-4">
          <button
            className="btn-primary flex items-center gap-1 px-3 py-1.5 text-xs"
            disabled={guardar.isPending}
            onClick={() => guardar.mutate()}
          >
            <Save className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
