import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import {
  BarChart3, Users, UserPlus, UserX, FileWarning,
  ClipboardList, Clock, DollarSign, AlertTriangle, CheckCircle2,
  Send, Smile, AlertOctagon, CalendarClock, FileSpreadsheet, History,
  CalendarDays, CalendarCheck, CalendarX, UserCheck, Mail, MessageCircle, Globe,
  Plus, ArrowRight, Heart, TrendingUp, Wallet, HeartHandshake,
} from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { clienteDashboardService, type RangoDashboard, type ClienteDashboardData } from '@/services/clienteDashboard.service'
import { useCurrentUser } from '@/hooks/useAuth'

const RANGOS: { key: RangoDashboard; label: string }[] = [
  { key: 'dia', label: 'Día' },
  { key: 'semana', label: 'Semana' },
  { key: 'mes', label: 'Mes' },
]

type Tone = 'brand' | 'success' | 'warn' | 'critical'

const TONE: Record<Tone, { bg: string; text: string; stroke: string; fill: string }> = {
  brand:    { bg: 'bg-brand/10',     text: 'text-brand',        stroke: 'rgb(var(--color-brand))', fill: 'rgb(var(--color-brand) / .12)' },
  success:  { bg: 'bg-emerald-100',  text: 'text-emerald-600',  stroke: '#10b981',                fill: 'rgba(16,185,129,.12)' },
  warn:     { bg: 'bg-amber-100',    text: 'text-amber-600',    stroke: '#f59e0b',                fill: 'rgba(245,158,11,.12)' },
  critical: { bg: 'bg-red-100',      text: 'text-red-600',      stroke: '#ef4444',                fill: 'rgba(239,68,68,.12)' },
}

// Mini-sparkline decorativa (sin datos históricos en el endpoint todavía).
function Sparkline({ tone, seed = 0 }: { tone: Tone; seed?: number }) {
  const c = TONE[tone]
  const pts = [8, 12, 7, 14, 10, 16, 9, 13].map((v, i) => {
    const y = 24 - ((v + ((seed * 3 + i * 5) % 7)) % 18) - 3
    return `${i * (72 / 7)},${y}`
  })
  const d = `M${pts.join(' L')}`
  return (
    <svg viewBox="0 0 72 24" className="h-8 w-[72px] flex-shrink-0" preserveAspectRatio="none">
      <path d={`${d} L72,24 L0,24 Z`} fill={c.fill} />
      <path d={d} fill="none" stroke={c.stroke} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function KpiCard({ icon: Icon, label, value, tone, seed }: {
  icon: React.ElementType; label: string; value: string | number; tone: Tone; seed: number
}) {
  const c = TONE[tone]
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div className={clsx('flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl', c.bg)}>
          <Icon className={clsx('h-5 w-5', c.text)} />
        </div>
        <Sparkline tone={tone} seed={seed} />
      </div>
      <div>
        <p className="text-[0.72rem] font-semibold text-ink-tertiary">{label}</p>
        <p className="mt-0.5 text-2xl font-extrabold text-ink tabular-nums leading-tight">{value}</p>
        <p className="mt-1 flex items-center gap-1 text-[0.68rem] font-semibold text-emerald-600">
          <TrendingUp className="h-3 w-3" /> +0%
          <span className="font-medium text-ink-tertiary">vs. periodo anterior</span>
        </p>
      </div>
    </div>
  )
}

function MiniStat({ icon: Icon, label, value, tone }: {
  icon: React.ElementType; label: string; value: string | number; tone: Tone
}) {
  const c = TONE[tone]
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-surface/60 p-2.5">
      <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', c.bg)}>
        <Icon className={clsx('h-4 w-4', c.text)} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[0.65rem] font-semibold text-ink-tertiary">{label}</p>
        <p className="text-sm font-bold text-ink tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function SectionCard({ icon: Icon, title, tone, onVerTodos, children }: {
  icon: React.ElementType; title: string; tone: Tone; onVerTodos?: () => void; children: React.ReactNode
}) {
  const c = TONE[tone]
  return (
    <div className="flex flex-col rounded-2xl border border-gray-100 bg-card p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className={clsx('flex h-8 w-8 items-center justify-center rounded-lg', c.bg)}>
            <Icon className={clsx('h-4 w-4', c.text)} />
          </div>
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        </div>
        {onVerTodos && (
          <button onClick={onVerTodos} className="text-[0.7rem] font-semibold text-brand hover:underline">Ver todos</button>
        )}
      </div>
      {children}
    </div>
  )
}

