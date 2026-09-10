import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Spinner } from '@/components/ui/Spinner'
import { citaService } from '@/services/cita.service'

function fmt(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

// Solicitudes de reprogramación/cancelación que el cliente mandó desde el portal.
export function SolicitudesCitaPanel({ onResuelta }: { onResuelta?: () => void }) {
  const qc = useQueryClient()
  const { data: solicitudes = [], isLoading } = useQuery({
    queryKey: ['citas-solicitudes'],
    queryFn: () => citaService.getSolicitudes(),
    staleTime: 15_000,
  })

  const resolver = useMutation({
    mutationFn: ({ id, accion }: { id: number; accion: 'aprobar' | 'rechazar' }) => citaService.resolverSolicitud(id, accion),
    onSuccess: () => {
      toast.success('Solicitud resuelta')
      qc.invalidateQueries({ queryKey: ['citas-solicitudes'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      onResuelta?.()
    },
    onError: () => toast.error('No se pudo resolver'),
  })

  if (isLoading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>
  if (solicitudes.length === 0) return null

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 overflow-hidden">
      <div className="border-b border-amber-200 px-4 py-2.5">
        <p className="text-[0.8rem] font-bold text-amber-800">
          Solicitudes de cambio del portal ({solicitudes.length})
        </p>
      </div>
      <div className="divide-y divide-amber-100">
        {solicitudes.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[0.8rem] font-semibold text-gray-800 truncate">
                {s.contactoNombre || 'Cliente'} — {s.tipo === 'cancelar' ? 'cancelar' : 'reprogramar'}: {s.citaTitulo}
              </p>
              <p className="text-[0.7rem] text-gray-500">
                Cita actual: {fmt(s.citaFechaHora)}
                {s.fechaPropuesta ? ` · propone: ${fmt(s.fechaPropuesta)}` : ''}
              </p>
              {s.motivo && <p className="text-[0.7rem] text-gray-400 truncate">"{s.motivo}"</p>}
            </div>
            <div className="flex gap-1.5 flex-shrink-0">
              <button onClick={() => resolver.mutate({ id: s.id, accion: 'aprobar' })} disabled={resolver.isPending}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50">
                Aprobar
              </button>
              <button onClick={() => resolver.mutate({ id: s.id, accion: 'rechazar' })} disabled={resolver.isPending}
                className="rounded-lg bg-white px-3 py-1.5 text-[0.7rem] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                Rechazar
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
