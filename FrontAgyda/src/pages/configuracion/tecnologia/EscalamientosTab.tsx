import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowUpCircle, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { ticketsService } from '@/services/tickets.service'

export function EscalamientosTab() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['escalamiento-config'],
    queryFn: () => ticketsService.getEscalamientoConfig(),
  })

  const [autoEscalamiento, setAutoEscalamiento] = useState(true)
  const [umbralPct, setUmbralPct] = useState(80)

  useEffect(() => {
    if (data) {
      setAutoEscalamiento(data.autoEscalamiento)
      setUmbralPct(Math.round(data.umbralRiesgo * 100))
    }
  }, [data])

  const guardar = useMutation({
    mutationFn: () => ticketsService.actualizarEscalamientoConfig({ autoEscalamiento, umbralRiesgo: umbralPct / 100 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalamiento-config'] })
      toast.success('Configuración de escalamiento guardada')
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
          <ArrowUpCircle className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Escalamiento automático N1 → N2 → N3</p>
        </div>
        <p className="mb-4 text-xs text-ink-tertiary">
          El cron de SLA revisa los tickets abiertos cada 5 minutos. Cuando el tiempo de resolución vence,
          notifica y, si el escalamiento automático está activo, sube el ticket al siguiente nivel (hasta N3).
        </p>

        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoEscalamiento} onChange={(e) => setAutoEscalamiento(e.target.checked)} className="h-4 w-4" />
          Escalar automáticamente al vencer el SLA de resolución
        </label>

        <div>
          <label className="text-xs font-medium text-gray-600">
            Umbral de "en riesgo" — % del tiempo de SLA consumido para notificar antes del vencimiento
          </label>
          <div className="mt-1 flex items-center gap-3">
            <input
              type="range" min={50} max={95} step={5}
              value={umbralPct}
              onChange={(e) => setUmbralPct(Number(e.target.value))}
              className="flex-1"
            />
            <span className="w-12 text-right text-sm font-semibold text-ink">{umbralPct}%</span>
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
