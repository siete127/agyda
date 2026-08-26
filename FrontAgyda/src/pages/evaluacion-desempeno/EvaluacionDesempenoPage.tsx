import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  Plus, Target, Star, ListChecks, ClipboardCheck, CheckCircle2, Lock,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { evaluacionDesempenoService } from '@/services/evaluacionDesempeno.service'
import { useIsADorTI } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import type { Evaluacion, Meta } from '@/types/evaluacionDesempeno.types'

interface Usuario {
  id: number
  nombre: string
  tipoUsuario: string
}

function formatFecha(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

/* ── Estrellas de calificación (1-5), interactivas o de solo lectura ── */
function Estrellas({ valor, onChange, readonly }: { valor: number; onChange?: (v: number) => void; readonly?: boolean }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(n)}
          className={clsx('transition-colors', readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110')}
        >
          <Star className={clsx('h-4 w-4', n <= valor ? 'fill-amber-400 text-amber-400' : 'text-gray-200')} />
        </button>
      ))}
    </div>
  )
}

/* ── Modal: llenar / ver evaluación ── */
function EvaluacionModal({ evaluacion, isAdmin, onClose }: { evaluacion: Evaluacion; isAdmin: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: criteriosDef = [] } = useQuery({
    queryKey: ['evaluacion-desempeno-criterios'],
    queryFn: () => evaluacionDesempenoService.getCriterios(),
  })

  const puedeEditar = isAdmin && evaluacion.estado === 'borrador'

  const [califs, setCalifs] = useState<Record<string, number>>(
    Object.fromEntries(evaluacion.criterios.map((c) => [c.criterio, c.calificacion])),
  )
  const [metas, setMetas] = useState<Meta[]>(evaluacion.metas.length > 0 ? evaluacion.metas : [{ descripcion: '', cumplimiento: null }])
  const [fortalezas, setFortalezas] = useState(evaluacion.fortalezas ?? '')
  const [areasMejora, setAreasMejora] = useState(evaluacion.areasMejora ?? '')
  const [planAccion, setPlanAccion] = useState(evaluacion.planAccion ?? '')

  const guardar = useMutation({
    mutationFn: () => evaluacionDesempenoService.actualizar(evaluacion.id, {
      criterios: Object.entries(califs).map(([criterio, calificacion]) => ({ criterio, calificacion })),
      metas: metas.filter((m) => m.descripcion.trim()),
      fortalezas, areasMejora, planAccion,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluaciones-todas'] })
      toast.success('Evaluación guardada')
    },
    onError: () => toast.error('Error al guardar'),
  })

  const finalizar = useMutation({
    mutationFn: () => evaluacionDesempenoService.finalizar(evaluacion.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluaciones-todas'] })
      toast.success('Evaluación finalizada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al finalizar'),
  })

  const criteriosCompletos = criteriosDef.length > 0 && criteriosDef.every((c) => califs[c.key] >= 1)

  return (
    <Modal isOpen onClose={onClose} title={`Evaluación — ${evaluacion.empleadoNombre}`} size="lg">
      <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
          <span>{evaluacion.cicloNombre}</span>
          {evaluacion.estado === 'finalizada' ? (
            <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Finalizada — {evaluacion.calificacion}/100
            </span>
          ) : (
            <span className="rounded-full bg-amber-50 px-2 py-0.5 font-semibold text-amber-700">Borrador</span>
          )}
        </div>

        <div>
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Competencias</h3>
          <div className="space-y-2">
            {criteriosDef.map((c) => (
              <div key={c.key} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2">
                <span className="text-sm text-gray-700">{c.label}</span>
                <Estrellas
                  valor={califs[c.key] ?? 0}
                  readonly={!puedeEditar}
                  onChange={(v) => setCalifs((prev) => ({ ...prev, [c.key]: v }))}
                />
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wide flex items-center gap-1">
              <Target className="h-3.5 w-3.5" /> Metas del periodo
            </h3>
            {puedeEditar && (
              <button
                type="button"
                onClick={() => setMetas((prev) => [...prev, { descripcion: '', cumplimiento: null }])}
                className="text-xs font-semibold text-brand hover:underline"
              >
                + Agregar meta
              </button>
            )}
          </div>
          <div className="space-y-2">
            {metas.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  value={m.descripcion}
                  disabled={!puedeEditar}
                  onChange={(e) => setMetas((prev) => prev.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))}
                  className="field flex-1 text-sm"
                  placeholder="Descripción de la meta"
                />
                <input
                  type="number"
                  min="0"
                  max="100"
                  disabled={!puedeEditar}
                  value={m.cumplimiento ?? ''}
                  onChange={(e) => setMetas((prev) => prev.map((x, idx) => idx === i ? { ...x, cumplimiento: e.target.value ? Number(e.target.value) : null } : x))}
                  className="field w-20 text-sm"
                  placeholder="%"
                />
              </div>
            ))}
            {metas.length === 0 && <p className="text-xs text-gray-400">Sin metas registradas.</p>}
          </div>
        </div>

        <div className="grid gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fortalezas</label>
            <textarea disabled={!puedeEditar} value={fortalezas} onChange={(e) => setFortalezas(e.target.value)} className="field min-h-[60px] text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Áreas de mejora</label>
            <textarea disabled={!puedeEditar} value={areasMejora} onChange={(e) => setAreasMejora(e.target.value)} className="field min-h-[60px] text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Plan de acción</label>
            <textarea disabled={!puedeEditar} value={planAccion} onChange={(e) => setPlanAccion(e.target.value)} className="field min-h-[60px] text-sm" />
          </div>
        </div>

        {puedeEditar && (
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="ghost" isLoading={guardar.isPending} onClick={() => guardar.mutate()}>Guardar borrador</Button>
            <Button isLoading={finalizar.isPending} disabled={!criteriosCompletos} onClick={() => finalizar.mutate()}>
              <Lock className="h-3.5 w-3.5" /> Finalizar evaluación
            </Button>
          </div>
        )}
      </div>
    </Modal>
  )
}

/* ── Modal: crear ciclo ── */
function CrearCicloModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState({ nombre: '', fechaInicio: '', fechaFin: '' })
  const canSave = form.nombre.trim() && form.fechaInicio && form.fechaFin && form.fechaFin >= form.fechaInicio

  const crear = useMutation({
    mutationFn: () => evaluacionDesempenoService.crearCiclo(form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluacion-ciclos'] })
      toast.success('Ciclo creado')
      onClose()
    },
    onError: () => toast.error('Error al crear el ciclo'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo ciclo de evaluación" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
          <input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} className="field" placeholder="Ej. Q3 2026" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
            <input type="date" value={form.fechaInicio} onChange={(e) => setForm((f) => ({ ...f, fechaInicio: e.target.value }))} className="field" />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
            <input type="date" value={form.fechaFin} onChange={(e) => setForm((f) => ({ ...f, fechaFin: e.target.value }))} className="field" min={form.fechaInicio || undefined} />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!canSave} onClick={() => crear.mutate()}>Crear ciclo</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal: asignar evaluación a un empleado ── */
function AsignarModal({ ciclos, onClose }: { ciclos: { id: number; nombre: string }[]; onClose: () => void }) {
  const qc = useQueryClient()
  const [cicloId, setCicloId] = useState<number | ''>(ciclos[0]?.id ?? '')
  const [empleadoId, setEmpleadoId] = useState<number | ''>('')

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-todas-areas'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios/todas-areas')
      return (data?.data ?? []) as Usuario[]
    },
  })

  const asignar = useMutation({
    mutationFn: () => evaluacionDesempenoService.crear(Number(cicloId), Number(empleadoId)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['evaluaciones-todas'] })
      toast.success('Evaluación asignada')
      onClose()
    },
    onError: (e) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al asignar'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Asignar evaluación" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Ciclo</label>
          <select value={cicloId} onChange={(e) => setCicloId(Number(e.target.value))} className="field">
            {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Empleado</label>
          <select value={empleadoId} onChange={(e) => setEmpleadoId(Number(e.target.value))} className="field">
            <option value="">Selecciona un empleado</option>
            {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1 border-t border-gray-100">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={asignar.isPending} disabled={!cicloId || !empleadoId} onClick={() => asignar.mutate()}>Asignar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Tab: Mis evaluaciones (empleado) ── */
function MisEvaluacionesTab() {
  const [ver, setVer] = useState<Evaluacion | null>(null)
  const { data: evaluaciones = [], isLoading } = useQuery({
    queryKey: ['mis-evaluaciones'],
    queryFn: () => evaluacionDesempenoService.getMisEvaluaciones(),
  })

  if (isLoading) return <div className="flex justify-center py-16"><Spinner size="lg" /></div>

  if (evaluaciones.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
        <ListChecks className="h-8 w-8" />
        <p className="text-sm">Todavía no tienes evaluaciones registradas</p>
      </div>
    )
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {evaluaciones.map((e) => (
        <button key={e.id} onClick={() => setVer(e)} className="card p-4 flex flex-col gap-2 text-left hover:shadow-card-lg transition-shadow">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-sm text-gray-900">{e.cicloNombre}</h3>
            {e.estado === 'finalizada' ? (
              <span className="flex-shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">Finalizada</span>
            ) : (
              <span className="flex-shrink-0 rounded-full bg-amber-50 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">En curso</span>
            )}
          </div>
          {e.calificacion != null && <p className="text-2xl font-bold text-brand">{e.calificacion}<span className="text-xs text-gray-400">/100</span></p>}
          <p className="text-xs text-gray-500">Evaluador: {e.evaluadorNombre ?? '—'}</p>
        </button>
      ))}
      {ver && <EvaluacionModal evaluacion={ver} isAdmin={false} onClose={() => setVer(null)} />}
    </div>
  )
}

/* ── Tab: Gestionar (admin) ── */
function GestionarTab() {
  const [showCiclo, setShowCiclo] = useState(false)
  const [showAsignar, setShowAsignar] = useState(false)
  const [ver, setVer] = useState<Evaluacion | null>(null)
  const [filtroCiclo, setFiltroCiclo] = useState<number | 'todos'>('todos')

  const { data: ciclos = [] } = useQuery({ queryKey: ['evaluacion-ciclos'], queryFn: () => evaluacionDesempenoService.getCiclos() })
  const { data: evaluaciones = [], isLoading } = useQuery({
    queryKey: ['evaluaciones-todas', filtroCiclo],
    queryFn: () => evaluacionDesempenoService.getAll(filtroCiclo === 'todos' ? undefined : { cicloId: filtroCiclo }),
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <select value={filtroCiclo} onChange={(e) => setFiltroCiclo(e.target.value === 'todos' ? 'todos' : Number(e.target.value))} className="field text-xs py-1.5">
          <option value="todos">Todos los ciclos</option>
          {ciclos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowCiclo(true)}><Plus className="h-3.5 w-3.5" /> Nuevo ciclo</Button>
          <Button size="sm" disabled={ciclos.length === 0} onClick={() => setShowAsignar(true)}><Plus className="h-3.5 w-3.5" /> Asignar evaluación</Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : evaluaciones.length === 0 ? (
        <div className="card flex flex-col items-center gap-2 py-16 text-gray-400">
          <ClipboardCheck className="h-8 w-8" />
          <p className="text-sm">No hay evaluaciones asignadas todavía</p>
        </div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-left text-gray-500">
                <th className="px-4 py-2.5 font-semibold">Empleado</th>
                <th className="px-4 py-2.5 font-semibold">Ciclo</th>
                <th className="px-4 py-2.5 font-semibold">Calificación</th>
                <th className="px-4 py-2.5 font-semibold">Estado</th>
                <th className="px-4 py-2.5 font-semibold"></th>
              </tr>
            </thead>
            <tbody>
              {evaluaciones.map((e) => (
                <tr key={e.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{e.empleadoNombre}</td>
                  <td className="px-4 py-2.5 text-gray-600">{e.cicloNombre}</td>
                  <td className="px-4 py-2.5 text-gray-600">{e.calificacion != null ? `${e.calificacion}/100` : '—'}</td>
                  <td className="px-4 py-2.5">
                    <span className={clsx('rounded-lg px-2 py-1 text-[0.7rem] font-semibold', e.estado === 'finalizada' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                      {e.estado === 'finalizada' ? 'Finalizada' : 'Borrador'}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button onClick={() => setVer(e)} className="text-xs font-semibold text-brand hover:underline">
                      {e.estado === 'finalizada' ? 'Ver' : 'Llenar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCiclo && <CrearCicloModal onClose={() => setShowCiclo(false)} />}
      {showAsignar && <AsignarModal ciclos={ciclos} onClose={() => setShowAsignar(false)} />}
      {ver && <EvaluacionModal evaluacion={ver} isAdmin onClose={() => setVer(null)} />}
    </div>
  )
}

/* ── Página principal ── */
export function EvaluacionDesempenoPage() {
  const isAdmin = useIsADorTI()
  const [tab, setTab] = useState<'mis' | 'gestionar'>(isAdmin ? 'gestionar' : 'mis')

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
          <Target className="h-5 w-5 text-brand" /> Evaluación de desempeño
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">KPIs, metas, retroalimentación y planes de mejora</p>
      </div>

      {isAdmin && (
        <div className="flex gap-1 border-b border-gray-100">
          <button
            onClick={() => setTab('gestionar')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'gestionar' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            <ClipboardCheck className="h-3.5 w-3.5" /> Gestionar
          </button>
          <button
            onClick={() => setTab('mis')}
            className={clsx('flex items-center gap-1.5 px-3 py-2 text-xs font-semibold border-b-2 -mb-px transition-colors', tab === 'mis' ? 'border-brand text-brand' : 'border-transparent text-gray-500 hover:text-gray-700')}
          >
            <ListChecks className="h-3.5 w-3.5" /> Mis evaluaciones
          </button>
        </div>
      )}

      {tab === 'gestionar' && isAdmin ? <GestionarTab /> : <MisEvaluacionesTab />}
    </div>
  )
}
