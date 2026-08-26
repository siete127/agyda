import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { MessageSquareHeart, Plus, Trash2, CheckCircle2, Circle } from 'lucide-react'
import { retroalimentacionService } from '@/services/retroalimentacion.service'
import { calidadService } from '@/services/calidad.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function CrearRetroModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [evaluacionId, setEvaluacionId] = useState<number | ''>('')
  const [comentario, setComentario] = useState('')
  const [planMejora, setPlanMejora] = useState('')

  const { data: evaluaciones = [] } = useQuery({
    queryKey: ['calidad-evaluaciones'],
    queryFn: () => calidadService.getEvaluaciones(),
  })

  const crear = useMutation({
    mutationFn: () => retroalimentacionService.crear({ evaluacionId: Number(evaluacionId), comentario: comentario.trim(), planMejora: planMejora.trim() || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-retroalimentacion'] })
      toast.success('Retroalimentación registrada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al registrar la retroalimentación'),
  })

  const puedeCrear = evaluacionId !== '' && comentario.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title="Nueva retroalimentación" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Evaluación</label>
          <select value={evaluacionId} onChange={(e) => setEvaluacionId(e.target.value ? Number(e.target.value) : '')} className="field">
            <option value="">Selecciona una evaluación</option>
            {evaluaciones.map((e) => (
              <option key={e.id} value={e.id}>#{e.id} — Agente {e.agenteId} — {e.puntaje} pts — {formatFecha(e.fecha)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Comentario</label>
          <textarea value={comentario} onChange={(e) => setComentario(e.target.value)} className="field" rows={3} placeholder="Observaciones sobre la evaluación" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Plan de mejora (opcional)</label>
          <textarea value={planMejora} onChange={(e) => setPlanMejora(e.target.value)} className="field" rows={2} placeholder="Acciones concretas a seguir" />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Registrar</Button>
        </div>
      </div>
    </Modal>
  )
}

function MiRetroalimentacionTab() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['calidad-retroalimentacion-mias'],
    queryFn: () => retroalimentacionService.getMias(),
  })

  const marcarVista = useMutation({
    mutationFn: (id: number) => retroalimentacionService.marcarVista(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calidad-retroalimentacion-mias'] }),
    onError: () => toast.error('Error al marcar como vista'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (data.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <MessageSquareHeart className="h-8 w-8" />
        <p className="text-sm">Sin retroalimentación registrada para ti todavía</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {data.map((r) => (
        <div key={r.id} className={clsx('card p-4', !r.vista && 'border-brand/40 bg-brand/5')}>
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs text-gray-500">Evaluación #{r.evaluacionId} · {r.puntajeEvaluacion} pts · {formatFecha(r.fechaEvaluacion)}</p>
              <p className="text-[0.68rem] text-gray-400">Recibida el {formatFecha(r.fecha)}</p>
            </div>
            {!r.vista && (
              <button
                onClick={() => marcarVista.mutate(r.id)}
                className="flex items-center gap-1 rounded-lg bg-brand/10 px-2.5 py-1 text-[0.68rem] font-semibold text-brand hover:bg-brand/20"
              >
                <Circle className="h-3 w-3" /> Marcar como vista
              </button>
            )}
            {r.vista && (
              <span className="flex items-center gap-1 text-[0.68rem] font-semibold text-emerald-600">
                <CheckCircle2 className="h-3.5 w-3.5" /> Vista
              </span>
            )}
          </div>
          <p className="mt-3 text-sm text-gray-800">{r.comentario}</p>
          {r.planMejora && (
            <div className="mt-2 rounded-lg bg-gray-50 p-2.5">
              <p className="text-[0.68rem] font-semibold text-gray-600 uppercase tracking-wide">Plan de mejora</p>
              <p className="text-sm text-gray-700">{r.planMejora}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TodasTab({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)

  const { data = [], isLoading } = useQuery({
    queryKey: ['calidad-retroalimentacion'],
    queryFn: () => retroalimentacionService.listAll(),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => retroalimentacionService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-retroalimentacion'] })
      toast.success('Retroalimentación eliminada')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nueva retroalimentación</Button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : data.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <MessageSquareHeart className="h-8 w-8" />
          <p className="text-sm">Sin retroalimentación registrada todavía</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Agente</th>
                <th className="px-4 py-2.5 font-semibold">Evaluación</th>
                <th className="px-4 py-2.5 font-semibold">Comentario</th>
                <th className="px-4 py-2.5 font-semibold">Vista</th>
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                {isAdmin && <th className="px-4 py-2.5 font-semibold"></th>}
              </tr>
            </thead>
            <tbody>
              {data.map((r) => (
                <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{r.agenteNombre ?? `Agente ${r.agenteId}`}</td>
                  <td className="px-4 py-2.5 text-gray-600">#{r.evaluacionId} ({r.puntajeEvaluacion} pts)</td>
                  <td className="px-4 py-2.5 text-gray-700 max-w-[280px] truncate">{r.comentario}</td>
                  <td className="px-4 py-2.5">
                    {r.vista ? <span className="text-emerald-600 font-semibold">Sí</span> : <span className="text-gray-400">No</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{formatFecha(r.fecha)}</td>
                  {isAdmin && (
                    <td className="px-4 py-2.5 text-right">
                      <button onClick={() => eliminar.mutate(r.id)} className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 ml-auto">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCrear && <CrearRetroModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}

export function RetroalimentacionPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'mias' | 'todas'>('mias')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <MessageSquareHeart className="h-5 w-5 text-brand" /> Retroalimentación
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Retroalimentación a agentes evaluados</p>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('mias')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'mias' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          Mi retroalimentación
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('todas')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'todas' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            Todas
          </button>
        )}
      </div>

      {tab === 'mias' && <MiRetroalimentacionTab />}
      {tab === 'todas' && isAdmin && <TodasTab isAdmin={isAdmin} />}
    </div>
  )
}
