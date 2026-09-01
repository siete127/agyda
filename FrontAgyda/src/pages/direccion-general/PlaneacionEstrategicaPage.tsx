import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Target, Plus, Trash2, Pencil, History, ListChecks, Users as UsersIcon, CornerDownRight, X, Tag, FileDown, FileSpreadsheet, LayoutGrid, BarChart3, MessageSquare, Paperclip, FileText, Upload } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'
import {
  planeacionEstrategicaService,
  type ObjetivoEstrategico,
  type ResultadoClave,
  type EstatusManual,
  type TipoKr,
  type Nivel,
} from '@/services/planeacionEstrategica.service'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { ProgressBarList } from '@/components/ui/ProgressBarList'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useAuthStore } from '@/stores/auth.store'
import { useUsuariosSimple } from './useUsuariosSimple'

const currentYear = String(new Date().getFullYear())

const NIVEL_LABEL: Record<Nivel, string> = {
  empresa: 'Empresa',
  departamento: 'Departamento',
  equipo: 'Equipo',
  individual: 'Individual',
}

const ESTATUS_MANUAL_CONFIG: Record<EstatusManual, { label: string; cls: string; dot: string }> = {
  on_track: { label: 'On track', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  at_risk: { label: 'At risk', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  off_track: { label: 'Off track', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
}

const TIPO_KR_LABEL: Record<TipoKr, string> = {
  numerico: 'Numérico',
  porcentaje: 'Porcentaje',
  moneda: 'Moneda',
  booleano: 'Sí / No',
  milestone: 'Hitos',
}

function progresoColor(pct: number) {
  if (pct >= 75) return 'bg-emerald-500'
  if (pct >= 40) return 'bg-amber-400'
  return 'bg-red-500'
}

function ProgresoBar({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={clsx('h-full transition-all', progresoColor(pct))} style={{ width: `${pct}%` }} />
    </div>
  )
}

function formatValorKr(kr: ResultadoClave) {
  if (kr.tipo === 'booleano') return kr.valorActual > 0 ? 'Sí' : 'No'
  if (kr.tipo === 'moneda') return `$${kr.valorActual.toLocaleString()} / $${kr.meta.toLocaleString()}`
  if (kr.tipo === 'porcentaje') return `${kr.valorActual}% / ${kr.meta}%`
  if (kr.tipo === 'milestone') {
    const total = kr.milestones?.length ?? 0
    const completados = kr.milestones?.filter((m) => m.completado).length ?? 0
    return `${completados}/${total} hitos`
  }
  return `${kr.valorActual} / ${kr.meta} ${kr.unidad || ''}`
}

// ── Estatus manual (chips) ────────────────────────────────────────────────
function EstatusManualPicker({ value, onChange }: { value: EstatusManual; onChange: (v: EstatusManual) => void }) {
  return (
    <div className="flex items-center gap-1">
      {(Object.keys(ESTATUS_MANUAL_CONFIG) as EstatusManual[]).map((key) => {
        const cfg = ESTATUS_MANUAL_CONFIG[key]
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={clsx(
              'flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold transition-all',
              active ? cfg.cls : 'bg-gray-50 text-gray-400 hover:bg-gray-100',
            )}
            title={cfg.label}
          >
            <span className={clsx('h-1.5 w-1.5 rounded-full', active ? cfg.dot : 'bg-gray-300')} />
            {cfg.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Formulario nuevo objetivo ────────────────────────────────────────────
function NuevoObjetivoModal({ isOpen, onClose, periodo, objetivosDisponibles }: {
  isOpen: boolean
  onClose: () => void
  periodo: string
  objetivosDisponibles: ObjetivoEstrategico[]
}) {
  const queryClient = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [nivel, setNivel] = useState<Nivel>('departamento')
  const [objetivoPadreId, setObjetivoPadreId] = useState<string>('')
  const [responsableId, setResponsableId] = useState<string>('')
  const [colaboradores, setColaboradores] = useState<number[]>([])
  const [etiquetas, setEtiquetas] = useState<string[]>([])
  const [nuevaEtiqueta, setNuevaEtiqueta] = useState('')

  const reset = () => {
    setTitulo('')
    setDescripcion('')
    setNivel('departamento')
    setObjetivoPadreId('')
    setResponsableId('')
    setColaboradores([])
    setEtiquetas([])
    setNuevaEtiqueta('')
  }

  const mutation = useMutation({
    mutationFn: () =>
      planeacionEstrategicaService.crearObjetivo({
        titulo,
        descripcion,
        periodo,
        nivel,
        objetivoPadreId: objetivoPadreId ? Number(objetivoPadreId) : null,
        responsableId: responsableId ? Number(responsableId) : undefined,
        colaboradores,
        etiquetas,
      }),
    onSuccess: () => {
      toast.success('Objetivo creado')
      queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear el objetivo'),
  })

  const toggleColaborador = (id: number) => {
    setColaboradores((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]))
  }

  const agregarEtiqueta = () => {
    const valor = nuevaEtiqueta.trim()
    if (!valor || etiquetas.includes(valor)) return
    setEtiquetas((prev) => [...prev, valor])
    setNuevaEtiqueta('')
  }

  const quitarEtiqueta = (valor: string) => {
    setEtiquetas((prev) => prev.filter((e) => e !== valor))
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo objetivo estratégico" variant="corporate" size="lg">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!titulo.trim()) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Consolidar la operación en 3 nuevas ciudades"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Descripción</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Contexto y alcance del objetivo (opcional)"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Nivel</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={nivel}
              onChange={(e) => setNivel(e.target.value as Nivel)}
            >
              {(Object.keys(NIVEL_LABEL) as Nivel[]).map((n) => (
                <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Contribuye a (opcional)</label>
            <select
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={objetivoPadreId}
              onChange={(e) => setObjetivoPadreId(e.target.value)}
            >
              <option value="">Sin objetivo padre</option>
              {objetivosDisponibles.map((o) => (
                <option key={o.id} value={o.id}>{o.titulo}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Responsable (owner)</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={responsableId}
            onChange={(e) => setResponsableId(e.target.value)}
          >
            <option value="">Sin asignar</option>
            {usuarios?.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Colaboradores</label>
          <div className="max-h-32 overflow-y-auto rounded-lg border border-gray-200 p-2 space-y-1">
            {usuarios?.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-xs text-ink-secondary">
                <input
                  type="checkbox"
                  checked={colaboradores.includes(u.id)}
                  onChange={() => toggleColaborador(u.id)}
                />
                {u.nombre}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Etiquetas</label>
          <div className="flex gap-2">
            <input
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={nuevaEtiqueta}
              onChange={(e) => setNuevaEtiqueta(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  agregarEtiqueta()
                }
              }}
              placeholder="Ej. estratégico, Q1 (Enter para agregar)"
            />
            <Button type="button" variant="secondary" size="sm" onClick={agregarEtiqueta}>Agregar</Button>
          </div>
          {etiquetas.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {etiquetas.map((e) => (
                <span key={e} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  {e}
                  <button type="button" onClick={() => quitarEtiqueta(e)} className="hover:text-red-600">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Crear objetivo</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Formulario nuevo resultado clave ─────────────────────────────────────
function NuevoResultadoClaveModal({ isOpen, onClose, objetivoId, periodo }: { isOpen: boolean; onClose: () => void; objetivoId: number | null; periodo: string }) {
  const queryClient = useQueryClient()
  const [titulo, setTitulo] = useState('')
  const [meta, setMeta] = useState('')
  const [unidad, setUnidad] = useState('')
  const [tipo, setTipo] = useState<TipoKr>('numerico')
  const [peso, setPeso] = useState('1')

  const reset = () => {
    setTitulo('')
    setMeta('')
    setUnidad('')
    setTipo('numerico')
    setPeso('1')
  }

  const mutation = useMutation({
    mutationFn: () =>
      planeacionEstrategicaService.crearResultadoClave(objetivoId as number, {
        titulo,
        meta: tipo === 'booleano' ? 1 : Number(meta) || 0,
        unidad: tipo === 'porcentaje' ? '%' : unidad,
        tipo,
        peso: Number(peso) || 1,
      }),
    onSuccess: () => {
      toast.success('Resultado clave agregado')
      queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo agregar el resultado clave'),
  })

  const mostrarMetaUnidad = tipo === 'numerico' || tipo === 'porcentaje' || tipo === 'moneda'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Nuevo resultado clave" size="sm" elevated>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!titulo.trim() || !objetivoId) return
          mutation.mutate()
        }}
      >
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Título</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={titulo}
            onChange={(e) => setTitulo(e.target.value)}
            placeholder="Ej. Nuevas sucursales abiertas"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Tipo</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoKr)}
          >
            {(Object.keys(TIPO_KR_LABEL) as TipoKr[]).map((t) => (
              <option key={t} value={t}>{TIPO_KR_LABEL[t]}</option>
            ))}
          </select>
          {tipo === 'milestone' && (
            <p className="mt-1 text-[11px] text-ink-tertiary">Después de crearlo, podrás agregarle hitos individuales.</p>
          )}
        </div>
        {mostrarMetaUnidad && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Meta</label>
              <input
                type="number"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                value={meta}
                onChange={(e) => setMeta(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-secondary">Unidad</label>
              <input
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
                value={tipo === 'porcentaje' ? '%' : unidad}
                onChange={(e) => setUnidad(e.target.value)}
                placeholder="sucursales, $"
                disabled={tipo === 'porcentaje'}
              />
            </div>
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Peso (importancia relativa)</label>
          <input
            type="number"
            step="0.1"
            min="0.1"
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={peso}
            onChange={(e) => setPeso(e.target.value)}
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Agregar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Edición de valor actual de un KR ─────────────────────────────────────
function EditarValorKrModal({ isOpen, onClose, kr, periodo }: { isOpen: boolean; onClose: () => void; kr: ResultadoClave | null; periodo: string }) {
  const queryClient = useQueryClient()
  const [valorActual, setValorActual] = useState<string>('')
  const [comentario, setComentario] = useState('')

  const mutation = useMutation({
    mutationFn: () =>
      planeacionEstrategicaService.actualizarResultadoClave(kr!.id, {
        titulo: kr!.titulo,
        valorActual: kr!.tipo === 'booleano' ? Number(valorActual) : Number(valorActual) || 0,
        meta: kr!.meta,
        unidad: kr!.unidad || undefined,
        tipo: kr!.tipo,
        peso: kr!.peso,
        comentario: comentario || undefined,
      }),
    onSuccess: () => {
      toast.success('Progreso actualizado')
      queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
      setComentario('')
      onClose()
    },
    onError: () => toast.error('No se pudo actualizar el progreso'),
  })

  if (!kr) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Actualizar: ${kr.titulo}`} size="sm" elevated>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          mutation.mutate()
        }}
      >
        {kr.tipo === 'booleano' ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">Valor</label>
            <div className="flex gap-2">
              <button
                type="button"
                className={clsx('flex-1 rounded-lg border px-3 py-2 text-sm font-semibold', valorActual === '1' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-gray-200 text-ink-secondary')}
                onClick={() => setValorActual('1')}
              >
                Sí
              </button>
              <button
                type="button"
                className={clsx('flex-1 rounded-lg border px-3 py-2 text-sm font-semibold', valorActual === '0' ? 'border-red-500 bg-red-50 text-red-700' : 'border-gray-200 text-ink-secondary')}
                onClick={() => setValorActual('0')}
              >
                No
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-semibold text-ink-secondary">
              Valor actual {kr.unidad ? `(${kr.unidad})` : ''} — meta: {kr.meta}
            </label>
            <input
              type="number"
              autoFocus
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              defaultValue={kr.valorActual}
              onChange={(e) => setValorActual(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="mb-1 block text-xs font-semibold text-ink-secondary">Comentario (por qué cambió)</label>
          <textarea
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            rows={2}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Opcional"
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" isLoading={mutation.isPending}>Guardar</Button>
        </div>
      </form>
    </Modal>
  )
}

// ── Historial de check-ins ────────────────────────────────────────────────
function KrCheckinsModal({ isOpen, onClose, kr }: { isOpen: boolean; onClose: () => void; kr: ResultadoClave | null }) {
  const { data, isLoading } = useQuery({
    queryKey: ['kr-checkins', kr?.id],
    queryFn: () => planeacionEstrategicaService.getKrCheckins(kr!.id),
    enabled: isOpen && !!kr,
  })

  const chartData = (data ? [...data].reverse() : []).map((c, i) => ({ i: i + 1, valor: c.valorNuevo }))

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={kr ? `Historial: ${kr.titulo}` : 'Historial'} size="md" elevated>
      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-ink-tertiary">Sin check-ins registrados aún.</p>
      ) : (
        <div className="space-y-4">
          {chartData.length > 1 && (
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="i" hide />
                  <Tooltip />
                  <Line type="monotone" dataKey="valor" stroke="#1B4FD8" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          <ul className="space-y-2">
            {data.map((c) => (
              <li key={c.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-ink">
                    {c.valorAnterior} → {c.valorNuevo}
                  </span>
                  <span className="text-ink-tertiary">{new Date(c.fecha).toLocaleString()}</span>
                </div>
                {c.comentario && <p className="mt-1 text-xs text-ink-secondary">{c.comentario}</p>}
                {c.autorNombre && <p className="mt-1 text-[11px] text-ink-tertiary">Por {c.autorNombre}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  )
}

// ── Gestión de hitos ───────────────────────────────────────────────────────
function MilestonesModal({ isOpen, onClose, kr, periodo }: { isOpen: boolean; onClose: () => void; kr: ResultadoClave | null; periodo: string }) {
  const queryClient = useQueryClient()
  const [nuevoTitulo, setNuevoTitulo] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['kr-milestones', kr?.id],
    queryFn: () => planeacionEstrategicaService.listMilestones(kr!.id),
    enabled: isOpen && !!kr,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['kr-milestones', kr?.id] })
    queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
  }

  const crearMutation = useMutation({
    mutationFn: () => planeacionEstrategicaService.crearMilestone(kr!.id, nuevoTitulo),
    onSuccess: () => {
      setNuevoTitulo('')
      invalidate()
    },
    onError: () => toast.error('No se pudo agregar el hito'),
  })

  const toggleMutation = useMutation({
    mutationFn: ({ id, titulo, completado }: { id: number; titulo: string; completado: boolean }) =>
      planeacionEstrategicaService.actualizarMilestone(id, titulo, completado),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo actualizar el hito'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => planeacionEstrategicaService.eliminarMilestone(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el hito'),
  })

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={kr ? `Hitos: ${kr.titulo}` : 'Hitos'} size="sm" elevated>
      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {data?.map((m) => (
              <li key={m.id} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <input
                  type="checkbox"
                  checked={m.completado}
                  onChange={(e) => toggleMutation.mutate({ id: m.id, titulo: m.titulo, completado: e.target.checked })}
                />
                <span className={clsx('flex-1 text-xs', m.completado ? 'text-ink-tertiary line-through' : 'text-ink')}>{m.titulo}</span>
                <button onClick={() => eliminarMutation.mutate(m.id)} className="text-gray-400 hover:text-red-600">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
            {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin hitos aún.</p>}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!nuevoTitulo.trim()) return
              crearMutation.mutate()
            }}
          >
            <input
              className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
              value={nuevoTitulo}
              onChange={(e) => setNuevoTitulo(e.target.value)}
              placeholder="Nuevo hito"
            />
            <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Agregar</Button>
          </form>
        </div>
      )}
    </Modal>
  )
}

// ── Evidencias (fotos y archivos) ──────────────────────────────────────
function formatBytes(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function EvidenciasModal({ isOpen, onClose, kr, periodo, puedeSubir }: {
  isOpen: boolean
  onClose: () => void
  kr: ResultadoClave | null
  periodo: string
  puedeSubir: boolean
}) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)

  const { data, isLoading } = useQuery({
    queryKey: ['kr-evidencias', kr?.id],
    queryFn: () => planeacionEstrategicaService.getEvidencias(kr!.id),
    enabled: isOpen && !!kr,
  })

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['kr-evidencias', kr?.id] })
    queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
  }

  const subirMutation = useMutation({
    mutationFn: (files: File[]) => planeacionEstrategicaService.subirEvidencias(kr!.id, files),
    onSuccess: () => {
      toast.success('Evidencia subida')
      invalidate()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo subir la evidencia')
    },
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => planeacionEstrategicaService.eliminarEvidencia(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar la evidencia'),
  })

  const pickFiles = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.accept = 'image/jpeg,image/png,image/webp,application/pdf'
    input.onchange = () => {
      const files = input.files ? Array.from(input.files) : []
      if (files.length) subirMutation.mutate(files)
    }
    input.click()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={kr ? `Evidencias: ${kr.titulo}` : 'Evidencias'} size="md" elevated>
      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {data?.map((ev) => {
              const esImagen = ev.mime?.startsWith('image/')
              const url = planeacionEstrategicaService.verEvidenciaUrl(ev.id)
              return (
                <div key={ev.id} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                  <button onClick={() => window.open(url, '_blank')} className="flex h-full w-full items-center justify-center" title={ev.nombreOriginal}>
                    {esImagen ? (
                      <img src={url} alt={ev.nombreOriginal} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex flex-col items-center gap-1 p-2 text-center">
                        <FileText className="h-6 w-6 text-gray-400" />
                        <span className="line-clamp-2 text-[10px] text-ink-tertiary">{ev.nombreOriginal}</span>
                      </div>
                    )}
                  </button>
                  {ev.usuarioId === currentUserId && (
                    <button
                      onClick={() => eliminarMutation.mutate(ev.id)}
                      className="absolute right-1 top-1 rounded-full bg-white/90 p-1 text-gray-500 opacity-0 shadow-sm transition-opacity hover:text-red-600 group-hover:opacity-100"
                      title="Eliminar"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  <span className="absolute bottom-0 left-0 right-0 truncate bg-black/40 px-1 py-0.5 text-[9px] text-white">
                    {formatBytes(ev.tamanio)}
                  </span>
                </div>
              )
            })}
            {(!data || data.length === 0) && (
              <p className="col-span-full text-xs text-ink-tertiary">Sin evidencias aún.</p>
            )}
          </div>

          {puedeSubir && (
            <Button type="button" variant="secondary" size="sm" onClick={pickFiles} isLoading={subirMutation.isPending}>
              <Upload className="h-3.5 w-3.5" /> Subir evidencia
            </Button>
          )}
        </div>
      )}
    </Modal>
  )
}

// ── Tarjeta compacta de objetivo (grid) ────────────────────────────────────
function ObjetivoCardCompacta({ objetivo, onClick, onEliminar, puedeEliminar }: {
  objetivo: ObjetivoEstrategico
  onClick: () => void
  onEliminar: () => void
  puedeEliminar: boolean
}) {
  const cfg = ESTATUS_MANUAL_CONFIG[objetivo.estatusManual]
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col rounded-2xl border border-gray-100 bg-card p-4 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      {puedeEliminar && (
        <span
          onClick={(e) => {
            e.stopPropagation()
            onEliminar()
          }}
          role="button"
          title="Eliminar objetivo"
          className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </span>
      )}

      <span className="mb-1 inline-flex w-fit chip bg-blue-50 text-blue-700">{NIVEL_LABEL[objetivo.nivel]}</span>
      <h3 className="pr-6 text-sm font-semibold text-ink">{objetivo.titulo}</h3>
      {objetivo.descripcion && <p className="mt-0.5 line-clamp-2 text-xs text-ink-tertiary">{objetivo.descripcion}</p>}

      <span className={clsx('mt-2 inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', cfg.cls)}>
        <span className={clsx('h-1.5 w-1.5 rounded-full', cfg.dot)} />
        {cfg.label}
      </span>

      {objetivo.etiquetas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {objetivo.etiquetas.slice(0, 3).map((e) => (
            <span key={e} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{e}</span>
          ))}
          {objetivo.etiquetas.length > 3 && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">+{objetivo.etiquetas.length - 3}</span>
          )}
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <ProgresoBar pct={objetivo.progreso} />
        <span className="text-xs font-semibold text-ink">{objetivo.progreso}%</span>
      </div>

      <div className="mt-3 flex items-center justify-between text-[11px] text-ink-tertiary">
        <span>{objetivo.resultadosClave.length} resultado{objetivo.resultadosClave.length !== 1 ? 's' : ''} clave</span>
        {objetivo.colaboradores.length > 0 && (
          <span className="flex items-center gap-1">
            <UsersIcon className="h-3 w-3" /> {objetivo.colaboradores.length}
          </span>
        )}
      </div>
    </button>
  )
}

// ── Comentarios ────────────────────────────────────────────────────────
function ComentariosSection({ objetivoId, periodo, puedeComentar }: { objetivoId: number; periodo: string; puedeComentar: boolean }) {
  const queryClient = useQueryClient()
  const currentUserId = useAuthStore((s) => s.user?.id)
  const [texto, setTexto] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['okr-comentarios', objetivoId],
    queryFn: () => planeacionEstrategicaService.getComentarios(objetivoId),
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['okr-comentarios', objetivoId] })

  const crearMutation = useMutation({
    mutationFn: () => planeacionEstrategicaService.crearComentario(objetivoId, texto),
    onSuccess: () => {
      setTexto('')
      invalidate()
    },
    onError: () => toast.error('No se pudo agregar el comentario'),
  })

  const eliminarMutation = useMutation({
    mutationFn: (id: number) => planeacionEstrategicaService.eliminarComentario(id),
    onSuccess: invalidate,
    onError: () => toast.error('No se pudo eliminar el comentario'),
  })

  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-tertiary">
        <MessageSquare className="h-3.5 w-3.5" /> Comentarios
      </h3>
      {isLoading ? (
        <p className="text-xs text-ink-tertiary">Cargando...</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {data?.map((c) => (
            <li key={c.id} className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-ink">{c.texto}</p>
                  <p className="mt-1 text-[11px] text-ink-tertiary">
                    {c.autorNombre || 'Usuario'} · {new Date(c.createdAt).toLocaleString()}
                  </p>
                </div>
                {c.usuarioId === currentUserId && (
                  <button onClick={() => eliminarMutation.mutate(c.id)} className="text-gray-400 hover:text-red-600">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </li>
          ))}
          {(!data || data.length === 0) && <p className="text-xs text-ink-tertiary">Sin comentarios aún.</p>}
        </ul>
      )}
      {puedeComentar && (
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (!texto.trim()) return
            crearMutation.mutate()
          }}
        >
          <input
            className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Agregar comentario..."
          />
          <Button type="submit" size="sm" isLoading={crearMutation.isPending}>Comentar</Button>
        </form>
      )}
    </div>
  )
}

// ── Modal de detalle de objetivo ────────────────────────────────────────
function ObjetivoDetalleModal({ objetivo, periodo, onClose, onAgregarKr, onEditarKr, onVerHistorial, onVerMilestones, onVerEvidencias, onEliminarKr, puedeEditar, puedeEliminar, puedeCheckin, puedeCrear, puedeComentar }: {
  objetivo: ObjetivoEstrategico | null
  periodo: string
  onClose: () => void
  onAgregarKr: (objetivoId: number) => void
  onEditarKr: (kr: ResultadoClave) => void
  onVerHistorial: (kr: ResultadoClave) => void
  onVerMilestones: (kr: ResultadoClave) => void
  onVerEvidencias: (kr: ResultadoClave) => void
  onEliminarKr: (id: number) => void
  puedeEditar: boolean
  puedeEliminar: boolean
  puedeCheckin: boolean
  puedeCrear: boolean
  puedeComentar: boolean
}) {
  const queryClient = useQueryClient()

  const estatusMutation = useMutation({
    mutationFn: (estatusManual: EstatusManual) => planeacionEstrategicaService.actualizarEstatusManual(objetivo!.id, estatusManual),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] }),
    onError: () => toast.error('No se pudo actualizar el estatus'),
  })

  if (!objetivo) return null

  return (
    <Modal isOpen={!!objetivo} onClose={onClose} size="xl">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="chip bg-blue-50 text-blue-700">{NIVEL_LABEL[objetivo.nivel]}</span>
            </div>
            <h2 className="text-base font-bold text-ink">{objetivo.titulo}</h2>
            {objetivo.descripcion && <p className="mt-1 text-sm text-ink-tertiary">{objetivo.descripcion}</p>}
            {objetivo.objetivoPadreTitulo && (
              <div className="mt-1.5 flex items-center gap-1 text-[11px] text-ink-tertiary">
                <CornerDownRight className="h-3 w-3" />
                contribuye a: <span className="font-medium text-ink-secondary">{objetivo.objetivoPadreTitulo}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            <X className="h-4 w-4" />
          </button>
        </div>

        <fieldset disabled={!puedeEditar} className="contents">
          <EstatusManualPicker value={objetivo.estatusManual} onChange={(v) => estatusMutation.mutate(v)} />
        </fieldset>

        {objetivo.colaboradores.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
            <UsersIcon className="h-3.5 w-3.5" />
            {objetivo.colaboradores.map((c) => c.nombre).join(', ')}
          </div>
        )}

        {objetivo.etiquetas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-ink-tertiary" />
            {objetivo.etiquetas.map((e) => (
              <span key={e} className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{e}</span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <ProgresoBar pct={objetivo.progreso} />
          <span className="text-xs font-semibold text-ink">{objetivo.progreso}%</span>
        </div>

        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Resultados clave</h3>
          <ul className="space-y-2">
            {objetivo.resultadosClave.map((kr) => (
              <li key={kr.id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-ink">{kr.titulo}</p>
                  <p className="text-[11px] text-ink-tertiary">
                    {formatValorKr(kr)} · {kr.progreso}% {kr.peso !== 1 ? `· peso ${kr.peso}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {kr.tipo === 'milestone' ? (
                    puedeCheckin && (
                      <button onClick={() => onVerMilestones(kr)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Gestionar hitos">
                        <ListChecks className="h-3.5 w-3.5" />
                      </button>
                    )
                  ) : (
                    <>
                      <button onClick={() => onVerHistorial(kr)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Ver historial">
                        <History className="h-3.5 w-3.5" />
                      </button>
                      {puedeCheckin && (
                        <button onClick={() => onEditarKr(kr)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Actualizar valor">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </>
                  )}
                  <button onClick={() => onVerEvidencias(kr)} className="rounded-lg p-1.5 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Evidencias">
                    <Paperclip className="h-3.5 w-3.5" />
                  </button>
                  {puedeEliminar && (
                    <button onClick={() => onEliminarKr(kr.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Eliminar">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
            {objetivo.resultadosClave.length === 0 && (
              <p className="text-xs text-ink-tertiary">Sin resultados clave aún.</p>
            )}
          </ul>

          {puedeCrear && (
            <button
              onClick={() => onAgregarKr(objetivo.id)}
              className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline"
            >
              <Plus className="h-3.5 w-3.5" /> Agregar resultado clave
            </button>
          )}
        </div>

        <ComentariosSection objetivoId={objetivo.id} periodo={periodo} puedeComentar={puedeComentar} />
      </div>
    </Modal>
  )
}

// ── Barra de filtros ───────────────────────────────────────────────────
interface Filtros {
  etiquetas: string[]
  estatusManual: EstatusManual | 'todos'
  nivel: Nivel | 'todos'
}

function FiltrosBar({ etiquetasDisponibles, filtros, onChange }: {
  etiquetasDisponibles: string[]
  filtros: Filtros
  onChange: (f: Filtros) => void
}) {
  const toggleEtiqueta = (etiqueta: string) => {
    const activa = filtros.etiquetas.includes(etiqueta)
    onChange({
      ...filtros,
      etiquetas: activa ? filtros.etiquetas.filter((e) => e !== etiqueta) : [...filtros.etiquetas, etiqueta],
    })
  }

  const hayFiltrosActivos = filtros.etiquetas.length > 0 || filtros.estatusManual !== 'todos' || filtros.nivel !== 'todos'

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-card p-3">
      <select
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        value={filtros.estatusManual}
        onChange={(e) => onChange({ ...filtros, estatusManual: e.target.value as Filtros['estatusManual'] })}
      >
        <option value="todos">Todos los estatus</option>
        {(Object.keys(ESTATUS_MANUAL_CONFIG) as EstatusManual[]).map((k) => (
          <option key={k} value={k}>{ESTATUS_MANUAL_CONFIG[k].label}</option>
        ))}
      </select>
      <select
        className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
        value={filtros.nivel}
        onChange={(e) => onChange({ ...filtros, nivel: e.target.value as Filtros['nivel'] })}
      >
        <option value="todos">Todos los niveles</option>
        {(Object.keys(NIVEL_LABEL) as Nivel[]).map((n) => (
          <option key={n} value={n}>{NIVEL_LABEL[n]}</option>
        ))}
      </select>
      {etiquetasDisponibles.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {etiquetasDisponibles.map((e) => {
            const activa = filtros.etiquetas.includes(e)
            return (
              <button
                key={e}
                onClick={() => toggleEtiqueta(e)}
                className={clsx(
                  'rounded-full px-2 py-1 text-[11px] font-medium transition-colors',
                  activa ? 'bg-brand text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
                )}
              >
                {e}
              </button>
            )
          })}
        </div>
      )}
      {hayFiltrosActivos && (
        <button
          onClick={() => onChange({ etiquetas: [], estatusManual: 'todos', nivel: 'todos' })}
          className="ml-auto text-[11px] font-semibold text-brand hover:underline"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

// ── Dashboard ejecutivo ────────────────────────────────────────────────
function DashboardEjecutivo({ objetivos }: { objetivos: ObjetivoEstrategico[] }) {
  const total = objetivos.length
  const cumplimientoPromedio = total ? Math.round(objetivos.reduce((s, o) => s + o.progreso, 0) / total) : 0
  const conteoPorEstatus = { on_track: 0, at_risk: 0, off_track: 0 } as Record<EstatusManual, number>
  objetivos.forEach((o) => { conteoPorEstatus[o.estatusManual]++ })

  const stats: DashboardStat[] = [
    { key: 'total', icon: Target, label: 'Objetivos', value: total, tone: 'brand' },
    { key: 'cumplimiento', icon: BarChart3, label: '% cumplimiento promedio', value: `${cumplimientoPromedio}%`, tone: 'brand' },
    { key: 'on', icon: Target, label: 'On track', value: conteoPorEstatus.on_track, tone: 'success' },
    { key: 'at', icon: Target, label: 'At risk', value: conteoPorEstatus.at_risk, tone: 'warn' },
    { key: 'off', icon: Target, label: 'Off track', value: conteoPorEstatus.off_track, tone: 'critical' },
  ]

  const ranking = [...objetivos]
    .sort((a, b) => a.progreso - b.progreso)
    .slice(0, 8)
    .map((o) => ({ key: String(o.id), label: o.titulo, value: o.progreso, max: 100 }))

  const distribucion = [
    { estatus: 'On track', cantidad: conteoPorEstatus.on_track },
    { estatus: 'At risk', cantidad: conteoPorEstatus.at_risk },
    { estatus: 'Off track', cantidad: conteoPorEstatus.off_track },
  ]

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
        <p className="text-sm text-ink-tertiary">No hay objetivos para mostrar en el dashboard.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <DashboardStatRow stats={stats} />
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Objetivos más rezagados</h3>
          <ProgressBarList items={ranking} />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-tertiary">Distribución por estatus</h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distribucion}>
                <XAxis dataKey="estatus" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="cantidad" fill="#1B4FD8" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Página ─────────────────────────────────────────────────────────────
export function PlaneacionEstrategicaPage() {
  const [periodo, setPeriodo] = useState(currentYear)
  const [nuevoObjetivoOpen, setNuevoObjetivoOpen] = useState(false)
  const [objetivoActivoId, setObjetivoActivoId] = useState<number | null>(null)
  const [objetivoParaKr, setObjetivoParaKr] = useState<number | null>(null)
  const [krParaEditar, setKrParaEditar] = useState<ResultadoClave | null>(null)
  const [krParaHistorial, setKrParaHistorial] = useState<ResultadoClave | null>(null)
  const [krParaMilestones, setKrParaMilestones] = useState<ResultadoClave | null>(null)
  const [krParaEvidencias, setKrParaEvidencias] = useState<ResultadoClave | null>(null)
  const [vista, setVista] = useState<'objetivos' | 'dashboard'>('objetivos')
  const [filtros, setFiltros] = useState<Filtros>({ etiquetas: [], estatusManual: 'todos', nivel: 'todos' })
  const [exportandoPdf, setExportandoPdf] = useState(false)
  const queryClient = useQueryClient()
  const { can } = useActionAccess()
  const puedeCrear = can('direccion-general', 'okr-crear')
  const puedeEditar = can('direccion-general', 'okr-editar')
  const puedeEliminar = can('direccion-general', 'okr-eliminar')
  const puedeCheckin = can('direccion-general', 'okr-checkin')
  const puedeComentar = can('direccion-general', 'okr-comentar')

  const { data, isLoading } = useQuery({
    queryKey: ['planeacion-objetivos', periodo],
    queryFn: () => planeacionEstrategicaService.getObjetivos(periodo),
    staleTime: 30_000,
  })

  const etiquetasDisponibles = useMemo(() => {
    const contador = new Map<string, number>()
    for (const o of data || []) {
      for (const e of o.etiquetas) contador.set(e, (contador.get(e) || 0) + 1)
    }
    return [...contador.entries()].sort((a, b) => b[1] - a[1]).map(([e]) => e)
  }, [data])

  const objetivosFiltrados = useMemo(() => {
    return (data || []).filter((o) => {
      if (filtros.estatusManual !== 'todos' && o.estatusManual !== filtros.estatusManual) return false
      if (filtros.nivel !== 'todos' && o.nivel !== filtros.nivel) return false
      if (filtros.etiquetas.length > 0 && !filtros.etiquetas.some((e) => o.etiquetas.includes(e))) return false
      return true
    })
  }, [data, filtros])

  const eliminarObjetivoMutation = useMutation({
    mutationFn: (id: number) => planeacionEstrategicaService.eliminarObjetivo(id),
    onSuccess: () => {
      toast.success('Objetivo eliminado')
      queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'No se pudo eliminar el objetivo')
    },
  })

  const eliminarKrMutation = useMutation({
    mutationFn: (id: number) => planeacionEstrategicaService.eliminarResultadoClave(id),
    onSuccess: () => {
      toast.success('Resultado clave eliminado')
      queryClient.invalidateQueries({ queryKey: ['planeacion-objetivos', periodo] })
    },
    onError: () => toast.error('No se pudo eliminar el resultado clave'),
  })

  const objetivosRaiz = objetivosFiltrados.filter((o) => !o.objetivoPadreId)
  const hijosPorPadre = new Map<number, ObjetivoEstrategico[]>()
  for (const o of objetivosFiltrados) {
    if (o.objetivoPadreId) {
      const lista = hijosPorPadre.get(o.objetivoPadreId) || []
      lista.push(o)
      hijosPorPadre.set(o.objetivoPadreId, lista)
    }
  }

  const objetivoActivo = (data || []).find((o) => o.id === objetivoActivoId) || null

  const handleExportarPdf = async () => {
    setExportandoPdf(true)
    try {
      const blob = await planeacionEstrategicaService.exportarPdf(periodo)
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `planeacion_estrategica_${periodo}.pdf`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo exportar el PDF')
    } finally {
      setExportandoPdf(false)
    }
  }

  const handleExportarExcel = () => {
    if (objetivosFiltrados.length === 0) {
      toast.error('No hay objetivos para exportar')
      return
    }
    const objetivosSheet = XLSX.utils.aoa_to_sheet([
      ['Título', 'Nivel', 'Estatus', 'Progreso %', 'Etiquetas', 'Descripción'],
      ...objetivosFiltrados.map((o) => [
        o.titulo,
        NIVEL_LABEL[o.nivel],
        ESTATUS_MANUAL_CONFIG[o.estatusManual].label,
        o.progreso,
        o.etiquetas.join(', '),
        o.descripcion || '',
      ]),
    ])
    objetivosSheet['!cols'] = [{ wch: 35 }, { wch: 14 }, { wch: 12 }, { wch: 12 }, { wch: 25 }, { wch: 40 }]

    const krsSheet = XLSX.utils.aoa_to_sheet([
      ['Objetivo', 'Resultado clave', 'Tipo', 'Valor actual', 'Meta', 'Unidad', 'Peso', 'Progreso %'],
      ...objetivosFiltrados.flatMap((o) =>
        o.resultadosClave.map((kr) => [o.titulo, kr.titulo, TIPO_KR_LABEL[kr.tipo], kr.valorActual, kr.meta, kr.unidad || '', kr.peso, kr.progreso]),
      ),
    ])
    krsSheet['!cols'] = [{ wch: 35 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 12 }]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, objetivosSheet, 'Objetivos')
    XLSX.utils.book_append_sheet(wb, krsSheet, 'Resultados clave')
    XLSX.writeFile(wb, `planeacion_estrategica_${periodo}.xlsx`)
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Target className="h-6 w-6 text-blue-300" />
            <div>
              <h1 className="text-lg font-bold">Planeación estratégica y objetivos</h1>
              <p className="text-xs text-blue-200/70">Objetivos y resultados clave de la empresa</p>
            </div>
          </div>
          <input
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white placeholder:text-white/50"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            placeholder="Periodo (ej. 2026)"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-ink">Objetivos del periodo {periodo}</h2>
          <div className="flex rounded-lg border border-gray-200 p-0.5">
            <button
              onClick={() => setVista('objetivos')}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', vista === 'objetivos' ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-50')}
            >
              <LayoutGrid className="h-3.5 w-3.5" /> Objetivos
            </button>
            <button
              onClick={() => setVista('dashboard')}
              className={clsx('flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', vista === 'dashboard' ? 'bg-brand text-white' : 'text-ink-tertiary hover:bg-gray-50')}
            >
              <BarChart3 className="h-3.5 w-3.5" /> Dashboard
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleExportarPdf} isLoading={exportandoPdf}>
            <FileDown className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" variant="secondary" onClick={handleExportarExcel}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
          {puedeCrear && (
            <Button size="sm" onClick={() => setNuevoObjetivoOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> Nuevo objetivo
            </Button>
          )}
        </div>
      </div>

      {!isLoading && data && data.length > 0 && (
        <FiltrosBar etiquetasDisponibles={etiquetasDisponibles} filtros={filtros} onChange={setFiltros} />
      )}

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : !data || data.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Aún no hay objetivos estratégicos para este periodo.</p>
        </div>
      ) : vista === 'dashboard' ? (
        <DashboardEjecutivo objetivos={objetivosFiltrados} />
      ) : objetivosFiltrados.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-card p-8 text-center">
          <p className="text-sm text-ink-tertiary">Ningún objetivo coincide con los filtros aplicados.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {objetivosRaiz.map((raiz) => {
            const hijos = hijosPorPadre.get(raiz.id) || []
            return (
              <div key={raiz.id} className="space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <ObjetivoCardCompacta
                    objetivo={raiz}
                    onClick={() => setObjetivoActivoId(raiz.id)}
                    onEliminar={() => eliminarObjetivoMutation.mutate(raiz.id)}
                    puedeEliminar={puedeEliminar}
                  />
                </div>
                {hijos.length > 0 && (
                  <div className="ml-4 border-l-2 border-gray-100 pl-4 sm:ml-6 sm:pl-6">
                    <p className="mb-2 flex items-center gap-1 text-[11px] font-semibold text-ink-tertiary">
                      <CornerDownRight className="h-3 w-3" /> contribuyen a este objetivo
                    </p>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {hijos.map((hijo) => (
                        <ObjetivoCardCompacta
                          key={hijo.id}
                          objetivo={hijo}
                          onClick={() => setObjetivoActivoId(hijo.id)}
                          onEliminar={() => eliminarObjetivoMutation.mutate(hijo.id)}
                          puedeEliminar={puedeEliminar}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <NuevoObjetivoModal
        isOpen={nuevoObjetivoOpen}
        onClose={() => setNuevoObjetivoOpen(false)}
        periodo={periodo}
        objetivosDisponibles={data || []}
      />
      <ObjetivoDetalleModal
        objetivo={objetivoActivo}
        periodo={periodo}
        onClose={() => setObjetivoActivoId(null)}
        onAgregarKr={setObjetivoParaKr}
        onEditarKr={setKrParaEditar}
        onVerHistorial={setKrParaHistorial}
        onVerMilestones={setKrParaMilestones}
        onVerEvidencias={setKrParaEvidencias}
        onEliminarKr={(id) => eliminarKrMutation.mutate(id)}
        puedeEditar={puedeEditar}
        puedeEliminar={puedeEliminar}
        puedeCheckin={puedeCheckin}
        puedeCrear={puedeCrear}
        puedeComentar={puedeComentar}
      />
      <NuevoResultadoClaveModal
        isOpen={objetivoParaKr !== null}
        onClose={() => setObjetivoParaKr(null)}
        objetivoId={objetivoParaKr}
        periodo={periodo}
      />
      <EditarValorKrModal
        isOpen={krParaEditar !== null}
        onClose={() => setKrParaEditar(null)}
        kr={krParaEditar}
        periodo={periodo}
      />
      <KrCheckinsModal
        isOpen={krParaHistorial !== null}
        onClose={() => setKrParaHistorial(null)}
        kr={krParaHistorial}
      />
      <MilestonesModal
        isOpen={krParaMilestones !== null}
        onClose={() => setKrParaMilestones(null)}
        kr={krParaMilestones}
        periodo={periodo}
      />
      <EvidenciasModal
        isOpen={krParaEvidencias !== null}
        onClose={() => setKrParaEvidencias(null)}
        kr={krParaEvidencias}
        periodo={periodo}
        puedeSubir={puedeCheckin}
      />
    </div>
  )
}
