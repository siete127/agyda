import { useQuery, useMutation } from '@tanstack/react-query'
import { Zap, Play, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ticketsService } from '@/services/tickets.service'

export function AutomatizacionesTab() {
  const { data: escalamiento } = useQuery({
    queryKey: ['escalamiento-config'],
    queryFn: () => ticketsService.getEscalamientoConfig(),
  })

  const ejecutarCron = useMutation({
    mutationFn: () => ticketsService.runSlaCronNow(),
    onSuccess: () => toast.success('Chequeo de SLA ejecutado'),
    onError: () => toast.error('No se pudo ejecutar el chequeo de SLA'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4 text-brand" />
          <p className="text-sm font-semibold text-ink">Automatizaciones activas</p>
        </div>

        <div className="divide-y divide-gray-100">
          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-ink">Auto-asignación de tickets y chats</p>
              <p className="text-xs text-ink-tertiary">
                Al crear un ticket o iniciar un chat de Soporte TI, el motor de reglas de asignación
                elige automáticamente al técnico según especialidad, categoría, sede y carga.
              </p>
            </div>
            <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[0.68rem] font-medium text-green-700">
              <CheckCircle2 className="h-3 w-3" /> Activa
            </span>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-ink">Escalamiento automático N1 → N2 → N3</p>
              <p className="text-xs text-ink-tertiary">
                Configurable en la sección Escalamientos. Umbral de riesgo actual: {escalamiento ? `${Math.round(escalamiento.umbralRiesgo * 100)}%` : '—'}.
              </p>
            </div>
            <span className={
              escalamiento?.autoEscalamiento
                ? 'flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[0.68rem] font-medium text-green-700'
                : 'rounded-full bg-gray-100 px-2 py-0.5 text-[0.68rem] font-medium text-gray-500'
            }>
              {escalamiento?.autoEscalamiento && <CheckCircle2 className="h-3 w-3" />}
              {escalamiento?.autoEscalamiento ? 'Activa' : 'Desactivada'}
            </span>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-ink">Motor de SLA (cron cada 5 minutos)</p>
              <p className="text-xs text-ink-tertiary">
                Revisa tickets abiertos, notifica riesgo/vencimiento de SLA y dispara el escalamiento.
              </p>
            </div>
            <button
              className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
              onClick={() => ejecutarCron.mutate()}
              disabled={ejecutarCron.isPending}
            >
              <Play className="h-3.5 w-3.5" /> Ejecutar ahora
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
