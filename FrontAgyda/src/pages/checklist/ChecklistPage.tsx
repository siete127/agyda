import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckSquare, Trash2, Lock, Clock, AlertCircle, Download, Table2, BarChart2, X } from 'lucide-react'
import { api } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { EntradaWidget } from '@/components/ui/AsistenciaModal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

/* ── Checklist types ── */
interface ChecklistItem {
  id: number
  texto: string
  completado: boolean
  orden: number
}

interface ChecklistDay {
  id: number
  fecha: string
  cerrado: boolean
  items: ChecklistItem[]
}

function parseItem(r: Record<string, unknown>): ChecklistItem {
  return {
    id: Number(r['id'] ?? r['ID'] ?? 0),
    texto: String(r['texto'] ?? r['TEXTO'] ?? r['text'] ?? r['descripcion'] ?? ''),
    completado: Boolean(r['completado'] ?? r['COMPLETADO'] ?? r['done'] ?? r['completed']),
    orden: Number(r['orden'] ?? r['ORDEN'] ?? r['order'] ?? 0),
  }
}

function parseDay(r: Record<string, unknown>): ChecklistDay {
  const items = Array.isArray(r['items']) ? r['items'] : []
  return {
    id: Number(r['id'] ?? r['ID'] ?? 0),
    fecha: String(r['fecha'] ?? r['FECHA'] ?? r['date'] ?? new Date().toISOString()),
    cerrado: Boolean(r['cerrado'] ?? r['CERRADO'] ?? r['closed']),
    items: (items as Record<string, unknown>[]).map(parseItem),
  }
}

/* ── Asistencia types ── */
interface AsistenciaRegistro {
  id: number
  usuarioId: number
  nombre: string
  rol: string
  fecha: string
  horaEntrada: string
  horaEsperada: string
  minutosRetardo: number
  esRetardo: boolean
}

interface RetardoStat {
  usuarioId: number
  usuarioNombre: string | null
  usuarioRol: string | null
  totalRetardos: number
}

const ROLES_LABEL: Record<string, string> = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes' }

const ROLES = [
  { value: '', label: 'Todos los roles' },
  { value: 'AD', label: 'Administración' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'CC', label: 'Call Center' },
]

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'a-tiempo', label: 'A tiempo' },
  { value: 'tolerancia', label: 'Tolerancia' },
  { value: 'retardo', label: 'Retardo' },
]

