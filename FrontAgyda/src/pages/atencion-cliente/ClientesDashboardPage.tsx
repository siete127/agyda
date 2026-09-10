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
  CalendarDays, CalendarCheck, CalendarX, UserCheck, Mail, MessageCircle, Globe,
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

  const statsCitas: DashboardStat[] = data ? [
    { key: 'citasAgendadas', icon: CalendarDays, label: 'Citas agendadas', value: data.citasAgendadas, tone: 'brand' },
    { key: 'citasConfirmadas', icon: CalendarCheck, label: 'Confirmadas', value: data.citasConfirmadas, tone: 'success' },
    { key: 'citasAsistidas', icon: UserCheck, label: 'Asistieron', value: data.citasAsistidas, tone: 'success' },
    { key: 'citasNoAsistidas', icon: CalendarX, label: 'No asistieron', value: data.citasNoAsistidas, tone: 'critical' },
    { key: 'citasCanceladas', icon: CalendarX, label: 'Canceladas', value: data.citasCanceladas, tone: 'warn' },
    { key: 'tasaNoShow', icon: AlertTriangle, label: 'Tasa de no-show', value: data.tasaNoShow !== null ? `${data.tasaNoShow}%` : '—', tone: data.tasaNoShow !== null && data.tasaNoShow > 20 ? 'critical' : 'warn' },
    { key: 'citasProximas', icon: CalendarClock, label: 'Próximas', value: data.citasProximas, tone: 'brand' },
    { key: 'citasSolicitudesPendientes', icon: Clock, label: 'Solicitudes de cambio', value: data.citasSolicitudesPendientes, tone: data.citasSolicitudesPendientes > 0 ? 'warn' : 'brand' },
  ] : []

  const statsRecordatorios: DashboardStat[] = data ? [
    { key: 'recordatoriosCorreo', icon: Mail, label: 'Recordatorios por correo', value: data.recordatoriosCorreo, tone: 'brand' },
    { key: 'recordatoriosWhatsapp', icon: MessageCircle, label: 'Recordatorios por WhatsApp', value: data.recordatoriosWhatsapp, tone: 'success' },
    { key: 'recordatoriosFallidos', icon: AlertTriangle, label: 'Envíos fallidos', value: data.recordatoriosFallidos, tone: data.recordatoriosFallidos > 0 ? 'critical' : 'brand' },
    { key: 'portalTokensActivos', icon: Globe, label: 'Portales activos', value: data.portalTokensActivos, tone: 'brand' },
    { key: 'portalAbiertos30d', icon: Globe, label: 'Abiertos (30d)', value: data.portalAbiertos30d, tone: 'success' },
    { key: 'citasConfirmadasPorCliente', icon: CalendarCheck, label: 'Citas confirmadas vía portal', value: data.citasConfirmadasPorCliente, tone: 'success' },
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
                      rango === r.key ? 'bg-card text-brand' : 'text-white/70 hover:text-white',
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
              <button
                onClick={handleExportar}
                disabled={exportando}
                className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[0.78rem] font-semibold text-brand shadow-sm hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {exportando ? <Spinner size="sm" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Descargar reporte
              </button>
            </div>
          </div>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-6">
          <DashboardStatRow stats={stats} />

          <section className="space-y-3">
            <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">Citas y asistencia</h2>
            <DashboardStatRow stats={statsCitas} />
            {data.citasPorAsesor.length > 0 && (
              <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-[0.7rem] uppercase tracking-wide text-gray-400">
                        <th className="px-4 py-2.5 text-left font-bold">Asesor</th>
                        <th className="px-4 py-2.5 text-right font-bold">Total</th>
                        <th className="px-4 py-2.5 text-right font-bold">Asistió</th>
                        <th className="px-4 py-2.5 text-right font-bold">No asistió</th>
                        <th className="px-4 py-2.5 text-right font-bold">Canceladas</th>
                        <th className="px-4 py-2.5 text-right font-bold">No-show</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {data.citasPorAsesor.map((a) => {
                        const fin = a.asistio + a.noAsistio
                        const ns = fin > 0 ? Math.round((a.noAsistio / fin) * 100) : null
                        return (
                          <tr key={a.asesor ?? '—'}>
                            <td className="px-4 py-2.5 font-semibold text-gray-800">{a.asesor ?? '—'}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums">{a.total}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-emerald-700">{a.asistio}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-red-600">{a.noAsistio}</td>
                            <td className="px-4 py-2.5 text-right tabular-nums text-amber-600">{a.cancelada}</td>
                            <td className={clsx('px-4 py-2.5 text-right tabular-nums font-semibold', ns !== null && ns > 20 ? 'text-red-600' : 'text-gray-500')}>
                              {ns !== null ? `${ns}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-[0.82rem] font-bold text-gray-700 uppercase tracking-wide px-1">Recordatorios y portal</h2>
            <DashboardStatRow stats={statsRecordatorios} />
          </section>
        </div>
      )}
    </div>
  )
}
