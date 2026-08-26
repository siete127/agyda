import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Send, CheckCircle2, Circle, AlertTriangle, ExternalLink } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { crmService } from '@/services/crm.service'
import { useActionAccess } from '@/hooks/useActionAccess'

const CLASIFICACION_CFG: Record<string, { label: string; bg: string; text: string }> = {
  satisfecho: { label: 'Satisfecho', bg: 'bg-emerald-50', text: 'text-emerald-700' },
  regular: { label: 'Regular', bg: 'bg-amber-50', text: 'text-amber-700' },
  necesita_mejora: { label: 'Necesita mejora', bg: 'bg-red-50', text: 'text-red-700' },
}

export function EncuestasTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [encuestaId, setEncuestaId] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const puedeEnviar = can('atencion-cliente', 'clientes-encuestas')

  const { data: disponibles = [] } = useQuery({
    queryKey: ['cliente-encuestas-disponibles'],
    queryFn: () => crmService.getEncuestasDisponibles(),
    staleTime: 60_000,
    enabled: puedeEnviar,
  })

  const { data: enviadas = [], isLoading } = useQuery({
    queryKey: ['cliente-encuestas-enviadas', contactoId],
    queryFn: () => crmService.getEncuestasEnviadas(contactoId),
    staleTime: 15_000,
  })

  const enviar = useMutation({
    mutationFn: () => crmService.enviarEncuestaContacto(contactoId, Number(encuestaId)),
    onSuccess: () => {
      toast.success('Encuesta enviada')
      setEncuestaId('')
      qc.invalidateQueries({ queryKey: ['cliente-encuestas-enviadas', contactoId] })
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Error al enviar encuesta')
    },
  })

  return (
    <div className="space-y-3">
      {puedeEnviar && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm p-4 flex items-center gap-2 flex-wrap">
          <select value={encuestaId} onChange={(e) => setEncuestaId(e.target.value)} className="field flex-1 min-w-[200px]">
            <option value="">Selecciona una encuesta de satisfacción activa...</option>
            {disponibles.map((e) => <option key={e.id} value={e.id}>{e.titulo}</option>)}
          </select>
          <button
            onClick={() => enviar.mutate()}
            disabled={!encuestaId || enviar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-bold text-white disabled:opacity-50 hover:bg-brand-dark transition-colors"
          >
            {enviar.isPending ? <Spinner size="sm" /> : <Send className="h-3.5 w-3.5" />} Enviar
          </button>
        </div>
      )}

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Encuestas enviadas</p>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="sm" /></div>
        ) : enviadas.length === 0 ? (
          <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin encuestas enviadas a este cliente</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {enviadas.map((e) => {
              const clas = e.clasificacion ? CLASIFICACION_CFG[e.clasificacion] : null
              return (
                <div key={e.id}>
                  <button
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{e.encuestaTitulo ?? `Encuesta #${e.encuestaId}`}</p>
                      <p className="text-[0.68rem] text-gray-400">Enviada {new Date(e.fechaEnvio).toLocaleDateString('es-MX')}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {clas && (
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold', clas.bg, clas.text)}>{clas.label}</span>
                      )}
                      <span className={clsx('flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[0.65rem] font-bold', e.respondio ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500')}>
                        {e.respondio ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                        {e.respondio ? 'Respondió' : 'Pendiente'}
                      </span>
                    </div>
                  </button>
                  {expandedId === e.id && e.respondio && (
                    <div className="px-4 pb-3 space-y-1.5">
                      {e.respuestas.map((r, i) => (
                        <div key={i} className="rounded-lg bg-gray-50 px-3 py-2">
                          <p className="text-[0.68rem] font-semibold text-gray-500">{r.pregunta}</p>
                          <p className="text-[0.75rem] text-gray-800">{r.respuesta}</p>
                        </div>
                      ))}
                      {e.incidenciaId && (
                        <button
                          onClick={() => navigate('/atencion-cliente/incidencias')}
                          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[0.75rem] font-semibold text-red-700 hover:bg-red-100 transition-colors"
                        >
                          <AlertTriangle className="h-3.5 w-3.5" /> Se creó una incidencia automáticamente <ExternalLink className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
