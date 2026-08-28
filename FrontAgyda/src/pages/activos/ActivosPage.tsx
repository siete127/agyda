import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Boxes, Laptop, Cpu, Monitor, Keyboard, Mouse,
  Search, RefreshCw, Plus, Edit2, Trash2, User2,
  LayoutGrid, PieChart, CheckCircle2, UserCheck, Wrench, XCircle,
  Calendar, Hash, Tag, ShieldCheck, ShieldAlert, Server,
  Armchair, Router, Network, ScreenShare, MousePointer2, MonitorSmartphone,
  Layers, Upload,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

type ActivoTipo = 'laptop' | 'cpu' | 'monitor' | 'teclado' | 'mouse'
type ActivoEstado = 'disponible' | 'asignado' | 'reparacion' | 'baja'

interface Activo {
  id: number
  tipo: ActivoTipo
  marca: string
  modelo: string
  numeroSerie: string
  estado: ActivoEstado
  asignadoA: number | null
  asignadoNombre: string | null
  fechaAsignacion: string | null
  fechaRegistro: string
  terminosAceptados: boolean
  fechaAceptacion: string | null
}

interface UsuarioOpcion {
  id: number
  nombre: string
}

const TIPOS: { value: ActivoTipo; label: string; icon: typeof Laptop }[] = [
  { value: 'laptop', label: 'Laptops', icon: Laptop },
  { value: 'cpu', label: 'CPU', icon: Cpu },
  { value: 'monitor', label: 'Monitores', icon: Monitor },
  { value: 'teclado', label: 'Teclados', icon: Keyboard },
  { value: 'mouse', label: 'Mouse', icon: Mouse },
]

const ESTADO_LABEL: Record<ActivoEstado, string> = {
  disponible: 'Disponible',
  asignado: 'Asignado',
  reparacion: 'En reparación',
  baja: 'Baja',
}

const ESTADO_COLOR: Record<ActivoEstado, string> = {
  disponible: 'bg-emerald-100 text-emerald-700',
  asignado: 'bg-blue-100 text-blue-700',
  reparacion: 'bg-amber-100 text-amber-700',
  baja: 'bg-gray-100 text-gray-500',
}

/* Paleta de estado validada (contraste ≥3:1, CVD ΔE≥23) — misma familia que ProyectosDashboard */
const ESTADO_HEX: Record<ActivoEstado, string> = {
  disponible: '#059669',
  asignado: '#2563EB',
  reparacion: '#D97706',
  baja: '#6B7280',
}

const ESTADO_ICON: Record<ActivoEstado, typeof CheckCircle2> = {
  disponible: CheckCircle2,
  asignado: UserCheck,
  reparacion: Wrench,
  baja: XCircle,
}

function parseActivo(r: Record<string, unknown>): Activo {
  return {
    id: Number(r['id'] ?? 0),
    tipo: String(r['tipo'] ?? 'laptop') as ActivoTipo,
    marca: String(r['marca'] ?? ''),
    modelo: String(r['modelo'] ?? ''),
    numeroSerie: String(r['numeroSerie'] ?? ''),
    estado: String(r['estado'] ?? 'disponible') as ActivoEstado,
    asignadoA: r['asignadoA'] != null ? Number(r['asignadoA']) : null,
    asignadoNombre: r['asignadoNombre'] ? String(r['asignadoNombre']) : null,
    fechaAsignacion: r['fechaAsignacion'] ? String(r['fechaAsignacion']) : null,
    fechaRegistro: String(r['fechaRegistro'] ?? ''),
    terminosAceptados: Boolean(r['terminosAceptados']),
    fechaAceptacion: r['fechaAceptacion'] ? String(r['fechaAceptacion']) : null,
  }
}

const EMPTY_FORM = { tipo: 'laptop' as ActivoTipo, marca: '', modelo: '', numeroSerie: '', estado: 'disponible' as ActivoEstado, asignadoA: '' }

