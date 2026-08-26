import { useState, useEffect } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { getSocket } from '@/lib/socket'
import { Search, RefreshCw, CalendarDays, Users, TrendingDown, CheckCircle2, Clock, CheckCircle, XCircle, UserPlus, UserMinus, ChevronDown, Pencil } from 'lucide-react'
import { clsx } from 'clsx'
import { Modal } from '@/components/ui/Modal'
import toast from 'react-hot-toast'

interface AgenteResumen {
  id: number
  nombre: string
  tipo: string
  tienePool: boolean
  diasUsados: number
  diasRestantes: number
  poolTotal: number
}

interface SolicitudDetalle {
  id: number
  tipoLabel: string
  fechaInicio: string
  fechaFin: string
  dias: number
  estado: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'CANCELADA'
  comentario: string
}

function parseSolicitudDetalle(r: Record<string, unknown>): SolicitudDetalle {
  const s = (keys: string[]) => String(keys.reduce((v, k) => v ?? r[k], undefined as unknown) ?? '')
  const tipo = s(['tipo_solicitud'])
  return {
    id: Number(r['id'] ?? 0),
    tipoLabel: tipo === '0100' ? 'Permiso' : tipo === '0200' ? 'Vacaciones' : tipo.replace(/_/g, ' '),
    fechaInicio: s(['fecha_inicio']),
    fechaFin: s(['fecha_fin']),
    dias: Number(r['dias_solicitados'] ?? 1),
    estado: (s(['estado']) || 'PENDIENTE').toUpperCase() as SolicitudDetalle['estado'],
    comentario: s(['comentario_admin']),
  }
}

const ESTADO_CONFIG: Record<string, { label: string; cls: string; Icon: React.ElementType }> = {
  PENDIENTE: { label: 'Pendiente', cls: 'bg-yellow-100 text-yellow-700', Icon: Clock },
  APROBADA:  { label: 'Aprobada',  cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle },
  RECHAZADA: { label: 'Rechazada', cls: 'bg-red-100 text-red-700', Icon: XCircle },
  CANCELADA: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-500', Icon: XCircle },
}

const MESES_ABREV = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// No usar `new Date(f)` aquí: el backend guarda fechas puras (sin hora) que
// SQL Server/mssql serializan como medianoche UTC ("2026-07-10T00:00:00.000Z").
// `new Date()` las interpreta correctamente, pero toLocaleDateString las
// vuelve a convertir a la zona horaria LOCAL del navegador — en México
// (UTC-6) eso resta horas y hace caer la fecha mostrada un día antes del
// valor real guardado. Se parsea el string directamente en vez de pasar por
// conversión de huso horario.
function formatFecha(f: string) {
  if (!f) return '—'
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(f)
  if (!match) return f
  const [, anio, mes, dia] = match
  const mesIdx = Number(mes) - 1
  if (mesIdx < 0 || mesIdx > 11) return f
  return `${dia} ${MESES_ABREV[mesIdx]} ${anio}`
}

function hoyISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function SolicitudRow({ s, agenteId }: { s: SolicitudDetalle; agenteId: number }) {
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [nuevaFecha, setNuevaFecha] = useState(s.fechaInicio.slice(0, 10))
  const [error, setError] = useState('')

  const cfg = ESTADO_CONFIG[s.estado] ?? ESTADO_CONFIG.PENDIENTE
  const hoy = hoyISO()
  const manana = (() => {
    const [y, m, d] = hoy.split('-').map(Number)
    const dt = new Date(y, m - 1, d + 1)
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
  })()
  const fechaOriginalISO = s.fechaInicio.slice(0, 10)
  const yaOcurrida = fechaOriginalISO <= hoy
  const esEditable = (s.estado === 'PENDIENTE' || s.estado === 'APROBADA') && !yaOcurrida

  const guardarFecha = useMutation({
    mutationFn: async () => {
      await api.patch(`/vacaciones/solicitudes/${s.id}/fecha`, { fechaInicio: nuevaFecha, fechaFin: nuevaFecha })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-solicitudes-detalle', agenteId] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
      toast.success('Fecha actualizada')
      setEditando(false)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'No se pudo actualizar la fecha'
      setError(msg)
    },
  })

  const abrirEdicion = () => {
    if (!esEditable) {
      setError(`No se puede modificar: esta fecha ya es hoy o ya pasó (${formatFecha(s.fechaInicio)}).`)
      return
    }
    setError('')
    setEditando(true)
  }

  if (editando) {
    return (
      <div className="rounded-xl border-2 border-brand/30 bg-brand/5 p-3 space-y-2">
        <p className="text-[0.78rem] font-semibold text-gray-700">Nueva fecha — {s.tipoLabel}</p>
        <input
          type="date"
          value={nuevaFecha}
          min={manana}
          onChange={(e) => { setNuevaFecha(e.target.value); setError('') }}
          className="field text-sm"
        />
        {error && <p className="text-[0.7rem] text-red-500">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={() => { setEditando(false); setError('') }} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100">
            Cancelar
          </button>
          <button
            onClick={() => guardarFecha.mutate()}
            disabled={guardarFecha.isPending || !nuevaFecha || nuevaFecha <= hoy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {guardarFecha.isPending ? 'Guardando...' : 'Guardar'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <button
        onClick={abrirEdicion}
        className="w-full text-left rounded-xl border border-gray-100 p-3 flex items-center justify-between gap-3 hover:border-brand/30 hover:bg-brand/[0.02] transition-colors"
      >
        <div>
          <p className="text-[0.8rem] font-semibold text-gray-800 flex items-center gap-1.5">
            {s.tipoLabel}
            {esEditable && <Pencil className="h-3 w-3 text-gray-300" />}
          </p>
          <p className="text-[0.72rem] text-gray-500">
            {formatFecha(s.fechaInicio)}{s.fechaFin && s.fechaFin !== s.fechaInicio ? ` – ${formatFecha(s.fechaFin)}` : ''}
          </p>
          {s.comentario && <p className="text-[0.68rem] text-gray-400 mt-0.5">{s.comentario}</p>}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={clsx('chip text-[0.62rem] font-semibold flex items-center gap-1', cfg.cls)}>
            <cfg.Icon className="h-3 w-3" />
            {cfg.label}
          </span>
          <span className="text-[0.68rem] text-gray-400">{s.dias} día{s.dias !== 1 ? 's' : ''}</span>
        </div>
      </button>
      {error && !editando && <p className="text-[0.7rem] text-red-500 mt-1 px-1">{error}</p>}
    </div>
  )
}

function DetalleVacacionesModal({ agente, onClose }: { agente: AgenteResumen; onClose: () => void }) {
  const { data, isLoading } = useQuery<{ success: boolean; data: Record<string, unknown>[] }>({
    queryKey: ['vacaciones-solicitudes-detalle', agente.id],
    queryFn: async () => {
      const r = await api.get('/vacaciones/solicitudes', { params: { numeroPersonal: agente.id } })
      return r.data
    },
  })

  const solicitudes = (data?.data ?? [])
    .map(parseSolicitudDetalle)
    .filter(s => s.estado === 'APROBADA' || s.estado === 'PENDIENTE')
    .sort((a, b) => b.fechaInicio.localeCompare(a.fechaInicio))

  return (
    <Modal isOpen onClose={onClose} title={`${agente.nombre} — días tomados`} size="md" variant="corporate">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-[0.78rem] text-gray-500 pb-1">
          <span>{agente.tienePool ? `${agente.diasUsados}/${agente.poolTotal} días usados` : 'Sin pool asignado'}</span>
          <span>{solicitudes.length} registro{solicitudes.length !== 1 ? 's' : ''}</span>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-14 rounded-xl bg-gray-100 animate-pulse" />
            ))}
          </div>
        ) : solicitudes.length === 0 ? (
          <div className="py-10 text-center text-sm text-gray-400">
            Sin vacaciones ni permisos registrados este año
          </div>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {solicitudes.map(s => (
              <SolicitudRow key={s.id} s={s} agenteId={agente.id} />
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}

type FiltroTipo = 'todos' | 'sin-pool'
type OrdenCol = 'nombre' | 'restantes' | 'usados'

const TIPO_LABEL: Record<string, string> = {
  AD: 'Admin',
  CC: 'Call Center',
  TI: 'TI',
  ST: 'Staff',
  VE: 'Ventas',
  CL: 'Cliente',
}

const TIPO_ORDEN = ['AD', 'TI', 'CC', 'ST', 'VE', 'CL']

function BarraDias({ usados, total }: { usados: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((usados / total) * 100)) : 0
  const color =
    pct >= 90 ? 'bg-red-400' :
    pct >= 60 ? 'bg-amber-400' :
    'bg-emerald-400'

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div className={clsx('h-full rounded-full transition-all', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[0.68rem] text-gray-400 tabular-nums w-8 text-right">{pct}%</span>
    </div>
  )
}

function ChipTipo({ tipo }: { tipo: string }) {
  const t = (tipo || '').toUpperCase()
  const colors: Record<string, string> = {
    AD: 'bg-violet-50 text-violet-600',
    TI: 'bg-sky-50 text-sky-600',
    CC: 'bg-amber-50 text-amber-700',
    ST: 'bg-emerald-50 text-emerald-700',
    VE: 'bg-orange-50 text-orange-700',
    CL: 'bg-gray-100 text-gray-500',
  }
  return (
    <span className={clsx('chip text-[0.62rem] font-semibold', colors[t] ?? 'bg-gray-100 text-gray-500')}>
      {TIPO_LABEL[t] ?? t}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr>
      <td className="px-4 py-3"><div className="h-3.5 w-36 rounded-lg bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-5 w-14 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-3.5 w-8 rounded bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-3.5 w-8 rounded bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-2 w-28 rounded-full bg-gray-100 animate-pulse" /></td>
      <td className="px-4 py-3"><div className="h-6 w-20 rounded-lg bg-gray-100 animate-pulse" /></td>
    </tr>
  )
}

function AgenteRow({ a, onSelect, onAsignarPool, onQuitarPool, asignando }: {
  a: AgenteResumen
  onSelect: (a: AgenteResumen) => void
  onAsignarPool: (id: number) => void
  onQuitarPool: (id: number) => void
  asignando: boolean
}) {
  return (
    <tr
      onClick={() => onSelect(a)}
      className="hover:bg-gray-50 transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <p className="text-[0.82rem] font-semibold text-gray-800">{a.nombre}</p>
      </td>
      <td className="px-4 py-3">
        <ChipTipo tipo={a.tipo} />
      </td>
      <td className="px-4 py-3">
        {a.tienePool ? (
          <span className={clsx(
            'text-[0.8rem] font-bold tabular-nums',
            a.diasUsados === 0 ? 'text-gray-300' : 'text-amber-600',
          )}>
            {a.diasUsados}
            <span className="text-[0.65rem] font-normal text-gray-400 ml-0.5">/{a.poolTotal}</span>
          </span>
        ) : (
          <span className="text-[0.72rem] text-gray-400 italic">Sin pool</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.tienePool ? (
          <span className={clsx(
            'text-[0.85rem] font-bold tabular-nums',
            a.diasRestantes === 0 ? 'text-red-500' :
            a.diasRestantes <= 3 ? 'text-amber-500' :
            'text-emerald-600',
          )}>
            {a.diasRestantes}
            <span className="text-[0.65rem] font-normal text-gray-400 ml-0.5">días</span>
          </span>
        ) : (
          <span className="text-[0.72rem] text-gray-400">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        {a.tienePool
          ? <BarraDias usados={a.diasUsados} total={a.poolTotal} />
          : <span className="text-[0.68rem] text-gray-300">N/A</span>
        }
      </td>
      <td className="px-4 py-3">
        {!a.tienePool ? (
          <button
            onClick={(e) => { e.stopPropagation(); onAsignarPool(a.id) }}
            disabled={asignando}
            className="flex items-center gap-1.5 rounded-lg bg-brand/10 hover:bg-brand/20 disabled:opacity-40 transition-colors px-2.5 py-1.5 text-[0.7rem] font-semibold text-brand"
          >
            <UserPlus className="h-3 w-3" />
            Asignar pool
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); onQuitarPool(a.id) }}
            disabled={asignando}
            className="flex items-center gap-1.5 rounded-lg bg-red-50 hover:bg-red-100 disabled:opacity-40 transition-colors px-2.5 py-1.5 text-[0.7rem] font-semibold text-red-600"
          >
            <UserMinus className="h-3 w-3" />
            Quitar pool
          </button>
        )}
      </td>
    </tr>
  )
}

function GrupoArea({ tipo, agentes, onSelect, onAsignarPool, onQuitarPool, asignando }: {
  tipo: string
  agentes: AgenteResumen[]
  onSelect: (a: AgenteResumen) => void
  onAsignarPool: (id: number) => void
  onQuitarPool: (id: number) => void
  asignando: boolean
}) {
  const [abierto, setAbierto] = useState(true)
  const usados = agentes.reduce((s, a) => s + a.diasUsados, 0)
  const restantes = agentes.reduce((s, a) => s + a.diasRestantes, 0)

  return (
    <>
      <tr
        onClick={() => setAbierto(v => !v)}
        className="bg-gray-50/80 hover:bg-gray-100/80 cursor-pointer select-none"
      >
        <td colSpan={6} className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <ChevronDown className={clsx('h-3.5 w-3.5 text-gray-400 transition-transform', !abierto && '-rotate-90')} />
            <ChipTipo tipo={tipo} />
            <span className="text-[0.72rem] font-semibold text-gray-500">{agentes.length} agente{agentes.length !== 1 ? 's' : ''}</span>
            <span className="ml-auto text-[0.68rem] text-gray-400">
              {usados} usados · {restantes} restantes
            </span>
          </div>
        </td>
      </tr>
      {abierto && agentes.map(a => (
        <AgenteRow key={a.id} a={a} onSelect={onSelect} onAsignarPool={onAsignarPool} onQuitarPool={onQuitarPool} asignando={asignando} />
      ))}
    </>
  )
}

function StatCard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string | number; sub?: string
  icon: React.ElementType; color: string
}) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
        <p className="text-lg font-bold text-gray-800 tabular-nums leading-tight">{value}</p>
        {sub && <p className="text-[0.65rem] text-gray-400">{sub}</p>}
      </div>
    </div>
  )
}

export function ResumenVacacionesTab() {
  const [search, setSearch] = useState('')
  const [filtro, setFiltro] = useState<FiltroTipo>('todos')
  const [orden, setOrden] = useState<OrdenCol>('nombre')
  const [desc, setDesc] = useState(false)
  const [detalleAgente, setDetalleAgente] = useState<AgenteResumen | null>(null)
  const qc = useQueryClient()

  const asignarPoolMut = useMutation({
    mutationFn: async (usuarioId: number) => {
      await api.post(`/vacaciones/pool-override/${usuarioId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
      toast.success('Pool asignado')
    },
    onError: () => toast.error('No se pudo asignar el pool'),
  })

  const quitarPoolMut = useMutation({
    mutationFn: async (usuarioId: number) => {
      await api.delete(`/vacaciones/pool-override/${usuarioId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
      toast.success('Pool retirado')
    },
    onError: () => toast.error('No se pudo quitar el pool'),
  })

  const { data, isLoading, refetch, isRefetching } = useQuery<{
    success: boolean; data: AgenteResumen[]; anio: number
  }>({
    queryKey: ['vacaciones-resumen-agentes'],
    queryFn: async () => {
      const r = await api.get('/vacaciones/resumen-agentes')
      return r.data
    },
    staleTime: 1000 * 60 * 2,
  })

  // Refresco en tiempo real: cualquier sesión que marque/quite vacaciones
  // (desde Asistencia o desde este mismo módulo) emite este evento por socket.
  useEffect(() => {
    const socket = getSocket()
    const handler = () => qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
    socket.on('vacaciones:diasActualizados', handler)
    return () => { socket.off('vacaciones:diasActualizados', handler) }
  }, [qc])

  const agentes = data?.data ?? []
  const anio = data?.anio ?? new Date().getFullYear()

  function handleQuitarPool(id: number) {
    const nombre = agentes.find(a => a.id === id)?.nombre ?? 'este empleado'
    if (window.confirm(`¿Quitar el pool de vacaciones a ${nombre}? Pasará a "Sin pool".`)) {
      quitarPoolMut.mutate(id)
    }
  }

  const conPool = agentes.filter(a => a.tienePool)
  const sinPool = agentes.filter(a => !a.tienePool)
  const totalDiasUsados = conPool.reduce((s, a) => s + a.diasUsados, 0)
  const totalDiasRestantes = conPool.reduce((s, a) => s + a.diasRestantes, 0)
  const agotados = conPool.filter(a => a.diasRestantes === 0).length

  const toggle = (col: OrdenCol) => {
    if (orden === col) setDesc(d => !d)
    else { setOrden(col); setDesc(false) }
  }

  const filtered = agentes
    .filter(a => {
      if (filtro === 'todos' && !a.tienePool) return false
      if (filtro === 'sin-pool' && a.tienePool) return false
      return a.nombre.toLowerCase().includes(search.toLowerCase())
    })
    .sort((a, b) => {
      let diff = 0
      if (orden === 'nombre') diff = a.nombre.localeCompare(b.nombre)
      else if (orden === 'restantes') diff = a.diasRestantes - b.diasRestantes
      else if (orden === 'usados') diff = a.diasUsados - b.diasUsados
      return desc ? -diff : diff
    })

  const grupos = filtro === 'todos'
    ? Object.entries(
        filtered.reduce<Record<string, AgenteResumen[]>>((acc, a) => {
          const key = (a.tipo || '').toUpperCase()
          ;(acc[key] ??= []).push(a)
          return acc
        }, {}),
      ).sort(([a], [b]) => {
        const ia = TIPO_ORDEN.indexOf(a), ib = TIPO_ORDEN.indexOf(b)
        return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
      })
    : null

  const SortIcon = ({ col }: { col: OrdenCol }) => (
    <span className={clsx('ml-0.5 text-[0.6rem]', orden === col ? 'opacity-80' : 'opacity-20')}>
      {orden === col && desc ? '▼' : '▲'}
    </span>
  )

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Agentes con pool" value={conPool.length} sub={`${sinPool.length} sin pool`} icon={Users} color="bg-[#0D1B3E]" />
        <StatCard label={`Días usados ${anio}`} value={totalDiasUsados} sub="entre todos los agentes" icon={TrendingDown} color="bg-amber-500" />
        <StatCard label="Días restantes" value={totalDiasRestantes} sub="pool combinado" icon={CalendarDays} color="bg-emerald-500" />
        <StatCard label="Sin días" value={agotados} sub="agentes con pool agotado" icon={CheckCircle2} color="bg-red-400" />
      </div>

      {/* Filtros y búsqueda */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-gray-100">
          <div className="relative flex-1 min-w-44">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre..."
              className="field py-2 pl-9 text-sm"
            />
          </div>
          <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1">
            {(['todos', 'sin-pool'] as FiltroTipo[]).map(f => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-all capitalize whitespace-nowrap',
                  filtro === f ? 'bg-white shadow-sm text-brand' : 'text-gray-500 hover:text-gray-700',
                )}
              >
                {f === 'todos' ? 'Todos' : 'Sin pool'}
              </button>
            ))}
          </div>
          <button
            onClick={() => refetch()}
            className={clsx(
              'flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50 transition-colors',
              isRefetching && 'animate-spin',
            )}
            title="Actualizar"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('nombre')}>
                  Empleado <SortIcon col="nombre" />
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('usados')}>
                  Usados <SortIcon col="usados" />
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none hover:text-gray-700" onClick={() => toggle('restantes')}>
                  Restantes <SortIcon col="restantes" />
                </th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Progreso</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                : filtered.length === 0
                  ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-14 text-center text-sm text-gray-400">
                        No se encontraron agentes
                      </td>
                    </tr>
                  )
                  : grupos
                    ? grupos.map(([tipo, agentesGrupo]) => (
                        <GrupoArea
                          key={tipo}
                          tipo={tipo}
                          agentes={agentesGrupo}
                          onSelect={setDetalleAgente}
                          onAsignarPool={(id) => asignarPoolMut.mutate(id)}
                          onQuitarPool={handleQuitarPool}
                          asignando={asignarPoolMut.isPending || quitarPoolMut.isPending}
                        />
                      ))
                    : filtered.map(a => (
                        <AgenteRow
                          key={a.id}
                          a={a}
                          onSelect={setDetalleAgente}
                          onAsignarPool={(id) => asignarPoolMut.mutate(id)}
                          onQuitarPool={handleQuitarPool}
                          asignando={asignarPoolMut.isPending || quitarPoolMut.isPending}
                        />
                      ))
              }
            </tbody>
          </table>
        </div>

        {!isLoading && filtered.length > 0 && (
          <div className="px-4 py-2.5 border-t border-gray-50 text-[0.68rem] text-gray-400">
            {filtered.length} agente{filtered.length !== 1 ? 's' : ''} · Pool {anio}: 12 días por persona
          </div>
        )}
      </div>

      {detalleAgente && (
        <DetalleVacacionesModal agente={detalleAgente} onClose={() => setDetalleAgente(null)} />
      )}
    </div>
  )
}
