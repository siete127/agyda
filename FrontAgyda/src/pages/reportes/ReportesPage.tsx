import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { BarChart2, Download, RefreshCw, Users, Clock, TrendingUp, LayoutGrid, Table2, Ticket } from 'lucide-react'
import { api } from '@/lib/axios'
import { Button } from '@/components/ui/Button'
import { clsx } from 'clsx'
import * as XLSX from 'xlsx'

interface UserTime {
  usuarioId: number
  nombre: string
  totalHoras: number
  totalMinutos: number
  diasTrabajados: number
}

interface ResumenUsuario {
  usuarioId: number
  nombre: string
  rol: string
  quejas: number
  pausaBanioMin: number
  pausaComidaMin: number
  pausaCapacitacionMin: number
  pausaPermisoMin: number
  checklistCompletados: number
  entradasATiempo: number
  retardos: number
  tickets: number
}

const ROLES_LABEL: Record<string, string> = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center' }
const ROLES_FILTRO = [
  { value: '', label: 'Todos los roles' },
  { value: 'AD', label: 'Administración' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'CC', label: 'Call Center' },
]

function parseUserTime(r: Record<string, unknown>): UserTime {
  const s = (keys: string[]) => keys.reduce((v, k) => v ?? r[k], undefined as unknown)
  return {
    usuarioId: Number(s(['usuarioId', 'usuario_id', 'ID', 'id']) ?? 0),
    nombre: String(s(['nombre', 'NOMBRE', 'nombres', 'name']) ?? ''),
    totalHoras: Number(s(['totalHoras', 'total_horas', 'horas', 'hours']) ?? 0),
    totalMinutos: Number(s(['totalMinutos', 'total_minutos', 'minutos', 'minutes']) ?? 0),
    diasTrabajados: Number(s(['diasTrabajados', 'dias_trabajados', 'dias', 'days']) ?? 0),
  }
}

function fmtMin(min: number) {
  if (min <= 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h === 0) return `${m}m`
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function exportResumenExcel(rows: ResumenUsuario[], from: string, to: string) {
  const fechaGen = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const headers = ['#', 'Colaborador', 'Rol', 'Quejas', 'Tickets', 'Baño', 'Comida', 'Capacitación', 'Permiso', 'Checklist completados', 'A tiempo', 'Retardos']
  const data = rows.map((r, i) => [
    i + 1,
    r.nombre,
    ROLES_LABEL[r.rol] ?? r.rol,
    r.quejas,
    r.tickets,
    fmtMin(r.pausaBanioMin),
    fmtMin(r.pausaComidaMin),
    fmtMin(r.pausaCapacitacionMin),
    fmtMin(r.pausaPermisoMin),
    r.checklistCompletados,
    r.entradasATiempo,
    r.retardos,
  ])

  const titleRow = [`Resumen General — ${from} a ${to} · generado ${fechaGen} · ${rows.length} usuarios`, '', '', '', '', '', '', '', '', '', '', '']
  const wsData = [titleRow, headers, ...data]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 16 }, { wch: 9 }, { wch: 9 }, { wch: 10 }, { wch: 10 }, { wch: 13 }, { wch: 10 }, { wch: 20 }, { wch: 10 }, { wch: 10 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } }]

  const titleStyle = {
    font: { bold: true, sz: 13, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF0D1B3E' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
  const headerStyle = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF7C3AED' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'FF0D1B3E' } } },
  }
  const cellEven = { font: { sz: 10 }, fill: { fgColor: { rgb: 'FFF3F0FF' }, patternType: 'solid' }, alignment: { vertical: 'center' } }
  const cellOdd = { font: { sz: 10 }, fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' }, alignment: { vertical: 'center' } }

  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']
  cols.forEach(c => { if (ws[`${c}1`]) ws[`${c}1`].s = titleStyle })
  cols.forEach(c => { if (ws[`${c}2`]) ws[`${c}2`].s = headerStyle })
  data.forEach((_, i) => {
    const excelRow = i + 3
    const isEven = i % 2 === 0
    cols.forEach((c) => {
      const cell = ws[`${c}${excelRow}`]
      if (cell) cell.s = isEven ? cellEven : cellOdd
    })
  })

  ws['!rows'] = [{ hpt: 22 }, { hpt: 18 }, ...data.map(() => ({ hpt: 16 }))]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Resumen General')
  XLSX.writeFile(wb, `resumen_general_${from}_${to}.xlsx`)
}

/* ── Skeleton tabla ── */
function SkeletonRow({ cols = 4 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3"><div className="h-4 w-full max-w-[80px] rounded-lg bg-gray-100 animate-pulse" /></td>
      ))}
    </tr>
  )
}