function PromoStrip({ icon: Icon, title, text, onClick }: {
  icon: React.ElementType; title: string; text: string; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-surface/40 p-3 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.03]"
    >
      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-brand/10">
        <Icon className="h-5 w-5 text-brand" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[0.78rem] font-bold text-ink">{title}</p>
        <p className="text-[0.7rem] text-ink-tertiary">{text}</p>
      </div>
      <ArrowRight className="h-4 w-4 flex-shrink-0 text-brand" />
    </button>
  )
}

export function ClientesDashboardPage() {
  const navigate = useNavigate()
  const user = useCurrentUser()
  const [rango, setRango] = useState<RangoDashboard>('semana')
  const [exportando, setExportando] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['clientes-dashboard', rango],
    queryFn: () => clienteDashboardService.getDashboard({ rango }),
    staleTime: 30_000,
  })

  const primerNombre = (user?.perfilAlias ?? user?.nombres ?? 'Administrador').split(' ')[0]
  const hoy = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const hora = new Date().getHours()
  const saludo = hora < 12 ? 'Buenos días' : hora < 19 ? 'Buenas tardes' : 'Buenas noches'

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

  const pendientesAtencion = data
    ? data.seguimientosVencidos + data.tareasVencidas + data.pagosVencidos + data.incidenciasAbiertas
    : 0

  const kpis: { icon: React.ElementType; label: string; value: (d: ClienteDashboardData) => string | number; tone: Tone }[] = [
    { icon: Users, label: 'Clientes totales', value: (d) => d.clientesTotal, tone: 'brand' },
    { icon: UserPlus, label: 'Clientes nuevos', value: (d) => d.clientesNuevos, tone: 'success' },
    { icon: CheckCircle2, label: 'Clientes activos', value: (d) => d.clientesActivos, tone: 'success' },
    { icon: UserX, label: 'Clientes inactivos', value: (d) => d.clientesInactivos, tone: 'warn' },
    { icon: FileWarning, label: 'Pend. documentación', value: (d) => d.clientesPendienteDocumentacion, tone: 'warn' },
    { icon: History, label: 'Seguimientos pendientes', value: (d) => d.seguimientosPendientes, tone: 'brand' },
    { icon: Clock, label: 'Seguimientos vencidos', value: (d) => d.seguimientosVencidos, tone: 'critical' },
    { icon: ClipboardList, label: 'Tareas pendientes', value: (d) => d.tareasPendientes, tone: 'brand' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Hero de bienvenida + CTA */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div
          className="animate-gradient-x relative overflow-hidden rounded-2xl px-6 py-6 shadow-card"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-20 right-24 h-40 w-40 rounded-full bg-white/[0.04]" />
          <div className="relative flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[0.78rem] font-medium text-blue-100/80">{saludo}, {primerNombre}</p>
              <h1 className="mt-0.5 flex items-center gap-2 text-2xl font-extrabold tracking-tight text-white">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10">
                  <BarChart3 className="h-5 w-5 text-white" />
                </span>
                Seguimiento de clientes
              </h1>
              <p className="mt-1.5 max-w-md text-[0.82rem] text-blue-100/80">
                Gestiona y da seguimiento a todos tus clientes y sus expedientes.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[0.72rem] font-semibold text-white">
                  <CalendarDays className="h-3.5 w-3.5" /> Hoy · {hoy}
                </span>
                <span className="inline-flex items-center gap-1.5 text-[0.72rem] font-medium text-blue-100/80">
                  <Heart className="h-3.5 w-3.5 fill-current text-rose-300" /> Cada cliente cuenta
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-0.5">
                {RANGOS.map((r) => (
                  <button
                    key={r.key}
                    onClick={() => setRango(r.key)}
                    className={clsx(
                      'rounded-md px-3 py-1.5 text-[0.72rem] font-semibold transition-colors',
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
                className="flex items-center gap-1.5 rounded-lg bg-card px-3 py-1.5 text-[0.75rem] font-semibold text-brand shadow-sm hover:bg-blue-50 transition-colors disabled:opacity-50"
              >
                {exportando ? <Spinner size="sm" /> : <FileSpreadsheet className="h-3.5 w-3.5" />} Descargar reporte
              </button>
              {data && <p className="text-[0.68rem] text-blue-100/70">{data.rango.desde} — {data.rango.hasta}</p>}
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/atencion-cliente/clientes')}
          className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-brand/20 bg-brand/[0.06] p-5 text-left shadow-card transition-all hover:-translate-y-0.5 hover:shadow-card-md"
        >
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-brand/10" />
          <div className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-brand text-white shadow-glow">
            <Plus className="h-7 w-7" />
          </div>
          <div className="relative min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink">Nuevo cliente</p>
            <p className="mt-0.5 text-[0.72rem] text-ink-tertiary">Registra un nuevo cliente en segundos</p>
          </div>
          <ArrowRight className="relative h-5 w-5 flex-shrink-0 text-brand transition-transform group-hover:translate-x-1" />
        </button>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : (
        <div className="space-y-5">
          {/* KPIs principales + panel de estado */}
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {kpis.map((k, i) => (
                <KpiCard key={k.label} icon={k.icon} label={k.label} value={k.value(data)} tone={k.tone} seed={i} />
              ))}
            </div>

            <div
              className="relative flex flex-col items-center justify-center overflow-hidden rounded-2xl p-6 text-center shadow-card"
              style={{ backgroundImage: 'linear-gradient(160deg, #0B1730 0%, #14274E 100%)' }}
            >
              <div className="pointer-events-none absolute -left-10 -top-10 h-32 w-32 rounded-full bg-white/[0.04]" />
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-brand/10" />
              <div className={clsx(
                'relative flex h-16 w-16 items-center justify-center rounded-full',
                pendientesAtencion === 0 ? 'bg-emerald-500/15' : 'bg-amber-500/15',
              )}>
                {pendientesAtencion === 0
                  ? <Smile className="h-8 w-8 text-emerald-400" />
                  : <AlertTriangle className="h-8 w-8 text-amber-400" />}
              </div>
              <p className="relative mt-4 text-base font-extrabold text-white">
                {pendientesAtencion === 0 ? '¡Todo en orden!' : `${pendientesAtencion} pendiente${pendientesAtencion !== 1 ? 's' : ''}`}
              </p>
              <p className="relative mt-1 text-[0.75rem] text-white/60">
                {pendientesAtencion === 0
                  ? 'No hay clientes pendientes de atención.'
                  : 'Seguimientos, tareas, pagos o incidencias por revisar.'}
              </p>
              <button
                onClick={() => navigate('/atencion-cliente/clientes')}
                className="relative mt-4 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors"
              >
                Ver detalles <ArrowRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Secciones */}
          <div className="grid gap-4 lg:grid-cols-3">
            <SectionCard icon={Wallet} title="Pagos y finanzas" tone="success" onVerTodos={() => navigate('/atencion-cliente/clientes')}>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={DollarSign} label="Pago por vencer (7d)" value={data.pagosProximosVencer} tone="warn" />
                <MiniStat icon={AlertTriangle} label="Pagos vencidos" value={data.pagosVencidos} tone="critical" />
                <MiniStat icon={CheckCircle2} label="Pagos realizados" value={data.pagosRealizados} tone="success" />
                <MiniStat icon={AlertOctagon} label="Incidencias abiertas" value={data.incidenciasAbiertas} tone="critical" />
              </div>
              <div className="mt-2 rounded-xl bg-emerald-50 p-3 text-center">
                <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-emerald-700/70">Monto cobrado</p>
                <p className="text-lg font-extrabold text-emerald-700 tabular-nums">
                  ${data.montoPagadoRango.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <PromoStrip
                icon={DollarSign}
                title="Renovaciones próximas"
                text={`${data.renovacionesProximas} en los próximos 30 días`}
                onClick={() => navigate('/atencion-cliente/clientes')}
              />
            </SectionCard>

            <SectionCard icon={CalendarClock} title="Citas y asistencia" tone="brand" onVerTodos={() => navigate('/atencion-cliente/clientes?tab=agenda')}>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={CalendarDays} label="Citas agendadas" value={data.citasAgendadas} tone="brand" />
                <MiniStat icon={CalendarCheck} label="Confirmadas" value={data.citasConfirmadas} tone="success" />
                <MiniStat icon={UserCheck} label="Asistieron" value={data.citasAsistidas} tone="success" />
                <MiniStat icon={CalendarX} label="No asistieron" value={data.citasNoAsistidas} tone="critical" />
                <MiniStat icon={CalendarX} label="Canceladas" value={data.citasCanceladas} tone="warn" />
                <MiniStat icon={AlertTriangle} label="Tasa de no-show" value={data.tasaNoShow !== null ? `${data.tasaNoShow}%` : '—'} tone={data.tasaNoShow !== null && data.tasaNoShow > 20 ? 'critical' : 'warn'} />
              </div>
              {data.citasAgendadas === 0 ? (
                <PromoStrip
                  icon={CalendarClock}
                  title="Sin citas registradas"
                  text="Programa la primera cita para dar seguimiento."
                  onClick={() => navigate('/atencion-cliente/clientes?tab=agenda')}
                />
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <MiniStat icon={CalendarClock} label="Próximas" value={data.citasProximas} tone="brand" />
                  <MiniStat icon={Clock} label="Solicitudes de cambio" value={data.citasSolicitudesPendientes} tone={data.citasSolicitudesPendientes > 0 ? 'warn' : 'brand'} />
                </div>
              )}
            </SectionCard>

            <SectionCard icon={Mail} title="Recordatorios y portal" tone="brand" onVerTodos={() => navigate('/atencion-cliente/clientes')}>
              <div className="grid grid-cols-2 gap-2">
                <MiniStat icon={Mail} label="Por correo" value={data.recordatoriosCorreo} tone="brand" />
                <MiniStat icon={MessageCircle} label="Por WhatsApp" value={data.recordatoriosWhatsapp} tone="success" />
                <MiniStat icon={AlertTriangle} label="Envíos fallidos" value={data.recordatoriosFallidos} tone={data.recordatoriosFallidos > 0 ? 'critical' : 'brand'} />
                <MiniStat icon={Globe} label="Portales activos" value={data.portalTokensActivos} tone="brand" />
                <MiniStat icon={Globe} label="Abiertos (30d)" value={data.portalAbiertos30d} tone="success" />
                <MiniStat icon={CalendarCheck} label="Confirmadas vía portal" value={data.citasConfirmadasPorCliente} tone="success" />
              </div>
              <PromoStrip
                icon={HeartHandshake}
                title="Mantén el contacto"
                text="La comunicación genera confianza y fidelidad."
                onClick={() => navigate('/atencion-cliente/clientes')}
              />
            </SectionCard>
          </div>

          {/* Encuestas + resumen adicional */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat icon={Send} label="Encuestas enviadas" value={data.encuestasEnviadas} tone="brand" />
            <MiniStat icon={Smile} label="Encuestas respondidas" value={data.encuestasRespondidas} tone="brand" />
            <MiniStat icon={Smile} label="Satisfacción" value={data.tasaSatisfaccion !== null ? `${data.tasaSatisfaccion}%` : '—'} tone="success" />
            <MiniStat icon={CheckCircle2} label="Incidencias resueltas" value={data.incidenciasResueltas} tone="success" />
          </div>

          {/* Detalle por asesor */}
          {data.citasPorAsesor.length > 0 && (
            <section className="space-y-3">
              <h2 className="px-1 text-[0.82rem] font-bold uppercase tracking-wide text-gray-700">Citas por asesor</h2>
              <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-sm">
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
            </section>
          )}
        </div>
      )}
    </div>
  )
}