/* ── Modal de detalle (solo lectura) ── */
function ActivoDetalleModal({ activo, onClose, onEditar }: { activo: Activo; onClose: () => void; onEditar: () => void }) {
  const tipoInfo = TIPOS.find((t) => t.value === activo.tipo)
  const TipoIcon = tipoInfo?.icon ?? Boxes
  const EstadoIcon = ESTADO_ICON[activo.estado]

  const fmtFecha = (f: string | null) => f
    ? new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : null

  const filas = [
    { icon: Tag, label: 'Tipo', value: tipoInfo?.label.replace(/s$/, '') ?? activo.tipo },
    { icon: Hash, label: 'Número de serie', value: activo.numeroSerie || 'Sin registrar' },
    { icon: User2, label: 'Asignado a', value: activo.asignadoNombre ?? 'Sin asignar' },
    { icon: Calendar, label: 'Fecha de asignación', value: fmtFecha(activo.fechaAsignacion) ?? '—' },
    { icon: Calendar, label: 'Fecha de registro', value: fmtFecha(activo.fechaRegistro) ?? '—' },
    ...(activo.asignadoNombre ? [
      activo.terminosAceptados
        ? { icon: ShieldCheck, label: 'Términos y condiciones', value: `Aceptados${fmtFecha(activo.fechaAceptacion) ? ' el ' + fmtFecha(activo.fechaAceptacion) : ''}` }
        : { icon: ShieldAlert, label: 'Términos y condiciones', value: 'Pendiente de aceptar' },
    ] : []),
  ]

  return (
    <Modal isOpen onClose={onClose} title="Detalle del activo" size="sm">
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-4">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <TipoIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.9rem] font-bold text-gray-900">{activo.marca || 'Sin marca'} {activo.modelo}</p>
            <span className={clsx('mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold', ESTADO_COLOR[activo.estado])}>
              <EstadoIcon className="h-3 w-3" />
              {ESTADO_LABEL[activo.estado]}
            </span>
          </div>
        </div>

        <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
          {filas.map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-center gap-3 px-4 py-2.5">
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
              <span className="text-[0.72rem] font-semibold text-gray-400 w-36 flex-shrink-0">{label}</span>
              <span className="text-[0.82rem] text-gray-700 truncate">{value}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
          <Button onClick={onEditar}><Edit2 className="h-3.5 w-3.5" /> Editar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal crear/editar ── */
function ActivoModal({ activo, tipoDefault, usuarios, onClose }: {
  activo: Activo | null
  tipoDefault: ActivoTipo
  usuarios: UsuarioOpcion[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(activo ? {
    tipo: activo.tipo, marca: activo.marca, modelo: activo.modelo,
    numeroSerie: activo.numeroSerie, estado: activo.estado,
    asignadoA: activo.asignadoA ? String(activo.asignadoA) : '',
  } : { ...EMPTY_FORM, tipo: tipoDefault })

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { ...form, asignadoA: form.asignadoA || null }
      return activo ? api.put(`/activos/${activo.id}`, payload) : api.post('/activos', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos'] })
      toast.success(activo ? 'Activo actualizado' : 'Activo creado')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  return (
    <Modal isOpen onClose={onClose} title={activo ? 'Editar activo' : 'Nuevo activo'} size="md">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as ActivoTipo })}
              className="field"
            >
              {TIPOS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</label>
            <select
              value={form.estado}
              onChange={(e) => setForm({ ...form, estado: e.target.value as ActivoEstado })}
              className="field"
            >
              {(Object.keys(ESTADO_LABEL) as ActivoEstado[]).map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Marca</label>
            <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Modelo</label>
            <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} className="field" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Número de serie</label>
            <input value={form.numeroSerie} onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })} className="field" />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asignado a</label>
            <select
              value={form.asignadoA}
              onChange={(e) => setForm({ ...form, asignadoA: e.target.value })}
              className="field"
            >
              <option value="">Sin asignar</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
            {activo ? 'Guardar cambios' : 'Crear activo'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Stat tile ── */
function StatTile({ estado, total }: { estado: ActivoEstado; total: number }) {
  const Icon = ESTADO_ICON[estado]
  return (
    <div className="card flex items-center gap-3 p-4">
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: ESTADO_HEX[estado] }}>
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{total}</p>
        <p className="text-[0.7rem] text-gray-400 mt-0.5">{ESTADO_LABEL[estado]}</p>
      </div>
    </div>
  )
}

/* ── Barra apilada de estados por tipo de equipo ── */
function BarraPorTipo({ tipo, label, Icon, activos }: { tipo: ActivoTipo; label: string; Icon: typeof Laptop; activos: Activo[] }) {
  const [hoverEstado, setHoverEstado] = useState<ActivoEstado | null>(null)
  const porEstado = activos.filter((a) => a.tipo === tipo)
  const total = porEstado.length
  const estados: ActivoEstado[] = ['disponible', 'asignado', 'reparacion', 'baja']
  const conteos = estados.map((e) => porEstado.filter((a) => a.estado === e).length)

  return (
    <div className="flex items-center gap-3">
      <div className="flex w-28 flex-shrink-0 items-center gap-2 text-[0.78rem] font-semibold text-gray-600">
        <Icon className="h-3.5 w-3.5 text-gray-400" />
        {label}
      </div>
      {total === 0 ? (
        <div className="h-6 flex-1 rounded-full bg-gray-50 flex items-center px-3">
          <span className="text-[0.68rem] text-gray-300">Sin equipos</span>
        </div>
      ) : (
        <div className="flex h-6 flex-1 overflow-hidden rounded-full bg-gray-100">
          {estados.map((e, i) => {
            const c = conteos[i]
            if (c === 0) return null
            const pct = (c / total) * 100
            return (
              <div
                key={e}
                onMouseEnter={() => setHoverEstado(e)}
                onMouseLeave={() => setHoverEstado(null)}
                style={{ width: `${pct}%`, background: ESTADO_HEX[e] }}
                className="relative h-full transition-opacity first:rounded-l-full last:rounded-r-full"
              >
                {hoverEstado === e && (
                  <div className="absolute left-1/2 -top-8 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1 text-[0.65rem] text-white shadow-lg">
                    {ESTADO_LABEL[e]}: {c}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      <span className="w-8 flex-shrink-0 text-right text-[0.72rem] font-semibold text-gray-400 tabular-nums">{total}</span>
    </div>
  )
}

/* ── Tarjeta de aceptación de términos y condiciones ── */
function TerminosCard({ activos }: { activos: Activo[] }) {
  const [hover, setHover] = useState<'aceptado' | 'pendiente' | null>(null)
  const asignados = useMemo(() => activos.filter((a) => a.asignadoNombre), [activos])
  const aceptados = useMemo(() => asignados.filter((a) => a.terminosAceptados), [asignados])
  const pendientes = useMemo(() => asignados.filter((a) => !a.terminosAceptados), [asignados])
  const total = asignados.length || 1

  const fmtFecha = (f: string | null) => f
    ? new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-[0.8rem] font-bold text-gray-700">Aceptación de términos y condiciones</h3>
        <div className="flex items-center gap-3 text-[0.68rem] text-gray-400">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" />Aceptados</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" />Pendientes</span>
        </div>
      </div>

      {asignados.length === 0 ? (
        <p className="py-10 text-center text-[0.8rem] text-gray-400">Sin equipos asignados</p>
      ) : (
        <>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 mb-2">
            <div
              onMouseEnter={() => setHover('aceptado')}
              onMouseLeave={() => setHover(null)}
              style={{ width: `${(aceptados.length / total) * 100}%`, background: '#059669' }}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            />
            <div
              onMouseEnter={() => setHover('pendiente')}
              onMouseLeave={() => setHover(null)}
              style={{ width: `${(pendientes.length / total) * 100}%`, background: '#D97706' }}
              className="h-full transition-opacity first:rounded-l-full last:rounded-r-full"
            />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1 mb-4">
            <span className={clsx('text-[0.72rem] transition-opacity', hover && hover !== 'aceptado' && 'opacity-40')}>
              <span className="font-bold text-gray-800 tabular-nums">{aceptados.length}</span> <span className="text-gray-500">aceptados</span>
            </span>
            <span className={clsx('text-[0.72rem] transition-opacity', hover && hover !== 'pendiente' && 'opacity-40')}>
              <span className="font-bold text-gray-800 tabular-nums">{pendientes.length}</span> <span className="text-gray-500">pendientes</span>
            </span>
          </div>

          {pendientes.length > 0 && (
            <div className="mb-3">
              <p className="text-[0.68rem] font-semibold text-amber-600 uppercase tracking-wide mb-1.5">Pendientes de aceptar</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                {pendientes.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[0.78rem] text-gray-700 truncate">
                      <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-amber-500" />
                      {a.asignadoNombre}
                    </span>
                    <span className="text-[0.7rem] text-gray-400 flex-shrink-0 truncate">
                      {TIPOS.find((t) => t.value === a.tipo)?.label.replace(/s$/, '')} {a.marca} {a.modelo}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {aceptados.length > 0 && (
            <div>
              <p className="text-[0.68rem] font-semibold text-emerald-600 uppercase tracking-wide mb-1.5">Ya aceptaron</p>
              <div className="divide-y divide-gray-100 rounded-xl border border-gray-100">
                {aceptados.map((a) => (
                  <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-1.5 text-[0.78rem] text-gray-700 truncate">
                      <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />
                      {a.asignadoNombre}
                    </span>
                    <span className="text-[0.7rem] text-gray-400 flex-shrink-0">
                      {fmtFecha(a.fechaAceptacion) ?? '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ── Dashboard ── */
function ActivosDashboard() {
  const { data: equipos = [], isLoading } = useQuery<ActivoGeneral[]>({
    queryKey: ['activos-generales'],
    queryFn: async () => {
      const { data } = await api.get('/activos/generales')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return list as ActivoGeneral[]
    },
    staleTime: 60_000,
  })

  const total = equipos.length
  const activos = equipos.filter((e) => /activo/i.test(e.estado)).length
  const inactivos = equipos.filter((e) => /inactivo/i.test(e.estado)).length

  const porDepto = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of equipos) {
      const d = e.departamento || 'Sin depto'
      map.set(d, (map.get(d) ?? 0) + 1)
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1])
  }, [equipos])

  if (isLoading) return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="card p-4 animate-pulse"><div className="h-8 rounded-xl bg-gray-100" /></div>
      ))}
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Tiles resumen */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10 text-brand">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{total}</p>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">Total equipos</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{activos}</p>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">Activos</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gray-100 text-gray-500">
            <XCircle className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{inactivos}</p>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">Inactivos</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-purple-100 text-purple-600">
            <Boxes className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xl font-bold text-gray-900 leading-none tabular-nums">{porDepto.length}</p>
            <p className="text-[0.7rem] text-gray-400 mt-0.5">Departamentos</p>
          </div>
        </div>
      </div>

      {/* Distribución por departamento */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[0.8rem] font-bold text-gray-700">Equipos por departamento</h3>
          <span className="text-[0.72rem] text-gray-400">{total} equipos en total</span>
        </div>
        {total === 0 ? (
          <p className="py-10 text-center text-[0.8rem] text-gray-400">Sin equipos registrados</p>
        ) : (
          <div className="space-y-3">
            {porDepto.map(([depto, count]) => {
              const pct = Math.round((count / total) * 100)
              const cfg = DEPTO_COLOR[depto] ?? 'bg-gray-100 text-gray-600'
              const barColor: Record<string, string> = {
                'TI': '#7C3AED', 'ADMIN': '#2563EB', 'CALL (A)': '#EA580C',
                'CALL (B)': '#D97706', 'CPU': '#6B7280', 'HP': '#0284C7', 'MONITOR': '#0D9488',
              }
              return (
                <div key={depto} className="flex items-center gap-3">
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold w-24 text-center flex-shrink-0', cfg)}>{depto}</span>
                  <div className="flex-1 h-5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, background: barColor[depto] ?? '#6B7280' }}
                    />
                  </div>
                  <span className="w-8 text-right text-[0.72rem] font-semibold text-gray-500 tabular-nums flex-shrink-0">{count}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Modal crear/editar activo general ── */
const EMPTY_FORM_GENERAL = {
  departamento: '',
  nombreEquipo: '',
  marca: '',
  modelo: '',
  numeroSerie: '',
  sistemaOperativo: '',
  ubicacion: '',
  estado: 'Activo',
  monitor1: '',
  monitor2: '',
  caracteristicas: '',
  accesorios: '',
  diademas: '',
  usuarioExcel: '',
  asignadoA: '',
}

function ActivoGeneralModal({ equipo, usuarios, onClose }: {
  equipo: ActivoGeneral | null
  usuarios: UsuarioOpcion[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState(equipo ? {
    departamento: equipo.departamento ?? '',
    nombreEquipo: equipo.nombreEquipo ?? '',
    marca: equipo.marca ?? '',
    modelo: equipo.modelo ?? '',
    numeroSerie: equipo.numeroSerie ?? '',
    sistemaOperativo: equipo.sistemaOperativo ?? '',
    ubicacion: equipo.ubicacion ?? '',
    estado: equipo.estado ?? 'Activo',
    monitor1: equipo.monitor1 ?? '',
    monitor2: equipo.monitor2 ?? '',
    caracteristicas: equipo.caracteristicas ?? '',
    accesorios: equipo.accesorios ?? '',
    diademas: equipo.diademas ?? '',
    usuarioExcel: equipo.usuarioExcel ?? '',
    asignadoA: equipo.asignadoA != null ? String(equipo.asignadoA) : '',
  } : { ...EMPTY_FORM_GENERAL })

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const guardar = useMutation({
    mutationFn: () => {
      const payload = { ...form, asignadoA: form.asignadoA || null }
      return equipo
        ? api.put(`/activos/generales/${equipo.id}`, payload)
        : api.post('/activos/generales', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos-generales'] })
      toast.success(equipo ? 'Equipo actualizado' : 'Equipo creado')
      onClose()
    },
    onError: (e: unknown) => toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const label = (txt: string) => (
    <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{txt}</label>
  )

  return (
    <Modal isOpen onClose={onClose} title={equipo ? 'Editar equipo' : 'Nuevo equipo'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">

        {/* Fila 1: Departamento + Estado */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Departamento')}
            <select value={form.departamento} onChange={(e) => set('departamento', e.target.value)} className="field">
              <option value="">— Seleccionar —</option>
              {['TI', 'ADMIN', 'CALL (A)', 'CALL (B)', 'CPU', 'HP', 'MONITOR'].map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
          <div>
            {label('Estado')}
            <select value={form.estado} onChange={(e) => set('estado', e.target.value)} className="field">
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Fila 2: Equipo + N° Serie */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Nombre de equipo')}
            <input value={form.nombreEquipo} onChange={(e) => set('nombreEquipo', e.target.value)} className="field" placeholder="ej. DESKTOP-XYZ01" />
          </div>
          <div>
            {label('Número de serie')}
            <input value={form.numeroSerie} onChange={(e) => set('numeroSerie', e.target.value)} className="field" placeholder="ej. 5J75JK2" />
          </div>
        </div>

        {/* Fila 3: Marca + Modelo */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Marca')}
            <input value={form.marca} onChange={(e) => set('marca', e.target.value)} className="field" placeholder="ej. DELL" />
          </div>
          <div>
            {label('Modelo')}
            <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className="field" placeholder="ej. OptiPlex 5070" />
          </div>
        </div>

        {/* Fila 4: SO + Ubicación */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Sistema operativo')}
            <input value={form.sistemaOperativo} onChange={(e) => set('sistemaOperativo', e.target.value)} className="field" placeholder="ej. Windows 11 Pro" />
          </div>
          <div>
            {label('Ubicación')}
            <input value={form.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} className="field" placeholder="ej. Escritorio, Mampara 3" />
          </div>
        </div>

        {/* Fila 5: Monitor 1 + Monitor 2 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Monitor 1')}
            <input value={form.monitor1} onChange={(e) => set('monitor1', e.target.value)} className="field" placeholder="ej. LG, DELL, N/D" />
          </div>
          <div>
            {label('Monitor 2')}
            <input value={form.monitor2} onChange={(e) => set('monitor2', e.target.value)} className="field" placeholder="ej. LG (si aplica)" />
          </div>
        </div>

        {/* Fila 6: Diadema + Accesorios */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Diadema')}
            <input value={form.diademas} onChange={(e) => set('diademas', e.target.value)} className="field" placeholder="ej. STEREN AZUL, N/A" />
          </div>
          <div>
            {label('Accesorios')}
            <input value={form.accesorios} onChange={(e) => set('accesorios', e.target.value)} className="field" placeholder="ej. Teclado, Mouse" />
          </div>
        </div>

        {/* Fila 7: Características (ancho completo) */}
        <div>
          {label('Características')}
          <input value={form.caracteristicas} onChange={(e) => set('caracteristicas', e.target.value)} className="field" placeholder="ej. Core i5, 8GB RAM, 256GB SSD" />
        </div>

        {/* Fila 8: Usuario Excel + Asignado a (sistema) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            {label('Usuario / Asignación')}
            <input value={form.usuarioExcel} onChange={(e) => set('usuarioExcel', e.target.value)} className="field" placeholder="ej. María Elena, AT&T" />
          </div>
          <div>
            {label('Asignado a (usuario del sistema)')}
            <select value={form.asignadoA} onChange={(e) => set('asignadoA', e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>

      </div>

      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
          {equipo ? 'Guardar cambios' : 'Crear equipo'}
        </Button>
      </div>
    </Modal>
  )
}

/* ── Inventario General (ACTIVOS_GENERALES) ── */
interface ActivoGeneral {
  id: number
  departamento: string
  usuarioExcel: string
  nombreEquipo: string
  marca: string
  modelo: string
  numeroSerie: string
  sistemaOperativo: string
  ubicacion: string
  estado: string
  monitor1: string
  monitor2: string
  caracteristicas: string
  accesorios: string
  diademas: string
  asignadoA: number | null
  asignadoNombre: string | null
  fechaRegistro: string
}

const ESTADO_INVENTARIO: Record<string, { bg: string; text: string }> = {
  activo:    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  Activo:    { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  inactivo:  { bg: 'bg-gray-100',    text: 'text-gray-500' },
  Inactivo:  { bg: 'bg-gray-100',    text: 'text-gray-500' },
}

const DEPTO_COLOR: Record<string, string> = {
  'TI':       'bg-purple-100 text-purple-700',
  'ADMIN':    'bg-blue-100 text-blue-700',
  'CALL (A)': 'bg-orange-100 text-orange-700',
  'CALL (B)': 'bg-amber-100 text-amber-700',
  'CPU':      'bg-gray-100 text-gray-600',
  'HP':       'bg-sky-100 text-sky-700',
  'MONITOR':  'bg-teal-100 text-teal-700',
}

/* ── Importar inventario desde Excel (encabezados en la primera fila) ── */
function ImportarExcelButton({ onDone }: { onDone: () => void }) {
  const [inputKey, setInputKey] = useState(0)

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('archivo', file)
      const { data } = await api.post('/activos/generales/importar', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      toast.success(data?.message || 'Importación completada')
      if (data?.data?.errores?.length) {
        console.warn('Errores en la importación de activos:', data.data.errores)
        toast.error(`${data.data.errores.length} fila(s) con error — revisa la consola`)
      }
      onDone()
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg || 'Error al importar el archivo')
    },
    onSettled: () => setInputKey((k) => k + 1),
  })

  return (
    <label className={clsx(
      'flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors cursor-pointer',
      mut.isPending && 'opacity-60 pointer-events-none',
    )}>
      <Upload className="h-3.5 w-3.5" /> {mut.isPending ? 'Importando...' : 'Importar Excel'}
      <input
        key={inputKey}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) mut.mutate(file)
        }}
      />
    </label>
  )
}

function InventarioGeneralView({ usuarios }: { usuarios: UsuarioOpcion[] }) {
  const [search, setSearch] = useState('')
  const [filtroDpto, setFiltroDpto] = useState('')
  const [modalGeneral, setModalGeneral] = useState(false)
  const [editandoGeneral, setEditandoGeneral] = useState<ActivoGeneral | null>(null)

  const { data: equipos = [], isLoading, refetch, isRefetching } = useQuery<ActivoGeneral[]>({
    queryKey: ['activos-generales'],
    queryFn: async () => {
      const { data } = await api.get('/activos/generales')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return list as ActivoGeneral[]
    },
    staleTime: 60_000,
  })

  const deptos = useMemo(() => Array.from(new Set(equipos.map((e) => e.departamento).filter(Boolean))).sort(), [equipos])

  const filtrados = useMemo(() => equipos.filter((e) => {
    const texto = `${e.nombreEquipo ?? ''} ${e.marca ?? ''} ${e.modelo ?? ''} ${e.numeroSerie ?? ''} ${e.usuarioExcel ?? ''} ${e.ubicacion ?? ''} ${e.caracteristicas ?? ''}`.toLowerCase()
    const matchSearch = !search || texto.includes(search.toLowerCase())
    const matchDpto = !filtroDpto || e.departamento === filtroDpto
    return matchSearch && matchDpto
  }), [equipos, search, filtroDpto])

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por equipo, serie, usuario, ubicación..."
            className="field py-2 pl-9 text-sm"
          />
        </div>
        <select
          value={filtroDpto}
          onChange={(e) => setFiltroDpto(e.target.value)}
          className="field py-2 text-sm min-w-40"
        >
          <option value="">Todos los departamentos</option>
          {deptos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={() => refetch()}
          className={clsx('flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors', isRefetching && 'animate-spin')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <span className="text-[0.72rem] text-gray-400">{filtrados.length} equipos</span>
        <div className="ml-auto flex items-center gap-2">
          <ImportarExcelButton onDone={() => refetch()} />
          <Button onClick={() => { setEditandoGeneral(null); setModalGeneral(true) }} className="text-[0.78rem] py-1.5 px-3">
            <Plus className="h-3.5 w-3.5" /> Nuevo equipo
          </Button>
        </div>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Equipo</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Marca / Modelo</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">N° Serie</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Depto</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Usuario / Ubicación</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">SO</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Monitor</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Diadema</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 rounded-full bg-gray-100" /></td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-16 text-center text-gray-400 text-sm">
                    {search || filtroDpto ? 'Sin resultados para este filtro' : 'Sin equipos registrados'}
                  </td>
                </tr>
              ) : filtrados.map((e) => {
                const estadoCfg = ESTADO_INVENTARIO[e.estado] ?? { bg: 'bg-gray-100', text: 'text-gray-500' }
                const deptoCfg = DEPTO_COLOR[e.departamento] ?? 'bg-gray-100 text-gray-600'
                return (
                  <tr key={e.id} onClick={() => { setEditandoGeneral(e); setModalGeneral(true) }} className="hover:bg-gray-50/60 transition-colors cursor-pointer">
                    <td className="px-4 py-3">
                      <p className="font-mono text-[0.78rem] font-semibold text-gray-800">{e.nombreEquipo || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-medium text-gray-700">{e.marca || '—'}</p>
                      <p className="text-[0.72rem] text-gray-400">{e.modelo || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{e.numeroSerie || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', deptoCfg)}>
                        {e.departamento || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.78rem] text-gray-700">{e.usuarioExcel || '—'}</p>
                      {e.ubicacion && <p className="text-[0.7rem] text-gray-400">{e.ubicacion}</p>}
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-500 max-w-[140px]">
                      <span className="truncate block" title={e.sistemaOperativo}>{e.sistemaOperativo || '—'}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', estadoCfg.bg, estadoCfg.text)}>
                        {e.estado || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-500">{e.monitor1 || '—'}</td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-500">{e.diademas || '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modalGeneral && (
        <ActivoGeneralModal
          equipo={editandoGeneral}
          usuarios={usuarios}
          onClose={() => { setModalGeneral(false); setEditandoGeneral(null) }}
        />
      )}
    </div>
  )
}

/* ── Mobiliario ── */
type MobCategoriaFija = 'pantalla' | 'monitor' | 'mouse' | 'teclado' | 'router' | 'switch' | 'escritorio' | 'silla' | 'base_lap' | 'laptop' | 'diadema' | 'otro'
// Las categorías custom creadas por el usuario llegan como string libre desde el backend
type MobCategoria = MobCategoriaFija | (string & {})
type MobEstado = 'disponible' | 'asignado' | 'reparacion' | 'baja'

type MobPropietario = 'ROSA' | 'ARDABYTEC' | 'MIXTO'

interface ActivoMobiliario {
  id: number
  categoria: MobCategoria
  marca: string
  modelo: string
  numeroSerie: string
  color: string
  ubicacion: string
  departamento: string
  estado: MobEstado
  asignadoA: number | null
  asignadoNombre: string | null
  notas: string
  cantidad: number
  valor: number | null
  proveedor: string
  fechaCompra: string
  propietario: MobPropietario | ''
  fechaRegistro: string
}

const MOB_PROPIETARIO_LABEL: Record<MobPropietario, string> = {
  ROSA: 'Rosa',
  ARDABYTEC: 'ArdabyTec',
  MIXTO: 'Mixto',
}

const MOB_CATEGORIAS: { value: MobCategoriaFija; label: string; icon: typeof Boxes }[] = [
  { value: 'pantalla',   label: 'Pantallas',      icon: ScreenShare },
  { value: 'monitor',    label: 'Monitores',       icon: Monitor },
  { value: 'mouse',      label: 'Mouse',           icon: MousePointer2 },
  { value: 'teclado',    label: 'Teclados',        icon: Keyboard },
  { value: 'router',     label: 'Routers',         icon: Router },
  { value: 'switch',     label: 'Switch',          icon: Network },
  { value: 'escritorio', label: 'Escritorios',     icon: MonitorSmartphone },
  { value: 'silla',      label: 'Sillas',          icon: Armchair },
  { value: 'base_lap',   label: 'Bases laptop',    icon: Laptop },
  { value: 'laptop',     label: 'Laptops',         icon: Laptop },
  { value: 'diadema',    label: 'Diademas',        icon: Layers },
  { value: 'otro',       label: 'Otros',           icon: Boxes },
]

const MOB_ESTADO_LABEL: Record<MobEstado, string> = {
  disponible: 'Disponible',
  asignado:   'Asignado',
  reparacion: 'Reparación',
  baja:       'Baja',
}

const MOB_ESTADO_COLOR: Record<MobEstado, string> = {
  disponible: 'bg-emerald-100 text-emerald-700',
  asignado:   'bg-blue-100 text-blue-700',
  reparacion: 'bg-amber-100 text-amber-700',
  baja:       'bg-gray-100 text-gray-500',
}

const MOB_CAT_COLOR: Record<MobCategoriaFija, string> = {
  pantalla:   'bg-sky-100 text-sky-700',
  monitor:    'bg-teal-100 text-teal-700',
  mouse:      'bg-violet-100 text-violet-700',
  teclado:    'bg-purple-100 text-purple-700',
  router:     'bg-orange-100 text-orange-700',
  switch:     'bg-amber-100 text-amber-700',
  escritorio: 'bg-blue-100 text-blue-700',
  silla:      'bg-rose-100 text-rose-700',
  base_lap:   'bg-indigo-100 text-indigo-700',
  laptop:     'bg-brand/10 text-brand',
  diadema:    'bg-green-100 text-green-700',
  otro:       'bg-gray-100 text-gray-600',
}

interface MobFormState {
  categoria: MobCategoria
  marca: string
  modelo: string
  numeroSerie: string
  color: string
  ubicacion: string
  departamento: string
  estado: MobEstado
  asignadoA: string
  notas: string
  cantidad: string
  valor: string
  proveedor: string
  fechaCompra: string
  propietario: MobPropietario | ''
}

const EMPTY_MOB_FORM: MobFormState = {
  categoria:    'otro',
  marca:        '',
  modelo:       '',
  numeroSerie:  '',
  color:        '',
  ubicacion:    '',
  departamento: '',
  estado:       'disponible',
  asignadoA:    '',
  notas:        '',
  cantidad:     '1',
  valor:        '',
  proveedor:    '',
  fechaCompra:  '',
  propietario:  '',
}

function parseMob(r: Record<string, unknown>): ActivoMobiliario {
  return {
    id:             Number(r['id'] ?? 0),
    categoria:      String(r['categoria'] ?? 'otro') as MobCategoria,
    marca:          String(r['marca'] ?? ''),
    modelo:         String(r['modelo'] ?? ''),
    numeroSerie:    String(r['numeroSerie'] ?? ''),
    color:          String(r['color'] ?? ''),
    ubicacion:      String(r['ubicacion'] ?? ''),
    departamento:   String(r['departamento'] ?? ''),
    estado:         String(r['estado'] ?? 'disponible') as MobEstado,
    asignadoA:      r['asignadoA'] != null ? Number(r['asignadoA']) : null,
    asignadoNombre: r['asignadoNombre'] ? String(r['asignadoNombre']) : null,
    notas:          String(r['notas'] ?? ''),
    cantidad:       Number(r['cantidad'] ?? 1),
    valor:          r['valor'] != null ? Number(r['valor']) : null,
    proveedor:      String(r['proveedor'] ?? ''),
    fechaCompra:    String(r['fechaCompra'] ?? ''),
    propietario:    (r['propietario'] ? String(r['propietario']) : '') as MobPropietario | '',
    fechaRegistro:  String(r['fechaRegistro'] ?? ''),
  }
}

function MobModal({ item, usuarios, onClose }: {
  item: ActivoMobiliario | null
  usuarios: UsuarioOpcion[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [form, setForm] = useState<MobFormState>(item ? {
    categoria:    item.categoria,
    marca:        item.marca,
    modelo:       item.modelo,
    numeroSerie:  item.numeroSerie,
    color:        item.color,
    ubicacion:    item.ubicacion,
    departamento: item.departamento,
    estado:       item.estado,
    asignadoA:    item.asignadoA ? String(item.asignadoA) : '',
    notas:        item.notas,
    cantidad:     String(item.cantidad || 1),
    valor:        item.valor != null ? String(item.valor) : '',
    proveedor:    item.proveedor,
    fechaCompra:  item.fechaCompra,
    propietario:  item.propietario,
  } : { ...EMPTY_MOB_FORM })

  const set = <K extends keyof MobFormState>(k: K, v: MobFormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const { data: categoriasCustom = [] } = useQuery({
    queryKey: ['activos-mob-categorias'],
    queryFn: async () => {
      const { data } = await api.get('/activos/mobiliario/categorias')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => ({ value: String(r['value']), label: String(r['label']) }))
    },
  })

  const { data: departamentosCustom = [] } = useQuery({
    queryKey: ['activos-mob-departamentos'],
    queryFn: async () => {
      const { data } = await api.get('/activos/mobiliario/departamentos')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map((r) => String(r['nombre']))
    },
  })

  const DEPARTAMENTOS_BASE = ['TI', 'ADMIN', 'CALL (A)', 'CALL (B)', 'CPU', 'HP', 'MONITOR', 'General']
  const departamentosDisponibles = Array.from(new Set([...DEPARTAMENTOS_BASE, ...departamentosCustom]))

  const [nuevaCategoria, setNuevaCategoria] = useState<string | null>(null)
  const [nuevoDepartamento, setNuevoDepartamento] = useState<string | null>(null)

  const crearCategoria = useMutation({
    mutationFn: (label: string) => api.post('/activos/mobiliario/categorias', { label }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['activos-mob-categorias'] })
      const nueva = res.data?.data
      if (nueva?.value) set('categoria', nueva.value)
      setNuevaCategoria(null)
      toast.success('Categoría creada')
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear categoría'),
  })

  const crearDepartamento = useMutation({
    mutationFn: (nombre: string) => api.post('/activos/mobiliario/departamentos', { nombre }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['activos-mob-departamentos'] })
      const nuevo = res.data?.data
      if (nuevo?.nombre) set('departamento', nuevo.nombre)
      setNuevoDepartamento(null)
      toast.success('Departamento creado')
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear departamento'),
  })

  const guardar = useMutation({
    mutationFn: () => {
      const payload = {
        ...form,
        asignadoA: form.asignadoA || null,
        cantidad: form.cantidad ? Number(form.cantidad) : 1,
        valor: form.valor ? Number(form.valor) : null,
        propietario: form.propietario || null,
      }
      return item
        ? api.put(`/activos/mobiliario/${item.id}`, payload)
        : api.post('/activos/mobiliario', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos-mobiliario'] })
      toast.success(item ? 'Activo actualizado' : 'Activo creado')
      onClose()
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al guardar'),
  })

  const lbl = (t: string) => (
    <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{t}</label>
  )

  return (
    <Modal isOpen onClose={onClose} title={item ? 'Editar mobiliario' : 'Nuevo activo'} size="lg">
      <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div>
            {lbl('Categoría')}
            {nuevaCategoria === null ? (
              <select
                value={form.categoria}
                onChange={(e) => {
                  if (e.target.value === '__nueva__') { setNuevaCategoria(''); return }
                  set('categoria', e.target.value as MobCategoria)
                }}
                className="field"
              >
                {MOB_CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                {categoriasCustom.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                <option value="__nueva__">+ Nueva categoría…</option>
              </select>
            ) : (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={nuevaCategoria}
                  onChange={(e) => setNuevaCategoria(e.target.value)}
                  placeholder="Nombre de la categoría"
                  className="field"
                  onKeyDown={(e) => { if (e.key === 'Enter' && nuevaCategoria.trim()) crearCategoria.mutate(nuevaCategoria.trim()) }}
                />
                <Button size="sm" isLoading={crearCategoria.isPending} disabled={!nuevaCategoria.trim()} onClick={() => crearCategoria.mutate(nuevaCategoria.trim())}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNuevaCategoria(null)}>Cancelar</Button>
              </div>
            )}
          </div>
          <div>
            {lbl('Estado')}
            <select value={form.estado} onChange={(e) => set('estado', e.target.value as MobEstado)} className="field">
              {(Object.keys(MOB_ESTADO_LABEL) as MobEstado[]).map((s) => (
                <option key={s} value={s}>{MOB_ESTADO_LABEL[s]}</option>
              ))}
            </select>
          </div>
          <div>
            {lbl('Marca')}
            <input value={form.marca} onChange={(e) => set('marca', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Modelo')}
            <input value={form.modelo} onChange={(e) => set('modelo', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Número de serie')}
            <input value={form.numeroSerie} onChange={(e) => set('numeroSerie', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Color')}
            <input value={form.color} onChange={(e) => set('color', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Ubicación')}
            <input value={form.ubicacion} onChange={(e) => set('ubicacion', e.target.value)} className="field" placeholder="ej. Mampara 3, Sala de juntas" />
          </div>
          <div>
            {lbl('Departamento')}
            {nuevoDepartamento === null ? (
              <select
                value={form.departamento}
                onChange={(e) => {
                  if (e.target.value === '__nuevo__') { setNuevoDepartamento(''); return }
                  set('departamento', e.target.value)
                }}
                className="field"
              >
                <option value="">— Seleccionar —</option>
                {departamentosDisponibles.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
                <option value="__nuevo__">+ Nuevo departamento…</option>
              </select>
            ) : (
              <div className="flex gap-1.5">
                <input
                  autoFocus
                  value={nuevoDepartamento}
                  onChange={(e) => setNuevoDepartamento(e.target.value)}
                  placeholder="Nombre del departamento"
                  className="field"
                  onKeyDown={(e) => { if (e.key === 'Enter' && nuevoDepartamento.trim()) crearDepartamento.mutate(nuevoDepartamento.trim()) }}
                />
                <Button size="sm" isLoading={crearDepartamento.isPending} disabled={!nuevoDepartamento.trim()} onClick={() => crearDepartamento.mutate(nuevoDepartamento.trim())}>
                  Guardar
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setNuevoDepartamento(null)}>Cancelar</Button>
              </div>
            )}
          </div>
          <div>
            {lbl('Cantidad')}
            <input type="number" min={1} value={form.cantidad} onChange={(e) => set('cantidad', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Valor (MXN)')}
            <input type="number" min={0} step="0.01" value={form.valor} onChange={(e) => set('valor', e.target.value)} className="field" />
          </div>
          <div>
            {lbl('Proveedor')}
            <input value={form.proveedor} onChange={(e) => set('proveedor', e.target.value)} className="field" placeholder="ej. Rosa, ArdabyTec" />
          </div>
          <div>
            {lbl('Fecha de compra')}
            <input value={form.fechaCompra} onChange={(e) => set('fechaCompra', e.target.value)} className="field" placeholder="ej. Noviembre 2025" />
          </div>
          <div>
            {lbl('Propietario')}
            <select value={form.propietario} onChange={(e) => set('propietario', e.target.value as MobPropietario | '')} className="field">
              <option value="">— Sin especificar —</option>
              {(Object.keys(MOB_PROPIETARIO_LABEL) as MobPropietario[]).map((p) => (
                <option key={p} value={p}>{MOB_PROPIETARIO_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <div>
            {lbl('Asignado a')}
            <select value={form.asignadoA} onChange={(e) => set('asignadoA', e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            {lbl('Notas')}
            <textarea
              value={form.notas}
              onChange={(e) => set('notas', e.target.value)}
              rows={2}
              className="field resize-none"
              placeholder="Observaciones adicionales..."
            />
          </div>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-gray-100 mt-4">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
          {item ? 'Guardar cambios' : 'Crear activo'}
        </Button>
      </div>
    </Modal>
  )
}

function InventarioMobiliarioView({ usuarios }: { usuarios: UsuarioOpcion[] }) {
  const [search, setSearch]     = useState('')
  const [filtroCateg, setFiltroCateg] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroDpto, setFiltroDpto]   = useState('')
  const [modal, setModal]       = useState(false)
  const [editando, setEditando] = useState<ActivoMobiliario | null>(null)
  const [confirmDel, setConfirmDel] = useState<ActivoMobiliario | null>(null)
  const qc = useQueryClient()

  const { data: items = [], isLoading, refetch, isRefetching } = useQuery<ActivoMobiliario[]>({
    queryKey: ['activos-mobiliario'],
    queryFn: async () => {
      const { data } = await api.get('/activos/mobiliario')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseMob)
    },
    staleTime: 60_000,
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/activos/mobiliario/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['activos-mobiliario'] })
      toast.success('Activo eliminado')
      setConfirmDel(null)
    },
    onError: () => toast.error('Error al eliminar'),
  })

  const conteosCat = useMemo(() => {
    const map = new Map<MobCategoria, number>()
    for (const i of items) map.set(i.categoria, (map.get(i.categoria) ?? 0) + 1)
    return map
  }, [items])

  const deptos = useMemo(() =>
    Array.from(new Set(items.map((i) => i.departamento).filter(Boolean))).sort(), [items])

  const filtrados = useMemo(() => items.filter((i) => {
    const txt = `${i.marca} ${i.modelo} ${i.numeroSerie} ${i.color} ${i.ubicacion} ${i.asignadoNombre ?? ''}`.toLowerCase()
    if (search && !txt.includes(search.toLowerCase())) return false
    if (filtroCateg && i.categoria !== filtroCateg) return false
    if (filtroEstado && i.estado !== filtroEstado) return false
    if (filtroDpto && i.departamento !== filtroDpto) return false
    return true
  }), [items, search, filtroCateg, filtroEstado, filtroDpto])

  return (
    <div className="space-y-4">
      {/* Tarjetas resumen por categoría */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-6">
        {MOB_CATEGORIAS.map(({ value, label, icon: Icon }) => {
          const n = conteosCat.get(value) ?? 0
          const isActive = filtroCateg === value
          return (
            <button
              key={value}
              onClick={() => setFiltroCateg(isActive ? '' : value)}
              className={clsx(
                'card flex items-center gap-2.5 p-3 text-left transition-all hover:ring-2 hover:ring-brand/30',
                isActive && 'ring-2 ring-brand bg-brand/5',
              )}
            >
              <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-[0.75rem]', MOB_CAT_COLOR[value])}>
                <Icon className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-base font-bold text-gray-900 leading-none tabular-nums">{n}</p>
                <p className="text-[0.65rem] text-gray-400 leading-tight mt-0.5 truncate">{label}</p>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por marca, modelo, serie, usuario..."
            className="field py-2 pl-9 text-sm"
          />
        </div>
        <select
          value={filtroCateg}
          onChange={(e) => setFiltroCateg(e.target.value)}
          className="field py-2 text-sm min-w-36"
        >
          <option value="">Todas las categorías</option>
          {MOB_CATEGORIAS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        <select
          value={filtroEstado}
          onChange={(e) => setFiltroEstado(e.target.value)}
          className="field py-2 text-sm min-w-32"
        >
          <option value="">Todos los estados</option>
          {(Object.keys(MOB_ESTADO_LABEL) as MobEstado[]).map((s) => (
            <option key={s} value={s}>{MOB_ESTADO_LABEL[s]}</option>
          ))}
        </select>
        <select
          value={filtroDpto}
          onChange={(e) => setFiltroDpto(e.target.value)}
          className="field py-2 text-sm min-w-36"
        >
          <option value="">Todos los deptos</option>
          {deptos.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <button
          onClick={() => refetch()}
          className={clsx('flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors', isRefetching && 'animate-spin')}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
        <span className="text-[0.72rem] text-gray-400">{filtrados.length} registros</span>
        <Button
          onClick={() => { setEditando(null); setModal(true) }}
          className="ml-auto text-[0.78rem] py-1.5 px-3"
        >
          <Plus className="h-3.5 w-3.5" /> Nuevo activo
        </Button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Categoría</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Marca / Modelo</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">N° Serie</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Color</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Depto / Ubicación</th>
                <th className="px-4 py-2.5 text-center text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Cant.</th>
                <th className="px-4 py-2.5 text-right text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Valor</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Propietario</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Asignado a</th>
                <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 11 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-3 rounded-full bg-gray-100" /></td>
                    ))}
                  </tr>
                ))
              ) : filtrados.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-4 py-16 text-center text-gray-400 text-sm">
                    {search || filtroCateg || filtroEstado || filtroDpto ? 'Sin resultados para este filtro' : 'Sin activos registrados'}
                  </td>
                </tr>
              ) : filtrados.map((item) => {
                const catCfg = MOB_CATEGORIAS.find((c) => c.value === item.categoria)
                const CatIcon = catCfg?.icon ?? Boxes
                return (
                  <tr key={item.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3">
                      <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', MOB_CAT_COLOR[item.categoria as MobCategoriaFija] ?? 'bg-gray-100 text-gray-600')}>
                        <CatIcon className="h-3 w-3" />
                        {catCfg?.label ?? item.categoria}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-medium text-gray-700">{item.marca || '—'}</p>
                      <p className="text-[0.72rem] text-gray-400">{item.modelo || ''}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-[0.75rem] text-gray-500">{item.numeroSerie || '—'}</td>
                    <td className="px-4 py-3 text-[0.72rem] text-gray-500">{item.color || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="text-[0.78rem] text-gray-700">{item.departamento || '—'}</p>
                      {item.ubicacion && <p className="text-[0.7rem] text-gray-400">{item.ubicacion}</p>}
                    </td>
                    <td className="px-4 py-3 text-center text-[0.82rem] font-semibold text-gray-700 tabular-nums">{item.cantidad}</td>
                    <td className="px-4 py-3 text-right text-[0.78rem] text-gray-600 tabular-nums">
                      {item.valor != null ? `$${item.valor.toLocaleString('es-MX')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-[0.75rem] text-gray-500">
                      {item.propietario ? MOB_PROPIETARIO_LABEL[item.propietario] : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-semibold', MOB_ESTADO_COLOR[item.estado])}>
                        {MOB_ESTADO_LABEL[item.estado]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] text-gray-600">{item.asignadoNombre || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 justify-end">
                        <button
                          onClick={() => { setEditando(item); setModal(true) }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDel(item)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <MobModal
          item={editando}
          usuarios={usuarios}
          onClose={() => { setModal(false); setEditando(null) }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmDel !== null}
        onClose={() => setConfirmDel(null)}
        onConfirm={() => { if (confirmDel) eliminar.mutate(confirmDel.id) }}
        title="Eliminar activo"
        message={`¿Eliminar este registro de ${MOB_CATEGORIAS.find((c) => c.value === confirmDel?.categoria)?.label.toLowerCase() ?? 'activo'}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}

/* ── Skeleton ── */
function SkeletonRow() {
  return (
    <tr className="animate-pulse">
      <td className="px-4 py-3"><div className="h-3 w-32 rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-3 w-20 rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-3 w-24 rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-3 w-16 rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3"><div className="h-3 w-28 rounded-full bg-gray-100" /></td>
      <td className="px-4 py-3" />
    </tr>
  )
}

export function ActivosPage() {
  const [vista, setVista] = useState<'dashboard' | 'inventario' | 'mobiliario'>('inventario')
  const [tipo, setTipo] = useState<ActivoTipo>('laptop')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editando, setEditando] = useState<Activo | null>(null)
  const [confirmEliminar, setConfirmEliminar] = useState<Activo | null>(null)
  const [detalle, setDetalle] = useState<Activo | null>(null)
  const qc = useQueryClient()

  const { data: activos = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['activos'],
    queryFn: async () => {
      const { data } = await api.get('/activos')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseActivo)
    },
  })

  const { data: usuarios = [] } = useQuery<UsuarioOpcion[]>({
    queryKey: ['usuarios-para-activos'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({ id: Number(r['id'] ?? 0), nombre: String(r['nombre'] ?? r['nombres'] ?? r['NOMBRES'] ?? ''), activo: Boolean(r['activo'] ?? true) }))
        .filter((u) => u.activo && u.nombre)
        .map((u) => ({ id: u.id, nombre: u.nombre }))
    },
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => api.delete(`/activos/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['activos'] }); toast.success('Activo eliminado') },
    onError: () => toast.error('Error al eliminar'),
  })

  const porTipo = useMemo(() => activos.filter((a) => a.tipo === tipo), [activos, tipo])
  const filtered = useMemo(() => porTipo.filter((a) =>
    `${a.marca} ${a.modelo} ${a.numeroSerie} ${a.asignadoNombre ?? ''}`.toLowerCase().includes(search.toLowerCase())
  ), [porTipo, search])

  const conteosPorTipo = useMemo(() => {
    const map = new Map<ActivoTipo, number>()
    for (const a of activos) map.set(a.tipo, (map.get(a.tipo) ?? 0) + 1)
    return map
  }, [activos])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Banner */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Boxes className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Activos</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {vista === 'mobiliario' ? 'Mobiliario y equipos de oficina' : `${activos.length} equipo${activos.length !== 1 ? 's' : ''} de TI registrados`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Dominio de datos: Equipos TI vs. Mobiliario */}
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
                <button
                  onClick={() => setVista((v) => (v === 'mobiliario' ? 'inventario' : v))}
                  title="Equipos de TI"
                  className={clsx('flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-semibold transition-colors', vista !== 'mobiliario' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}
                >
                  <Server className="h-3.5 w-3.5" /> Equipos TI
                </button>
                <button
                  onClick={() => setVista('mobiliario')}
                  title="Mobiliario y equipos de oficina"
                  className={clsx('flex items-center gap-1.5 rounded-md px-2.5 h-8 text-xs font-semibold transition-colors', vista === 'mobiliario' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}
                >
                  <Armchair className="h-3.5 w-3.5" /> Mobiliario
                </button>
              </div>

              {/* Sub-vista de Equipos TI: Dashboard vs. Listado */}
              {vista !== 'mobiliario' && (
                <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
                  <button
                    onClick={() => setVista('dashboard')}
                    title="Ver dashboard"
                    className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'dashboard' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}
                  >
                    <PieChart className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setVista('inventario')}
                    title="Listado de equipos"
                    className={clsx('flex h-8 w-8 items-center justify-center rounded-md transition-colors', vista === 'inventario' ? 'bg-card text-brand' : 'text-white/70 hover:bg-white/10')}
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </button>
                </div>
              )}

              <button onClick={() => refetch()} className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}>
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {vista === 'inventario' && <InventarioGeneralView usuarios={usuarios} />}
      {vista === 'mobiliario' && <InventarioMobiliarioView usuarios={usuarios} />}
      {vista === 'dashboard'  && <ActivosDashboard />}

      {detalle && (
        <ActivoDetalleModal
          activo={detalle}
          onClose={() => setDetalle(null)}
          onEditar={() => { setEditando(detalle); setShowModal(true); setDetalle(null) }}
        />
      )}

      {showModal && (
        <ActivoModal
          activo={editando}
          tipoDefault={tipo}
          usuarios={usuarios}
          onClose={() => { setShowModal(false); setEditando(null) }}
        />
      )}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminar.mutate(confirmEliminar.id) }}
        title="Eliminar activo"
        message={`¿Seguro que deseas eliminar este ${TIPOS.find((t) => t.value === confirmEliminar?.tipo)?.label.toLowerCase().replace(/s$/, '')}? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        isPending={eliminar.isPending}
      />
    </div>
  )
}