/* ── Dashboard de métricas por colaborador ── */
type MetricaKey = 'quejas' | 'tickets' | 'pausaBanioMin' | 'pausaComidaMin' | 'pausaCapacitacionMin' | 'pausaPermisoMin' | 'checklistCompletados' | 'retardos'

const METRICAS: { key: MetricaKey; label: string; color: string; bg: string; esMinutos?: boolean }[] = [
  { key: 'quejas',               label: 'Quejas',       color: 'bg-red-500',     bg: 'bg-red-50',     },
  { key: 'tickets',              label: 'Tickets',      color: 'bg-orange-500',  bg: 'bg-orange-50',  },
  { key: 'pausaBanioMin',        label: 'Baño',         color: 'bg-blue-500',    bg: 'bg-blue-50',    esMinutos: true },
  { key: 'pausaComidaMin',       label: 'Comida',       color: 'bg-emerald-500', bg: 'bg-emerald-50', esMinutos: true },
  { key: 'pausaCapacitacionMin', label: 'Capacitación', color: 'bg-amber-500',   bg: 'bg-amber-50',   esMinutos: true },
  { key: 'pausaPermisoMin',      label: 'Permiso',      color: 'bg-purple-500',  bg: 'bg-purple-50',  esMinutos: true },
  { key: 'checklistCompletados', label: 'Checklist',    color: 'bg-green-600',   bg: 'bg-green-50',   },
  { key: 'retardos',             label: 'Retardos',     color: 'bg-pink-500',    bg: 'bg-pink-50',    },
]

