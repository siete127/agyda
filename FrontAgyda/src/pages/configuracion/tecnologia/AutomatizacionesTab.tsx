import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Zap, Play, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { ticketsService } from '@/services/tickets.service'

export function AutomatizacionesTab() {
  const qc = useQueryClient()
  const { data: escalamiento } = useQuery({
    queryKey: ['escalamiento-config'],
    queryFn: () => ticketsService.getEscalamientoConfig(),
  })

  const { data: recordatorios } = useQuery({
    queryKey: ['recordatorios-config'],
    queryFn: () => ticketsService.getRecordatoriosConfig(),
  })
  const [diasSinActividad, setDiasSinActividad] = useState(3)
  useEffect(() => {
    if (recordatorios) setDiasSinActividad(recordatorios.diasSinActividad)
  }, [recordatorios])

  const ejecutarCron = useMutation({
    mutationFn: () => ticketsService.runSlaCronNow(),
    onSuccess: () => toast.success('Chequeo de SLA ejecutado'),
    onError: () => toast.error('No se pudo ejecutar el chequeo de SLA'),
  })

  const toggleRecordatorios = useMutation({
    mutationFn: () => ticketsService.actualizarRecordatoriosConfig({ activo: !recordatorios?.activo, diasSinActividad }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recordatorios-config'] }),
    onError: () => toast.error('No se pudo actualizar la configuración de recordatorios'),
  })

  const guardarDiasRecordatorios = useMutation({
    mutationFn: () => ticketsService.actualizarRecordatoriosConfig({ activo: recordatorios?.activo ?? true, diasSinActividad }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recordatorios-config'] })
      toast.success('Días de inactividad actualizados')
    },
    onError: () => toast.error('No se pudo guardar'),
  })

  const ejecutarCronRecordatorios = useMutation({
    mutationFn: () => ticketsService.runRecordatoriosCronNow(),
    onSuccess: () => toast.success('Chequeo de recordatorios ejecutado'),
    onError: () => toast.error('No se pudo ejecutar el chequeo de recordatorios'),
  })

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
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

          <div className="flex items-center justify-between py-3">
            <div className="flex-1 pr-4">
              <p className="text-sm font-medium text-ink">Recordatorios de tickets sin actividad (cron diario, 9:00)</p>
              <p className="text-xs text-ink-tertiary">
                Notifica al técnico asignado cuando un ticket abierto lleva días sin comentarios ni cambios.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-ink-secondary">Días sin actividad:</label>
                <input
                  type="number"
                  min={1}
                  className="field w-16 py-1 text-xs"
                  value={diasSinActividad}
                  onChange={(e) => setDiasSinActividad(Number(e.target.value))}
                />
                <button
                  className="btn-secondary px-2 py-1 text-xs"
                  onClick={() => guardarDiasRecordatorios.mutate()}
                  disabled={guardarDiasRecordatorios.isPending}
                >
                  Guardar
                </button>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <button
                onClick={() => toggleRecordatorios.mutate()}
                disabled={toggleRecordatorios.isPending}
                className={
                  recordatorios?.activo
                    ? 'flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[0.68rem] font-medium text-green-700 hover:opacity-80'
                    : 'rounded-full bg-gray-100 px-2 py-0.5 text-[0.68rem] font-medium text-gray-500 hover:opacity-80'
                }
              >
                {recordatorios?.activo && <CheckCircle2 className="h-3 w-3" />}
                {recordatorios?.activo ? 'Activa' : 'Desactivada'}
              </button>
              <button
                className="btn-secondary flex items-center gap-1 px-3 py-1.5 text-xs"
                onClick={() => ejecutarCronRecordatorios.mutate()}
                disabled={ejecutarCronRecordatorios.isPending}
              >
                <Play className="h-3.5 w-3.5" /> Ejecutar ahora
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
