import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Radio } from 'lucide-react'
import { configuracionService } from '@/services/configuracion.service'
import toast from 'react-hot-toast'

// Asignación dura: si un agente tiene una vista fija asignada acá, el
// Marcador ya no le muestra el selector ni la vista predeterminada global —
// carga siempre esta. Distinto de "Credenciales de VICIdial" (esa es N:N,
// solo login/password por vista; esta decide QUÉ vista ve cada quien).
export function WebphoneAsignacionesTab() {
  const qc = useQueryClient()

  const { data: asignaciones = [], isLoading } = useQuery({
    queryKey: ['webphone-asignaciones'],
    queryFn: () => configuracionService.getAsignaciones(),
  })
  const { data: vistas = [] } = useQuery({
    queryKey: ['webphone-vistas'],
    queryFn: () => configuracionService.getVistas(),
  })

  const guardar = useMutation({
    mutationFn: ({ neusId, vistaId }: { neusId: number; vistaId: number | null }) =>
      configuracionService.setAsignacion(neusId, vistaId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webphone-asignaciones'] })
      toast.success('Asignación actualizada')
    },
    onError: () => toast.error('Error al guardar la asignación'),
  })

  if (isLoading) return <p className="text-sm text-ink-tertiary">Cargando...</p>

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
        <p className="font-semibold">Asignación fija de vista por usuario</p>
        <p className="mt-0.5 text-amber-700">
          Si le asignás una vista a un agente acá, el Marcador le carga siempre esa vista —
          ya no ve el selector ni la vista predeterminada global. Dejalo en "Sin asignar" para
          que siga la vista predeterminada, como cualquier otro agente.
        </p>
      </div>

      {vistas.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No hay vistas de Webphone configuradas todavía.</p>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-card shadow-card">
          <div className="max-h-[60vh] space-y-2 overflow-y-auto p-4">
            {asignaciones.map((a) => (
              <div key={a.neusId} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-ink-secondary">
                    {a.nombre}
                    <span className="chip bg-gray-100 text-gray-500 text-[0.6rem]">{a.tipoUsuario}</span>
                  </p>
                  {a.vistaId != null && (
                    <p className="flex items-center gap-1 text-xs text-brand">
                      <Radio className="h-3 w-3" /> Vista fija asignada
                    </p>
                  )}
                </div>
                <select
                  value={a.vistaId ?? ''}
                  onChange={(e) => guardar.mutate({ neusId: a.neusId, vistaId: e.target.value ? Number(e.target.value) : null })}
                  disabled={guardar.isPending}
                  className="field w-56 text-sm"
                >
                  <option value="">Sin asignar (usa la predeterminada)</option>
                  {vistas.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