function ResumenDashboard({ rows }: { rows: ResumenUsuario[] }) {
  const maximos = useMemo(() => {
    const result = {} as Record<MetricaKey, number>
    for (const m of METRICAS) {
      result[m.key] = rows.reduce((max, r) => Math.max(max, r[m.key]), 0)
    }
    return result
  }, [rows])

  const ordenados = useMemo(() => [...rows].sort((a, b) => a.nombre.localeCompare(b.nombre)), [rows])

  return (
    <div className="space-y-3">
      {/* Leyenda */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 px-1">
        {METRICAS.map((m) => (
          <div key={m.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm flex-shrink-0 ${m.color}`} />
            <span className="text-[0.72rem] text-gray-500">{m.label}</span>
          </div>
        ))}
      </div>

      {/* Tarjetas por colaborador */}
      {ordenados.map((usuario) => (
        <div key={usuario.usuarioId} className="rounded-2xl border border-gray-100 bg-gray-50/60 px-5 py-4 space-y-3">
          {/* Encabezado del colaborador */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand/10 flex-shrink-0">
              <span className="text-[0.7rem] font-bold text-brand">
                {usuario.nombre.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase()}
              </span>
            </div>
            <div>
              <p className="text-[0.88rem] font-bold text-gray-800 leading-tight">{usuario.nombre}</p>
              <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide">
                {ROLES_LABEL[usuario.rol] ?? usuario.rol}
              </p>
            </div>
          </div>

          {/* Barras de métricas */}
          <div className="grid grid-cols-1 gap-2">
            {METRICAS.map((m) => {
              const value = usuario[m.key]
              const max = maximos[m.key] || 1
              const pct = Math.min(1, value / max)
              const display = m.esMinutos ? fmtMin(value) : String(value)
              if (value === 0) return null
              return (
                <div key={m.key} className="flex items-center gap-3">
                  <span className="w-24 flex-shrink-0 text-[0.72rem] font-semibold text-gray-500">{m.label}</span>
                  <div className="flex-1 h-5 rounded-full bg-gray-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${m.color} flex items-center pl-2`}
                      style={{ width: `${Math.max(pct * 100, 6)}%` }}
                    >
                      <span className="text-[0.65rem] font-bold text-white leading-none whitespace-nowrap">{display}</span>
                    </div>
                  </div>
                  <span className="w-10 flex-shrink-0 text-right text-[0.72rem] font-bold text-gray-600">{display}</span>
                </div>
              )
            })}
            {METRICAS.every((m) => usuario[m.key] === 0) && (
              <p className="text-[0.75rem] text-gray-400 italic">Sin actividad en este período</p>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function ReportesPage() {
  const today = new Date()
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const [from, setFrom] = useState(firstOfMonth)
  const [to, setTo] = useState(today.toISOString().slice(0, 10))
  const [tab, setTab] = useState<'tiempos' | 'resumen'>('resumen')
  const [rolFiltro, setRolFiltro] = useState('')
  const [enabled, setEnabled] = useState(false)
  const [vistaResumen, setVistaResumen] = useState<'tabla' | 'barras'>('tabla')

  const { data: reporte = [], isLoading, refetch } = useQuery({
    queryKey: ['reportes-tiempos', from, to],
    queryFn: async () => {
      const { data } = await api.get('/reports/usuarios/times', { params: { from, to } })
      const list = Array.isArray(data) ? data : (data?.data ?? data?.reporte ?? [])
      return (list as Record<string, unknown>[]).map(parseUserTime)
    },
    enabled: enabled && tab === 'tiempos',
  })

  const { data: resumen = [], isLoading: isLoadingResumen, error: errorResumen, refetch: refetchResumen } = useQuery<ResumenUsuario[]>({
    queryKey: ['reportes-resumen-general', from, to, rolFiltro],
    queryFn: async () => {
      const { data } = await api.get('/reports/resumen-general', { params: { from, to, rol: rolFiltro || undefined } })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    enabled: enabled && tab === 'resumen',
    retry: false,
  })

  const errorResumenMsg = errorResumen
    ? ((errorResumen as { response?: { status?: number; data?: { message?: string } } })?.response?.status === 403
        ? 'No tienes permiso para ver el resumen general. Esta sección es exclusiva para administradores (AD).'
        : (errorResumen as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al generar el resumen general')
    : null

  const descargarCSV = async () => {
    try {
      const res = await api.get('/reports/usuarios/times', {
        params: { from, to, format: 'csv' },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `reporte_tiempos_${from}_${to}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
    } catch { /* silent */ }
  }

  const totalHoras = reporte.reduce((s, r) => s + r.totalHoras, 0)

  const stats = [
    { label: 'Usuarios',  val: String(reporte.length),    icon: Users,     from: '#1B4FD8', to: '#2563eb' },
    { label: 'Total hrs', val: `${totalHoras}h`,           icon: Clock,     from: '#7C3AED', to: '#8B5CF6' },
    { label: 'Promedio',  val: `${reporte.length ? Math.round(totalHoras / reporte.length) : 0}h`, icon: TrendingUp, from: '#059669', to: '#10B981' },
  ]

  const totalQuejas = resumen.reduce((s, r) => s + r.quejas, 0)
  const totalTickets = resumen.reduce((s, r) => s + r.tickets, 0)
  const totalRetardos = resumen.reduce((s, r) => s + r.retardos, 0)
  const totalChecklist = resumen.reduce((s, r) => s + r.checklistCompletados, 0)

  function generar() {
    setEnabled(true)
    setTimeout(() => (tab === 'tiempos' ? refetch() : refetchResumen()), 50)
  }

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
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
                <BarChart2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Reportes</h1>
                <p className="mt-0.5 text-xs text-blue-200/80">
                  {tab === 'tiempos' ? 'Reporte de tiempos por usuario' : 'Resumen general por colaborador'}
                </p>
              </div>
            </div>
            {tab === 'tiempos' && reporte.length > 0 && (
              <Button onClick={descargarCSV} className="bg-card !text-brand hover:bg-blue-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                <Download className="h-3.5 w-3.5" /> Descargar CSV
              </Button>
            )}
            {tab === 'resumen' && resumen.length > 0 && (
              <div className="flex items-center gap-2">
                <Button onClick={() => exportResumenExcel(resumen, from, to)} className="bg-card !text-brand hover:bg-blue-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Download className="h-3.5 w-3.5" /> Exportar Excel
                </Button>
                <button
                  onClick={() => setVistaResumen((v) => (v === 'tabla' ? 'barras' : 'tabla'))}
                  title={vistaResumen === 'tabla' ? 'Ver gráfica de barras' : 'Ver tabla'}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
                >
                  {vistaResumen === 'tabla' ? (
                    <BarChart2 className="h-4 w-4 text-white" />
                  ) : (
                    <Table2 className="h-4 w-4 text-white" />
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Panel de configuración del reporte: tabs + filtros unificados ── */}
      <div className="card p-5 space-y-4">
        <div className="flex gap-1.5">
          <button
            onClick={() => setTab('resumen')}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[0.8rem] font-semibold border transition-all',
              tab === 'resumen' ? 'bg-brand text-white border-brand shadow-sm' : 'bg-card text-gray-600 border-gray-200 hover:border-brand/40 hover:text-brand',
            )}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Resumen general
          </button>
          <button
            onClick={() => setTab('tiempos')}
            className={clsx(
              'flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-[0.8rem] font-semibold border transition-all',
              tab === 'tiempos' ? 'bg-brand text-white border-brand shadow-sm' : 'bg-card text-gray-600 border-gray-200 hover:border-brand/40 hover:text-brand',
            )}
          >
            <Clock className="h-3.5 w-3.5" /> Tiempos por usuario
          </button>
        </div>

        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">Rango de fechas</p>
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Desde</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="field w-auto" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Hasta</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="field w-auto" />
            </div>
            {tab === 'resumen' && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Rol</label>
                <select value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)} className="field w-auto">
                  {ROLES_FILTRO.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
            )}
            <Button onClick={generar}>
              <RefreshCw className="h-3.5 w-3.5" /> Generar reporte
            </Button>
          </div>
        </div>
      </div>

      {/* ── Resumen general ── */}
      {tab === 'resumen' && (
        errorResumenMsg ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50">
              <LayoutGrid className="h-7 w-7 text-red-300" />
            </div>
            <div className="text-center max-w-sm">
              <p className="text-sm font-semibold text-gray-700">No se pudo generar el resumen</p>
              <p className="text-xs text-gray-400 mt-0.5">{errorResumenMsg}</p>
            </div>
          </div>
        ) : isLoadingResumen ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gray-100" />
                    <div className="space-y-1.5">
                      <div className="h-5 w-16 rounded-lg bg-gray-100" />
                      <div className="h-3 w-20 rounded-full bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <table className="w-full">
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={11} />)}
                </tbody>
              </table>
            </div>
          </div>
        ) : !enabled ? (
          <div className="card flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <LayoutGrid className="h-7 w-7 text-blue-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">Listo para generar</p>
              <p className="text-xs text-gray-400 mt-0.5">Selecciona un rango y pulsa "Generar reporte"</p>
            </div>
          </div>
        ) : resumen.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <LayoutGrid className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">Sin datos para el período seleccionado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #1B4FD8, #2563eb)' }}>
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{resumen.length}</p>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5">Colaboradores</p>
                </div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #e34948, #ef6665)' }}>
                  <BarChart2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalQuejas}</p>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5">Quejas totales</p>
                </div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #eb6834, #f2895a)' }}>
                  <Ticket className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalTickets}</p>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5">Tickets levantados</p>
                </div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #eda100, #f5b93a)' }}>
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalRetardos}</p>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5">Retardos totales</p>
                </div>
              </div>
              <div className="card flex items-center gap-3 p-4">
                <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
                  <TrendingUp className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-xl font-bold text-gray-900 leading-none">{totalChecklist}</p>
                  <p className="text-[0.7rem] text-gray-400 mt-0.5">Checklist completados</p>
                </div>
              </div>
            </div>

            {vistaResumen === 'tabla' ? (
              /* Tabla */
              <div className="card overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left bg-gray-50/50">
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colaborador</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rol</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Quejas</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Tickets</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Baño</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Comida</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Capacitación</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Permiso</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Checklist</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">A tiempo</th>
                        <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Retardos</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {[...resumen].sort((a, b) => a.nombre.localeCompare(b.nombre)).map((r) => (
                        <tr key={r.usuarioId} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 font-semibold text-gray-800 text-[0.82rem] whitespace-nowrap">{r.nombre}</td>
                          <td className="px-4 py-3">
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[0.65rem] font-semibold text-gray-500">
                              {ROLES_LABEL[r.rol] ?? r.rol}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-[0.78rem]">
                            {r.quejas > 0 ? <span className="font-semibold text-red-600">{r.quejas}</span> : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-[0.78rem]">
                            {r.tickets > 0 ? <span className="font-semibold text-orange-600">{r.tickets}</span> : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-[0.78rem] text-gray-500">{fmtMin(r.pausaBanioMin)}</td>
                          <td className="px-4 py-3 text-center text-[0.78rem] text-gray-500">{fmtMin(r.pausaComidaMin)}</td>
                          <td className="px-4 py-3 text-center text-[0.78rem] text-gray-500">{fmtMin(r.pausaCapacitacionMin)}</td>
                          <td className="px-4 py-3 text-center text-[0.78rem] text-gray-500">{fmtMin(r.pausaPermisoMin)}</td>
                          <td className="px-4 py-3 text-center text-[0.78rem]">
                            {r.checklistCompletados > 0 ? <span className="font-semibold text-emerald-600">{r.checklistCompletados}</span> : <span className="text-gray-300">0</span>}
                          </td>
                          <td className="px-4 py-3 text-center text-[0.78rem] text-gray-500">{r.entradasATiempo}</td>
                          <td className="px-4 py-3 text-center text-[0.78rem]">
                            {r.retardos > 0 ? <span className="font-semibold text-red-600">{r.retardos}</span> : <span className="text-gray-300">0</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* Dashboard de barras */
              <div className="card p-5">
                <ResumenDashboard rows={resumen} />
              </div>
            )}
          </div>
        )
      )}

      {/* ── Tiempos por usuario ── */}
      {tab === 'tiempos' && (
        isLoading ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-gray-100" />
                    <div className="space-y-1.5">
                      <div className="h-5 w-16 rounded-lg bg-gray-100" />
                      <div className="h-3 w-20 rounded-full bg-gray-100" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card overflow-hidden">
              <table className="w-full">
                <tbody className="divide-y divide-gray-50">
                  {Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)}
                </tbody>
              </table>
            </div>
          </div>
        ) : !enabled ? (
          <div className="card flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50">
              <BarChart2 className="h-7 w-7 text-blue-300" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">Listo para generar</p>
              <p className="text-xs text-gray-400 mt-0.5">Selecciona un rango y pulsa "Generar reporte"</p>
            </div>
          </div>
        ) : reporte.length === 0 ? (
          <div className="card flex flex-col items-center justify-center gap-4 py-20">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gray-100">
              <BarChart2 className="h-7 w-7 text-gray-300" />
            </div>
            <p className="text-sm text-gray-500">Sin datos para el período seleccionado</p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-3 gap-3">
              {stats.map((s) => (
                <div key={s.label} className="card flex items-center gap-3 p-4 hover:shadow-card-md transition-shadow">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-gray-900 leading-none">{s.val}</p>
                    <p className="text-[0.7rem] text-gray-400 mt-0.5">{s.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla */}
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left">
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Usuario</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Días trabajados</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total tiempo</th>
                    <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Proporción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {[...reporte].sort((a, b) => b.totalHoras - a.totalHoras).map((r) => {
                    const pct = totalHoras > 0 ? (r.totalHoras / totalHoras) * 100 : 0
                    const mins = r.totalMinutos % 60
                    return (
                      <tr key={r.usuarioId} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-gray-800 text-[0.82rem]">{r.nombre}</td>
                        <td className="px-4 py-3 text-gray-500 text-[0.78rem]">{r.diasTrabajados} día{r.diasTrabajados !== 1 ? 's' : ''}</td>
                        <td className="px-4 py-3 text-gray-500 text-[0.78rem]">{r.totalHoras}h {mins > 0 ? `${mins}m` : ''}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-muted transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-[0.65rem] text-gray-400 w-8 text-right">{Math.round(pct)}%</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  )
}
