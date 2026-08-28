import { Fragment, useRef, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertCircle, BarChart2, ChevronDown, ChevronRight, ChevronLeft,
  Clock, Download, FileText, FileWarning, Loader2, Table2, Upload, X,
  TrendingUp, CheckCircle2, AlertTriangle, Timer, CalendarDays, UserX,
  Settings2, Save, Edit3, Link2, RefreshCw, ShieldAlert, Umbrella,
  UserCog, Mail, Bell, History,
} from 'lucide-react'
import { api } from '@/lib/axios'
import { asistenciaReporteService, type AsistenciaActa } from '@/services/asistenciaReporte.service'
import { useAuthStore } from '@/stores/auth.store'
import { useActionAccess } from '@/hooks/useActionAccess'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

interface AsistenciaRegistro {
  id: number
  usuarioId: number
  nombre: string
  rol: string
  fecha: string
  horaEntrada: string | null
  horaEsperada: string | null
  minutosRetardo: number
  esRetardo: boolean
  esVacaciones?: boolean
  excepcionId?: number | null
  esFalta?: boolean
}

interface RetardoStat {
  usuarioId: number
  usuarioNombre: string | null
  usuarioRol: string | null
  totalRetardos: number
}

const ROLES = [
  { value: '', label: 'Todos los roles' },
  { value: 'AD', label: 'Administración' },
  { value: 'TI', label: 'Tecnología' },
  { value: 'CC', label: 'Call Center' },
  { value: 'CL', label: 'Clientes' },
]

const ROLES_LABEL: Record<string, string> = { AD: 'Administración', TI: 'Tecnología', CC: 'Call Center', CL: 'Clientes' }

const ESTADOS = [
  { value: '', label: 'Todos' },
  { value: 'a-tiempo', label: 'A tiempo' },
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
    const [y, m, d] = f.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return f
  }
}

function fmtFechaCorta(f: string) {
  try {
    const [y, m, d] = f.slice(0, 10).split('-').map(Number)
    return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return f
  }
}

