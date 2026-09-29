import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Spinner } from '@/components/ui/Spinner'
import { citaService } from '@/services/cita.service'

function fmt(f: string) {
  try { return new Date(f).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }
  catch { return f }
}

// Solicitudes de reprogramación/cancelación que el cliente mandó desde el
// portal, sobre una cita ya existente.
function PanelSolicitudesCambio({ onResuelta }: { onResuelta?: () => void }) {
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

// Reuniones NUEVAS propuestas por el cliente desde el portal (sin cita previa
// — a diferencia de PanelSolicitudesCambio). Al aprobar, el backend crea la
// cita real (con Meet automático si la modalidad es videollamada).
function PanelPropuestasReunion({ onResuelta }: { onResuelta?: () => void }) {
  const qc = useQueryClient()
  const [rechazando, setRechazando] = useState<number | null>(null)
  const [comentario, setComentario] = useState('')
  const [aprobando, setAprobando] = useState<number | null>(null)
  const [enlace, setEnlace] = useState('')
  const { data: propuestas = [], isLoading } = useQuery({
    queryKey: ['citas-propuestas-reunion'],
    queryFn: () => citaService.getPropuestasReunion(),
    staleTime: 15_000,
  })

  const resolver = useMutation({
    mutationFn: ({ id, accion, comentario, enlace }: { id: number; accion: 'aprobar' | 'rechazar'; comentario?: string; enlace?: string }) =>
      citaService.resolverPropuestaReunion(id, accion, comentario, enlace),
    onSuccess: (_d, vars) => {
      toast.success(vars.accion === 'aprobar' ? 'Reunión aprobada y agendada' : 'Propuesta rechazada')
      qc.invalidateQueries({ queryKey: ['citas-propuestas-reunion'] })
      qc.invalidateQueries({ queryKey: ['citas'] })
      setRechazando(null)
      setComentario('')
      setAprobando(null)
      setEnlace('')
      onResuelta?.()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo resolver')
    },
  })

  if (isLoading) return <div className="flex justify-center py-6"><Spinner size="sm" /></div>
  if (propuestas.length === 0) return null

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50 overflow-hidden">
      <div className="border-b border-sky-200 px-4 py-2.5">
        <p className="text-[0.8rem] font-bold text-sky-800">
          Reuniones propuestas por clientes ({propuestas.length})
        </p>
      </div>
      <div className="divide-y divide-sky-100">
        {propuestas.map((p) => (
          <div key={p.id} className="px-4 py-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-semibold text-gray-800 truncate">
                  {p.contactoNombre || 'Cliente'} — {p.titulo}
                </p>
                <p className="text-[0.7rem] text-gray-500">Propone: {fmt(p.fechaPropuesta)} · {p.duracionMin} min</p>
                {p.motivo && <p className="text-[0.7rem] text-gray-400 truncate">"{p.motivo}"</p>}
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => {
                    if (p.modalidad === 'videollamada') { setAprobando(aprobando === p.id ? null : p.id); setRechazando(null) }
                    else resolver.mutate({ id: p.id, accion: 'aprobar' })
                  }}
                  disabled={resolver.isPending}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Aprobar
                </button>
                <button onClick={() => { setRechazando(rechazando === p.id ? null : p.id); setAprobando(null) }} disabled={resolver.isPending}
                  className="rounded-lg bg-white px-3 py-1.5 text-[0.7rem] font-bold text-gray-600 border border-gray-200 hover:bg-gray-50 transition-colors disabled:opacity-50">
                  Rechazar
                </button>
              </div>
            </div>
            {aprobando === p.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={enlace}
                  onChange={(e) => setEnlace(e.target.value)}
                  placeholder="Enlace de la videollamada (ej. https://meet.google.com/xxx-xxxx-xxx)"
                  className="field flex-1 text-[0.75rem]"
                  maxLength={500}
                  autoFocus
                />
                <button
                  onClick={() => resolver.mutate({ id: p.id, accion: 'aprobar', enlace: enlace.trim() })}
                  disabled={resolver.isPending || !enlace.trim()}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[0.7rem] font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  Confirmar y agendar
                </button>
              </div>
            )}
            {rechazando === p.id && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  placeholder="Motivo del rechazo (opcional)"
                  className="field flex-1 text-[0.75rem]"
                  maxLength={500}
                />
                <button
                  onClick={() => resolver.mutate({ id: p.id, accion: 'rechazar', comentario: comentario.trim() || undefined })}
                  disabled={resolver.isPending}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-[0.7rem] font-bold text-white hover:bg-red-700 transition-colors disabled:opacity-50 flex-shrink-0"
                >
                  Confirmar rechazo
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export function SolicitudesCitaPanel({ onResuelta }: { onResuelta?: () => void }) {
  return (
    <div className="space-y-3">
      <PanelPropuestasReunion onResuelta={onResuelta} />
      <PanelSolicitudesCambio onResuelta={onResuelta} />
    </div>
  )
}