function localDateStr(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

function fmtFecha(f: string) {
  try {
    return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return f
  }
}

function exportExcel(rows: AsistenciaRegistro[]) {
  const fechaGen = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const headers = ['#', 'Colaborador', 'Rol', 'Fecha', 'Hora entrada', 'Hora esperada', 'Estado', 'Minutos de retardo']
  const data = rows.map((r, i) => [
    i + 1,
    r.nombre ?? '',
    ROLES_LABEL[r.rol] ?? r.rol,
    fmtFecha(r.fecha),
    r.horaEntrada,
    r.horaEsperada,
    r.esRetardo ? 'Retardo' : 'A tiempo',
    r.esRetardo ? r.minutosRetardo : 0,
  ])
  const titleRow = [`Reporte de Asistencia — ${fechaGen} · ${rows.length} registros`, '', '', '', '', '', '', '']
  const wsData = [titleRow, headers, ...data]
  const ws = XLSX.utils.aoa_to_sheet(wsData)
  ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia')
  XLSX.writeFile(wb, `asistencia_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

/* ── Ranking de retardos (reemplaza el SVG) ── */
function getRankingColor(pct: number): { bar: string; badge: string; rank: string } {
  if (pct >= 0.75) return { bar: 'bg-red-500', badge: 'bg-red-100 text-red-700 border-red-200', rank: 'bg-red-500 text-white' }
  if (pct >= 0.45) return { bar: 'bg-orange-400', badge: 'bg-orange-100 text-orange-700 border-orange-200', rank: 'bg-orange-400 text-white' }
  if (pct >= 0.20) return { bar: 'bg-amber-400', badge: 'bg-amber-100 text-amber-700 border-amber-200', rank: 'bg-amber-400 text-white' }
  return { bar: 'bg-yellow-300', badge: 'bg-yellow-100 text-yellow-700 border-yellow-200', rank: 'bg-yellow-300 text-yellow-800' }
}

function RetardosRanking({ stats, maxTotal }: { stats: RetardoStat[]; maxTotal: number }) {
  if (stats.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
      <BarChart2 className="h-8 w-8 text-gray-300" />
      <p className="text-sm">Sin retardos en este período</p>
    </div>
  )

  return (
    <div className="space-y-2.5">
      {stats.map((s, i) => {
        const nombre = s.usuarioNombre ?? `Usuario #${s.usuarioId}`
        const pct = maxTotal > 0 ? s.totalRetardos / maxTotal : 0
        const colors = getRankingColor(pct)
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null

        return (
          <div key={s.usuarioId ?? i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/60 px-4 py-3 hover:bg-gray-100/60 transition-colors">
            {/* Posición */}
            <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg text-[0.72rem] font-bold ${colors.rank}`}>
              {medal ?? `#${i + 1}`}
            </div>

            {/* Nombre + rol */}
            <div className="w-44 flex-shrink-0">
              <p className="text-[0.82rem] font-semibold text-gray-800 leading-tight truncate">{nombre}</p>
              {s.usuarioRol && (
                <p className="text-[0.68rem] font-medium text-gray-400 uppercase tracking-wide mt-0.5">
                  {ROLES_LABEL[s.usuarioRol] ?? s.usuarioRol}
                </p>
              )}
            </div>

            {/* Barra */}
            <div className="flex-1 min-w-0">
              <div className="h-3 rounded-full bg-gray-200 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${colors.bar}`}
                  style={{ width: `${Math.max(pct * 100, 4)}%` }}
                />
              </div>
            </div>

            {/* Badge de cantidad */}
            <div className={`flex-shrink-0 inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-bold ${colors.badge}`}>
              {s.totalRetardos} {s.totalRetardos === 1 ? 'retardo' : 'retardos'}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Skeleton for checklist ── */
function SkeletonItem() {
  return (
    <div className="flex items-center gap-3 px-4 py-3 animate-pulse">
      <div className="h-5 w-5 rounded flex-shrink-0 bg-gray-100" />
      <div className="h-3.5 flex-1 max-w-[60%] rounded-lg bg-gray-100" />
    </div>
  )
}

export function ChecklistPage() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const rol = user?.tipoUsuario?.toUpperCase() ?? ''
  const isAD = rol === 'AD'

  /* ── Checklist query ── */
  const { data: day, isLoading: isLoadingChecklist } = useQuery({
    queryKey: ['checklist-day'],
    queryFn: async () => {
      const { data } = await api.get('/checklists/day', { params: { date: localDateStr() } })
      const raw = data?.day ?? data?.data ?? data
      return parseDay(raw as Record<string, unknown>)
    },
  })

  const toggleItem = useMutation({
    mutationFn: (id: number) => api.post(`/checklists/items/${id}/complete`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-day'] }),
  })

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/checklists/items/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-day'] }),
    onError: () => toast.error('Error al eliminar'),
  })

  const items = day?.items ?? []
  const completados = items.filter((i) => i.completado).length
  const total = items.length
  const progreso = total > 0 ? Math.round((completados / total) * 100) : 0
  const fecha = day
    ? new Date(day.fecha).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })
    : ''

  /* ── Asistencia state & queries (AD only) ── */
  const today = localDateStr()
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)
  const [nombre, setNombre] = useState('')
  const [filtroRol, setFiltroRol] = useState('')
  const [estado, setEstado] = useState('')
  const [vista, setVista] = useState<'tabla' | 'barras'>('tabla')
  const [toleranciaVis, setToleranciaVis] = useState<number>(() => {
    const saved = localStorage.getItem('asistencia-tolerancia')
    return saved !== null ? Number(saved) : 5
  })

  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  // Para el filtro "tolerancia" traemos todos los retardos y filtramos client-side
  const estadoBackend = estado === 'tolerancia' ? undefined : (estado || undefined)

  const { data: rawRegistros = [], isLoading: isLoadingRegistros, error: errorRegistros } = useQuery<AsistenciaRegistro[]>({
    queryKey: ['asistencia-reporte', desde, hasta, nombre, filtroRol, estadoBackend],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/retardos', {
        params: {
          from: desde || undefined,
          to: hasta || undefined,
          nombre: nombre || undefined,
          area: filtroRol || undefined,
          estado: estadoBackend,
        },
      })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
    enabled: isAD && !rangoInvalido,
  })

  const registros = useMemo(() => {
    if (estado !== 'tolerancia') return rawRegistros
    return rawRegistros.filter((r) => r.esRetardo && r.minutosRetardo <= toleranciaVis)
  }, [rawRegistros, estado, toleranciaVis])

  const { data: stats = [] } = useQuery<RetardoStat[]>({
    queryKey: ['asistencia-retardos-stats', desde, hasta],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/retardos/stats', {
        params: { from: desde || undefined, to: hasta || undefined },
      })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
    enabled: isAD && !rangoInvalido,
  })

  const maxTotal = useMemo(() => stats.reduce((m, s) => Math.max(m, s.totalRetardos), 0), [stats])

  function getEstado(r: AsistenciaRegistro): 'retardo' | 'tolerancia' | 'a-tiempo' {
    if (!r.esRetardo) return 'a-tiempo'
    if (r.minutosRetardo <= toleranciaVis) return 'tolerancia'
    return 'retardo'
  }

  const totalRetardos = useMemo(() => registros.filter((r) => getEstado(r) === 'retardo').length, [registros, toleranciaVis])
  const totalTolerancia = useMemo(() => registros.filter((r) => getEstado(r) === 'tolerancia').length, [registros, toleranciaVis])
  const totalATiempo = useMemo(() => registros.filter((r) => getEstado(r) === 'a-tiempo').length, [registros, toleranciaVis])
  const hayFiltrosExtra = Boolean(nombre || filtroRol || estado)

  function cambiarTolerancia(delta: number) {
    setToleranciaVis(prev => {
      const next = Math.max(0, prev + delta)
      localStorage.setItem('asistencia-tolerancia', String(next))
      return next
    })
  }

  function limpiarFiltros() {
    setNombre('')
    setFiltroRol('')
    setEstado('')
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-6 py-5">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <CheckSquare className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Asistencias</h1>
                <p className="mt-0.5 text-xs text-white/50 capitalize">{isAD ? `${totalATiempo} a tiempo · ${totalTolerancia} en tolerancia · ${totalRetardos} retardos` : fecha}</p>
              </div>
            </div>
            {isAD && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportExcel(registros)}
                  disabled={registros.length === 0}
                  title="Exportar a Excel"
                  className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 transition-colors px-3.5 h-9 text-[0.78rem] font-semibold text-white"
                >
                  <Download className="h-4 w-4" /> Exportar
                </button>
                <button
                  onClick={() => setVista((v) => (v === 'tabla' ? 'barras' : 'tabla'))}
                  title={vista === 'tabla' ? 'Ver gráfica' : 'Ver tabla'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {vista === 'tabla' ? <BarChart2 className="h-4 w-4 text-white" /> : <Table2 className="h-4 w-4 text-white" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Vista no-AD: EntradaWidget + Checklist ── */}
      {!isAD && (
        <div className="max-w-2xl mx-auto space-y-4">
          <EntradaWidget />

          {(isLoadingChecklist || total > 0) && (
            <div className="card p-4">
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center gap-1.5">
                  <div className="h-4 w-1 rounded-full bg-brand" />
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-widest">Progreso</span>
                </div>
                {!isLoadingChecklist && (
                  <span className={clsx('text-xs font-bold tabular-nums', progreso === 100 ? 'text-emerald-600' : 'text-brand')}>
                    {completados}/{total} ({progreso}%)
                  </span>
                )}
              </div>
              {isLoadingChecklist ? (
                <div className="h-2 rounded-full bg-gray-100 animate-pulse" />
              ) : (
                <>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full transition-all duration-500', progreso === 100 ? 'bg-emerald-500' : 'bg-gradient-to-r from-brand to-brand-muted')}
                      style={{ width: `${progreso}%` }}
                    />
                  </div>
                  {progreso === 100 && (
                    <p className="text-center text-xs text-emerald-600 font-semibold mt-2">¡Todos los items completados!</p>
                  )}
                </>
              )}
            </div>
          )}

          {(isLoadingChecklist || items.length > 0) && (
            <div className="card overflow-hidden">
              {isLoadingChecklist ? (
                <div className="divide-y divide-gray-50">
                  {Array.from({ length: 4 }).map((_, i) => <SkeletonItem key={i} />)}
                </div>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {[...items].sort((a, b) => a.orden - b.orden).map((item) => (
                    <li key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                      <button
                        onClick={() => !day?.cerrado && toggleItem.mutate(item.id)}
                        disabled={day?.cerrado}
                        className={clsx(
                          'h-5 w-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all',
                          item.completado ? 'bg-brand border-brand' : 'border-gray-300 hover:border-brand/60',
                          day?.cerrado && 'cursor-default',
                        )}
                      >
                        {item.completado && (
                          <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      <span className={clsx('flex-1 text-sm', item.completado ? 'line-through text-gray-400' : 'text-gray-700')}>
                        {item.texto}
                      </span>
                      {!day?.cerrado && (
                        <button
                          onClick={() => deleteItem.mutate(item.id)}
                          className="rounded-xl p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {!isLoadingChecklist && day?.cerrado && (
                <div className="border-t border-gray-100 p-3 text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
                  <Lock className="h-3 w-3" /> Día cerrado
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Vista AD: Reporte de asistencia ── */}
      {isAD && (
        <>
          {/* Stats rápidas */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
                <Clock className="h-4 w-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">A tiempo</p>
                <p className="text-xl font-bold text-gray-800">{totalATiempo}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-amber-200/60 bg-amber-50/60 shadow-sm p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold text-amber-500 uppercase tracking-wide">Tolerancia</p>
                <p className="text-xl font-bold text-gray-800">{totalTolerancia}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-100">
                <AlertCircle className="h-4 w-4 text-red-600" />
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">Retardos</p>
                <p className="text-xl font-bold text-gray-800">{totalRetardos}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
                <CheckSquare className="h-4 w-4 text-blue-600" />
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">Total</p>
                <p className="text-xl font-bold text-gray-800">{registros.length}</p>
              </div>
            </div>
          </div>

          {/* Filtros */}
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Estado</label>
              <select value={estado} onChange={(e) => setEstado(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
                {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Rol</label>
              <select value={filtroRol} onChange={(e) => setFiltroRol(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[0.72rem] font-semibold text-gray-500 uppercase tracking-wide">Nombre</label>
              <input type="text" placeholder="Buscar por nombre..." value={nombre} onChange={(e) => setNombre(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            {hayFiltrosExtra && (
              <button onClick={limpiarFiltros} className="flex items-center gap-1 text-[0.75rem] text-gray-400 hover:text-gray-600 px-2 py-1.5">
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
            {/* Tolerancia visual */}
            <div className="flex flex-col gap-1 ml-auto">
              <label className="text-[0.72rem] font-semibold text-amber-500 uppercase tracking-wide">Tolerancia (min)</label>
              <div className="flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-2 py-1.5 h-[34px]">
                <button
                  onClick={() => cambiarTolerancia(-1)}
                  disabled={toleranciaVis === 0}
                  className="flex h-5 w-5 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-100 disabled:opacity-30 transition-colors font-bold text-base leading-none"
                >−</button>
                <span className="w-7 text-center text-sm font-bold text-amber-700 tabular-nums select-none">{toleranciaVis}</span>
                <button
                  onClick={() => cambiarTolerancia(1)}
                  className="flex h-5 w-5 items-center justify-center rounded-lg text-amber-600 hover:bg-amber-100 transition-colors font-bold text-base leading-none"
                >+</button>
              </div>
            </div>
          </div>

          {rangoInvalido && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-sm text-amber-700">La fecha "Desde" no puede ser posterior a la fecha "Hasta".</p>
            </div>
          )}

          {vista === 'barras' ? (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-gray-700">Ranking de retardos</h2>
                  <p className="text-[0.72rem] text-gray-400 mt-0.5">Ordenado de mayor a menor · {stats.length} {stats.length === 1 ? 'persona' : 'personas'}</p>
                </div>
                <div className="flex items-center gap-3 text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-yellow-300" />Pocos</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-amber-400" />Moderado</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-orange-400" />Alto</span>
                  <span className="flex items-center gap-1"><span className="inline-block h-2 w-3 rounded-sm bg-red-500" />Crítico</span>
                </div>
              </div>
              {rangoInvalido ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
                  <AlertCircle className="h-8 w-8 text-amber-300" />
                  <p className="text-sm">Corrige el rango de fechas para ver los datos</p>
                </div>
              ) : (
                <RetardosRanking stats={stats} maxTotal={maxTotal} />
              )}
            </div>
          ) : (
            <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700">Detalle de entradas</h2>
                <span className="text-[0.72rem] text-gray-400">{registros.length} registro{registros.length !== 1 ? 's' : ''}</span>
              </div>

              {rangoInvalido ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Corrige el rango de fechas</div>
              ) : isLoadingRegistros ? (
                <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Cargando...</div>
              ) : errorRegistros ? (
                <div className="flex items-center justify-center py-16 text-red-500 text-sm">Error al cargar el reporte</div>
              ) : registros.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
                  <Clock className="h-8 w-8 text-gray-300" />
                  <p className="text-sm">Sin registros en este período</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50/50">
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Colaborador</th>
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Rol</th>
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Fecha</th>
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Hora entrada</th>
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Hora esperada</th>
                        <th className="px-4 py-2.5 text-left text-[0.72rem] font-semibold text-gray-400 uppercase tracking-wide">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {registros.map((r) => {
                        const est = getEstado(r)
                        return (
                          <tr key={r.id} className={`hover:bg-gray-50/60 transition-colors ${est === 'retardo' ? 'bg-red-50/40' : est === 'tolerancia' ? 'bg-amber-50/40' : ''}`}>
                            <td className="px-4 py-3">
                              <p className="font-medium text-gray-800 text-[0.82rem] leading-tight">{r.nombre}</p>
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">
                                {ROLES_LABEL[r.rol] ?? r.rol}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-[0.8rem] text-gray-600">{fmtFecha(r.fecha)}</td>
                            <td className="px-4 py-3 text-[0.8rem] text-gray-600 font-mono">{r.horaEntrada}</td>
                            <td className="px-4 py-3 text-[0.8rem] text-gray-400 font-mono">{r.horaEsperada}</td>
                            <td className="px-4 py-3">
                              {est === 'retardo' && (
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold bg-red-100 text-red-700 border-red-200">
                                  Retardo · {r.minutosRetardo} min
                                </span>
                              )}
                              {est === 'tolerancia' && (
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold bg-amber-100 text-amber-700 border-amber-200">
                                  Tolerancia · {r.minutosRetardo} min
                                </span>
                              )}
                              {est === 'a-tiempo' && (
                                <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.72rem] font-semibold bg-emerald-100 text-emerald-700 border-emerald-200">
                                  A tiempo
                                </span>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