function exportExcel(rows: AsistenciaRegistro[]) {
  const fechaGen = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' })

  const estadoLabel = (r: AsistenciaRegistro) =>
    r.esFalta ? 'Falta' : r.esVacaciones ? 'Vacaciones' : r.esRetardo ? 'Retardo' : 'A tiempo'

  const headers = ['#', 'Colaborador', 'Rol', 'Fecha', 'Hora entrada', 'Hora esperada', 'Estado', 'Minutos de retardo']
  const data = rows.map((r, i) => [
    i + 1,
    r.nombre ?? '',
    ROLES_LABEL[r.rol] ?? r.rol,
    fmtFechaCorta(r.fecha),
    r.horaEntrada ?? '—',
    r.horaEsperada ?? '—',
    estadoLabel(r),
    r.esRetardo && !r.esVacaciones && !r.esFalta ? r.minutosRetardo : 0,
  ])

  const titleRow = [`Reporte de Asistencia — ${fechaGen} · ${rows.length} registros`, '', '', '', '', '', '', '']

  const wsData = [titleRow, headers, ...data]
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  ws['!cols'] = [{ wch: 5 }, { wch: 32 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 18 }]
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 7 } }]

  const titleStyle = {
    font: { bold: true, sz: 13, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF1B4FD8' }, patternType: 'solid' },
    alignment: { horizontal: 'left', vertical: 'center' },
  }
  const headerStyle = {
    font: { bold: true, sz: 10, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FF3B6FE0' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
    border: { bottom: { style: 'thin', color: { rgb: 'FF1B4FD8' } } },
  }
  const cellEven = {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'FFEFF4FF' }, patternType: 'solid' },
    alignment: { vertical: 'center' },
  }
  const cellOdd = {
    font: { sz: 10 },
    fill: { fgColor: { rgb: 'FFFFFFFF' }, patternType: 'solid' },
    alignment: { vertical: 'center' },
  }
  const retardoStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FF991B1B' } },
    fill: { fgColor: { rgb: 'FFFEE2E2' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const aTiempoStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FF166534' } },
    fill: { fgColor: { rgb: 'FFDCFCE7' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const faltaStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FFFFFFFF' } },
    fill: { fgColor: { rgb: 'FFB91C1C' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const vacacionesStyle = {
    font: { sz: 10, bold: true, color: { rgb: 'FF0369A1' } },
    fill: { fgColor: { rgb: 'FFE0F2FE' }, patternType: 'solid' },
    alignment: { horizontal: 'center', vertical: 'center' },
  }
  const estadoStyle = (estado: string) =>
    estado === 'Falta' ? faltaStyle : estado === 'Vacaciones' ? vacacionesStyle : estado === 'Retardo' ? retardoStyle : aTiempoStyle

  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

  cols.forEach(c => { if (ws[`${c}1`]) ws[`${c}1`].s = titleStyle })
  cols.forEach(c => { if (ws[`${c}2`]) ws[`${c}2`].s = headerStyle })
  data.forEach((row, i) => {
    const excelRow = i + 3
    const isEven = i % 2 === 0
    cols.forEach((c, ci) => {
      const cell = ws[`${c}${excelRow}`]
      if (!cell) return
      if (ci === 6) {
        cell.s = estadoStyle(String(row[6]))
      } else {
        cell.s = isEven ? cellEven : cellOdd
      }
    })
  })

  ws['!rows'] = [{ hpt: 22 }, { hpt: 18 }, ...data.map(() => ({ hpt: 16 }))]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Asistencia')
  XLSX.writeFile(wb, `asistencia_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

const BAR_HEIGHT = 24
const BAR_GAP = 14
const CHART_PAD_LEFT = 170
const CHART_PAD_RIGHT = 56

function BarRow({ stat, maxTotal, index }: { stat: RetardoStat; maxTotal: number; index: number }) {
  const [hover, setHover] = useState(false)
  const pct = maxTotal > 0 ? stat.totalRetardos / maxTotal : 0
  const y = index * (BAR_HEIGHT + BAR_GAP)
  const nombre = stat.usuarioNombre ?? `Usuario #${stat.usuarioId}`

  return (
    <g
      transform={`translate(0, ${y})`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <text x={CHART_PAD_LEFT - 12} y={BAR_HEIGHT / 2 - 1} textAnchor="end" fontSize="12" className="fill-gray-700 font-medium">
        {nombre.length > 20 ? `${nombre.slice(0, 19)}…` : nombre}
      </text>
      {stat.usuarioRol && (
        <text x={CHART_PAD_LEFT - 12} y={BAR_HEIGHT / 2 + 11} textAnchor="end" fontSize="9" fontWeight="600" className="fill-gray-400 uppercase tracking-wide">
          {ROLES_LABEL[stat.usuarioRol] ?? stat.usuarioRol}
        </text>
      )}
      <rect
        x={CHART_PAD_LEFT}
        y={2}
        width={`calc((100% - ${CHART_PAD_LEFT + CHART_PAD_RIGHT}px) * ${pct})`}
        height={BAR_HEIGHT - 4}
        rx={4}
        className={hover ? 'fill-red-600' : 'fill-red-500'}
        style={{ transition: 'fill 120ms ease' }}
      />
      <text x={CHART_PAD_LEFT + 8} y={BAR_HEIGHT / 2 + 4} fontSize="11" fontWeight="700" className="fill-white" style={{ pointerEvents: 'none' }}>
        {stat.totalRetardos}
      </text>
      {hover && (
        <title>{`${nombre}${stat.usuarioRol ? ` · ${ROLES_LABEL[stat.usuarioRol] ?? stat.usuarioRol}` : ''} — ${stat.totalRetardos} ${stat.totalRetardos === 1 ? 'retardo' : 'retardos'}`}</title>
      )}
    </g>
  )
}

function ReporteRetardoButton({ asistenciaId }: { asistenciaId: number }) {
  const mut = useMutation({
    mutationFn: async () => {
      const existente = await asistenciaReporteService.getPorAsistencia(asistenciaId)
      const reporte = existente ?? (await asistenciaReporteService.crear(asistenciaId))
      const url = await asistenciaReporteService.obtenerPdfUrl(reporte.id)
      window.open(url, '_blank')
    },
    onError: () => toast.error('No se pudo generar el reporte'),
  })

  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      title="Generar reporte de retardo"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-gray-500 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-50"
    >
      {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileText className="h-3 w-3" />}
      Reporte
    </button>
  )
}

const MESES_LABEL = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

function VerActaButton({ actaId }: { actaId: number }) {
  const mut = useMutation({
    mutationFn: async () => {
      const url = await asistenciaReporteService.obtenerActaPdfUrl(actaId)
      window.open(url, '_blank')
    },
    onError: () => toast.error('No se pudo abrir el acta'),
  })
  return (
    <button
      onClick={() => mut.mutate()}
      disabled={mut.isPending}
      title="Ver e imprimir acción correctiva"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-gray-500 hover:border-brand/40 hover:text-brand transition-colors disabled:opacity-50"
    >
      {mut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
      Ver PDF
    </button>
  )
}

function ActasSection() {
  const { data: actas = [], isLoading, error } = useQuery<AsistenciaActa[]>({
    queryKey: ['asistencia-actas'],
    queryFn: () => asistenciaReporteService.listarActas(),
    staleTime: 30_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-50 border border-orange-200">
            <FileWarning className="h-3.5 w-3.5 text-orange-500" />
          </div>
          <div>
            <h2 className="text-[0.82rem] font-semibold text-gray-800">Acciones correctivas</h2>
            <p className="text-[0.68rem] text-gray-400 mt-px">Se generan al 3er retardo del mes</p>
          </div>
        </div>
        {actas.length > 0 && (
          <span className="inline-flex items-center rounded-full bg-orange-50 border border-orange-200 px-2.5 py-0.5 text-[0.68rem] font-semibold text-orange-600">
            {actas.length} documento{actas.length !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16 text-red-500 text-sm">Error al cargar las acciones correctivas</div>
      ) : actas.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
            <FileWarning className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-[0.82rem] text-gray-400">Aún no se ha generado ninguna acción correctiva</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/40">
                <th className="px-5 py-2.5 text-left text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Colaborador</th>
                <th className="px-5 py-2.5 text-left text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Periodo</th>
                <th className="px-5 py-2.5 text-left text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Retardos</th>
                <th className="px-5 py-2.5 text-left text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Generada</th>
                <th className="px-5 py-2.5 text-left text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wider">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {actas.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50/60 transition-colors">
                  <td className="px-5 py-3">
                    <p className="font-semibold text-gray-800 text-[0.82rem] leading-tight">{a.nombre}</p>
                  </td>
                  <td className="px-5 py-3 text-[0.78rem] text-gray-600 capitalize">{MESES_LABEL[a.mes - 1]} {a.anio}</td>
                  <td className="px-5 py-3">
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[0.68rem] font-bold text-red-600">
                      {a.totalRetardos} retardos
                    </span>
                  </td>
                  <td className="px-5 py-3 text-[0.75rem] text-gray-400">{fmtFechaCorta(a.fechaCreacion)}</td>
                  <td className="px-5 py-3">
                    <VerActaButton actaId={a.id} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const AREA_ORDER = ['CC', 'AD', 'TI']

const AREA_BADGE: Record<string, string> = {
  CC: 'bg-blue-50 text-blue-700 border-blue-200',
  AD: 'bg-violet-50 text-violet-700 border-violet-200',
  TI: 'bg-amber-50 text-amber-700 border-amber-200',
}

function VacacionesButton({ registro }: { registro: AsistenciaRegistro }) {
  const qc = useQueryClient()

  const marcar = useMutation({
    mutationFn: () => asistenciaReporteService.marcarVacaciones(registro.usuarioId, registro.fecha),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
      qc.invalidateQueries({ queryKey: ['mi-saldo'] })
      toast.success('Marcado como vacaciones')
    },
    onError: () => toast.error('No se pudo marcar como vacaciones'),
  })

  const quitar = useMutation({
    mutationFn: () => asistenciaReporteService.quitarExcepcion(registro.excepcionId!),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      qc.invalidateQueries({ queryKey: ['vacaciones-resumen-agentes'] })
      qc.invalidateQueries({ queryKey: ['mi-saldo'] })
      toast.success('Marca de vacaciones removida')
    },
    onError: () => toast.error('No se pudo quitar la marca'),
  })

  if (registro.esVacaciones) {
    return (
      <button
        onClick={() => quitar.mutate()}
        disabled={quitar.isPending}
        title="Quitar marca de vacaciones"
        className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[0.7rem] font-semibold text-sky-600 hover:bg-sky-100 transition-colors disabled:opacity-50"
      >
        {quitar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Umbrella className="h-3 w-3" />}
        Quitar vacaciones
      </button>
    )
  }

  return (
    <button
      onClick={() => marcar.mutate()}
      disabled={marcar.isPending}
      title="Marcar como vacaciones"
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-2.5 py-1 text-[0.7rem] font-semibold text-gray-500 hover:border-sky-300 hover:text-sky-600 transition-colors disabled:opacity-50"
    >
      {marcar.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Umbrella className="h-3 w-3" />}
      Vacaciones
    </button>
  )
}

function DiaSection({ fecha, filas, defaultOpen }: { fecha: string; filas: AsistenciaRegistro[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const isADorTI = useAuthStore((s) => s.isADorTI())
  const { can } = useActionAccess()
  const puedeMarcarVacaciones = isADorTI && can('asistencia', 'marcar-vacaciones')
  const retardos = filas.filter(r => r.esRetardo && !r.esVacaciones).length
  const vacaciones = filas.filter(r => r.esVacaciones).length
  const faltas = filas.filter(r => r.esFalta).length
  const aTiempo = filas.length - retardos - vacaciones - faltas

  const porArea = useMemo(() => {
    const map = new Map<string, AsistenciaRegistro[]>()
    for (const r of filas) {
      const lista = map.get(r.rol) ?? []
      lista.push(r)
      map.set(r.rol, lista)
    }
    const ordered: Array<[string, AsistenciaRegistro[]]> = []
    for (const rol of AREA_ORDER) {
      if (map.has(rol)) ordered.push([rol, map.get(rol)!])
    }
    for (const [rol, rows] of map) {
      if (!AREA_ORDER.includes(rol)) ordered.push([rol, rows])
    }
    return ordered
  }, [filas])

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50/60 hover:bg-gray-100/70 transition-colors text-left"
      >
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />}
        <span className="text-[0.8rem] font-semibold text-gray-700 capitalize flex-1">{fmtFecha(fecha)}</span>
        <div className="flex items-center gap-2">
          {faltas > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 border border-red-300 px-2.5 py-0.5 text-[0.65rem] font-bold text-red-700">
              <UserX className="h-2.5 w-2.5" /> {faltas} falta{faltas !== 1 ? 's' : ''}
            </span>
          )}
          {retardos > 0 && (
            <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2.5 py-0.5 text-[0.65rem] font-semibold text-red-600">
              {retardos} retardo{retardos !== 1 ? 's' : ''}
            </span>
          )}
          {vacaciones > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 border border-sky-200 px-2.5 py-0.5 text-[0.65rem] font-semibold text-sky-600">
              <Umbrella className="h-2.5 w-2.5" /> {vacaciones} vacaciones
            </span>
          )}
          <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[0.65rem] font-semibold text-emerald-600">
            {aTiempo} a tiempo
          </span>
          <span className="text-[0.7rem] text-gray-400 tabular-nums">{filas.length} total</span>
        </div>
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="px-4 py-2 text-center text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider w-10">#</th>
                <th className="px-4 py-2 text-left text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Colaborador</th>
                <th className="px-4 py-2 text-left text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Entrada</th>
                <th className="px-4 py-2 text-left text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Esperada</th>
                <th className="px-4 py-2 text-left text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Estado</th>
                <th className="px-4 py-2 text-left text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Reporte</th>
              </tr>
            </thead>
            <tbody>
              {porArea.map(([rol, rows]) => (
                <Fragment key={rol}>
                  <tr className="border-y border-gray-100 bg-gray-50/40">
                    <td colSpan={6} className="px-4 py-1.5">
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.65rem] font-semibold ${AREA_BADGE[rol] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                        {ROLES_LABEL[rol] ?? rol} · {rows.length}
                      </span>
                    </td>
                  </tr>
                  {rows.map((r, i) => (
                    <tr
                      key={r.id}
                      className={`border-b border-gray-50 hover:bg-gray-50/70 transition-colors ${r.esFalta ? 'bg-red-100/30' : r.esVacaciones ? 'bg-sky-50/20' : r.esRetardo ? 'bg-red-50/20' : ''}`}
                    >
                      <td className="px-4 py-2.5 text-center text-[0.68rem] text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5">
                        <span className="font-medium text-gray-800 text-[0.8rem]">{r.nombre}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {r.esFalta ? (
                          <span className="font-mono text-[0.78rem] text-gray-300">—</span>
                        ) : (
                          <span className={`font-mono text-[0.78rem] tabular-nums ${r.esRetardo && !r.esVacaciones ? 'text-red-600 font-semibold' : 'text-gray-700'}`}>
                            {r.horaEntrada}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-mono text-[0.75rem] tabular-nums text-gray-400">{r.esFalta ? '—' : r.horaEsperada}</td>
                      <td className="px-4 py-2.5">
                        {r.esFalta ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-300 bg-red-100 px-2.5 py-0.5 text-[0.68rem] font-bold text-red-700">
                            <UserX className="h-2.5 w-2.5" />
                            Falta
                          </span>
                        ) : r.esVacaciones ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[0.68rem] font-semibold text-sky-600">
                            <Umbrella className="h-2.5 w-2.5" />
                            Vacaciones
                          </span>
                        ) : r.esRetardo ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[0.68rem] font-semibold text-red-600">
                            <Timer className="h-2.5 w-2.5" />
                            {r.minutosRetardo} min
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[0.68rem] font-semibold text-emerald-600">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            A tiempo
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {r.esRetardo && !r.esVacaciones && !r.esFalta && <ReporteRetardoButton asistenciaId={r.id} />}
                          {puedeMarcarVacaciones && <VacacionesButton registro={r} />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TablaAgrupada({
  registros, isLoading, error, rangoInvalido, esDiaUnico,
}: {
  registros: AsistenciaRegistro[]
  isLoading: boolean
  error: unknown
  rangoInvalido: boolean
  esDiaUnico: boolean
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, AsistenciaRegistro[]>()
    for (const r of registros) {
      const lista = map.get(r.fecha) ?? []
      lista.push(r)
      map.set(r.fecha, lista)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [registros])

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 border border-brand/20">
            <Table2 className="h-3.5 w-3.5 text-brand" />
          </div>
          <span className="text-[0.82rem] font-semibold text-gray-800">Detalle de entradas</span>
        </div>
        <span className="text-[0.72rem] text-gray-400 tabular-nums">
          {grupos.length > 1 ? `${grupos.length} días · ` : ''}{registros.length} registro{registros.length !== 1 ? 's' : ''}
        </span>
      </div>

      {rangoInvalido ? (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">Corrige el rango de fechas</div>
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : error ? (
        <div className="flex items-center justify-center py-16 text-red-500 text-sm">Error al cargar el reporte</div>
      ) : registros.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-gray-400">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
            <Clock className="h-6 w-6 text-gray-300" />
          </div>
          <p className="text-[0.82rem]">Sin registros en este período</p>
        </div>
      ) : (
        <div>
          {grupos.map(([fecha, filas], i) => (
            <DiaSection
              key={fecha}
              fecha={fecha}
              filas={filas}
              defaultOpen={esDiaUnico || i === 0}
            />
          ))}
        </div>
      )}
    </div>
  )
}

interface BiotimeSyncResultado {
  insertados: number
  saltados: number
  sinMapeo: string[]
  alertas: number
  errores?: string[]
}

function UploadBiometricoButton() {
  const qc = useQueryClient()
  const inputRef = useRef<HTMLInputElement>(null)
  const [resultado, setResultado] = useState<{ insertados: number; saltados: number; noEncontrados: string[] } | null>(null)
  const [showBiotimeModal, setShowBiotimeModal] = useState(false)

  const mut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append('archivo', file)
      const { data } = await api.post('/asistencia/upload-biometrico', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      qc.invalidateQueries({ queryKey: ['asistencia-retardos-stats'] })
      setResultado({ insertados: data.insertados, saltados: data.saltados, noEncontrados: data.noEncontrados ?? [] })
      toast.success(`${data.insertados} registros cargados`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Error al procesar el archivo')
    },
  })

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) { setResultado(null); mut.mutate(file) }
          e.target.value = ''
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={mut.isPending}
        title="Cargar registro biométrico (Excel)"
        className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 transition-colors px-3.5 h-9 text-[0.75rem] font-semibold text-white"
      >
        {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Biométrico
      </button>
      <button
        onClick={() => setShowBiotimeModal(true)}
        title="Sincronizar desde BioTime"
        className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 transition-colors px-3.5 h-9 text-[0.75rem] font-semibold text-white"
      >
        <Link2 className="h-4 w-4" />
        BioTime
      </button>
      {resultado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setResultado(null)}>
          <div className="w-full max-w-sm bg-card rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-5 py-4 flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Carga biométrica completada</h3>
              <button onClick={() => setResultado(null)} className="text-white/70 hover:text-white text-lg">×</button>
            </div>
            <div className="p-5 space-y-3">
              <div className="flex gap-3">
                <div className="flex-1 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{resultado.insertados}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Insertados</p>
                </div>
                <div className="flex-1 rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{resultado.saltados}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Ya existían / omitidos</p>
                </div>
              </div>
              {resultado.noEncontrados.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Colaboradores no encontrados en el sistema:</p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {resultado.noEncontrados.map((n) => <li key={n}>· {n}</li>)}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showBiotimeModal && <SyncBiotimeModal onClose={() => setShowBiotimeModal(false)} />}
    </>
  )
}

function SyncBiotimeModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [json, setJson] = useState('')
  const [resultado, setResultado] = useState<BiotimeSyncResultado | null>(null)

  const mut = useMutation({
    mutationFn: async (registros: unknown[]) => {
      const { data } = await api.post('/asistencia/sync-biotime', { registros })
      return data as BiotimeSyncResultado
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      qc.invalidateQueries({ queryKey: ['asistencia-retardos-stats'] })
      qc.invalidateQueries({ queryKey: ['biotime-map'] })
      qc.invalidateQueries({ queryKey: ['biotime-alertas'] })
      setResultado(data)
      toast.success(`BioTime: ${data.insertados} registros procesados`)
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'Error al sincronizar BioTime')
    },
  })

  function handleSync() {
    try {
      const parsed = JSON.parse(json)
      const arr = Array.isArray(parsed) ? parsed : parsed.registros ?? parsed.data ?? []
      if (!Array.isArray(arr) || arr.length === 0) {
        toast.error('El JSON debe contener un array de registros')
        return
      }
      mut.mutate(arr)
    } catch {
      toast.error('JSON inválido — verifica el formato')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-full max-w-lg bg-card rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="bg-gradient-to-r from-[#0D1B3E] to-[#1B4FD8] px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-white" />
            <h3 className="text-sm font-bold text-white">Sincronizar desde BioTime</h3>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5 space-y-4">
          {!resultado ? (
            <>
              <p className="text-[0.78rem] text-gray-500">
                Pega el JSON exportado de BioTime. Formato esperado:
              </p>
              <pre className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-[0.68rem] text-gray-500 overflow-x-auto">{`[
  { "emp_code": "0052", "punch_time": "2026-07-23 09:56:57", "biotime_id": 12345 },
  ...
]`}</pre>
              <textarea
                value={json}
                onChange={(e) => setJson(e.target.value)}
                placeholder="Pega el JSON aquí..."
                rows={6}
                className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.78rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="px-4 py-2 rounded-xl text-[0.78rem] text-gray-500 hover:bg-gray-100 transition-colors">Cancelar</button>
                <button
                  onClick={handleSync}
                  disabled={!json.trim() || mut.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-brand text-white text-[0.78rem] font-semibold hover:bg-brand/90 disabled:opacity-40 transition-colors"
                >
                  {mut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sincronizar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{resultado.insertados}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">Insertados</p>
                </div>
                <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{resultado.saltados}</p>
                  <p className="text-xs text-gray-400 mt-0.5">Omitidos</p>
                </div>
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                  <p className="text-2xl font-bold text-amber-700">{resultado.alertas}</p>
                  <p className="text-xs text-amber-600 mt-0.5">Alertas inactivos</p>
                </div>
              </div>
              {resultado.sinMapeo.length > 0 && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Emp_codes sin mapeo en el sistema:</p>
                  <ul className="text-xs text-amber-600 space-y-0.5">
                    {resultado.sinMapeo.map((c) => <li key={c}>· {c}</li>)}
                  </ul>
                </div>
              )}
              {resultado.errores && resultado.errores.length > 0 && (
                <div className="rounded-xl bg-red-50 border border-red-200 p-3">
                  <p className="text-xs font-semibold text-red-700 mb-1">Errores ({resultado.errores.length}):</p>
                  <ul className="text-xs text-red-600 space-y-0.5">
                    {resultado.errores.map((e, i) => <li key={i}>· {e}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => { setResultado(null); setJson('') }} className="px-4 py-2 rounded-xl text-[0.78rem] text-gray-500 hover:bg-gray-100 transition-colors">Nueva sincronización</button>
                <button onClick={onClose} className="px-4 py-2 rounded-xl bg-brand text-white text-[0.78rem] font-semibold hover:bg-brand/90 transition-colors">Cerrar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

interface BiotimeMapRow {
  id: number
  empCode: string
  neusId: number
  nombre: string | null
  rol: string | null
  activo: boolean
  fechaMapeo: string
  metodo: string
}

interface BiotimeAlerta {
  id: number
  empCode: string
  neusId: number | null
  nombre: string | null
  punchTime: string
  tipo: string
  fechaDeteccion: string
}

function BiotimeTab() {
  const [tabBio, setTabBio] = useState<'mapa' | 'alertas'>('mapa')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const { data: mapa = [], isLoading: loadingMapa, refetch: refetchMapa } = useQuery<BiotimeMapRow[]>({
    queryKey: ['biotime-map'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/biotime/map')
      return data.data ?? []
    },
    staleTime: 30_000,
  })

  const { data: alertasData, isLoading: loadingAlertas, refetch: refetchAlertas } = useQuery<{ data: BiotimeAlerta[]; total: number }>({
    queryKey: ['biotime-alertas', desde, hasta],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/biotime/alertas', {
        params: { desde: desde || undefined, hasta: hasta || undefined, limit: 100 },
      })
      return data
    },
    staleTime: 30_000,
  })

  const alertas = alertasData?.data ?? []

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 border-b border-gray-200 pb-1">
        {(['mapa', 'alertas'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTabBio(t)}
            className={`px-4 py-1.5 rounded-t-lg text-[0.78rem] font-semibold transition-colors ${
              tabBio === t ? 'bg-card border border-b-white border-gray-200 text-brand' : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {t === 'mapa' ? `Mapeo emp_code (${mapa.length})` : `Alertas inactivos (${alertasData?.total ?? 0})`}
          </button>
        ))}
        <button
          onClick={() => { refetchMapa(); refetchAlertas() }}
          className="ml-auto flex items-center gap-1 text-[0.72rem] text-gray-400 hover:text-brand transition-colors px-2 py-1"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refrescar
        </button>
      </div>

      {tabBio === 'mapa' && (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand" />
            <span className="text-[0.82rem] font-semibold text-gray-800">Mapeo BioTime emp_code → empleado</span>
          </div>
          {loadingMapa ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand/40" /></div>
          ) : mapa.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400">
              <Link2 className="h-8 w-8 text-gray-200 mb-2" />
              <p className="text-[0.82rem]">Sin mapeos registrados</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[0.78rem]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Emp Code</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Empleado</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Rol</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Estado</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Método</th>
                    <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Fecha mapeo</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {mapa.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/60 transition-colors">
                      <td className="px-4 py-2.5 font-mono font-semibold text-brand">{row.empCode}</td>
                      <td className="px-4 py-2.5 text-gray-800">{row.nombre ?? <span className="text-gray-400 italic">Sin nombre</span>}</td>
                      <td className="px-4 py-2.5 text-gray-500">{row.rol ?? '—'}</td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold ${row.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'}`}>
                          {row.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{row.metodo}</td>
                      <td className="px-4 py-2.5 text-gray-400">{row.fechaMapeo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tabBio === 'alertas' && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Desde</label>
              <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Hasta</label>
              <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30" />
            </div>
            {(desde || hasta) && (
              <button onClick={() => { setDesde(''); setHasta('') }} className="flex items-center gap-1 text-[0.72rem] text-gray-400 hover:text-gray-600 px-2 py-1.5">
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <span className="text-[0.82rem] font-semibold text-gray-800">Usuarios inactivos que marcaron en BioTime</span>
            </div>
            {loadingAlertas ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-brand/40" /></div>
            ) : alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                <ShieldAlert className="h-8 w-8 text-gray-200 mb-2" />
                <p className="text-[0.82rem]">Sin alertas en este período</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[0.78rem]">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/60">
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Emp Code</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Empleado</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Punch Time</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Tipo</th>
                      <th className="px-4 py-2.5 text-left font-semibold text-gray-500 text-[0.68rem] uppercase tracking-wider">Detectado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {alertas.map((a) => (
                      <tr key={a.id} className="hover:bg-amber-50/30 transition-colors">
                        <td className="px-4 py-2.5 font-mono font-semibold text-amber-600">{a.empCode}</td>
                        <td className="px-4 py-2.5 text-gray-800">{a.nombre ?? <span className="text-gray-400 italic">Sin mapeo</span>}</td>
                        <td className="px-4 py-2.5 text-gray-700 tabular-nums">{a.punchTime}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.65rem] font-semibold text-amber-700">
                            {a.tipo}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{a.fechaDeteccion}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ── interfaces para el resumen del mes ── */
interface ResumenDiaItem {
  usuarioId: number
  nombre: string
  rol: string
  horaEntrada?: string
  horaEsperada?: string
  minutosRetardo?: number
}

interface ResumenDia {
  retardos: ResumenDiaItem[]
  faltas:   ResumenDiaItem[]
}

interface ResumenMesDia { dia: number; total: number }

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

const ROL_PILL_CAL: Record<string, string> = {
  CC: 'bg-blue-100 text-blue-700',
  AD: 'bg-violet-100 text-violet-700',
  TI: 'bg-amber-100 text-amber-700',
}

/* ── Vista calendario de asistencia (faltas y retardos) ── */
function CalendarioAsistencia() {
  const now = new Date()
  const [year,  setYear]  = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())       // 0-based
  const [diaSeleccionado, setDiaSeleccionado] = useState<number | null>(null)

  const prevMes = () => { if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1); setDiaSeleccionado(null) }
  const nextMes = () => { if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1); setDiaSeleccionado(null) }

  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  /* ── Resumen mensual: puntos por día ── */
  const { data: resumenMes, isLoading: loadingMes } = useQuery<{
    retardos: ResumenMesDia[]
    faltas:   ResumenMesDia[]
  }>({
    queryKey: ['asistencia-resumen-mes', year, month],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/resumen-mes', { params: { mes: month + 1, anio: year } })
      return { retardos: data.retardos ?? [], faltas: data.faltas ?? [] }
    },
    staleTime: 60_000,
  })

  const mapRetardos = useMemo(() => {
    const m = new Map<number, number>()
    for (const r of resumenMes?.retardos ?? []) m.set(r.dia, r.total)
    return m
  }, [resumenMes])

  const mapFaltas = useMemo(() => {
    const m = new Map<number, number>()
    for (const f of resumenMes?.faltas ?? []) m.set(f.dia, f.total)
    return m
  }, [resumenMes])

  /* ── Detalle del día seleccionado ── */
  const fechaSelStr = diaSeleccionado
    ? `${year}-${String(month + 1).padStart(2,'0')}-${String(diaSeleccionado).padStart(2,'0')}`
    : null

  const { data: detalleDia, isLoading: loadingDia } = useQuery<ResumenDia>({
    queryKey: ['asistencia-resumen-dia', fechaSelStr],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/resumen-dia', { params: { fecha: fechaSelStr } })
      return { retardos: data.retardos ?? [], faltas: data.faltas ?? [] }
    },
    enabled: !!fechaSelStr,
    staleTime: 60_000,
  })

  const hayIncidencias = (dia: number) => mapRetardos.has(dia) || mapFaltas.has(dia)

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      {/* panel header */}
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 border border-brand/20">
            <CalendarDays className="h-3.5 w-3.5 text-brand" />
          </div>
          <span className="text-[0.82rem] font-semibold text-gray-800">Calendario de incidencias</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[0.68rem] text-gray-400">
            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" /> Retardo
            <span className="inline-block h-2 w-2 rounded-full bg-red-400 ml-2" /> Falta
          </span>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">

        {/* ── Calendario ── */}
        <div className="flex-1 p-5 min-w-0">
          {/* Navegación mes */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={prevMes}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <h3 className="text-[0.88rem] font-bold text-gray-800">{MESES[month]} {year}</h3>
            <button
              onClick={nextMes}
              className="flex h-8 w-8 items-center justify-center rounded-xl border border-gray-200 text-gray-400 hover:border-brand hover:text-brand transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Cabecera días */}
          <div className="grid grid-cols-7 mb-1">
            {DIAS_SEMANA.map(d => (
              <div key={d} className="text-center text-[0.65rem] font-semibold text-gray-400 uppercase tracking-wide py-1">{d}</div>
            ))}
          </div>

          {/* Grid */}
          {loadingMes ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="h-12 rounded-xl bg-gray-100/60 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dia = i + 1
                const retardos = mapRetardos.get(dia) ?? 0
                const faltas   = mapFaltas.get(dia)   ?? 0
                const isToday  = dia === now.getDate() && month === now.getMonth() && year === now.getFullYear()
                const isSel    = dia === diaSeleccionado

                // Color de fondo según el tipo de incidencia más grave
                let bgClass = ''
                if (isSel) bgClass = 'ring-2 ring-brand bg-brand/8'
                else if (faltas > 0 && retardos > 0) bgClass = 'bg-gradient-to-br from-amber-50 to-red-50 border border-red-100'
                else if (faltas > 0) bgClass = 'bg-red-50 border border-red-100'
                else if (retardos > 0) bgClass = 'bg-amber-50 border border-amber-100'

                return (
                  <button
                    key={dia}
                    onClick={() => setDiaSeleccionado(dia === diaSeleccionado ? null : dia)}
                    className={`relative flex flex-col items-center justify-start rounded-xl p-1.5 min-h-[52px] transition-all duration-150 ${
                      bgClass || (isToday ? 'bg-brand/8 ring-1 ring-brand/30' : 'hover:bg-gray-50')
                    }`}
                  >
                    <span className={`text-[0.72rem] font-bold ${
                      isSel ? 'text-brand' : isToday ? 'text-brand' : hayIncidencias(dia) ? 'text-gray-800' : 'text-gray-500'
                    }`}>
                      {dia}
                    </span>
                    {/* Indicadores */}
                    {(retardos > 0 || faltas > 0) && (
                      <div className="flex flex-col gap-0.5 mt-1 w-full px-0.5">
                        {retardos > 0 && (
                          <div className="flex items-center gap-0.5">
                            <span className="block h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                            <span className="text-[9px] font-bold text-amber-600 tabular-nums">{retardos}</span>
                          </div>
                        )}
                        {faltas > 0 && (
                          <div className="flex items-center gap-0.5">
                            <span className="block h-1.5 w-1.5 rounded-full bg-red-400 flex-shrink-0" />
                            <span className="text-[9px] font-bold text-red-500 tabular-nums">{faltas}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Panel detalle del día ── */}
        <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 flex flex-col">
          {!diaSeleccionado ? (
            <div className="flex flex-col items-center justify-center gap-2 h-full py-16 text-gray-400">
              <CalendarDays className="h-8 w-8 text-gray-200" />
              <p className="text-[0.75rem]">Selecciona un día para ver el detalle</p>
            </div>
          ) : (
            <>
              {/* header día */}
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/50">
                <p className="text-[0.8rem] font-bold text-gray-800 capitalize">
                  {new Date(year, month, diaSeleccionado).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
                {!loadingDia && detalleDia && (
                  <div className="flex items-center gap-2 mt-1">
                    {detalleDia.retardos.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.62rem] font-semibold text-amber-600">
                        <Timer className="h-2.5 w-2.5" />
                        {detalleDia.retardos.length} retardo{detalleDia.retardos.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {detalleDia.faltas.length > 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.62rem] font-semibold text-red-600">
                        <UserX className="h-2.5 w-2.5" />
                        {detalleDia.faltas.length} falta{detalleDia.faltas.length !== 1 ? 's' : ''}
                      </span>
                    )}
                    {detalleDia.retardos.length === 0 && detalleDia.faltas.length === 0 && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.62rem] font-semibold text-emerald-600">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        Sin incidencias
                      </span>
                    )}
                  </div>
                )}
              </div>

              {loadingDia ? (
                <div className="flex items-center justify-center gap-2 py-12 text-gray-400 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
                </div>
              ) : !detalleDia || (detalleDia.retardos.length === 0 && detalleDia.faltas.length === 0) ? (
                <div className="flex flex-col items-center justify-center gap-2 py-12 text-gray-400">
                  <CheckCircle2 className="h-6 w-6 text-emerald-300" />
                  <p className="text-[0.75rem]">Sin incidencias este día</p>
                </div>
              ) : (
                <div className="overflow-y-auto flex-1 divide-y divide-gray-100">

                  {/* Retardos */}
                  {detalleDia.retardos.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-amber-50/70 sticky top-0">
                        <Timer className="h-3 w-3 text-amber-500" />
                        <span className="text-[0.62rem] font-bold text-amber-600 uppercase tracking-wider">
                          Retardos — {detalleDia.retardos.length}
                        </span>
                      </div>
                      {detalleDia.retardos.map((r) => (
                        <div key={r.usuarioId} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
                          {/* Avatar */}
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-amber-100 border border-amber-200 text-[0.6rem] font-bold text-amber-700">
                            {r.nombre.trim().split(' ').slice(0,2).map(s => s[0]).join('').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[0.75rem] font-semibold text-gray-800 truncate leading-tight">{r.nombre}</p>
                            <div className="flex items-center flex-wrap gap-1.5 mt-0.5">
                              <span className={`text-[0.58rem] font-bold px-1.5 py-px rounded-full ${ROL_PILL_CAL[r.rol] ?? 'bg-gray-100 text-gray-600'}`}>
                                {ROLES_LABEL[r.rol] ?? r.rol}
                              </span>
                              {r.horaEntrada && (
                                <span className="font-mono text-[0.65rem] text-amber-600 font-semibold tabular-nums">{r.horaEntrada}</span>
                              )}
                              {r.minutosRetardo != null && (
                                <span className="text-[0.62rem] text-amber-500">+{r.minutosRetardo} min</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Faltas */}
                  {detalleDia.faltas.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 px-4 py-2 bg-red-50/70 sticky top-0">
                        <UserX className="h-3 w-3 text-red-500" />
                        <span className="text-[0.62rem] font-bold text-red-600 uppercase tracking-wider">
                          Faltas — {detalleDia.faltas.length}
                        </span>
                      </div>
                      {detalleDia.faltas.map((f) => (
                        <div key={f.usuarioId} className="flex items-start gap-3 px-4 py-2.5 hover:bg-gray-50/60 transition-colors">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-red-100 border border-red-200 text-[0.6rem] font-bold text-red-600">
                            {f.nombre.trim().split(' ').slice(0,2).map(s => s[0]).join('').toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[0.75rem] font-semibold text-gray-800 truncate leading-tight">{f.nombre}</p>
                            <span className={`text-[0.58rem] font-bold px-1.5 py-px rounded-full mt-0.5 inline-block ${ROL_PILL_CAL[f.rol] ?? 'bg-gray-100 text-gray-600'}`}>
                              {ROLES_LABEL[f.rol] ?? f.rol}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Horario editable ── */
const DIAS_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
const DIAS_FULL   = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']

interface HorarioEspecial {
  id: number
  horarioId: number
  diaSemana: number
  horaEntrada: string
  horaSalida: string
  toleranciaMinutos: number
  activo: boolean
}

interface HorarioRol {
  id: number
  rol: string
  nombreArea: string
  horaEntrada: string
  horaSalida:  string
  toleranciaMinutos: number
  diaInicio: number
  diaFin: number
  activo: boolean
  especiales: HorarioEspecial[]
}

const ROL_COLOR: Record<string, { bg: string; text: string; border: string }> = {
  CC: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200' },
  AD: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200' },
  TI: { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200' },
}

function ConfigHorariosTab() {
  const qc = useQueryClient()

  const { data: horarios = [], isLoading } = useQuery<HorarioRol[]>({
    queryKey: ['asistencia-horarios'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/horarios')
      return data.data ?? []
    },
    staleTime: 30_000,
  })

  // Estado de edición de horario base
  const [editando, setEditando] = useState<number | null>(null)
  const [form, setForm] = useState<Partial<HorarioRol>>({})

  // Estado de horario especial expandido / formulario de especial
  const [expandido, setExpandido] = useState<number | null>(null)
  const [espForm, setEspForm] = useState<{ diaSemana: number; horaEntrada: string; horaSalida: string; toleranciaMinutos: number } | null>(null)

  const saveMut = useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: Partial<HorarioRol> }) => {
      await api.put(`/asistencia/horarios/${id}`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-horarios'] })
      setEditando(null)
      toast.success('Horario actualizado')
    },
    onError: () => toast.error('Error al guardar el horario'),
  })

  const saveEspMut = useMutation({
    mutationFn: async ({ horarioId, payload }: { horarioId: number; payload: { diaSemana: number; horaEntrada: string; horaSalida: string; toleranciaMinutos: number } }) => {
      await api.post(`/asistencia/horarios/${horarioId}/especiales`, payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-horarios'] })
      setEspForm(null)
      toast.success('Horario especial guardado')
    },
    onError: () => toast.error('Error al guardar el horario especial'),
  })

  const delEspMut = useMutation({
    mutationFn: async ({ horarioId, espId }: { horarioId: number; espId: number }) => {
      await api.delete(`/asistencia/horarios/${horarioId}/especiales/${espId}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-horarios'] })
      toast.success('Horario especial eliminado')
    },
    onError: () => toast.error('Error al eliminar'),
  })

  function startEdit(h: HorarioRol) {
    setEditando(h.id)
    setForm({
      nombreArea:        h.nombreArea,
      horaEntrada:       h.horaEntrada.slice(0, 5),
      horaSalida:        h.horaSalida.slice(0, 5),
      toleranciaMinutos: h.toleranciaMinutos,
      diaInicio:         h.diaInicio,
      diaFin:            h.diaFin,
      activo:            h.activo,
    })
  }

  function handleSave(id: number) {
    saveMut.mutate({ id, payload: form })
  }

  function toggleExpandido(id: number) {
    setExpandido(prev => prev === id ? null : id)
    setEspForm(null)
  }

  function iniciarEspecial(horario: HorarioRol) {
    // Preseleccionar el primer día NO cubierto por el rango principal que no tenga ya especial
    const diasUsados = new Set(horario.especiales.map(e => e.diaSemana))
    const candidatos = [0, 6].filter(d => !diasUsados.has(d))
    const dia = candidatos[0] ?? 6
    setEspForm({ diaSemana: dia, horaEntrada: '09:00', horaSalida: '14:00', toleranciaMinutos: horario.toleranciaMinutos })
  }

  return (
    <div className="space-y-6">

      {/* Sección: Horarios */}
      <div className="space-y-2">
        <p className="px-1 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">Horarios</p>
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/10 border border-brand/20">
              <Settings2 className="h-3.5 w-3.5 text-brand" />
            </div>
            <div>
              <span className="text-[0.82rem] font-semibold text-gray-800">Horarios por departamento</span>
              <p className="text-[0.68rem] text-gray-400 mt-px">Define la hora de entrada y salida por área — los estatus de asistencia se calculan automáticamente</p>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-gray-400 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {horarios.map((h) => {
              const pal    = ROL_COLOR[h.rol] ?? { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' }
              const isEdit = editando === h.id
              const isExp  = expandido === h.id
              const entradaLabel = isEdit ? (form.horaEntrada ?? h.horaEntrada.slice(0,5)) : h.horaEntrada.slice(0,5)
              const tolLabel     = isEdit ? (form.toleranciaMinutos ?? h.toleranciaMinutos) : h.toleranciaMinutos

              // Chips de días activos
              const diaIni = isEdit ? (form.diaInicio ?? h.diaInicio) : h.diaInicio
              const diaFin = isEdit ? (form.diaFin    ?? h.diaFin)    : h.diaFin

              return (
                <div key={h.id}>
                  {/* ── Fila principal ── */}
                  <div className={`px-5 py-4 transition-colors ${isEdit ? 'bg-brand/[0.03]' : 'hover:bg-gray-50/40'}`}>
                    <div className="flex flex-wrap items-start gap-4">

                      {/* Área + nombre */}
                      <div className="flex items-center gap-2 min-w-[160px]">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[0.65rem] font-bold ${pal.bg} ${pal.text} ${pal.border}`}>
                          {h.rol}
                        </span>
                        {isEdit ? (
                          <input
                            value={form.nombreArea ?? ''}
                            onChange={e => setForm(f => ({ ...f, nombreArea: e.target.value }))}
                            className="rounded-lg border border-gray-200 px-2 py-1 text-[0.78rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 w-36"
                          />
                        ) : (
                          <span className="text-[0.8rem] font-semibold text-gray-800">{h.nombreArea}</span>
                        )}
                      </div>

                      {/* Hora entrada */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[0.58rem] font-bold text-gray-400 uppercase tracking-wider">Entrada</span>
                        {isEdit ? (
                          <input type="time" value={form.horaEntrada ?? ''} onChange={e => setForm(f => ({ ...f, horaEntrada: e.target.value }))}
                            className="rounded-lg border border-brand/40 bg-brand/5 px-2 py-1 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 w-28" />
                        ) : (
                          <span className="font-mono text-[0.88rem] font-bold text-gray-800 tabular-nums">{h.horaEntrada.slice(0,5)}</span>
                        )}
                      </div>

                      {/* Hora salida */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[0.58rem] font-bold text-gray-400 uppercase tracking-wider">Salida</span>
                        {isEdit ? (
                          <input type="time" value={form.horaSalida ?? ''} onChange={e => setForm(f => ({ ...f, horaSalida: e.target.value }))}
                            className="rounded-lg border border-brand/40 bg-brand/5 px-2 py-1 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 w-28" />
                        ) : (
                          <span className="font-mono text-[0.88rem] font-bold text-gray-800 tabular-nums">{h.horaSalida.slice(0,5)}</span>
                        )}
                      </div>

                      {/* Tolerancia */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[0.58rem] font-bold text-gray-400 uppercase tracking-wider">Tolerancia</span>
                        {isEdit ? (
                          <div className="flex items-center gap-1">
                            <input type="number" min={0} max={60} value={form.toleranciaMinutos ?? 5}
                              onChange={e => setForm(f => ({ ...f, toleranciaMinutos: parseInt(e.target.value, 10) || 0 }))}
                              className="rounded-lg border border-brand/40 bg-brand/5 px-2 py-1 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 w-16" />
                            <span className="text-[0.68rem] text-gray-400">min</span>
                          </div>
                        ) : (
                          <span className="font-mono text-[0.88rem] font-bold text-gray-800 tabular-nums">{h.toleranciaMinutos}<span className="text-[0.68rem] font-normal text-gray-400 ml-0.5">min</span></span>
                        )}
                      </div>

                      {/* Días activos */}
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[0.58rem] font-bold text-gray-400 uppercase tracking-wider">Días activos</span>
                        {isEdit ? (
                          <div className="flex items-center gap-1.5">
                            <select value={form.diaInicio ?? h.diaInicio} onChange={e => setForm(f => ({ ...f, diaInicio: parseInt(e.target.value, 10) }))}
                              className="rounded-lg border border-brand/40 bg-brand/5 px-2 py-1 text-[0.75rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
                              {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                            <span className="text-[0.68rem] text-gray-400">→</span>
                            <select value={form.diaFin ?? h.diaFin} onChange={e => setForm(f => ({ ...f, diaFin: parseInt(e.target.value, 10) }))}
                              className="rounded-lg border border-brand/40 bg-brand/5 px-2 py-1 text-[0.75rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30">
                              {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            {DIAS_LABELS.map((d, i) => {
                              const activo = diaIni <= diaFin
                                ? i >= diaIni && i <= diaFin
                                : i >= diaIni || i <= diaFin
                              const tieneEsp = h.especiales.some(e => e.diaSemana === i)
                              return (
                                <span key={i} title={tieneEsp ? `${DIAS_FULL[i]}: horario especial` : DIAS_FULL[i]}
                                  className={`inline-flex items-center justify-center rounded text-[0.6rem] font-bold w-6 h-5 border transition-colors
                                    ${tieneEsp
                                      ? 'bg-amber-50 text-amber-700 border-amber-300'
                                      : activo
                                        ? 'bg-brand/10 text-brand border-brand/30'
                                        : 'bg-gray-50 text-gray-300 border-gray-200'}`}>
                                  {d}
                                </span>
                              )
                            })}
                          </div>
                        )}
                      </div>

                      {/* Acciones */}
                      <div className="ml-auto flex items-center gap-2 flex-shrink-0">
                        {isEdit ? (
                          <>
                            <button onClick={() => setEditando(null)} className="text-[0.72rem] text-gray-400 hover:text-gray-600 px-2 py-1 transition-colors">
                              Cancelar
                            </button>
                            <button onClick={() => handleSave(h.id)} disabled={saveMut.isPending}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-50 transition-colors">
                              {saveMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Guardar
                            </button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(h)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:border-brand/40 hover:text-brand transition-colors">
                              <Edit3 className="h-3 w-3" /> Editar
                            </button>
                            <button onClick={() => toggleExpandido(h.id)}
                              className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.72rem] font-semibold transition-colors
                                ${isExp ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 bg-card text-gray-600 hover:border-amber-300 hover:text-amber-700'}`}>
                              <CalendarDays className="h-3 w-3" />
                              Especiales {h.especiales.length > 0 && <span className="ml-0.5 rounded-full bg-amber-200 px-1.5 text-[0.6rem]">{h.especiales.length}</span>}
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Preview de estatus en modo lectura */}
                    {!isEdit && (
                      <div className="mt-2.5 flex items-center gap-1.5 flex-wrap">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-600 whitespace-nowrap">
                          <CheckCircle2 className="h-2.5 w-2.5" /> A tiempo ≤ {entradaLabel} +{tolLabel}m
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[0.6rem] font-semibold text-amber-600">
                          <Timer className="h-2.5 w-2.5" /> Retardo
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-[0.6rem] font-semibold text-red-500">
                          <UserX className="h-2.5 w-2.5" /> Falta
                        </span>
                      </div>
                    )}
                  </div>

                  {/* ── Panel de horarios especiales ── */}
                  {isExp && (
                    <div className="border-t border-amber-100 bg-amber-50/40 px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <p className="text-[0.78rem] font-semibold text-amber-800">Horarios especiales — {h.nombreArea}</p>
                          <p className="text-[0.65rem] text-amber-600 mt-0.5">Excepciones por día de la semana (ej. Sábado con horario reducido)</p>
                        </div>
                        {!espForm && (
                          <button onClick={() => iniciarEspecial(h)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-card px-3 py-1.5 text-[0.72rem] font-semibold text-amber-700 hover:bg-amber-50 transition-colors">
                            + Agregar día especial
                          </button>
                        )}
                      </div>

                      {/* Lista de especiales existentes */}
                      {h.especiales.length > 0 && (
                        <div className="mb-3 space-y-1.5">
                          {h.especiales.map(e => (
                            <div key={e.id} className="flex items-center gap-3 rounded-xl border border-amber-200 bg-card px-3 py-2">
                              <span className="text-[0.72rem] font-bold text-amber-700 w-8">{DIAS_LABELS[e.diaSemana]}</span>
                              <span className="text-[0.68rem] text-gray-500">{DIAS_FULL[e.diaSemana]}</span>
                              <span className="ml-auto font-mono text-[0.8rem] font-bold text-gray-800 tabular-nums">
                                {e.horaEntrada.slice(0,5)} — {e.horaSalida.slice(0,5)}
                              </span>
                              <span className="text-[0.65rem] text-gray-400">{e.toleranciaMinutos}min tol.</span>
                              <button onClick={() => delEspMut.mutate({ horarioId: h.id, espId: e.id })} disabled={delEspMut.isPending}
                                className="ml-1 rounded text-red-400 hover:text-red-600 transition-colors p-0.5">
                                <UserX className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Formulario de nuevo especial */}
                      {espForm && (
                        <div className="rounded-xl border border-amber-300 bg-card p-3 flex flex-wrap items-end gap-3">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.58rem] font-bold text-gray-400 uppercase">Día</span>
                            <select value={espForm.diaSemana} onChange={e => setEspForm(f => f ? { ...f, diaSemana: parseInt(e.target.value, 10) } : null)}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-[0.78rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300">
                              {DIAS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                            </select>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.58rem] font-bold text-gray-400 uppercase">Entrada</span>
                            <input type="time" value={espForm.horaEntrada} onChange={e => setEspForm(f => f ? { ...f, horaEntrada: e.target.value } : null)}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 w-28" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.58rem] font-bold text-gray-400 uppercase">Salida</span>
                            <input type="time" value={espForm.horaSalida} onChange={e => setEspForm(f => f ? { ...f, horaSalida: e.target.value } : null)}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 w-28" />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[0.58rem] font-bold text-gray-400 uppercase">Tol. min</span>
                            <input type="number" min={0} max={60} value={espForm.toleranciaMinutos}
                              onChange={e => setEspForm(f => f ? { ...f, toleranciaMinutos: parseInt(e.target.value, 10) || 0 } : null)}
                              className="rounded-lg border border-gray-200 px-2 py-1.5 text-[0.82rem] font-mono text-gray-700 focus:outline-none focus:ring-2 focus:ring-amber-300 w-16" />
                          </div>
                          <div className="flex items-center gap-2 ml-auto">
                            <button onClick={() => setEspForm(null)} className="text-[0.72rem] text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors">
                              Cancelar
                            </button>
                            <button onClick={() => saveEspMut.mutate({ horarioId: h.id, payload: espForm })} disabled={saveEspMut.isPending}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-[0.72rem] font-semibold text-white hover:bg-amber-600 disabled:opacity-50 transition-colors">
                              {saveEspMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                              Guardar
                            </button>
                          </div>
                        </div>
                      )}

                      {h.especiales.length === 0 && !espForm && (
                        <p className="text-[0.72rem] text-amber-600/70 text-center py-2">No hay horarios especiales configurados para esta área</p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Leyenda de estatus */}
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/40 flex flex-wrap items-center gap-4">
          <span className="text-[0.62rem] font-bold text-gray-400 uppercase tracking-wider">Cómo se calculan:</span>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-[0.68rem] text-gray-600"><b>A tiempo</b> — dentro del rango de tolerancia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-amber-400" />
            <span className="text-[0.68rem] text-gray-600"><b>Retardo</b> — pasó la hora + tolerancia</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-red-400" />
            <span className="text-[0.68rem] text-gray-600"><b>Falta</b> — sin registro en el día</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="block h-2 w-2 rounded-full bg-amber-300" />
            <span className="text-[0.68rem] text-gray-600"><b>Día especial</b> — tiene horario de excepción</span>
          </div>
        </div>
        </div>
      </div>

      {/* Sección: Excepciones de asistencia */}
      <div className="space-y-2">
        <p className="px-1 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">Excepciones de asistencia</p>
        <ExentosSection />
      </div>

      {/* Sección: Alertas automáticas */}
      <div className="space-y-2">
        <p className="px-1 text-[0.65rem] font-bold uppercase tracking-widest text-gray-400">Alertas automáticas</p>
        <PosibleBajaSection />
      </div>
    </div>
  )
}

interface ExentoRow {
  id: number
  usuarioId: number
  nombre: string
  rol: string
  motivo: string | null
  fechaCreacion: string
}

/* ── Usuarios exentos de asistencia (no cuentan como falta ni retardo) ── */
function ExentosSection() {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [usuarioSel, setUsuarioSel] = useState<{ id: number; nombre: string } | null>(null)
  const [motivo, setMotivo] = useState('')

  const { data: exentos = [], isLoading } = useQuery<ExentoRow[]>({
    queryKey: ['asistencia-exentos'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/exentos')
      return data.data ?? []
    },
    staleTime: 30_000,
  })

  const { data: usuarios = [] } = useQuery<{ id: number; nombres: string }[]>({
    queryKey: ['usuarios-buscar', busqueda],
    queryFn: async () => {
      if (busqueda.trim().length < 2) return []
      const { data } = await api.get('/usuarios')
      const list = (Array.isArray(data) ? data : (data?.data ?? [])) as Record<string, unknown>[]
      return list
        .map(u => ({ id: Number(u['id'] ?? u['ID'] ?? 0), nombres: String(u['nombres'] ?? u['nombre'] ?? '') }))
        .filter(u => u.nombres.toLowerCase().includes(busqueda.toLowerCase()))
        .slice(0, 8)
    },
    enabled: busqueda.trim().length >= 2,
  })

  const agregar = useMutation({
    mutationFn: async () => {
      if (!usuarioSel) return
      await api.post('/asistencia/exentos', { usuarioId: usuarioSel.id, motivo: motivo.trim() || undefined })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-exentos'] })
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      setUsuarioSel(null); setBusqueda(''); setMotivo('')
      toast.success('Usuario marcado como exento')
    },
    onError: () => toast.error('Error al marcar como exento'),
  })

  const quitar = useMutation({
    mutationFn: (id: number) => api.delete(`/asistencia/exentos/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-exentos'] })
      qc.invalidateQueries({ queryKey: ['asistencia-reporte'] })
      toast.success('Exención removida')
    },
    onError: () => toast.error('Error al quitar la exención'),
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gray-100 border border-gray-200">
            <UserX className="h-3.5 w-3.5 text-gray-500" />
          </div>
          <div>
            <span className="text-[0.82rem] font-semibold text-gray-800">Usuarios exentos de asistencia</span>
            <p className="text-[0.68rem] text-gray-400 mt-px">No cuentan como falta ni retardo en ningún reporte (ej. directivos sin checador, cuentas de prueba)</p>
          </div>
        </div>
      </div>

      <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/40 space-y-2">
        <div className="flex flex-wrap gap-2 items-start">
          <div className="relative flex-1 min-w-[220px]">
            <input
              value={usuarioSel ? usuarioSel.nombre : busqueda}
              onChange={(e) => { setBusqueda(e.target.value); setUsuarioSel(null) }}
              placeholder="Buscar usuario por nombre..."
              className="w-full rounded-xl border border-gray-200 px-3 py-2 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            {!usuarioSel && usuarios.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-xl border border-gray-200 bg-card shadow-lg overflow-hidden">
                {usuarios.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { setUsuarioSel({ id: u.id, nombre: u.nombres }); setBusqueda('') }}
                    className="w-full text-left px-3 py-2 text-[0.78rem] text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    {u.nombres}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Motivo (opcional)"
            className="flex-1 min-w-[180px] rounded-xl border border-gray-200 px-3 py-2 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
          <button
            onClick={() => agregar.mutate()}
            disabled={!usuarioSel || agregar.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand/90 disabled:opacity-40 transition-colors"
          >
            {agregar.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
            Marcar exento
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : exentos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-300">
          <UserX className="h-8 w-8" />
          <p className="text-[0.78rem] text-gray-400">Sin usuarios exentos</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {exentos.map((e) => (
            <div key={e.id} className="flex items-center justify-between px-5 py-2.5">
              <div className="min-w-0">
                <p className="text-[0.8rem] font-medium text-gray-800">{e.nombre} <span className="text-gray-400 font-normal">· {e.rol}</span></p>
                {e.motivo && <p className="text-[0.68rem] text-gray-400">{e.motivo}</p>}
              </div>
              <button
                onClick={() => quitar.mutate(e.id)}
                disabled={quitar.isPending}
                className="flex-shrink-0 rounded-lg px-2.5 py-1 text-[0.7rem] font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors disabled:opacity-50"
              >
                Quitar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Alerta de posible baja por faltas acumuladas ── */
interface BajasConfig { activo: boolean; diasFaltaUmbral: number }
interface BajaDestinatario { id: number; nombre: string; rol: string; correo: string | null; seleccionado: boolean | number }
interface AlertaBaja { id: number; usuarioId: number; nombre: string; rol: string; diasConsecutivos: number; fechaUltimaFalta: string; fechaCreacion: string }

function PosibleBajaSection() {
  const qc = useQueryClient()
  const [umbralDraft, setUmbralDraft] = useState<number | null>(null)
  const [mostrarHistorial, setMostrarHistorial] = useState(false)

  const { data: config, isLoading: loadingConfig } = useQuery<BajasConfig>({
    queryKey: ['asistencia-bajas-config'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/bajas/config')
      return data.data
    },
    staleTime: 30_000,
  })

  const { data: destinatarios = [], isLoading: loadingDest } = useQuery<BajaDestinatario[]>({
    queryKey: ['asistencia-bajas-destinatarios'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/bajas/destinatarios')
      return data.data ?? []
    },
    staleTime: 30_000,
  })

  const { data: alertas = [] } = useQuery<AlertaBaja[]>({
    queryKey: ['asistencia-bajas-alertas'],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/bajas/alertas')
      return data.data ?? []
    },
    enabled: mostrarHistorial,
    staleTime: 30_000,
  })

  const updateConfig = useMutation({
    mutationFn: async (payload: BajasConfig) => {
      await api.put('/asistencia/bajas/config', payload)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-bajas-config'] })
      toast.success('Configuración actualizada')
    },
    onError: () => toast.error('Error al actualizar la configuración'),
  })

  const toggleDestinatario = useMutation({
    mutationFn: async (nuevaSeleccion: number[]) => {
      await api.put('/asistencia/bajas/destinatarios', { usuarioIds: nuevaSeleccion })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asistencia-bajas-destinatarios'] })
      toast.success('Destinatarios actualizados')
    },
    onError: () => toast.error('Error al actualizar destinatarios'),
  })

  const umbral = umbralDraft ?? config?.diasFaltaUmbral ?? 3
  const seleccionados = destinatarios.filter(d => Boolean(d.seleccionado))

  function handleToggleActivo() {
    if (!config) return
    updateConfig.mutate({ activo: !config.activo, diasFaltaUmbral: umbral })
  }

  function handleGuardarUmbral() {
    if (!config) return
    updateConfig.mutate({ activo: config.activo, diasFaltaUmbral: umbral })
    setUmbralDraft(null)
  }

  function handleToggleUsuario(id: number) {
    const setActual = new Set(seleccionados.map(d => d.id))
    if (setActual.has(id)) setActual.delete(id); else setActual.add(id)
    toggleDestinatario.mutate(Array.from(setActual))
  }

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200">
            <AlertTriangle className="h-3.5 w-3.5 text-red-500" />
          </div>
          <div>
            <span className="text-[0.82rem] font-semibold text-gray-800">Alerta de posible baja</span>
            <p className="text-[0.68rem] text-gray-400 mt-px">Notifica cuando un empleado acumula faltas consecutivas sin marcar entrada</p>
          </div>
        </div>
        <button
          onClick={() => setMostrarHistorial(v => !v)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.7rem] font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <History className="h-3.5 w-3.5" />
          {mostrarHistorial ? 'Ocultar historial' : 'Ver historial'}
        </button>
      </div>

      {loadingConfig ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
        </div>
      ) : (
        <>
          {/* Activar/desactivar + umbral */}
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/40 flex flex-wrap items-center gap-4">
            <button
              onClick={handleToggleActivo}
              disabled={updateConfig.isPending}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-[0.78rem] font-semibold transition-colors disabled:opacity-50 ${
                config?.activo ? 'bg-emerald-500 text-white hover:bg-emerald-600' : 'bg-gray-200 text-gray-500 hover:bg-gray-300'
              }`}
            >
              <Bell className="h-3.5 w-3.5" />
              {config?.activo ? 'Regla activada' : 'Regla desactivada'}
            </button>

            <div className="flex items-center gap-2">
              <label className="text-[0.72rem] text-gray-500">Umbral de días de falta consecutivos:</label>
              <input
                type="number"
                min={1}
                value={umbral}
                onChange={(e) => setUmbralDraft(parseInt(e.target.value, 10) || 1)}
                className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-[0.8rem] text-gray-700 text-center focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
              {umbralDraft !== null && umbralDraft !== config?.diasFaltaUmbral && (
                <button
                  onClick={handleGuardarUmbral}
                  disabled={updateConfig.isPending}
                  className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1 text-[0.7rem] font-semibold text-white hover:bg-brand/90 transition-colors disabled:opacity-50"
                >
                  <Save className="h-3 w-3" /> Guardar
                </button>
              )}
            </div>
          </div>

          {/* Destinatarios */}
          <div className="px-5 py-3.5 border-b border-gray-100">
            <div className="flex items-center gap-2 mb-2.5">
              <UserCog className="h-3.5 w-3.5 text-gray-400" />
              <span className="text-[0.75rem] font-semibold text-gray-600">Notificar a (in-app + correo)</span>
              <span className="text-[0.68rem] text-gray-400">{seleccionados.length} seleccionado{seleccionados.length !== 1 ? 's' : ''}</span>
            </div>
            {loadingDest ? (
              <div className="flex items-center gap-2 py-4 text-gray-400 text-sm">
                <Loader2 className="h-4 w-4 animate-spin" /> Cargando...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto">
                {destinatarios.map(d => (
                  <label
                    key={d.id}
                    className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(d.seleccionado)}
                      onChange={() => handleToggleUsuario(d.id)}
                      disabled={toggleDestinatario.isPending}
                      className="rounded border-gray-300 text-brand focus:ring-brand/30"
                    />
                    <div className="min-w-0">
                      <p className="text-[0.78rem] text-gray-700 truncate">{d.nombre} <span className="text-gray-400">· {d.rol}</span></p>
                      {!d.correo && <p className="text-[0.62rem] text-amber-500">Sin correo registrado</p>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Historial */}
          {mostrarHistorial && (
            alertas.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-gray-300">
                <Mail className="h-7 w-7" />
                <p className="text-[0.75rem] text-gray-400">Sin alertas generadas todavía</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-50">
                {alertas.map(a => (
                  <div key={a.id} className="flex items-center justify-between px-5 py-2.5">
                    <div>
                      <p className="text-[0.8rem] font-medium text-gray-800">{a.nombre} <span className="text-gray-400 font-normal">· {a.rol}</span></p>
                      <p className="text-[0.68rem] text-gray-400">Última falta: {a.fechaUltimaFalta} — detectado {a.fechaCreacion}</p>
                    </div>
                    <span className="chip bg-red-50 text-red-600 text-[0.7rem] font-semibold">{a.diasConsecutivos} días seguidos</span>
                  </div>
                ))}
              </div>
            )
          )}
        </>
      )}
    </div>
  )
}

/* ── KPI card ── */
function KpiCard({
  label, value, sub, color, icon: Icon,
}: {
  label: string
  value: string | number
  sub?: string
  color: 'blue' | 'green' | 'red' | 'amber'
  icon: React.ElementType
}) {
  const palette = {
    blue:  { wrap: 'bg-blue-50 border-blue-200',   icon: 'text-blue-500',   val: 'text-blue-700' },
    green: { wrap: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-500', val: 'text-emerald-700' },
    red:   { wrap: 'bg-red-50 border-red-200',     icon: 'text-red-500',    val: 'text-red-600' },
    amber: { wrap: 'bg-amber-50 border-amber-200', icon: 'text-amber-500',  val: 'text-amber-700' },
  }[color]

  return (
    <div className="flex items-center gap-3.5 rounded-2xl border border-gray-200/70 bg-card p-4 shadow-sm">
      <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border ${palette.wrap}`}>
        <Icon className={`h-5 w-5 ${palette.icon}`} />
      </div>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-semibold uppercase tracking-widest text-gray-400">{label}</p>
        <p className={`text-2xl font-extrabold tabular-nums leading-tight ${palette.val}`}>{value}</p>
        {sub && <p className="mt-0.5 text-[0.68rem] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  )
}

export function AsistenciaReportePage() {
  const today = localDateStr()
  const [desde, setDesde] = useState(today)
  const [hasta, setHasta] = useState(today)
  const [nombre, setNombre] = useState('')
  const [rol, setRol] = useState('')
  const [estado, setEstado] = useState('')
  const [vista, setVista] = useState<'tabla' | 'barras' | 'calendario' | 'actas' | 'config' | 'biotime'>('tabla')

  const rangoInvalido = Boolean(desde && hasta && desde > hasta)

  const { data: registros = [], isLoading, error } = useQuery<AsistenciaRegistro[]>({
    queryKey: ['asistencia-reporte', desde, hasta, nombre, rol, estado],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/retardos', {
        params: {
          from: desde || undefined,
          to: hasta || undefined,
          nombre: nombre || undefined,
          area: rol || undefined,
          estado: estado || undefined,
        },
      })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
    enabled: !rangoInvalido,
  })

  const { data: stats = [] } = useQuery<RetardoStat[]>({
    queryKey: ['asistencia-retardos-stats', desde, hasta],
    queryFn: async () => {
      const { data } = await api.get('/asistencia/retardos/stats', {
        params: { from: desde || undefined, to: hasta || undefined },
      })
      return Array.isArray(data) ? data : (data?.data ?? [])
    },
    staleTime: 30_000,
    enabled: !rangoInvalido,
  })

  const maxTotal = useMemo(() => stats.reduce((m, s) => Math.max(m, s.totalRetardos), 0), [stats])
  const totalRetardos = useMemo(() => registros.filter((r) => r.esRetardo).length, [registros])
  const totalATiempo = useMemo(() => registros.filter((r) => !r.esRetardo).length, [registros])
  const puntualidad = registros.length > 0 ? Math.round((totalATiempo / registros.length) * 100) : 0

  const peorRetardo = useMemo(() => {
    const retardados = registros.filter(r => r.esRetardo)
    if (!retardados.length) return null
    return retardados.reduce((a, b) => b.minutosRetardo > a.minutosRetardo ? b : a)
  }, [registros])

  function limpiarFiltros() {
    setNombre('')
    setRol('')
    setEstado('')
  }

  const hayFiltrosExtra = Boolean(nombre || rol || estado)

  return (
    <div className="space-y-4 animate-fade-in">

      {/* ── Header ── */}
      <div
        className="animate-gradient-x relative overflow-hidden rounded-2xl px-6 py-4 shadow-md"
        style={{
          backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
          backgroundSize: '200% 100%',
        }}
      >
        <div className="pointer-events-none absolute -right-8 -top-8 h-36 w-36 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute right-20 bottom-0 h-24 w-24 rounded-full bg-white/3" />
        <div className="relative flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 border border-white/10">
              <Clock className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-[1rem] font-bold text-white tracking-tight leading-tight">Reporte de Asistencia</h1>
              <p className="mt-0.5 text-[0.72rem] text-blue-200/80">
                Control de entradas y retardos
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <UploadBiometricoButton />
            <button
              onClick={() => exportExcel(registros)}
              disabled={registros.length === 0}
              title="Exportar a Excel"
              className="flex items-center gap-1.5 rounded-xl bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:hover:bg-white/10 transition-colors px-3.5 h-9 text-[0.75rem] font-semibold text-white border border-white/10"
            >
              <Download className="h-4 w-4" /> Exportar
            </button>
            {/* Vista toggle: reportes primero, administración/integración separada por un divisor */}
            <div className="flex items-center gap-0.5 rounded-xl bg-white/10 p-1 border border-white/10">
              {([
                ['tabla',      Table2,      'Tabla'],
                ['barras',     BarChart2,   'Gráfico'],
                ['calendario', CalendarDays,'Calendario'],
                ['actas',      FileWarning, 'Actas'],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  title={label}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    vista === v ? 'bg-card text-brand shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
              <div className="mx-1 h-5 w-px bg-white/15 flex-shrink-0" />
              {([
                ['config',     Settings2,   'Configuración'],
                ['biotime',    Link2,       'BioTime'],
              ] as const).map(([v, Icon, label]) => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  title={label}
                  className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
                    vista === v ? 'bg-card text-brand shadow-sm' : 'text-white/60 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      {vista !== 'actas' && vista !== 'calendario' && vista !== 'config' && vista !== 'biotime' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Total" value={registros.length} sub="registros en el período" color="blue" icon={TrendingUp} />
          <KpiCard label="A tiempo" value={totalATiempo} sub={`${puntualidad}% puntualidad`} color="green" icon={CheckCircle2} />
          <KpiCard label="Retardos" value={totalRetardos} sub={`${100 - puntualidad}% del total`} color="red" icon={AlertTriangle} />
          <KpiCard
            label="Mayor retardo"
            value={peorRetardo ? `${peorRetardo.minutosRetardo} min` : '—'}
            sub={peorRetardo?.nombre ?? 'Sin retardos'}
            color="amber"
            icon={Timer}
          />
        </div>
      )}

      {/* ── Filtros ── */}
      {vista !== 'actas' && vista !== 'calendario' && vista !== 'config' && vista !== 'biotime' && (
        <>
          <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm px-4 py-3 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Desde</label>
              <input
                type="date"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Hasta</label>
              <input
                type="date"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/40"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Estado</label>
              <select
                value={estado}
                onChange={(e) => setEstado(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/40 bg-card"
              >
                {ESTADOS.map((e) => <option key={e.value} value={e.value}>{e.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Área</label>
              <select
                value={rol}
                onChange={(e) => setRol(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/40 bg-card"
              >
                {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 flex-1 min-w-[180px]">
              <label className="text-[0.62rem] font-semibold text-gray-400 uppercase tracking-wider">Buscar</label>
              <input
                type="text"
                placeholder="Nombre del colaborador..."
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-[0.8rem] text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/40"
              />
            </div>
            {hayFiltrosExtra && (
              <button onClick={limpiarFiltros} className="flex items-center gap-1 text-[0.72rem] text-gray-400 hover:text-gray-600 px-2 py-1.5 transition-colors">
                <X className="h-3.5 w-3.5" /> Limpiar
              </button>
            )}
          </div>

          {rangoInvalido && (
            <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertCircle className="h-4 w-4 text-amber-500 flex-shrink-0" />
              <p className="text-[0.8rem] text-amber-700">La fecha "Desde" no puede ser posterior a la fecha "Hasta".</p>
            </div>
          )}
        </>
      )}

      {/* ── Content ── */}
      {vista === 'config' ? (
        <ConfigHorariosTab />
      ) : vista === 'biotime' ? (
        <BiotimeTab />
      ) : vista === 'calendario' ? (
        <CalendarioAsistencia />
      ) : vista === 'actas' ? (
        <ActasSection />
      ) : vista === 'barras' ? (
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm p-5">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-50 border border-red-200">
                <BarChart2 className="h-3.5 w-3.5 text-red-500" />
              </div>
              <span className="text-[0.82rem] font-semibold text-gray-800">Retardos por persona</span>
            </div>
            <p className="text-[0.7rem] text-gray-400">En el rango de fechas seleccionado</p>
          </div>

          {rangoInvalido ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <AlertCircle className="h-8 w-8 text-amber-300" />
              <p className="text-[0.82rem]">Corrige el rango de fechas para ver los datos</p>
            </div>
          ) : stats.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-16 text-gray-400">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
                <BarChart2 className="h-6 w-6 text-gray-300" />
              </div>
              <p className="text-[0.82rem]">Sin retardos en este período</p>
            </div>
          ) : (
            <svg width="100%" height={stats.length * (BAR_HEIGHT + BAR_GAP)} role="img" aria-label="Retardos por persona">
              {stats.map((s, i) => (
                <BarRow key={s.usuarioId ?? i} stat={s} maxTotal={maxTotal} index={i} />
              ))}
            </svg>
          )}
        </div>
      ) : (
        <TablaAgrupada
          registros={registros}
          isLoading={isLoading}
          error={error}
          rangoInvalido={rangoInvalido}
          esDiaUnico={desde === hasta}
        />
      )}
    </div>
  )
}
