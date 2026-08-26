import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import {
  ChevronLeft, BarChart3, Users, UserPlus, UserX, FileWarning,
  ClipboardList, Clock, DollarSign, AlertTriangle, CheckCircle2,
  Send, Smile, AlertOctagon, CalendarClock, FileSpreadsheet, History,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import { clienteDashboardService, type RangoDashboard } from '@/services/clienteDashboard.service'

const RANGOS: { key: RangoDashboard; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
]

export function ClientesDashboardPage() {
  const navigate = useNavigate()
  const [rango, setRango] = useState<RangoDashboard>('semana')
  const [exportando, setExportando] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['clientes-dashboard', rango],
    queryFn: () => clienteDashboardService.getDashboard({ rango }),
    staleTime: 30_000,
  })

  const handleExportar = async () => {
    setExportando(true)
    try {
      const reporte = await clienteDashboardService.getReporte({ rango })
      if (reporte.filas.length === 0) {
        toast.error('No hay clientes en este rango para exportar')
        return
      }
      const sheet = XLSX.utils.aoa_to_sheet([
        ['Cliente', 'Empresa', 'Estatus', 'Tipo', 'Responsable', 'Fecha de alta', 'Incidencias abiertas', 'Pagos vencidos'],
        ...reporte.filas.map((f) => [
          f.nombre, f.empresa ?? '', f.estatus, f.tipoCliente ?? '', f.responsable ?? '',
          f.fechaAlta, f.incidenciasAbiertas, f.pagosVencidos,
        ]),
      ])
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, sheet, 'Clientes')
      XLSX.writeFile(wb, `clientes_${reporte.rango.desde}_${reporte.rango.hasta}.xlsx`)
    } catch {
      toast.error('No se pudo generar el reporte')
    } finally {
      setExportando(false)
    }
  }

  const stats: DashboardStat[] = data ? [
    { key: 'clientesTotal', icon: Users, label: 'Clientes totales', value: data.clientesTotal, tone: 'brand' },
    { key: 'clientesNuevos', icon: UserPlus, label: 'Clientes nuevos', value: data.clientesNuevos, tone: 'success' },
    { key: 'clientesActivos', icon: CheckCircle2, label: 'Clientes activos', value: data.clientesActivos, tone: 'success' },
    { key: 'clientesInactivos', icon: UserX, label: 'Clientes inactivos', value: data.clientesInactivos, tone: 'warn' },
    { key: 'clientesPendienteDoc', icon: FileWarning, label: 'Pend. documentación', value: data.clientesPendienteDocumentacion, tone: 'warn' },
    { key: 'seguimientosPendientes', icon: History, label: 'Seguimientos pendientes', value: data.seguimientosPendientes, tone: 'brand' },
    { key: 'seguimientosVencidos', icon: Clock, label: 'Seguimientos vencidos', value: data.seguimientosVencidos, tone: 'critical' },
    { key: 'tareasPendientes', icon: ClipboardList, label: 'Tareas pendientes', value: data.tareasPendientes, tone: 'brand' },
    { key: 'tareasVencidas', icon: Clock, label: 'Tareas vencidas', value: data.tareasVencidas, tone: 'critical' },
    { key: 'pagosProximos', icon: DollarSign, label: 'Pagos por vencer (7d)', value: data.pagosProximosVencer, tone: 'warn' },
    { key: 'pagosVencidos', icon: AlertTriangle, label: 'Pagos vencidos', value: data.pagosVencidos, tone: 'critical' },
    { key: 'pagosRealizados', icon: CheckCircle2, label: 'Pagos realizados', value: data.pagosRealizados, tone: 'success' },
    { key: 'montoPagado', icon: DollarSign, label: 'Monto cobrado', value: `$${data.montoPagadoRango.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`, tone: 'success' },
    { key: 'encuestasEnviadas', icon: Send, label: 'Encuestas enviadas', value: data.encuestasEnviadas, tone: 'brand' },
    { key: 'encuestasRespondidas', icon: Smile, label: 'Encuestas respondidas', value: data.encuestasRespondidas, tone: 'brand' },
    { key: 'tasaSatisfaccion', icon: Smile, label: 'Satisfacción', value: data.tasaSatisfaccion !== null ? `${data.tasaSatisfaccion}%` : '—', tone: 'success' },
    { key: 'incidenciasAbiertas', icon: AlertOctagon, label: 'Incidencias abiertas', value: data.incidenciasAbiertas, tone: 'critical' },
    { key: 'incidenciasResueltas', icon: CheckCircle2, label: 'Incidencias resueltas', value: data.incidenciasResueltas, tone: 'success' },
    { key: 'renovacionesProximas', icon: CalendarClock, label: 'Renovaciones (30d)', value: data.renovacionesProximas, tone: 'warn' },
  ] : []

  return (
    <div className="space-y-5 animate-fade-in">
      <button onClick={() => navigate('/atencion-cliente')} className="flex items-center gap-1.5 text-xs font-medium text-brand hover:underline">
        <ChevronLeft className="h-3.5 w-3.5" /> Volver a Atención al Cliente
      </button>

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
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Dashboard de Clientes</h1>
                {data && <p className="mt-0.5 text-xs text-blue-100/80">{data.rango.desde} — {data.rango.hasta}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
                {RANGOS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRango(r.key)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
                      rango === r.key ? 'bg-white text-brand' : 'text-white/70 hover:text-white',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[0.78rem] font-semibold text-brand shadow-sm hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {exportando ? <Spinner size="sm" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Descargar reporte
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <DashboardStatRow stats={stats} />
      )}
    </div>
  )
}
