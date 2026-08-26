import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Target, Plus, Trash2, AlertTriangle } from 'lucide-react'
import { planesMejoraService } from '@/services/planesMejora.service'
import { calidadService } from '@/services/calidad.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { ESTATUS_LABELS, type EstatusPlanMejora, type PlanMejora, type MiPlanMejora } from '@/types/planesMejora.types'

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function estaVencido(p: { fechaLimite: string | null; estatus: EstatusPlanMejora }) {
  if (p.estatus === 'completado' || !p.fechaLimite) return false
  return new Date(p.fechaLimite).getTime() < Date.now()
}

const ESTATUS_COLOR: Record<EstatusPlanMejora, string> = {
  pendiente: 'bg-amber-100 text-amber-700',
  en_progreso: 'bg-blue-100 text-blue-700',
  completado: 'bg-emerald-100 text-emerald-700',
}

function EstatusBadge({ estatus, vencido }: { estatus: EstatusPlanMejora; vencido: boolean }) {
  if (vencido) return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[0.68rem] font-semibold text-red-700"><AlertTriangle className="h-3 w-3" /> Vencido</span>
  return <span className={clsx('inline-flex rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', ESTATUS_COLOR[estatus])}>{ESTATUS_LABELS[estatus]}</span>
}

function CrearPlanModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [evaluacionId, setEvaluacionId] = useState<number | ''>('')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [fechaLimite, setFechaLimite] = useState('')

  const { data: evaluaciones = [] } = useQuery({
    queryKey: ['calidad-evaluaciones'],
    queryFn: () => calidadService.getEvaluaciones(),
  })

  const crear = useMutation({
    mutationFn: () => planesMejoraService.crear({ evaluacionId: Number(evaluacionId), titulo: titulo.trim(), descripcion: descripcion.trim() || undefined, fechaLimite: fechaLimite || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-planes-mejora'] })
      toast.success('Plan de mejora creado')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear el plan'),
  })

  const puedeCrear = evaluacionId !== '' && titulo.trim() !== ''

  return (
    <Modal isOpen onClose={onClose} title="Nuevo plan de mejora" size="md">
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
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input type="text" value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Ej. Mejorar manejo de objeciones" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción (opcional)</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field" rows={3} placeholder="Detalle de las acciones a seguir" />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha límite (opcional)</label>
          <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="field" min={hoy()} />
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeCrear} onClick={() => crear.mutate()}>Crear plan</Button>
        </div>
      </div>
    </Modal>
  )
}

function PlanCard({ plan, onCambiarEstatus }: { plan: PlanMejora | MiPlanMejora; onCambiarEstatus: (estatus: EstatusPlanMejora) => void }) {
  const vencido = estaVencido(plan)
  const nombre = 'agenteNombre' in plan ? plan.agenteNombre : null
  return (
    <div className={clsx('card p-4', vencido && 'border-red-200 bg-red-50/30')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {nombre && <p className="text-xs text-gray-500">{nombre}</p>}
          <p className="text-sm font-semibold text-gray-900">{plan.titulo}</p>
          <p className="text-[0.68rem] text-gray-400">Evaluación #{plan.evaluacionId} · {plan.puntajeEvaluacion} pts</p>
        </div>
        <EstatusBadge estatus={plan.estatus} vencido={vencido} />
      </div>
      {plan.descripcion && <p className="mt-2 text-sm text-gray-700">{plan.descripcion}</p>}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
        <p className="text-[0.68rem] text-gray-500">Límite: {formatFecha(plan.fechaLimite)}</p>
        {plan.estatus !== 'completado' && (
          <div className="flex gap-1.5">
            {plan.estatus === 'pendiente' && (
              <button onClick={() => onCambiarEstatus('en_progreso')} className="rounded-lg bg-blue-50 px-2 py-1 text-[0.68rem] font-semibold text-blue-700 hover:bg-blue-100">Iniciar</button>
            )}
            <button onClick={() => onCambiarEstatus('completado')} className="rounded-lg bg-emerald-50 px-2 py-1 text-[0.68rem] font-semibold text-emerald-700 hover:bg-emerald-100">Completar</button>
          </div>
        )}
      </div>
    </div>
  )
}

function MisPlanesTab() {
  const qc = useQueryClient()
  const { data = [], isLoading } = useQuery({
    queryKey: ['calidad-planes-mejora-mios'],
    queryFn: () => planesMejoraService.getMios(),
  })

  const cambiarEstatus = useMutation({
    mutationFn: ({ id, estatus }: { id: number; estatus: EstatusPlanMejora }) => planesMejoraService.actualizarEstatus(id, estatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-planes-mejora-mios'] })
      toast.success('Plan actualizado')
    },
    onError: () => toast.error('Error al actualizar el plan'),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (data.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <Target className="h-8 w-8" />
        <p className="text-sm">Sin planes de mejora asignados todavía</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {data.map((p) => <PlanCard key={p.id} plan={p} onCambiarEstatus={(estatus) => cambiarEstatus.mutate({ id: p.id, estatus })} />)}
    </div>
  )
}

function TodosTab() {
  const qc = useQueryClient()
  const [showCrear, setShowCrear] = useState(false)
  const [filtro, setFiltro] = useState<EstatusPlanMejora | ''>('')

  const { data = [], isLoading } = useQuery({
    queryKey: ['calidad-planes-mejora', filtro],
    queryFn: () => planesMejoraService.listAll(filtro || undefined),
  })

  const cambiarEstatus = useMutation({
    mutationFn: ({ id, estatus }: { id: number; estatus: EstatusPlanMejora }) => planesMejoraService.actualizarEstatus(id, estatus),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-planes-mejora'] })
      toast.success('Plan actualizado')
    },
    onError: () => toast.error('Error al actualizar el plan'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => planesMejoraService.eliminar(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calidad-planes-mejora'] })
      toast.success('Plan eliminado')
    },
    onError: () => toast.error('Error al eliminar el plan'),
  })

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value as EstatusPlanMejora | '')} className="field w-auto">
          <option value="">Todos los estatus</option>
          <option value="pendiente">Pendiente</option>
          <option value="en_progreso">En progreso</option>
          <option value="completado">Completado</option>
        </select>
        <Button size="sm" onClick={() => setShowCrear(true)}><Plus className="h-3.5 w-3.5" /> Nuevo plan</Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : data.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <Target className="h-8 w-8" />
          <p className="text-sm">Sin planes de mejora registrados</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.map((p) => (
            <div key={p.id} className="relative">
              <PlanCard plan={p} onCambiarEstatus={(estatus) => cambiarEstatus.mutate({ id: p.id, estatus })} />
              <button onClick={() => eliminar.mutate(p.id)} className="absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCrear && <CrearPlanModal onClose={() => setShowCrear(false)} />}
    </div>
  )
}

export function PlanesMejoraPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'mios' | 'todos'>('mios')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Target className="h-5 w-5 text-brand" /> Planes de mejora
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Planes de mejora derivados de evaluaciones</p>
      </div>

      <div className="flex gap-1 border-b border-gray-100">
        <button
          onClick={() => setTab('mios')}
          className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'mios' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
        >
          Mis planes
        </button>
        {isAdmin && (
          <button
            onClick={() => setTab('todos')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'todos' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            Todos
          </button>
        )}
      </div>

      {tab === 'mios' && <MisPlanesTab />}
      {tab === 'todos' && isAdmin && <TodosTab />}
    </div>
  )
}
