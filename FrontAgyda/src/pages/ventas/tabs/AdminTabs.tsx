import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useVentasStore } from '@/stores/ventas.store'
import { ventasService } from '@/services/ventas.service'
import {
  VENTA_ESTADO_COLORS, VENTA_ESTADOS,
  type Venta, type VentaAgendada, type AgenteVentas, type Campana, type CampanaStatus, type VentaEstado, type StatsDynamicResponse,
} from '@/types/ventas.types'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import {
  BarChart2, Users, Bell, ShoppingCart, Download, Search,
  Pencil, ToggleLeft, ToggleRight, Trash2, Phone, Calendar,
  Clock, Eye, ImageIcon, Plus, ChevronDown, ChevronLeft,
  ChevronRight, TrendingUp, CheckCircle2, XCircle, AlertCircle,
  Megaphone, User, Database, FileText, Shield, RefreshCw,
  Upload, Settings, Lock, Unlock, Activity,
} from 'lucide-react'
import type {
  BaseMadreStats, CRMImportacion, CRMRegistro, CRMTrazabilidad, CRMAcceso, TrazabilidadMesStat,
} from '@/types/ventas.types'
import { TabBtn } from './AgenteTabs'

type AdminTab = 'stats' | 'ventas' | 'agentes' | 'asignaciones' | 'notificaciones' | 'campanas' | 'basemadre' | 'basecrm' | 'trazabilidad' | 'accesos' | 'vicidial'
type StatsPeriod = 'hoy' | 'semana' | 'mes'

// SQL Server devuelve fechas en hora local México sin sufijo Z.
// new Date() las interpreta como UTC → 6h de diferencia. Forzar hora local:
function parseFechaLocal(fechaStr: string): Date {
  // Quitar microsegundos y forzar que se lea como hora local
  const clean = fechaStr.replace('T', ' ').replace(/\.\d+$/, '')
  return new Date(clean)
}

/* ══════════════════════════════════════════════════════════
   ADMIN TABS
══════════════════════════════════════════════════════════ */
export function AdminTabs() {
  const [tab, setTab] = useState<AdminTab>('stats')
  const { ventasRole } = useVentasStore()
  const isAdmin = ventasRole === 'superadmin' || ventasRole === 'admin'
  const isSuperAdmin = ventasRole === 'superadmin'

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 className="h-5 w-5 text-brand" /> Ventas — Panel Administrador
          </h1>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">Gestión completa del sistema de ventas</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        <TabBtn active={tab === 'stats'}  onClick={() => setTab('stats')}  icon={<BarChart2    className="h-3.5 w-3.5" />} label="Estadísticas" />
        <TabBtn active={tab === 'ventas'} onClick={() => setTab('ventas')} icon={<ShoppingCart className="h-3.5 w-3.5" />} label="Todas las Ventas" />
        {isAdmin && (
          <>
            <TabBtn active={tab === 'agentes'}       onClick={() => setTab('agentes')}       icon={<Users    className="h-3.5 w-3.5" />} label="Agentes" />
            <TabBtn active={tab === 'asignaciones'}  onClick={() => setTab('asignaciones')}  icon={<Megaphone className="h-3.5 w-3.5" />} label="Asignaciones" />
            <TabBtn active={tab === 'notificaciones'} onClick={() => setTab('notificaciones')} icon={<Bell   className="h-3.5 w-3.5" />} label="Agendadas" />
          </>
        )}
        {isSuperAdmin && (
          <TabBtn active={tab === 'campanas'} onClick={() => setTab('campanas')} icon={<Megaphone className="h-3.5 w-3.5" />} label="Campañas" />
        )}
        {isAdmin && (
          <>
            {/* <TabBtn active={tab === 'basemadre'}    onClick={() => setTab('basemadre')}    icon={<Database   className="h-3.5 w-3.5" />} label="Base Madre" /> */}
            {/* <TabBtn active={tab === 'basecrm'}      onClick={() => setTab('basecrm')}      icon={<FileText   className="h-3.5 w-3.5" />} label="Base CRM" /> */}
            {/* <TabBtn active={tab === 'trazabilidad'} onClick={() => setTab('trazabilidad')} icon={<Activity   className="h-3.5 w-3.5" />} label="Trazabilidad" /> */}
            <TabBtn active={tab === 'accesos'}      onClick={() => setTab('accesos')}      icon={<Shield     className="h-3.5 w-3.5" />} label="Accesos" />
            {/* <TabBtn active={tab === 'vicidial'}     onClick={() => setTab('vicidial')}     icon={<TrendingUp className="h-3.5 w-3.5" />} label="Gestión Vicidial" /> */}
          </>
        )}
      </div>

      {tab === 'stats'          && <StatsTab />}
      {tab === 'ventas'         && <TodasVentasTab canEdit={isAdmin} />}
      {tab === 'agentes'        && isAdmin && <AgentesTab />}
      {tab === 'asignaciones'   && isAdmin && <AsignacionesTab />}
      {tab === 'notificaciones' && isAdmin && <NotificacionesTab />}
      {tab === 'campanas'       && isSuperAdmin && <CampanasTab canCreate={isSuperAdmin} />}
      {tab === 'basemadre'      && isAdmin && <BaseMadreTab isSuperAdmin={isSuperAdmin} />}
      {tab === 'basecrm'        && isAdmin && <BaseCRMTab />}
      {tab === 'trazabilidad'   && isAdmin && <TrazabilidadTab />}
      {tab === 'accesos'        && isAdmin && <AccesosTab />}
      {tab === 'vicidial'       && isAdmin && <VicidialTab />}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   STATS TAB — 3 columnas en paralelo igual que Flutter
══════════════════════════════════════════════════════════ */
function StatsTab() {
  const [campaignId, setCampaignId] = useState<number | undefined>(undefined)
  const [selectedDate, setSelectedDate] = useState<string>('')
  const [showAgendada, setShowAgendada] = useState(false)
  const { ventasCampaigns, ventasRole } = useVentasStore()
  const isPlata = campaignId === 1

  // Superadmin y admin cargan todas las campañas desde /admin/campaigns
  const { data: allCampaigns } = useQuery({
    queryKey: ['ventas-admin-campaigns'],
    queryFn: () => ventasService.getAdminCampaigns(),
    enabled: ventasRole === 'superadmin' || ventasRole === 'admin',
    staleTime: 300_000,
  })
  const campaigns = (ventasRole === 'superadmin' || ventasRole === 'admin')
    ? (allCampaigns ?? ventasCampaigns)
    : ventasCampaigns

  const dateParam = selectedDate || undefined
  const selectedCampaign = campaigns.find((c) => c.id === campaignId)
  const isBanamex = campaignId === 4 ||
    (selectedCampaign ? selectedCampaign.nombre.toLowerCase().includes('banamex') : false)

  // Stats dinámicas (por estatus reales de la campaña)
  const { data: dynDay,   isLoading: ldDynDay   } = useQuery({ queryKey: ['ventas-stats-dyn', 'hoy',    campaignId, dateParam], queryFn: () => ventasService.getStatsDynamicDay(campaignId, dateParam),   staleTime: 0, retry: false })
  const { data: dynWeek,  isLoading: ldDynWeek  } = useQuery({ queryKey: ['ventas-stats-dyn', 'semana', campaignId, dateParam], queryFn: () => ventasService.getStatsDynamicWeek(campaignId, dateParam),  staleTime: 0, retry: false })
  const { data: dynMonth, isLoading: ldDynMonth } = useQuery({ queryKey: ['ventas-stats-dyn', 'mes',    campaignId, dateParam], queryFn: () => ventasService.getStatsDynamicMonth(campaignId, dateParam), staleTime: 0, retry: false })

  const ref = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()
  const dayLabel   = ref.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
  const weekStart  = new Date(ref); weekStart.setDate(ref.getDate() - ref.getDay() + 1)
  const weekEnd    = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6)
  const weekLabel  = `del ${weekStart.toLocaleDateString('es-MX', { day: '2-digit', month: 'long' })} al ${weekEnd.toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`
  const monthLabel = ref.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      {/* Filtros: campaña + fecha */}
      <div className="flex flex-wrap items-center gap-3">
        {campaigns.length > 0 && (
          <div className="relative flex items-center gap-2">
            {selectedCampaign?.color && (
              <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-white shadow"
                style={{ backgroundColor: selectedCampaign.color }} />
            )}
            <div className="relative">
              <select value={campaignId ?? ''} onChange={(e) => setCampaignId(e.target.value ? Number(e.target.value) : undefined)}
                className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10">
                <option value="">Todas las campañas</option>
                {campaigns.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="date" value={selectedDate} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-3 text-[0.82rem] font-medium text-gray-700 shadow-sm focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10" />
          </div>
          <button onClick={() => setSelectedDate('')} style={{ visibility: selectedDate ? 'visible' : 'hidden' }}
            className="rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-[0.75rem] font-medium text-gray-500 hover:bg-gray-50 transition-colors">
            ✕ Fecha actual
          </button>
        </div>
        {isPlata && (
          <label className="flex items-center gap-2 cursor-pointer select-none rounded-xl border border-gray-200 bg-white px-3 py-2 shadow-sm hover:bg-gray-50 transition-colors">
            <input type="checkbox" checked={showAgendada} onChange={(e) => setShowAgendada(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-blue-500" />
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-[0.82rem] font-medium text-gray-600">Agendadas</span>
          </label>
        )}
      </div>

      {/* Columnas apiladas verticalmente, cada una ocupa toda la pantalla */}
      <div className="flex flex-col gap-8">
        <StatColumnDynamic key={`dyn-day-${campaignId ?? 0}-${dateParam ?? 'now'}`}   title="Diarias"   subtitle={dayLabel}   data={dynDay}   isLoading={ldDynDay}   period="day"   campaignId={campaignId} date={dateParam} campanaColor={selectedCampaign?.color} isBanamex={isBanamex} hideAgendada={!(isPlata && showAgendada)} />
        <StatColumnDynamic key={`dyn-week-${campaignId ?? 0}-${dateParam ?? 'now'}`}  title="Semanales" subtitle={weekLabel}  data={dynWeek}  isLoading={ldDynWeek}  period="week"  campaignId={campaignId} date={dateParam} campanaColor={selectedCampaign?.color} isBanamex={isBanamex} hideAgendada={!(isPlata && showAgendada)} />
        <StatColumnDynamic key={`dyn-month-${campaignId ?? 0}-${dateParam ?? 'now'}`} title="Mensuales" subtitle={monthLabel} data={dynMonth} isLoading={ldDynMonth} period="month" campaignId={campaignId} date={dateParam} campanaColor={selectedCampaign?.color} isBanamex={isBanamex} hideAgendada={!(isPlata && showAgendada)} />
      </div>
    </div>
  )
}

/* ── Columna de estadísticas DINÁMICA (estatus reales de campaña) ── */
const FALLBACK_COLORS = ['#2563eb','#22c55e','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#14b8a6','#f97316','#6366f1']

function StatColumnDynamic({ title, subtitle, data, isLoading, period, campaignId, date, campanaColor, isBanamex, hideAgendada }: {
  title: string; subtitle: string
  data: StatsDynamicResponse | undefined
  isLoading: boolean
  period: 'day' | 'week' | 'month'
  campaignId?: number; date?: string; campanaColor?: string; isBanamex: boolean
  hideAgendada?: boolean
}) {
  const CHART_H = 480

  const rawAgents = data?.stats ?? []
  // Si hideAgendada, filtrar Agendada de los counts de cada agente
  const agents = hideAgendada
    ? rawAgents.map((ag) => {
        const counts = { ...ag.estatusCounts }
        delete counts['Agendada']
        const total = Object.values(counts).reduce((s, v) => s + v, 0)
        return { ...ag, estatusCounts: counts, total }
      })
    : rawAgents
  const sorted = [...agents].sort((a, b) => b.total - a.total)
  const maxVal = Math.max(...sorted.map((a) => a.total), 1)

  // Estatus de la campaña (con colores) — si no hay campaña seleccionada, fallback a globales
  const rawStatuses = data?.statuses ?? []
  const statuses = hideAgendada
    ? rawStatuses.filter((s) => s.nombreEstado !== 'Agendada')
    : rawStatuses

  // Si no hay estatus de campaña, usar los globales fijos
  const efectiveStatuses = statuses.length > 0 ? statuses : [
    { id: -1, nombreEstado: 'Aprobada',    color: '#22c55e' },
    { id: -2, nombreEstado: 'Pendiente',   color: '#f59e0b' },
    { id: -3, nombreEstado: 'Rechazada',   color: '#ef4444' },
  ]

  // Colores fijos por nombre conocido — independiente de posición
  const KNOWN_COLORS: Record<string, string> = {
    'Aprobada':    '#22c55e',
    'Aprobado':    '#22c55e',
    'Pendiente':   '#f59e0b',
    'Rechazada':   '#ef4444',
    'Rechazado':   '#ef4444',
    'Agendada':    '#3b82f6',
    'Agendado':    '#3b82f6',
    'Formalizada': '#8b5cf6',
    'Formalizado': '#8b5cf6',
    'Garantizada': '#14b8a6',
    'Garantizado': '#14b8a6',
    'Declinado':   '#f97316',
    'Cancelada':   '#6b7280',
    'Cancelado':   '#6b7280',
  }

  const getColor = (nombre: string) => {
    // 1. Color configurado en CampaignStatuses (tiene prioridad)
    const st = efectiveStatuses.find((s) => s.nombreEstado === nombre)
    if (st?.color) return st.color
    // 2. Color fijo por nombre conocido
    if (KNOWN_COLORS[nombre]) return KNOWN_COLORS[nombre]
    // 3. Hash determinístico por nombre (mismo nombre → mismo color siempre)
    let hash = 0
    for (let i = 0; i < nombre.length; i++) hash = nombre.charCodeAt(i) + ((hash << 5) - hash)
    return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length]
  }

  // Todos los estatus que aparecen en los datos (para la leyenda)
  const allStatuses = new Set<string>()
  for (const ag of sorted) Object.keys(ag.estatusCounts).forEach((e) => allStatuses.add(e))
  const legendStatuses = efectiveStatuses.filter((s) => allStatuses.has(s.nombreEstado))
  // Agregar los que están en datos pero no en efectiveStatuses
  for (const name of allStatuses) {
    if (!legendStatuses.find((s) => s.nombreEstado === name)) {
      legendStatuses.push({ id: -99, nombreEstado: name, color: null })
    }
  }

  const handleExport = async () => {
    try { await ventasService.exportExcel(period, campaignId, date) } catch { toast.error('Error al exportar') }
  }

  const rawTotales = data?.totalesPorEstatus ?? {}
  const totales = hideAgendada
    ? Object.fromEntries(Object.entries(rawTotales).filter(([k]) => k !== 'Agendada'))
    : rawTotales
  const grandTotal = Object.values(totales).reduce((s, v) => s + v, 0)

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-5 pt-5 pb-3">
        <div>
          <h3 className="text-[1rem] font-bold text-gray-900">{title}</h3>
          <p className="text-[0.72rem] text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <button onClick={handleExport} title="Exportar Excel"
          className="rounded-xl p-2 text-gray-400 hover:bg-gray-50 hover:text-brand transition-colors">
          <Download className="h-4 w-4" />
        </button>
      </div>

      {/* Totales por estatus — estatus de campaña + los que tienen datos */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 px-5 pb-3">
        {(() => {
          // Partir de los estatus de la campaña (si hay), luego agregar los que vienen en datos
          const shown: { nombre: string; cnt: number }[] = []
          const seen = new Set<string>()
          // 1. Estatus configurados de la campaña (siempre mostrar si hay campaña)
          if (statuses.length > 0) {
            for (const s of statuses) {
              shown.push({ nombre: s.nombreEstado, cnt: totales[s.nombreEstado] ?? 0 })
              seen.add(s.nombreEstado)
            }
          }
          // 2. Estatus que vienen en datos pero no están en la configuración
          for (const [nombre, cnt] of Object.entries(totales)) {
            if (!seen.has(nombre) && cnt > 0) shown.push({ nombre, cnt })
          }
          // Si no hay campaña seleccionada, solo mostrar los que tienen datos
          if (statuses.length === 0) {
            return Object.entries(totales)
              .filter(([, cnt]) => cnt > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([nombre, cnt]) => {
                const color = getColor(nombre)
                return (
                  <span key={nombre} className="flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color }}>
                    <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
                    {nombre}: {cnt}
                  </span>
                )
              })
          }
          return shown.map(({ nombre, cnt }) => {
            const color = getColor(nombre)
            return (
              <span key={nombre} className="flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color: cnt === 0 ? '#9ca3af' : color }}>
                <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: cnt === 0 ? '#d1d5db' : color }} />
                {nombre}: {cnt}
              </span>
            )
          })
        })()}
      </div>

      {/* Gráfica */}
      {isLoading ? (
        <div className="flex justify-center items-center py-16"><Spinner size="lg" /></div>
      ) : sorted.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-300 gap-2">
          <BarChart2 className="h-10 w-10" />
          <p className="text-[0.8rem]">Sin datos</p>
        </div>
      ) : (
        <div className="px-5 pb-5">
          {/* Eje Y */}
          <div className="relative" style={{ height: `${CHART_H + 40}px` }}>
            {/* Líneas de cuadrícula */}
            {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
              const y = CHART_H - frac * CHART_H
              const val = Math.round(frac * maxVal)
              return (
                <div key={frac} className="absolute left-0 right-0 flex items-center gap-1" style={{ top: `${y}px` }}>
                  <span className="text-[0.65rem] text-gray-300 w-5 text-right flex-shrink-0">{val}</span>
                  <div className="flex-1 border-t border-dashed border-gray-100" />
                </div>
              )
            })}
            {/* Barras */}
            <div className="absolute inset-0 flex items-end gap-1.5 pl-7">
              {sorted.map((ag) => {
                const hTotal = ag.total === 0 ? 0 : Math.max(Math.round((ag.total / maxVal) * CHART_H), 6)

                // Orden de segmentos: primero los de efectiveStatuses, luego el resto
                const orderedNames = [...efectiveStatuses.map((s) => s.nombreEstado)]
                for (const name of Object.keys(ag.estatusCounts)) {
                  if (!orderedNames.includes(name)) orderedNames.push(name)
                }
                // Solo los que tienen count > 0
                const active = orderedNames.filter((n) => (ag.estatusCounts[n] ?? 0) > 0)

                // Invertir para que el primero de la lista quede abajo (flex-col normal, de abajo a arriba)
                const activeReversed = [...active].reverse()

                return (
                  <div key={ag.agentId} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                    {ag.total > 0 && <span className="text-[0.78rem] font-black text-gray-700 mb-1">{ag.total}</span>}
                    <div className="w-full rounded-t-xl overflow-hidden flex flex-col" style={{ height: `${hTotal}px`, minWidth: '32px' }}>
                      {activeReversed.map((name, i) => {
                        const cnt = ag.estatusCounts[name]!
                        const color = getColor(name)
                        const pct = (cnt / ag.total) * 100
                        const segH = hTotal * pct / 100
                        return (
                          <div key={i} className="w-full flex items-center justify-center overflow-hidden"
                            style={{ flexGrow: cnt, flexBasis: 0, backgroundColor: color }}>
                            {segH >= 16 &&
                              <span className="text-[0.68rem] font-bold text-white leading-none">{cnt}</span>}
                          </div>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 w-full text-center text-[0.65rem] text-gray-500 leading-tight px-0.5" style={{ wordBreak: 'break-word' }}>{ag.nombreAgente}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Leyenda */}
          {legendStatuses.length > 0 && (
            <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
              {legendStatuses.map((s, i) => (
                <span key={s.id} className="flex items-center gap-1 text-[0.7rem] text-gray-500">
                  <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getColor(s.nombreEstado) }} />
                  {s.nombreEstado}
                </span>
              ))}
            </div>
          )}
          <p className="mt-2 text-[0.65rem] text-gray-300 text-center">Cada barra representa el total de casos por agente, desglosado por estatus.</p>
        </div>
      )}
    </div>
  )
}

/* ── Columna de estadísticas (1 período) ──────────────────── */
function StatColumn({ title, subtitle, data, isLoading, period, campaignId, date, isBanamex, campanaColor }: {
  title: string
  subtitle: string
  data: { stats: import('@/types/ventas.types').VentaStats[], totales: { aprobadas: number; rechazadas: number; pendientes: number; total: number } } | undefined
  isLoading: boolean
  period: 'day' | 'week' | 'month'
  campaignId: number | undefined
  date: string | undefined
  isBanamex: boolean
  campanaColor?: string
}) {
  const [exporting, setExporting] = useState(false)
  const stats = data?.stats ?? []
  const totales = data?.totales ? {
    aprobadas:  Number(data.totales.aprobadas)  || 0,
    rechazadas: Number(data.totales.rechazadas) || 0,
    pendientes: Number(data.totales.pendientes) || 0,
    total:      Number(data.totales.total)      || 0,
  } : undefined

  const exportExcel = async () => {
    if (!stats.length || exporting) return
    try {
      setExporting(true)
      await ventasService.exportExcel(period, campaignId, date)
    } catch {
      toast.error('Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  // Normalizar a número (SQL Server puede devolver strings)
  const ns = stats.map((s) => ({
    ...s,
    aprobadas:  Number(s.aprobadas)  || 0,
    rechazadas: Number(s.rechazadas) || 0,
    pendientes: Number(s.pendientes) || 0,
    total:      Number(s.total)      || 0,
  }))

  // Calcular max para escalar barras (total apilado)
  const maxVal = Math.max(...ns.map((s) => s.aprobadas + s.pendientes + s.rechazadas), 1)

  // Etiquetas de los segmentos según campaña
  const labelApr = 'Aprobadas'
  const labelPen = isBanamex ? 'Formalizadas' : 'Pendientes'
  const labelRec = isBanamex ? 'Declinadas'   : 'Rechazadas'

  // Líneas del eje Y
  const yTicks = [0, Math.ceil(maxVal / 3), Math.ceil((maxVal * 2) / 3), maxVal]

  const CHART_H = 300 // px altura del área de barras — mayor para 1920×1080

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between px-6 pt-6 pb-4">
        <div>
          <h2 className="text-lg font-black text-gray-900">{title}</h2>
          <p className="text-[0.78rem] text-gray-400 mt-0.5">{subtitle}</p>
          <div className="flex flex-wrap gap-4 mt-3" style={{ visibility: totales ? 'visible' : 'hidden' }}>
            <span className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-emerald-600">
              <span className="h-3 w-3 rounded-full bg-emerald-500 inline-block" />
              {labelApr}: {totales?.aprobadas ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-yellow-600">
              <span className="h-3 w-3 rounded-full bg-yellow-400 inline-block" />
              {labelPen}: {totales?.pendientes ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-[0.85rem] font-semibold text-red-500">
              <span className="h-3 w-3 rounded-full bg-red-500 inline-block" />
              {labelRec}: {totales?.rechazadas ?? 0}
            </span>
          </div>
        </div>
        <button onClick={exportExcel} disabled={!stats.length || exporting} title="Exportar Excel"
          className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-emerald-600 transition-colors disabled:opacity-30">
          {exporting ? <Spinner size="sm" /> : <Download className="h-5 w-5" />}
        </button>
      </div>

      {/* Zona de contenido */}
      <div className="flex flex-col min-h-0 relative">
        {/* Loading overlay */}
        <div style={{ display: isLoading ? 'flex' : 'none' }} className="absolute inset-0 z-10 items-center justify-center bg-white rounded-b-2xl">
          <Spinner size="lg" />
        </div>

        {/* Empty state */}
        <div style={{ display: !isLoading && ns.length === 0 ? 'flex' : 'none' }} className="flex-col items-center justify-center py-16 gap-3 text-gray-300">
          <BarChart2 className="h-12 w-12 opacity-20" />
          <p className="text-sm">Sin datos</p>
        </div>

        {/* Gráfica apilada */}
        <div style={{ display: !isLoading && ns.length > 0 ? 'block' : 'none' }}>
          <div className="px-5 pb-1 overflow-x-auto">
            <div className="flex gap-3" style={{ minWidth: `${Math.max(ns.length, 1) * 64 + 40}px` }}>
              {/* Eje Y */}
              <div className="flex flex-col justify-between items-end pr-2 flex-shrink-0" style={{ height: `${CHART_H}px` }}>
                {[...yTicks].reverse().map((t) => (
                  <span key={t} className="text-[0.72rem] text-gray-400 leading-none font-medium">{t}</span>
                ))}
              </div>

              {/* Barras + labels de agente */}
              <div className="flex-1 flex flex-col">
                {/* Área de barras con líneas guía */}
                <div className="relative" style={{ height: `${CHART_H}px` }}>
                  {/* Líneas horizontales */}
                  {[...yTicks].reverse().map((t, idx) => (
                    <div key={t} className="absolute left-0 right-0 border-t border-dashed border-gray-100" style={{ top: `${(idx / (yTicks.length - 1)) * 100}%` }} />
                  ))}
                  {/* Barras */}
                  <div className="absolute inset-0 flex items-end gap-2 px-1">
                    {ns.map((s, agentIdx) => {
                      const total  = s.aprobadas + s.pendientes + s.rechazadas
                      const hTotal = total === 0 ? 0 : Math.max(Math.round((total / maxVal) * CHART_H), 10)
                      const hApr   = total === 0 ? 0 : Math.round((s.aprobadas  / total) * hTotal)
                      const hPen   = total === 0 ? 0 : Math.round((s.pendientes / total) * hTotal)
                      const hRec   = hTotal - hApr - hPen
                      // Color de la barra: color de campaña si hay uno, sino paleta por agente
                      const AGENT_PALETTE = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#ca8a04','#16a34a','#dc2626','#059669','#d97706']
                      const barColor = campanaColor ?? AGENT_PALETTE[agentIdx % AGENT_PALETTE.length]
                      return (
                        <div key={s.agentId} className="flex-1 flex flex-col items-center justify-end" style={{ height: '100%' }}>
                          {total > 0 && (
                            <span className="text-[0.8rem] font-black text-gray-700 mb-1">{total}</span>
                          )}
                          <div className="w-full rounded-t-xl overflow-hidden flex flex-col-reverse" style={{ height: `${hTotal}px`, minWidth: '40px' }}>
                            {hRec > 0 && (
                              <div className="w-full flex items-center justify-center" style={{ height: `${hRec}px`, backgroundColor: '#ef4444' }}>
                                {hRec >= 20 && <span className="text-[0.78rem] font-bold text-white leading-none">{s.rechazadas}</span>}
                              </div>
                            )}
                            {hPen > 0 && (
                              <div className="w-full flex items-center justify-center" style={{ height: `${hPen}px`, backgroundColor: '#eab308' }}>
                                {hPen >= 20 && <span className="text-[0.78rem] font-bold text-white leading-none">{s.pendientes}</span>}
                              </div>
                            )}
                            {hApr > 0 && (
                              <div className="w-full flex items-center justify-center" style={{ height: `${hApr}px`, backgroundColor: barColor }}>
                                {hApr >= 20 && <span className="text-[0.78rem] font-bold text-white leading-none">{s.aprobadas}</span>}
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Nombres de agentes debajo */}
                <div className="flex gap-2 px-1 mt-2">
                  {ns.map((s) => (
                    <div key={s.agentId} className="flex-1 text-center">
                      <span className="text-[0.72rem] text-gray-500 leading-snug block font-medium" style={{ wordBreak: 'break-word' }}>
                        {s.nombreAgente.split(' ').slice(0, 3).join(' ')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Leyenda */}
            <div className="flex items-center gap-5 mt-4 mb-2 justify-center">
              {([
                ['bg-emerald-500', labelApr],
                ['bg-yellow-400',  labelPen],
                ['bg-red-500',     labelRec],
              ] as [string, string][]).map(([cls, label]) => (
                <span key={label} className="flex items-center gap-2 text-[0.78rem] text-gray-500 font-medium">
                  <span className={`h-3.5 w-3.5 rounded-sm inline-block flex-shrink-0 ${cls}`} />{label}
                </span>
              ))}
            </div>
          </div>

          {/* Nota al pie */}
          <div className="border-t border-gray-100 px-6 py-3 flex items-center gap-2">
            <AlertCircle className="h-3.5 w-3.5 text-gray-300 flex-shrink-0" />
            <p className="text-[0.72rem] text-gray-400">Cada barra representa el total de casos por agente, desglosado por estatus.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TODAS LAS VENTAS TAB  — tabla completa con búsqueda/filtros/paginación/edición
══════════════════════════════════════════════════════════ */
const PAGE_SIZE = 10

function TodasVentasTab({ canEdit = true }: { canEdit?: boolean }) {
  const qc = useQueryClient()
  const { ventasCampaigns, ventasRole } = useVentasStore()

  const { data: allCampaigns } = useQuery({
    queryKey: ['ventas-admin-campaigns'],
    queryFn: () => ventasService.getAdminCampaigns(),
    enabled: ventasRole === 'superadmin' || ventasRole === 'admin',
    staleTime: 300_000,
  })
  const campanasSelect = (ventasRole === 'superadmin' || ventasRole === 'admin')
    ? (allCampaigns ?? ventasCampaigns)
    : ventasCampaigns

  const [search,       setSearch]       = useState('')
  const [filtStatus,   setFiltStatus]   = useState('')
  const [filtAgent,    setFiltAgent]    = useState('')
  const [filtCampaign, setFiltCampaign] = useState<number | undefined>()
  const [dateFrom,     setDateFrom]     = useState('')
  const [dateTo,       setDateTo]       = useState('')
  const [page,         setPage]         = useState(1)
  const [editing,      setEditing]      = useState<Venta | null>(null)
  const [viewImg,      setViewImg]      = useState<string | null>(null)
  const [exporting,    setExporting]    = useState(false)

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-all', filtCampaign],
    queryFn:  () => ventasService.getAllSales({ campaignId: filtCampaign }),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })

  const uniqueAgentes  = [...new Set(ventas.map((v) => v.nombreAgente))].filter(Boolean).sort()

  const filtered = ventas.filter((v) => {
    const q = search.toLowerCase()
    const fechaVenta = v.fecha ? new Date(v.fecha) : null
    const desde = dateFrom ? new Date(dateFrom + 'T00:00:00') : null
    const hasta  = dateTo   ? new Date(dateTo   + 'T23:59:59') : null
    return (
      (v.nombreCliente.toLowerCase().includes(q) || v.telefonoCliente.includes(q) || v.nombreAgente.toLowerCase().includes(q)) &&
      (!filtStatus || v.estatus === filtStatus) &&
      (!filtAgent  || v.nombreAgente === filtAgent) &&
      (!desde || !fechaVenta || fechaVenta >= desde) &&
      (!hasta || !fechaVenta || fechaVenta <= hasta)
    )
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const exportExcel = async () => {
    if (!filtered.length || exporting) return
    try {
      setExporting(true)
      const ids = filtered.map((v) => v.id)
      await ventasService.exportExcelByIds(ids)
    } catch {
      toast.error('Error al exportar')
    } finally {
      setExporting(false)
    }
  }

  const clearDates = () => { setDateFrom(''); setDateTo(''); setPage(1) }

  const delVenta = useMutation({
    mutationFn: (id: number) => ventasService.deleteVenta(id),
    onSuccess: () => { toast.success('Venta eliminada'); qc.invalidateQueries({ queryKey: ['ventas-all'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Buscar por agente, cliente o teléfono..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
        </div>

        <FilterSelect value={filtAgent} onChange={(v) => { setFiltAgent(v); setPage(1) }}>
          <option value="">Todos los agentes</option>
          {uniqueAgentes.map((a) => <option key={a} value={a}>{a}</option>)}
        </FilterSelect>

        <FilterSelect value={filtStatus} onChange={(v) => { setFiltStatus(v); setPage(1) }}>
          <option value="">Todos los estados</option>
          {VENTA_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
        </FilterSelect>

        {campanasSelect.length > 0 && (
          <FilterSelect value={filtCampaign ?? ''} onChange={(v) => { setFiltCampaign(v ? Number(v) : undefined); setPage(1) }}>
            <option value="">Todas las campañas</option>
            {campanasSelect.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
          </FilterSelect>
        )}

        {/* Rango de fechas en la misma fila */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="date" value={dateFrom} max={dateTo || new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setDateFrom(e.target.value); setPage(1) }}
              title="Desde"
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-2 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10 w-[148px]" />
          </div>
          <span className="text-[0.72rem] text-gray-400 font-medium">—</span>
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input type="date" value={dateTo} min={dateFrom} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => { setDateTo(e.target.value); setPage(1) }}
              title="Hasta"
              className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-8 pr-2 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10 w-[148px]" />
          </div>
          <button
            onClick={clearDates}
            style={{ visibility: (dateFrom || dateTo) ? 'visible' : 'hidden' }}
            className="rounded-xl border border-gray-200 bg-white px-2 py-2 text-[0.72rem] font-medium text-gray-400 hover:bg-gray-50 transition-colors"
            title="Limpiar fechas">
            ✕
          </button>
        </div>

        <button onClick={exportExcel} disabled={!filtered.length || exporting}
          className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors disabled:opacity-40">
          {exporting ? <Spinner size="sm" /> : <Download className="h-3.5 w-3.5" />} Exportar Excel
        </button>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3.5">
          <h2 className="text-[0.85rem] font-bold text-gray-900">
            {filtered.length} venta{filtered.length !== 1 ? 's' : ''}
            {(search || filtStatus || filtAgent) ? ' (filtradas)' : ''}
          </h2>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : paginated.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <ShoppingCart className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin resultados</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {(['Agente','Cliente','Teléfono','Campaña','Estatus','Fecha','Evidencia'] as string[])
                    .concat(canEdit ? ['Acciones'] : [])
                    .map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {paginated.map((v) => (
                  <tr key={v.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-semibold text-gray-800 whitespace-nowrap">{v.nombreAgente}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-[0.82rem] font-medium text-gray-700 whitespace-nowrap">{v.nombreCliente}</p>
                    </td>
                    <td className="px-4 py-3 text-[0.78rem] font-mono text-gray-500">{v.telefonoCliente}</td>
                    <td className="px-4 py-3">
                      {v.campaignId ? (
                        <span className={clsx(
                          'rounded-full px-2 py-0.5 text-[0.65rem] font-bold whitespace-nowrap',
                          v.campaignId === 4 ? 'bg-red-100 text-red-700' :
                          v.campaignId === 2 ? 'bg-purple-100 text-purple-700' :
                          v.campaignId === 3 ? 'bg-orange-100 text-orange-700' :
                          'bg-blue-100 text-blue-700'
                        )}>
                          {campanasSelect.find((c) => c.id === v.campaignId)?.nombre ?? `Camp. ${v.campaignId}`}
                        </span>
                      ) : <span className="text-[0.72rem] text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold whitespace-nowrap', VENTA_ESTADO_COLORS[v.estatus])}>
                        {v.estatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[0.75rem] text-gray-500 whitespace-nowrap">
                      {v.fecha ? parseFechaLocal(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      {v.evidencia ? (
                        <button onClick={() => setViewImg(v.evidencia)}
                          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[0.72rem] font-semibold text-gray-500 hover:bg-gray-50 transition-colors">
                          <Eye className="h-3.5 w-3.5" /> Ver
                        </button>
                      ) : (
                        <span className="text-[0.72rem] text-gray-300">—</span>
                      )}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {v.evidencia && (
                            <button
                              onClick={async () => {
                                try {
                                  const res = await fetch(v.evidencia!)
                                  const blob = await res.blob()
                                  const url = URL.createObjectURL(blob)
                                  const a = document.createElement('a')
                                  a.href = url
                                  a.download = v.evidencia!.split('/').pop() ?? 'evidencia.jpg'
                                  a.click()
                                  URL.revokeObjectURL(url)
                                } catch { window.open(v.evidencia!, '_blank') }
                              }}
                              className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors" title="Descargar evidencia">
                              <Download className="h-3.5 w-3.5" />
                            </button>
                          )}
                          <button onClick={() => setEditing(v)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => {
                            if (window.confirm('¿Eliminar esta venta?')) delVenta.mutate(v.id)
                          }} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Eliminar">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
            <p className="text-[0.72rem] text-gray-400">Página {page} de {totalPages} · {filtered.length} registros</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => p - 1)} disabled={page === 1}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button onClick={() => setPage((p) => p + 1)} disabled={page === totalPages}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal editar venta */}
      {editing && (
        <EditVentaModal
          venta={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['ventas-all'] }) }}
        />
      )}

      {/* Visor imagen */}
      {viewImg && (
        <Modal isOpen title="Evidencia" onClose={() => setViewImg(null)}>
          <img src={viewImg} alt="evidencia" className="w-full rounded-xl object-contain max-h-[70vh]" />
          <button
            onClick={async () => {
              try {
                const res = await fetch(viewImg)
                const blob = await res.blob()
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = viewImg.split('/').pop() ?? 'evidencia.jpg'
                a.click()
                URL.revokeObjectURL(url)
              } catch { window.open(viewImg, '_blank') }
            }}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-200 transition-colors">
            <Download className="h-3.5 w-3.5" /> Descargar evidencia
          </button>
        </Modal>
      )}
    </div>
  )
}

/* ─── Modal editar venta ─────────────────────────────────── */
function EditVentaModal({ venta, onClose, onSaved }: {
  venta: Venta; onClose: () => void; onSaved: () => void
}) {
  const [form, setForm] = useState({
    nombreCliente:   venta.nombreCliente,
    telefonoCliente: venta.telefonoCliente,
    estatus:         venta.estatus,
    fecha:           venta.fecha ? new Date(venta.fecha).toISOString().slice(0, 16) : '',
  })

  const isBanamex = venta.campaignId === 4
  const opciones: VentaEstado[] = isBanamex
    ? ['Aprobada', 'Declinado', 'Formalizado', 'Agendada', 'Cancelada']
    : ['Pendiente', 'Aprobada', 'Rechazada', 'Agendada', 'Formalizada', 'Garantizada', 'Cancelada']

  const guardar = useMutation({
    mutationFn: () => ventasService.updateVenta(venta.id, {
      nombreCliente:   form.nombreCliente,
      telefonoCliente: form.telefonoCliente,
      estatus:         form.estatus,
      fecha:           form.fecha ? new Date(form.fecha).toISOString() : venta.fecha,
    }),
    onSuccess: () => { toast.success('Venta actualizada'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  return (
    <Modal isOpen title="Editar venta" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre cliente</label>
          <input value={form.nombreCliente} onChange={(e) => setForm((f) => ({ ...f, nombreCliente: e.target.value }))}
            className="field w-full" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Teléfono</label>
          <input value={form.telefonoCliente} onChange={(e) => setForm((f) => ({ ...f, telefonoCliente: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
            className="field w-full" maxLength={10} inputMode="numeric" />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Estatus</label>
          <div className="relative">
            <select value={form.estatus} onChange={(e) => setForm((f) => ({ ...f, estatus: e.target.value as VentaEstado }))}
              className="w-full appearance-none rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-8 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10">
              {opciones.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Fecha y hora</label>
          <input type="datetime-local" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
            className="field w-full" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
            {guardar.isPending && <Spinner size="sm" />} Guardar cambios
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════
   AGENTES TAB
══════════════════════════════════════════════════════════ */
function AgentesTab() {
  const qc = useQueryClient()
  const [search,     setSearch]     = useState('')
  const [filtroRol,  setFiltroRol]  = useState('')
  const [showModal,  setShowModal]  = useState(false)
  const [editAgente, setEditAgente] = useState<AgenteVentas | null>(null)
  const [viewAgente, setViewAgente] = useState<AgenteVentas | null>(null)

  const { data: agentes  = [], isLoading } = useQuery({ queryKey: ['ventas-agentes'],  queryFn: () => ventasService.getAgentes() })
  const { data: campanas = [] }            = useQuery({ queryKey: ['ventas-campanas'], queryFn: () => ventasService.getCampanas() })

  const toggle = useMutation({
    mutationFn: (id: number) => ventasService.toggleAgente(id),
    onSuccess: () => { toast.success('Estado actualizado'); qc.invalidateQueries({ queryKey: ['ventas-agentes'] }) },
    onError: () => toast.error('Error al actualizar'),
  })

  const del = useMutation({
    mutationFn: (id: number) => ventasService.deleteAgente(id),
    onSuccess: () => { toast.success('Agente eliminado'); qc.invalidateQueries({ queryKey: ['ventas-agentes'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const filtered = agentes.filter((a) => {
    const q = search.toLowerCase()
    return (a.nombreAgente.toLowerCase().includes(q) || a.username.toLowerCase().includes(q)) &&
      (!filtroRol || a.role === filtroRol)
  })

  const activos   = agentes.filter((a) => a.activo).length
  const inactivos = agentes.filter((a) => !a.activo).length

  const ROLES = ['agente', 'supervisor', 'admin'] as const

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[0.78rem] text-gray-400">{activos} activos · {inactivos} inactivos</p>
        <button onClick={() => { setEditAgente(null); setShowModal(true) }}
          className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors">
          <Plus className="h-4 w-4" /> Nuevo agente
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre o usuario..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
        </div>
        <FilterSelect value={filtroRol} onChange={setFiltroRol}>
          <option value="">Todos los roles</option>
          {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
        </FilterSelect>
      </div>

      {/* Tabla */}
      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <Users className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin agentes{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Agente','Usuario','Rol','Campaña','Estado','Acciones'].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((a) => {
                  const campana = campanas.find((c) => c.id === a.campaignId)
                  return (
                    <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[0.72rem] font-bold text-white"
                            style={{ backgroundColor: a.color ?? '#1B4FD8' }}>
                            {a.nombreAgente.charAt(0).toUpperCase()}
                          </div>
                          <span className="text-[0.82rem] font-semibold text-gray-800">{a.nombreAgente}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] font-mono text-gray-500">{a.username}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold capitalize',
                          a.role === 'admin' || a.role === 'superadmin' ? 'bg-purple-100 text-purple-700' :
                          a.role === 'supervisor' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600')}>
                          {a.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[0.78rem] text-gray-500">{campana?.nombre ?? `Campaña ${a.campaignId}`}</td>
                      <td className="px-4 py-3">
                        <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold',
                          a.activo ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400')}>
                          {a.activo ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setViewAgente(a)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-500 transition-colors" title="Ver ventas">
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => { setEditAgente(a); setShowModal(true) }} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors" title="Editar">
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button onClick={() => toggle.mutate(a.id)} disabled={toggle.isPending} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 transition-colors" title={a.activo ? 'Desactivar' : 'Activar'}>
                            {a.activo ? <ToggleRight className="h-4 w-4 text-emerald-500" /> : <ToggleLeft className="h-4 w-4 text-gray-300" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      {showModal && (
        <AgenteModal
          agente={editAgente}
          campanas={campanas}
          onClose={() => setShowModal(false)}
          onSaved={() => { setShowModal(false); qc.invalidateQueries({ queryKey: ['ventas-agentes'] }) }}
        />
      )}

      {/* Modal ver ventas del agente */}
      {viewAgente && (
        <AgenteSalesModal
          agente={viewAgente}
          onClose={() => setViewAgente(null)}
        />
      )}
    </div>
  )
}

/* ─── Modal agente crear/editar ─────────────────────────── */
function AgenteModal({ agente, campanas: campanasProp, onClose, onSaved }: {
  agente: AgenteVentas | null; campanas: Campana[]
  onClose: () => void; onSaved: () => void
}) {
  const qc = useQueryClient()
  const [campanas, setCampanas] = useState<Campana[]>(campanasProp)
  const [form, setForm] = useState({
    nombreAgente:    agente?.nombreAgente ?? '',
    username:        agente?.username     ?? '',
    password:        '',
    newPassword:     '',
    confirmPassword: '',
    role:            agente?.role         ?? 'agente',
    campaignId:      agente?.campaignId   ?? campanasProp[0]?.id ?? 0,
  })
  const [showPass,        setShowPass]        = useState(false)
  const [showNewPass,     setShowNewPass]      = useState(false)
  const [showNuevaCampana, setShowNuevaCampana] = useState(false)
  const [nuevaCampNombre,  setNuevaCampNombre]  = useState('')

  const passError = form.newPassword && form.newPassword !== form.confirmPassword ? 'Las contraseñas no coinciden' : ''

  const guardar = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {
        nombreAgente: form.nombreAgente.trim(),
        username:     form.username.trim(),
        role:         form.role,
        campaigns:    [Number(form.campaignId)],
        campaign:     Number(form.campaignId),
      }
      if (!agente) payload['password'] = form.password
      else if (form.newPassword) {
        payload['currentPassword'] = form.password
        payload['newPassword']     = form.newPassword
      }
      return agente
        ? ventasService.updateAgente(agente.id, payload as Parameters<typeof ventasService.updateAgente>[1])
        : ventasService.createAgente(payload as Parameters<typeof ventasService.createAgente>[0]).then(() => {})
    },
    onSuccess: () => { toast.success(agente ? 'Agente actualizado' : 'Agente creado'); onSaved() },
    onError: () => toast.error('Error al guardar'),
  })

  const crearCampana = useMutation({
    mutationFn: () => ventasService.createCampana(nuevaCampNombre.trim()),
    onSuccess: (nueva) => {
      const actualizadas = [...campanas, nueva]
      setCampanas(actualizadas)
      setForm((f) => ({ ...f, campaignId: nueva.id }))
      setNuevaCampNombre('')
      setShowNuevaCampana(false)
      qc.invalidateQueries({ queryKey: ['ventas-campanas'] })
      toast.success('Campaña creada')
    },
    onError: () => toast.error('Error al crear campaña'),
  })

  const canSave = form.nombreAgente.trim() && form.username.trim() &&
    (!agente ? form.password.trim() : true) && !passError

  const ROLES = ['agente', 'supervisor', 'admin'] as const

  return (
    <Modal isOpen title={agente ? `Editar: ${agente.nombreAgente}` : 'Nuevo agente'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre completo</label>
            <input value={form.nombreAgente} onChange={(e) => setForm((f) => ({ ...f, nombreAgente: e.target.value }))}
              className="field w-full" placeholder="Nombre del agente" />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Usuario</label>
            <input value={form.username} onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              className="field w-full" placeholder="CC_0200" />
          </div>
        </div>

        {!agente ? (
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Contraseña</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="field w-full pr-10" placeholder="••••••••" />
              <button type="button" onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                {showPass
                  ? <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 space-y-3">
            <p className="text-[0.72rem] font-semibold text-gray-500">Cambiar contraseña (opcional)</p>
            <div>
              <label className="mb-1.5 block text-[0.72rem] font-semibold text-gray-500">Contraseña actual</label>
              <div className="relative">
                <input type={showPass ? 'text' : 'password'} value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="field w-full pr-10" placeholder="••••••••" />
                <button type="button" onClick={() => setShowPass((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                  {showPass
                    ? <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-[0.72rem] font-semibold text-gray-500">Nueva contraseña</label>
                <div className="relative">
                  <input type={showNewPass ? 'text' : 'password'} value={form.newPassword}
                    onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))}
                    className="field w-full pr-10" placeholder="••••••••" />
                  <button type="button" onClick={() => setShowNewPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showNewPass
                      ? <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                      : <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    }
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-[0.72rem] font-semibold text-gray-500">Confirmar</label>
                <input type="password" value={form.confirmPassword} onChange={(e) => setForm((f) => ({ ...f, confirmPassword: e.target.value }))}
                  className={clsx('field w-full', passError ? 'border-red-300' : '')} placeholder="••••••••" />
              </div>
            </div>
            {passError && <p className="text-[0.68rem] text-red-500 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{passError}</p>}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Rol</label>
            <FilterSelect value={form.role} onChange={(v) => setForm((f) => ({ ...f, role: v as AgenteVentas['role'] }))}>
              {ROLES.map((r) => <option key={r} value={r} className="capitalize">{r}</option>)}
            </FilterSelect>
          </div>
          <div>
            <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600 flex items-center justify-between">
              Campaña
              <button type="button" onClick={() => setShowNuevaCampana((v) => !v)}
                className="ml-2 flex items-center gap-0.5 text-[0.68rem] font-semibold text-brand hover:text-brand-dark transition-colors">
                <Plus className="h-3 w-3" /> Nueva
              </button>
            </label>
            {showNuevaCampana ? (
              <div className="flex gap-1.5">
                <input autoFocus value={nuevaCampNombre} onChange={(e) => setNuevaCampNombre(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && nuevaCampNombre.trim() && crearCampana.mutate()}
                  placeholder="Nombre campaña" className="field flex-1 text-[0.78rem] py-1.5" />
                <button type="button" onClick={() => crearCampana.mutate()} disabled={!nuevaCampNombre.trim() || crearCampana.isPending}
                  className="rounded-xl bg-brand px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors flex items-center gap-1">
                  {crearCampana.isPending ? <Spinner size="sm" /> : <Plus className="h-3 w-3" />}
                </button>
                <button type="button" onClick={() => { setShowNuevaCampana(false); setNuevaCampNombre('') }}
                  className="rounded-xl border border-gray-200 px-2.5 py-1.5 text-[0.75rem] text-gray-400 hover:bg-gray-50 transition-colors">✕</button>
              </div>
            ) : (
              <FilterSelect value={form.campaignId} onChange={(v) => setForm((f) => ({ ...f, campaignId: Number(v) }))}>
                {campanas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </FilterSelect>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
          <button onClick={() => guardar.mutate()} disabled={!canSave || guardar.isPending}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors disabled:opacity-50">
            {guardar.isPending && <Spinner size="sm" />}
            {agente ? 'Guardar cambios' : 'Crear agente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ─── Modal ver ventas de agente ─────────────────────────── */
function AgenteSalesModal({ agente, onClose }: { agente: AgenteVentas; onClose: () => void }) {
  const qc = useQueryClient()
  const [search, setSearch]   = useState('')
  const [filtStatus, setFiltStatus] = useState('')
  const [editing, setEditing] = useState<Venta | null>(null)
  const [viewImg, setViewImg] = useState<string | null>(null)

  const { data: ventas = [], isLoading } = useQuery({
    queryKey: ['ventas-agente-detail', agente.id],
    queryFn: () => ventasService.getAllSales(),
    staleTime: 30_000,
  })

  const agenteVentas = ventas.filter((v) => v.agentId === agente.id || v.nombreAgente === agente.nombreAgente)

  const filtered = agenteVentas.filter((v) => {
    const q = search.toLowerCase()
    return (v.nombreCliente.toLowerCase().includes(q) || v.telefonoCliente.includes(q)) &&
      (!filtStatus || v.estatus === filtStatus)
  })

  return (
    <Modal isOpen title={`${agente.nombreAgente} — ${agenteVentas.length} ventas`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-40">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente o teléfono..."
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-[0.82rem] outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
          </div>
          <FilterSelect value={filtStatus} onChange={setFiltStatus}>
            <option value="">Todos los estados</option>
            {VENTA_ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
          </FilterSelect>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2 text-gray-400">
            <ShoppingCart className="h-7 w-7 opacity-25" />
            <p className="text-[0.82rem]">Sin ventas{search ? ` para "${search}"` : ''}</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[55vh] overflow-y-auto rounded-xl border border-gray-100">
            {filtered.map((v) => (
              <div key={v.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <div className={clsx('mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg',
                  v.estatus === 'Aprobada' ? 'bg-emerald-100' : v.estatus === 'Rechazada' ? 'bg-red-100' : 'bg-yellow-100')}>
                  {v.estatus === 'Aprobada' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> :
                   v.estatus === 'Rechazada' ? <XCircle className="h-4 w-4 text-red-500" /> :
                   <Clock className="h-4 w-4 text-yellow-600" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.82rem] font-semibold text-gray-800">{v.nombreCliente}</p>
                  <p className="text-[0.72rem] text-gray-500 flex items-center gap-1">
                    <Phone className="h-3 w-3" />{v.telefonoCliente}
                  </p>
                  <p className="text-[0.68rem] text-gray-400 mt-0.5">
                    {v.fecha ? new Date(v.fecha).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.65rem] font-bold', VENTA_ESTADO_COLORS[v.estatus])}>
                    {v.estatus}
                  </span>
                  <div className="flex gap-1">
                    {v.evidencia && (
                      <button onClick={() => setViewImg(v.evidencia)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-blue-500 transition-colors">
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => setEditing(v)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors">
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <EditVentaModal
          venta={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); qc.invalidateQueries({ queryKey: ['ventas-agente-detail', agente.id] }); qc.invalidateQueries({ queryKey: ['ventas-all'] }) }}
        />
      )}
      {viewImg && (
        <Modal isOpen title="Evidencia" onClose={() => setViewImg(null)}>
          <img src={viewImg} alt="evidencia" className="w-full rounded-xl object-contain max-h-[70vh]" />
        </Modal>
      )}
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════
   ASIGNACIONES TAB  —  asignar agentes a campañas
══════════════════════════════════════════════════════════ */
function AsignacionesTab() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState<number | null>(null)

  const { data: agentes  = [], isLoading: ldAgentes  } = useQuery({ queryKey: ['ventas-agentes'],  queryFn: () => ventasService.getAgentes() })
  const { data: campanas = [], isLoading: ldCampanas } = useQuery({ queryKey: ['ventas-campanas'], queryFn: () => ventasService.getCampanas() })

  // Mapa local de asignaciones: agentId → Set<campaignId>
  // Se inicializa desde los datos del agente pero permite cambios optimistas
  const [assignments, setAssignments] = useState<Record<number, Set<number>>>({})

  // Inicializar assignments cuando llegan los agentes
  const initialized = agentes.length > 0 && Object.keys(assignments).length === 0
  if (initialized) {
    const init: Record<number, Set<number>> = {}
    for (const a of agentes) {
      // campaignIds viene del agente si está disponible, sino solo su campaña primaria
      const ids: number[] = (a as AgenteVentas & { campaignIds?: number[] }).campaignIds ?? (a.campaignId ? [a.campaignId] : [])
      init[a.id] = new Set(ids)
    }
    setAssignments(init)
  }

  const toggle = async (agentId: number, campanaId: number) => {
    const current = new Set(assignments[agentId] ?? [])
    if (current.has(campanaId)) {
      current.delete(campanaId)
    } else {
      current.add(campanaId)
    }
    // Actualizar local inmediatamente
    setAssignments((prev) => ({ ...prev, [agentId]: current }))

    // Guardar en backend
    setSaving(agentId)
    try {
      await ventasService.updateAgente(agentId, { campaigns: [...current] } as Parameters<typeof ventasService.updateAgente>[1])
      toast.success('Asignación actualizada')
      qc.invalidateQueries({ queryKey: ['ventas-agentes'] })
    } catch {
      toast.error('Error al guardar')
      // Revertir
      const revert = new Set(assignments[agentId] ?? [])
      setAssignments((prev) => ({ ...prev, [agentId]: revert }))
    } finally {
      setSaving(null)
    }
  }

  const filtered = agentes.filter((a) =>
    a.nombreAgente.toLowerCase().includes(search.toLowerCase()) ||
    a.username.toLowerCase().includes(search.toLowerCase())
  )

  const isLoading = ldAgentes || ldCampanas

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar agente..."
            className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
        </div>
        <p className="text-[0.75rem] text-gray-400">Activa o desactiva las campañas de cada agente</p>
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 w-64">Agente</th>
                  {campanas.map((c) => (
                    <th key={c.id} className="px-4 py-2.5 text-center text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 min-w-[120px]">
                      {c.nombre}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((a) => {
                  const agentAssign = assignments[a.id] ?? new Set<number>()
                  const isSavingThis = saving === a.id
                  return (
                    <tr key={a.id} className={clsx('hover:bg-gray-50 transition-colors', !a.activo && 'opacity-40')}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[0.68rem] font-bold text-white"
                            style={{ backgroundColor: a.color ?? '#1B4FD8' }}>
                            {a.nombreAgente.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[0.78rem] font-semibold text-gray-800 leading-tight">{a.nombreAgente}</p>
                            <p className="text-[0.68rem] text-gray-400 font-mono">{a.username}</p>
                          </div>
                          {isSavingThis && <Spinner size="sm" />}
                        </div>
                      </td>
                      {campanas.map((c) => {
                        const active = agentAssign.has(c.id)
                        return (
                          <td key={c.id} className="px-4 py-3 text-center">
                            <button
                              onClick={() => toggle(a.id, c.id)}
                              disabled={isSavingThis}
                              title={active ? `Quitar de ${c.nombre}` : `Asignar a ${c.nombre}`}
                              className={clsx(
                                'inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors mx-auto',
                                active
                                  ? 'bg-emerald-100 text-emerald-600 hover:bg-red-100 hover:text-red-500'
                                  : 'bg-gray-100 text-gray-300 hover:bg-emerald-100 hover:text-emerald-500',
                                isSavingThis && 'cursor-not-allowed',
                              )}
                            >
                              {active
                                ? <CheckCircle2 className="h-4 w-4" />
                                : <Plus className="h-4 w-4" />
                              }
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   NOTIFICACIONES TAB  —  ventas agendadas (admin)
══════════════════════════════════════════════════════════ */
function NotificacionesTab() {
  const [search, setSearch] = useState('')
  const { ventasRole } = useVentasStore()
  const isAdminRole = ventasRole === 'superadmin' || ventasRole === 'admin'

  const { data: agendadas = [], isLoading } = useQuery({
    queryKey: ['ventas-agendadas-admin'],
    queryFn:  () => ventasService.getScheduledAdmin(),
    staleTime: 30_000,
    refetchInterval: isAdminRole ? 60_000 : false,
    enabled: isAdminRole,
    retry: false,
  })

  const filtered = agendadas.filter((a) => {
    const q = search.toLowerCase()
    return (
      a.nombreAgente.toLowerCase().includes(q) ||
      a.nombreCliente.toLowerCase().includes(q) ||
      a.telefonoCliente.includes(q)
    )
  })

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por agente, cliente o teléfono..."
          className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-[0.85rem] font-bold text-gray-900 flex items-center gap-2">
            <Bell className="h-4 w-4 text-brand" /> Ventas agendadas del equipo
          </h2>
          <span className="rounded-full bg-brand/10 px-2.5 py-0.5 text-[0.72rem] font-bold text-brand">{filtered.length}</span>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-400">
            <Bell className="h-10 w-10 opacity-20" />
            <p className="text-[0.85rem] font-medium">Sin ventas agendadas</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {filtered.map((a) => {
              const fechaFmt = a.fechaAgendada
                ? new Date(a.fechaAgendada).toLocaleDateString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })
                : '—'
              return (
                <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-100">
                    <Bell className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[0.88rem] font-bold text-gray-900">{a.nombreCliente}</p>
                    <div className="flex flex-wrap gap-3 mt-1">
                      <span className="text-[0.72rem] text-gray-500 flex items-center gap-1">
                        <Phone className="h-3 w-3" />{a.telefonoCliente}
                      </span>
                      <span className="text-[0.72rem] text-gray-500 flex items-center gap-1">
                        <User className="h-3 w-3" />Agente: {a.nombreAgente}
                      </span>
                      <span className="text-[0.72rem] text-blue-600 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{fechaFmt}
                        {a.horaAgendada && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{a.horaAgendada}</span>}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   CAMPAÑAS TAB  (solo superadmin)
══════════════════════════════════════════════════════════ */
function CampanasTab({ canCreate }: { canCreate: boolean }) {
  const qc = useQueryClient()
  const [showCrear,  setShowCrear]  = useState(false)
  const [nombre,     setNombre]     = useState('')
  const [editando,   setEditando]   = useState<Campana | null>(null)

  const { data: campanas = [], isLoading } = useQuery({
    queryKey: ['ventas-campanas'],
    queryFn:  () => ventasService.getCampanas(),
    staleTime: 30_000,
  })

  const crear = useMutation({
    mutationFn: () => ventasService.createCampana(nombre.trim()),
    onSuccess: () => {
      toast.success('Campaña creada')
      setNombre('')
      setShowCrear(false)
      qc.invalidateQueries({ queryKey: ['ventas-campanas'] })
      qc.invalidateQueries({ queryKey: ['ventas-stats-v2'] })
    },
    onError: () => toast.error('Error al crear campaña'),
  })

  const toggle = useMutation({
    mutationFn: (id: number) => ventasService.toggleCampana(id),
    onSuccess: (_data, id) => {
      qc.setQueryData(['ventas-campanas'], (old: typeof campanas) =>
        old.map((c) => c.id === id ? { ...c, activo: !c.activo } : c)
      )
    },
    onError: () => toast.error('Error al actualizar campaña'),
  })

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-[0.78rem] text-gray-400">{campanas.length} campaña{campanas.length !== 1 ? 's' : ''} registrada{campanas.length !== 1 ? 's' : ''}</p>
        {canCreate && (
          <button onClick={() => setShowCrear(true)}
            className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-4 w-4" /> Nueva campaña
          </button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : campanas.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
            <Megaphone className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin campañas registradas</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {campanas.map((c) => (
              <div key={c.id} className={clsx('flex items-center gap-4 px-5 py-4 transition-colors', c.activo !== false ? 'hover:bg-gray-50' : 'bg-gray-50/60 opacity-60 hover:opacity-80')}>
                {/* Dot de color de campaña */}
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: c.color ? `${c.color}20` : (c.activo !== false ? '#1B4FD820' : '#e5e7eb') }}>
                  <div className="h-5 w-5 rounded-full border-2 border-white shadow-sm"
                    style={{ backgroundColor: c.color ?? (c.activo !== false ? '#1B4FD8' : '#9ca3af') }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[0.85rem] font-semibold text-gray-900 flex items-center gap-2">
                    {c.nombre}
                  </p>
                  <p className="text-[0.72rem] text-gray-400">ID: {c.id}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setEditando(c)} title="Editar campaña"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-brand transition-colors">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <span className={clsx('text-[0.7rem] font-semibold', c.activo !== false ? 'text-emerald-600' : 'text-gray-400')}>
                    {c.activo !== false ? 'Activa' : 'Inactiva'}
                  </span>
                  <button onClick={() => toggle.mutate(c.id)} disabled={toggle.isPending}
                    title={c.activo !== false ? 'Desactivar' : 'Activar'}
                    className="flex-shrink-0 disabled:opacity-50">
                    {c.activo !== false
                      ? <ToggleRight className="h-7 w-7 text-emerald-500 hover:text-emerald-600 transition-colors" />
                      : <ToggleLeft  className="h-7 w-7 text-gray-300 hover:text-gray-400 transition-colors" />
                    }
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal nueva campaña */}
      {showCrear && (
        <Modal isOpen title="Nueva campaña" onClose={() => { setShowCrear(false); setNombre('') }}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre de la campaña</label>
              <input value={nombre} onChange={(e) => setNombre(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && nombre.trim() && crear.mutate()}
                placeholder="Ej: BANAMEX, HSBC..." className="field w-full" autoFocus />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => { setShowCrear(false); setNombre('') }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={() => crear.mutate()} disabled={!nombre.trim() || crear.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
                {crear.isPending && <Spinner size="sm" />} Crear
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal editar campaña */}
      {editando && (
        <EditarCampanaModal campana={editando} onClose={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['ventas-campanas'] }) }} />
      )}
    </div>
  )
}

/* ── Modal editar campaña + estatus ─────────────────────── */
function EditarCampanaModal({ campana, onClose }: { campana: Campana; onClose: () => void }) {
  const qc = useQueryClient()
  const [nombre,        setNombre]        = useState(campana.nombre)
  const [colorCampana,  setColorCampana]  = useState(campana.color ?? '#2563eb')
  const [nuevoEstatus,  setNuevoEstatus]  = useState('')
  const [nuevoColor,    setNuevoColor]    = useState('#22c55e')
  const [editColorId,   setEditColorId]   = useState<number | null>(null)
  const [editColor,     setEditColor]     = useState('')
  const colorDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { data: statuses = [], isLoading: ldSt } = useQuery({
    queryKey: ['campana-statuses', campana.id],
    queryFn:  () => ventasService.getCampanaStatuses(campana.id),
    staleTime: 0,
  })

  const guardarCampana = useMutation({
    mutationFn: () => ventasService.updateCampana(campana.id, nombre.trim(), colorCampana),
    onSuccess: () => { toast.success('Campaña actualizada'); qc.invalidateQueries({ queryKey: ['ventas-campanas'] }) },
    onError: () => toast.error('Error al guardar'),
  })

  const agregarEstatus = useMutation({
    mutationFn: () => ventasService.addCampanaStatus(campana.id, nuevoEstatus.trim(), nuevoColor),
    onSuccess: () => { toast.success('Estatus agregado'); setNuevoEstatus(''); setNuevoColor('#22c55e'); qc.invalidateQueries({ queryKey: ['campana-statuses', campana.id] }) },
    onError: () => toast.error('Error al agregar estatus'),
  })

  const guardarColorEstatus = useMutation({
    mutationFn: ({ id, color }: { id: number; color: string }) => ventasService.updateCampanaStatus(campana.id, id, { color }),
    onSuccess: (_d, { id, color }) => {
      qc.setQueryData(['campana-statuses', campana.id], (old: CampanaStatus[]) =>
        (old ?? []).map((s) => s.id === id ? { ...s, color } : s)
      )
      setEditColorId(null)
      toast.success('Color actualizado')
    },
    onError: () => toast.error('Error al actualizar color'),
  })

  const toggleSt = useMutation({
    mutationFn: (statusId: number) => ventasService.toggleCampanaStatus(campana.id, statusId),
    onSuccess: (_data, statusId) => {
      qc.setQueryData(['campana-statuses', campana.id], (old: CampanaStatus[]) =>
        (old ?? []).map((s) => s.id === statusId ? { ...s, activo: !s.activo } : s)
      )
    },
    onError: () => toast.error('Error al actualizar estatus'),
  })

  const eliminarSt = useMutation({
    mutationFn: (statusId: number) => ventasService.deleteCampanaStatus(campana.id, statusId),
    onSuccess: (_data, statusId) => {
      qc.setQueryData(['campana-statuses', campana.id], (old: CampanaStatus[]) =>
        (old ?? []).filter((s) => s.id !== statusId)
      )
      toast.success('Estatus eliminado')
    },
    onError: () => toast.error('Error al eliminar estatus'),
  })

  const changed = nombre.trim() !== campana.nombre || colorCampana !== (campana.color ?? '#2563eb')

  return (
    <Modal isOpen title={`Editar campaña — ${campana.nombre}`} onClose={onClose}>
      <div className="space-y-5 min-w-[420px]">

        {/* Nombre + color de campaña */}
        <div>
          <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre y color de campaña</label>
          <div className="flex gap-2 items-center">
            {/* Color picker campaña */}
            <div className="relative flex-shrink-0">
              <div className="h-9 w-9 rounded-xl border-2 border-gray-200 overflow-hidden cursor-pointer" style={{ backgroundColor: colorCampana }}>
                <input type="color" value={colorCampana} onChange={(e) => setColorCampana(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              </div>
            </div>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && changed && guardarCampana.mutate()}
              className="field flex-1" />
            <button onClick={() => guardarCampana.mutate()} disabled={!changed || guardarCampana.isPending}
              className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-40 transition-colors flex-shrink-0">
              {guardarCampana.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Guardar
            </button>
          </div>
        </div>

        {/* Estatus */}
        <div>
          <p className="mb-2 text-[0.75rem] font-semibold text-gray-600">Estatus de la campaña</p>
          {ldSt ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : (
            <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 mb-3 overflow-hidden max-h-[260px] overflow-y-auto">
              {statuses.length === 0 ? (
                <p className="px-4 py-3 text-[0.78rem] text-gray-400">Sin estatus configurados</p>
              ) : statuses.map((s) => (
                <div key={s.id} className={clsx('flex items-center gap-2.5 px-4 py-2.5 transition-colors', s.activo ? '' : 'opacity-50')}>
                  {/* Burbuja de color del estatus — abre color picker nativo */}
                  <div className="relative flex-shrink-0">
                    <div
                      className="h-7 w-7 rounded-lg border-2 border-white shadow cursor-pointer flex-shrink-0 transition-transform hover:scale-110"
                      style={{ backgroundColor: editColorId === s.id ? editColor : (s.color ?? '#94a3b8') }}
                      title="Cambiar color del estatus"
                    >
                      <input type="color"
                        value={editColorId === s.id ? editColor : (s.color ?? '#94a3b8')}
                        onChange={(e) => {
                          const newColor = e.target.value
                          setEditColorId(s.id)
                          setEditColor(newColor)
                          if (colorDebounceRef.current) clearTimeout(colorDebounceRef.current)
                          colorDebounceRef.current = setTimeout(() => {
                            guardarColorEstatus.mutate({ id: s.id, color: newColor })
                          }, 600)
                        }}
                        className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
                    </div>
                  </div>
                  <span className="flex-1 text-[0.82rem] font-medium text-gray-800">{s.nombreEstado}</span>
                  <button onClick={() => toggleSt.mutate(s.id)} disabled={toggleSt.isPending} title={s.activo ? 'Desactivar' : 'Activar'} className="disabled:opacity-40 flex-shrink-0">
                    {s.activo
                      ? <ToggleRight className="h-6 w-6 text-emerald-500 hover:text-emerald-600" />
                      : <ToggleLeft  className="h-6 w-6 text-gray-300 hover:text-gray-400" />
                    }
                  </button>
                  <button onClick={() => eliminarSt.mutate(s.id)} disabled={eliminarSt.isPending} title="Eliminar estatus"
                    className="rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40 flex-shrink-0">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Agregar nuevo estatus */}
          <div className="flex gap-2 items-center">
            <div className="relative flex-shrink-0">
              <div className="h-9 w-9 rounded-xl border-2 border-gray-200 overflow-hidden cursor-pointer" style={{ backgroundColor: nuevoColor }}>
                <input type="color" value={nuevoColor} onChange={(e) => setNuevoColor(e.target.value)}
                  className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" />
              </div>
            </div>
            <input value={nuevoEstatus} onChange={(e) => setNuevoEstatus(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && nuevoEstatus.trim() && agregarEstatus.mutate()}
              placeholder="Nuevo estatus (ej: Formalizado)"
              className="field flex-1" />
            <button onClick={() => agregarEstatus.mutate()} disabled={!nuevoEstatus.trim() || agregarEstatus.isPending}
              className="flex items-center gap-1.5 rounded-xl border border-brand text-brand px-3 py-2 text-[0.78rem] font-semibold hover:bg-brand hover:text-white disabled:opacity-40 transition-colors flex-shrink-0">
              {agregarEstatus.isPending ? <Spinner size="sm" /> : <Plus className="h-3.5 w-3.5" />} Agregar
            </button>
          </div>
        </div>

        <div className="flex justify-end">
          <button onClick={onClose} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            Cerrar
          </button>
        </div>
      </div>
    </Modal>
  )
}

/* ══════════════════════════════════════════════════════════
   BASE MADRE TAB — full rebuild
══════════════════════════════════════════════════════════ */
function BaseMadreTab({ isSuperAdmin = false }: { isSuperAdmin?: boolean }) {
  const [campanaId,      setCampanaId]      = useState(1)
  const [subTab,         setSubTab]         = useState<'madre' | 'cargar' | 'lote1' | 'cola' | 'historico' | 'repetidos'>('madre')
  const [showMigrar,     setShowMigrar]     = useState(false)
  const [migrarQty,      setMigrarQty]      = useState(1000)
  const [chartMode,      setChartMode]      = useState<'lista' | 'barra'>('barra')
  const qc = useQueryClient()
  const { ventasCampaigns } = useVentasStore()

  // ── Filters per tab ─────────────────────────────────────
  const [mSearch, setMSearch] = useState(''); const [mStatus, setMStatus] = useState(''); const [mDesde, setMDesde] = useState(''); const [mHasta, setMHasta] = useState(''); const [mPage, setMPage] = useState(1)
  const [l1Search, setL1Search] = useState(''); const [l1Page, setL1Page] = useState(1)
  const [coSearch, setCoSearch] = useState(''); const [coPage, setCoPage] = useState(1)
  const [hiSearch, setHiSearch] = useState(''); const [hiPage, setHiPage] = useState(1)
  const [repPage, setRepPage] = useState(1)
  const LIMIT = 50

  // ── Queries ─────────────────────────────────────────────
  const { data: stats, isLoading: ldStats } = useQuery({
    queryKey: ['bm-stats', campanaId],
    queryFn: () => ventasService.getBaseMadreStats(campanaId),
    staleTime: 60_000,
  })

  const { data: statuses = [] } = useQuery({
    queryKey: ['bm-statuses', campanaId],
    queryFn: () => ventasService.getBaseMadreStatuses(campanaId),
    staleTime: 300_000,
  })

  const { data: madreRes, isLoading: ldMadre } = useQuery({
    queryKey: ['bm-madre', campanaId, mPage, mSearch, mStatus, mDesde, mHasta],
    queryFn: () => ventasService.getBaseMadreMadre(campanaId, mPage, LIMIT, mSearch, mStatus, mDesde, mHasta),
    enabled: subTab === 'madre',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: lote1Res, isLoading: ldL1 } = useQuery({
    queryKey: ['bm-lote1', campanaId, l1Page, l1Search],
    queryFn: () => ventasService.getBaseMadreLote1(campanaId, l1Page, LIMIT, l1Search),
    enabled: subTab === 'lote1',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: chartStats } = useQuery({
    queryKey: ['bm-chart-stats', campanaId],
    queryFn: () => ventasService.getBaseMadreLote1ChartStats(campanaId),
    enabled: subTab === 'lote1',
    staleTime: 60_000,
  })

  const { data: colaRes, isLoading: ldCo } = useQuery({
    queryKey: ['bm-cola', campanaId, coPage, coSearch],
    queryFn: () => ventasService.getBaseMadreCola(campanaId, coPage, LIMIT, coSearch),
    enabled: subTab === 'cola',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: histRes, isLoading: ldHi } = useQuery({
    queryKey: ['bm-historico', campanaId, hiPage, hiSearch],
    queryFn: () => ventasService.getBaseMadreHistorico(campanaId, hiPage, LIMIT, hiSearch),
    enabled: subTab === 'historico',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const { data: repRes, isLoading: ldRep } = useQuery({
    queryKey: ['bm-repetidos', campanaId, repPage],
    queryFn: () => ventasService.getBaseMadreRepetidos(campanaId, repPage, LIMIT),
    enabled: subTab === 'repetidos',
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  })

  const resetTab = (t: typeof subTab) => {
    setSubTab(t)
    setMPage(1); setL1Page(1); setCoPage(1); setHiPage(1); setRepPage(1)
  }

  const invalidateBM = () => {
    qc.invalidateQueries({ queryKey: ['bm-stats', campanaId] })
    qc.invalidateQueries({ queryKey: ['bm-madre', campanaId] })
    qc.invalidateQueries({ queryKey: ['bm-lote1', campanaId] })
    qc.invalidateQueries({ queryKey: ['bm-chart-stats', campanaId] })
    qc.invalidateQueries({ queryKey: ['bm-cola', campanaId] })
  }

  // ── Mutations ────────────────────────────────────────────
  const syncMut = useMutation({
    mutationFn: () => ventasService.syncBaseMadreStatus(campanaId),
    onSuccess: (r) => { toast.success(`Sync: ${r.updated} actualizados`); invalidateBM() },
    onError: () => toast.error('Error al sincronizar'),
  })
  const pubMut = useMutation({
    mutationFn: () => ventasService.publicarAlCRM(campanaId),
    onSuccess: (r) => { toast.success(`${r.inserted} publicados al CRM`); invalidateBM() },
    onError: () => toast.error('Error al publicar'),
  })
  const migMut = useMutation({
    mutationFn: () => ventasService.migrarLote1(campanaId, migrarQty),
    onSuccess: (r) => { toast.success(`Migrados: ${r.insertadosLote1} a Lote 1`); setShowMigrar(false); invalidateBM() },
    onError: () => toast.error('Error al migrar'),
  })
  const avzMut = useMutation({
    mutationFn: () => ventasService.avanzarCola(campanaId),
    onSuccess: (r) => { toast.success(`Cola avanzada: ${r.regresadosAMadre} a madre, ${r.avanzadosAVuelta2} a v2`); invalidateBM() },
    onError: () => toast.error('Error al avanzar cola'),
  })
  const rotMut = useMutation({
    mutationFn: () => ventasService.rotarLotes(campanaId),
    onSuccess: (r) => { toast.success(`Rotados: ${r.aCola} a cola, ${r.regresadosAMadre} a madre`); invalidateBM() },
    onError: () => toast.error('Error al rotar'),
  })
  const desMut = useMutation({
    mutationFn: (lote: 'lote1' | 'lote2' | 'ambos') => ventasService.descartarLote(campanaId, lote),
    onSuccess: (r) => { toast.success(`Descartados L1=${r.descartadosLote1} L2=${r.descartadosLote2}`); invalidateBM() },
    onError: () => toast.error('Error al descartar'),
  })

  const anyBusy = syncMut.isPending || pubMut.isPending || migMut.isPending || avzMut.isPending || rotMut.isPending || desMut.isPending

  // ── Sub-components ───────────────────────────────────────
  const StatCard = ({ label, value, sub, color = 'text-gray-900' }: { label: string; value: number; sub?: string; color?: string }) => (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm px-4 py-3.5 flex flex-col gap-0.5">
      <p className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
      <p className={`text-[1.5rem] font-black leading-tight ${color}`}>{value.toLocaleString()}</p>
      {sub && <p className="text-[0.65rem] text-gray-400">{sub}</p>}
    </div>
  )

  const Pagination = ({ page, total, limit, onChange }: { page: number; total: number; limit: number; onChange: (p: number) => void }) => {
    const pages = Math.ceil(total / limit)
    if (pages <= 1) return null
    return (
      <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100">
        <p className="text-[0.72rem] text-gray-400">{((page - 1) * limit + 1).toLocaleString()}–{Math.min(page * limit, total).toLocaleString()} de {total.toLocaleString()}</p>
        <div className="flex items-center gap-1">
          <button onClick={() => onChange(page - 1)} disabled={page <= 1}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-[0.78rem] font-semibold text-gray-600 px-2">{page} / {pages}</span>
          <button onClick={() => onChange(page + 1)} disabled={page >= pages}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>
    )
  }

  const BMTable = ({ cols, rows, loading }: { cols: string[]; rows: Record<string, unknown>[]; loading: boolean }) => {
    if (loading) return <div className="flex justify-center py-10"><Spinner size="lg" /></div>
    if (!rows.length) return <div className="flex items-center justify-center py-10 text-gray-400 text-[0.82rem]">Sin registros</div>
    return (
      <div className="overflow-x-auto">
        <table className="w-full text-[0.75rem]">
          <thead><tr className="border-b border-gray-100 bg-gray-50">
            {cols.map(c => <th key={c} className="px-3 py-2 text-left font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{c.replace(/([A-Z])/g,' $1').trim()}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50 transition-colors">
                {cols.map(c => <td key={c} className="px-3 py-2 text-gray-600 whitespace-nowrap max-w-[180px] truncate">{String(r[c] ?? '—')}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  const SearchBar = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder ?? 'Buscar...'}
        className="w-full max-w-sm rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
    </div>
  )

  // Barra de consumo: trabajados = madre_raw - disponibles
  const madreRaw   = stats?.totalMadreRaw ?? 0
  const disponible = stats?.totalMadre    ?? 0
  const trabajados = madreRaw - disponible
  const pctTrab    = madreRaw > 0 ? (trabajados / madreRaw) * 100 : 0
  const pctDisp    = madreRaw > 0 ? (disponible / madreRaw) * 100 : 0

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-bold text-gray-900 flex items-center gap-2"><Database className="h-4 w-4 text-brand" /> Base Madre</h2>
          <p className="text-[0.75rem] text-gray-400 mt-0.5">Gestión de lotes y estadísticas de base de datos</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ventasCampaigns.length > 0 && (
            <FilterSelect value={campanaId} onChange={v => { setCampanaId(Number(v)); setMPage(1); setL1Page(1); setCoPage(1); setHiPage(1); setRepPage(1) }}>
              {ventasCampaigns.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </FilterSelect>
          )}
          <button onClick={() => syncMut.mutate()} disabled={anyBusy}
            className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors">
            {syncMut.isPending ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />} Sync Status Ventas
          </button>
          <button onClick={() => pubMut.mutate()} disabled={anyBusy}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-40 transition-colors">
            {pubMut.isPending ? <Spinner size="sm" /> : <Upload className="h-3.5 w-3.5" />} Publicar Lote 1 al CRM
          </button>
        </div>
      </div>

      {/* ── Stats cards ── */}
      {ldStats ? <div className="flex justify-center py-6"><Spinner size="lg" /></div> : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <StatCard label="Disponibles"  value={disponible}           color="text-brand"      sub={`de ${madreRaw.toLocaleString()} totales`} />
            <StatCard label="Lote 1"       value={stats?.totalLote1 ?? 0}  color="text-blue-600" />
            <StatCard label="Lote 2"       value={stats?.totalLote2 ?? 0}  color="text-indigo-500" />
            <StatCard label="Cola Espera"  value={stats?.totalCola ?? 0}   color="text-yellow-600" sub={`${stats?.totalCola1 ?? 0} v1 · ${stats?.totalCola2 ?? 0} v2`} />
            <StatCard label="Histórico"    value={stats?.totalHistorico ?? 0} color="text-gray-600" sub={madreRaw > 0 ? `${((stats?.totalHistorico ?? 0) / madreRaw * 100).toFixed(1)}% consumida` : undefined} />
            <StatCard label="Repetidos"    value={stats?.totalRepetidos ?? 0} color="text-red-500" />
          </div>

          {/* Barra de consumo */}
          {madreRaw > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm px-5 py-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[0.75rem] font-semibold text-gray-700">Consumo de Base Madre</p>
                <p className="text-[0.72rem] text-gray-400">{trabajados.toLocaleString()} trabajados · {disponible.toLocaleString()} disponibles</p>
              </div>
              <div className="flex h-3 w-full rounded-full overflow-hidden bg-gray-100">
                <div className="h-full bg-gray-400 transition-all" style={{ width: `${pctTrab.toFixed(1)}%` }} title={`Trabajados ${pctTrab.toFixed(1)}%`} />
                <div className="h-full bg-brand transition-all" style={{ width: `${((stats?.totalLote1 ?? 0) / madreRaw * 100).toFixed(1)}%` }} title="En Lote 1" />
                <div className="h-full bg-indigo-400 transition-all" style={{ width: `${((stats?.totalLote2 ?? 0) / madreRaw * 100).toFixed(1)}%` }} title="En Lote 2" />
                <div className="h-full bg-yellow-400 transition-all" style={{ width: `${((stats?.totalCola ?? 0) / madreRaw * 100).toFixed(1)}%` }} title="En Cola" />
                <div className="h-full bg-red-400 transition-all" style={{ width: `${((stats?.totalRepetidos ?? 0) / madreRaw * 100).toFixed(1)}%` }} title="Repetidos" />
                <div className="h-full bg-emerald-400 flex-1" title={`Disponibles ${pctDisp.toFixed(1)}%`} />
              </div>
              <div className="flex gap-4 mt-2 flex-wrap">
                {([
                  { color: 'bg-gray-400',    label: 'Histórico' },
                  { color: 'bg-brand',       label: 'En Lote 1' },
                  { color: 'bg-indigo-400',  label: 'En Lote 2' },
                  { color: 'bg-yellow-400',  label: 'En Cola' },
                  { color: 'bg-red-400',     label: 'Repetidos' },
                  { color: 'bg-emerald-400', label: 'Disponibles' },
                ] as const).map(l => (
                  <span key={l.label} className="flex items-center gap-1 text-[0.65rem] text-gray-400">
                    <span className={`h-2 w-2 rounded-full ${l.color}`} /> {l.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Superadmin actions ── */}
      {isSuperAdmin && (
        <div className="rounded-2xl border border-orange-200/60 bg-orange-50/40 px-5 py-4">
          <p className="text-[0.68rem] font-bold text-orange-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <AlertCircle className="h-3.5 w-3.5" /> Acciones superadmin — operaciones irreversibles
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowMigrar(true)} disabled={anyBusy}
              className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition-colors">
              <Plus className="h-3.5 w-3.5" /> Migrar a Lote 1
            </button>
            <button onClick={() => { if (window.confirm('¿Avanzar cola? v2→Madre, v1→v2')) avzMut.mutate() }} disabled={anyBusy}
              className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition-colors">
              {avzMut.isPending ? <Spinner size="sm" /> : <ChevronRight className="h-3.5 w-3.5" />} Avanzar Cola
            </button>
            <button onClick={() => { if (window.confirm('¿Rotar lotes? Lote 1→Cola, completados→Madre')) rotMut.mutate() }} disabled={anyBusy}
              className="flex items-center gap-1.5 rounded-xl border border-orange-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-40 transition-colors">
              {rotMut.isPending ? <Spinner size="sm" /> : <RefreshCw className="h-3.5 w-3.5" />} Rotar Lotes
            </button>
            <button onClick={() => { if (window.confirm('¿Descartar Lote 1? No se puede deshacer.')) desMut.mutate('lote1') }} disabled={anyBusy}
              className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
              {desMut.isPending ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />} Descartar Lote 1
            </button>
            <button onClick={() => { if (window.confirm('¿Descartar AMBOS lotes? No se puede deshacer.')) desMut.mutate('ambos') }} disabled={anyBusy}
              className="flex items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-2 text-[0.75rem] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors">
              {desMut.isPending ? <Spinner size="sm" /> : <Trash2 className="h-3.5 w-3.5" />} Descartar Ambos
            </button>
          </div>
        </div>
      )}

      {/* ── Modal migrar ── */}
      {showMigrar && (
        <Modal isOpen title="Migrar registros a Lote 1" onClose={() => setShowMigrar(false)}>
          <div className="space-y-4 min-w-[300px]">
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Cantidad a migrar</label>
              <input type="number" value={migrarQty} onChange={e => setMigrarQty(Number(e.target.value))}
                min={1} max={100000} className="field w-full" />
            </div>
            <p className="text-[0.72rem] text-gray-400">Se toman registros disponibles de Base Madre en orden de carga.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowMigrar(false)} className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={() => migMut.mutate()} disabled={migMut.isPending || migrarQty < 1}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
                {migMut.isPending && <Spinner size="sm" />} Migrar
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Sub-tabs ── */}
      <div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1 w-fit">
        {([
          { id: 'madre',     label: 'Base Madre' },
          { id: 'cargar',    label: 'Cargar' },
          { id: 'lote1',     label: 'Lote 1' },
          { id: 'cola',      label: 'Cola' },
          { id: 'historico', label: 'Histórico' },
          { id: 'repetidos', label: 'Repetidos' },
        ] as const).map(t => (
          <TabBtn key={t.id} active={subTab === t.id} onClick={() => resetTab(t.id)}
            icon={<Database className="h-3.5 w-3.5" />} label={t.label} />
        ))}
      </div>

      {/* ══ BASE MADRE tab ══ */}
      {subTab === 'madre' && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
            <h3 className="text-[0.85rem] font-bold text-gray-900">Base Madre — {(madreRes?.total ?? 0).toLocaleString()} registros</h3>
            <div className="flex flex-wrap gap-2">
              <SearchBar value={mSearch} onChange={v => { setMSearch(v); setMPage(1) }} placeholder="Teléfono, nombre o status..." />
              <select value={mStatus} onChange={e => { setMStatus(e.target.value); setMPage(1) }}
                className="rounded-xl border border-gray-200 bg-white py-2 px-3 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none">
                <option value="">— Todos los status —</option>
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <input type="date" value={mDesde} onChange={e => { setMDesde(e.target.value); setMPage(1) }}
                className="rounded-xl border border-gray-200 bg-white py-2 px-3 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
              <input type="date" value={mHasta} onChange={e => { setMHasta(e.target.value); setMPage(1) }}
                className="rounded-xl border border-gray-200 bg-white py-2 px-3 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
            </div>
          </div>
          <BMTable
            cols={['PhoneNumber','FirstName','StatusDetalle','ListID','CampaignID','EntryDate']}
            rows={madreRes?.data ?? []} loading={ldMadre} />
          <Pagination page={mPage} total={madreRes?.total ?? 0} limit={LIMIT} onChange={setMPage} />
        </div>
      )}

      {/* ══ CARGAR tab ══ */}
      {subTab === 'cargar' && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-4">
            <h3 className="text-[0.85rem] font-bold text-gray-900">Cargar / Migrar lotes</h3>
            <p className="text-[0.75rem] text-gray-400 mt-0.5">Usa los botones de superadmin para mover registros entre tablas.</p>
          </div>
          {/* Desglose por status como gráfica de barras */}
          {(stats?.desglose ?? []).length > 0 && (
            <div className="px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[0.78rem] font-semibold text-gray-700 flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-brand" /> Desglose por status de origen
                </p>
                <div className="flex items-center gap-1">
                  {(['lista','barra'] as const).map(m => (
                    <button key={m} onClick={() => setChartMode(m)}
                      className={clsx('rounded-lg px-2.5 py-1 text-[0.72rem] font-semibold transition-colors',
                        chartMode === m ? 'bg-brand text-white' : 'text-gray-400 hover:bg-gray-100')}>
                      {m === 'lista' ? 'Lista' : 'Barra'}
                    </button>
                  ))}
                </div>
              </div>
              {chartMode === 'barra' ? (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  {(stats?.desglose ?? []).map((d, i) => {
                    const pct = madreRaw > 0 ? (d.total / madreRaw) * 100 : 0
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <p className="text-[0.72rem] text-gray-600 w-44 truncate flex-shrink-0">{d.StatusDetalle || '(sin status)'}</p>
                        <div className="flex-1 h-5 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${Math.min(pct * 5, 100)}%` }} />
                        </div>
                        <p className="text-[0.72rem] font-semibold text-gray-700 w-20 text-right flex-shrink-0">{d.total.toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.78rem]">
                    <thead><tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-4 py-2 text-left font-bold text-gray-400 uppercase">Status</th>
                      <th className="px-4 py-2 text-right font-bold text-gray-400 uppercase">Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {(stats?.desglose ?? []).map((d, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-gray-700">{d.StatusDetalle || '(sin status)'}</td>
                          <td className="px-4 py-2 font-semibold text-gray-900 text-right">{d.total.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {!isSuperAdmin && (
            <div className="flex items-center justify-center py-10 text-gray-400 text-[0.82rem] gap-2">
              <AlertCircle className="h-4 w-4" /> Requiere permisos de superadmin para migrar lotes
            </div>
          )}
        </div>
      )}

      {/* ══ LOTE 1 tab ══ */}
      {subTab === 'lote1' && (
        <div className="space-y-4">
          {/* Chart stats */}
          {chartStats && chartStats.totalLote > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm px-5 py-4">
                <p className="text-[0.78rem] font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><TrendingUp className="h-3.5 w-3.5 text-brand" /> Por resultado</p>
                <div className="space-y-2">
                  {chartStats.byResultado.slice(0, 8).map((r, i) => {
                    const pct = chartStats.totalLote > 0 ? (r.total / chartStats.totalLote) * 100 : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <p className="text-[0.68rem] text-gray-600 w-32 truncate flex-shrink-0">{r.resultado}</p>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-brand rounded-full" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                        </div>
                        <p className="text-[0.68rem] font-semibold text-gray-700 w-12 text-right flex-shrink-0">{r.total.toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm px-5 py-4">
                <p className="text-[0.78rem] font-semibold text-gray-700 mb-3 flex items-center gap-1.5"><Users className="h-3.5 w-3.5 text-brand" /> Por agente (Top 10)</p>
                <div className="space-y-2">
                  {chartStats.byAgente.slice(0, 10).map((a, i) => {
                    const pct = chartStats.totalLote > 0 ? (a.total / chartStats.totalLote) * 100 : 0
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <p className="text-[0.68rem] text-gray-600 w-32 truncate flex-shrink-0">{a.agente || '(sin agente)'}</p>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(pct * 3, 100)}%` }} />
                        </div>
                        <p className="text-[0.68rem] font-semibold text-gray-700 w-12 text-right flex-shrink-0">{a.total.toLocaleString()}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
              <h3 className="text-[0.85rem] font-bold text-gray-900">Lote 1 — {(lote1Res?.total ?? 0).toLocaleString()} registros</h3>
              <div className="flex gap-2">
                <SearchBar value={l1Search} onChange={v => { setL1Search(v); setL1Page(1) }} />
                <button onClick={() => ventasService.exportBaseMadreLote1(campanaId).catch(() => toast.error('Error al exportar'))}
                  className="flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-[0.75rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                  <Download className="h-3.5 w-3.5" /> Exportar
                </button>
              </div>
            </div>
            <BMTable cols={['PhoneNumber','FirstName','StatusOrigen','ListID','CampaignID','FechaCarga']} rows={lote1Res?.data ?? []} loading={ldL1} />
            <Pagination page={l1Page} total={lote1Res?.total ?? 0} limit={LIMIT} onChange={setL1Page} />
          </div>
        </div>
      )}

      {/* ══ COLA tab ══ */}
      {subTab === 'cola' && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
            <h3 className="text-[0.85rem] font-bold text-gray-900">
              Cola — {(colaRes?.total ?? 0).toLocaleString()} registros
              <span className="ml-2 text-[0.72rem] font-normal text-gray-400">({stats?.totalCola1 ?? 0} v1 · {stats?.totalCola2 ?? 0} v2)</span>
            </h3>
            <SearchBar value={coSearch} onChange={v => { setCoSearch(v); setCoPage(1) }} />
          </div>
          <BMTable cols={['PhoneNumber','FirstName','StatusOrigen','Vueltas','FechaEntrada','FechaUltVuelta']} rows={colaRes?.data ?? []} loading={ldCo} />
          <Pagination page={coPage} total={colaRes?.total ?? 0} limit={LIMIT} onChange={setCoPage} />
        </div>
      )}

      {/* ══ HISTÓRICO tab ══ */}
      {subTab === 'historico' && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-3">
            <h3 className="text-[0.85rem] font-bold text-gray-900">Histórico — {(histRes?.total ?? 0).toLocaleString()} registros</h3>
            <SearchBar value={hiSearch} onChange={v => { setHiSearch(v); setHiPage(1) }} />
          </div>
          <BMTable cols={['PhoneNumber','FirstName','StatusOrigen','StatusVenta','FechaArchivado','VecesContactado']} rows={histRes?.data ?? []} loading={ldHi} />
          <Pagination page={hiPage} total={histRes?.total ?? 0} limit={LIMIT} onChange={setHiPage} />
        </div>
      )}

      {/* ══ REPETIDOS tab ══ */}
      {subTab === 'repetidos' && (
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-5 py-3">
            <h3 className="text-[0.85rem] font-bold text-gray-900">Repetidos — {(repRes?.total ?? 0).toLocaleString()} registros</h3>
          </div>
          <BMTable cols={['PhoneNumber','FirstName','StatusOrigen','StatusAnterior','VecesRepetido','FechaRepeticion']} rows={repRes?.data ?? []} loading={ldRep} />
          <Pagination page={repPage} total={repRes?.total ?? 0} limit={LIMIT} onChange={setRepPage} />
        </div>
      )}

    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   BASE CRM TAB
══════════════════════════════════════════════════════════ */
function BaseCRMTab() {
  const qc = useQueryClient()
  const { ventasCampaigns } = useVentasStore()
  const [selectedImp, setSelectedImp] = useState<CRMImportacion | null>(null)
  const [showNueva, setShowNueva] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevaCampana, setNuevaCampana] = useState(ventasCampaigns[0]?.id ?? 1)
  const [subView, setSubView] = useState<'lista' | 'registros' | 'campos'>('lista')

  const { data: importaciones = [], isLoading } = useQuery({
    queryKey: ['crm-importaciones'],
    queryFn: () => ventasService.getCRMImportaciones(),
    staleTime: 30_000,
  })

  const { data: registros = [], isLoading: ldReg } = useQuery({
    queryKey: ['crm-registros', selectedImp?.id],
    queryFn: () => ventasService.getCRMRegistros(selectedImp!.id),
    enabled: !!selectedImp && subView === 'registros',
    staleTime: 30_000,
  })

  const { data: campos = [], isLoading: ldCampos } = useQuery({
    queryKey: ['crm-campos', selectedImp?.id],
    queryFn: () => ventasService.getCRMCamposConfig(selectedImp!.id),
    enabled: !!selectedImp && subView === 'campos',
    staleTime: 60_000,
  })

  const crearImp = useMutation({
    mutationFn: () => ventasService.createCRMImportacion(nuevoNombre.trim(), nuevaCampana),
    onSuccess: () => { toast.success('Importación creada'); setShowNueva(false); setNuevoNombre(''); qc.invalidateQueries({ queryKey: ['crm-importaciones'] }) },
    onError: () => toast.error('Error al crear'),
  })

  const eliminarImp = useMutation({
    mutationFn: (id: number) => ventasService.deleteCRMImportacion(id),
    onSuccess: () => { toast.success('Eliminada'); if (selectedImp) setSelectedImp(null); qc.invalidateQueries({ queryKey: ['crm-importaciones'] }) },
    onError: () => toast.error('Error al eliminar'),
  })

  const toggleActiva = useMutation({
    mutationFn: (id: number) => ventasService.toggleCRMImportacionActiva(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-importaciones'] }),
    onError: () => toast.error('Error al cambiar estado'),
  })

  const confirmar = useMutation({
    mutationFn: (id: number) => ventasService.confirmarCRMImportacion(id),
    onSuccess: () => { toast.success('Importación confirmada'); qc.invalidateQueries({ queryKey: ['crm-importaciones'] }) },
    onError: () => toast.error('Error al confirmar'),
  })

  const exportarReporte = async (tipo: 'gestiones' | 'ventas' | 'base-completa' | 'resubir') => {
    try { await ventasService.exportCRMReporte(tipo) } catch { toast.error('Error al exportar') }
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-bold text-gray-900 flex items-center gap-2"><FileText className="h-4 w-4 text-brand" /> Base CRM</h2>
          <p className="text-[0.75rem] text-gray-400 mt-0.5">Importaciones y registros del CRM</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => exportarReporte('gestiones')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.75rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Gestiones
          </button>
          <button onClick={() => exportarReporte('ventas')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.75rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Ventas CRM
          </button>
          <button onClick={() => exportarReporte('base-completa')} className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.75rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
            <Download className="h-3.5 w-3.5" /> Base completa
          </button>
          <button onClick={() => setShowNueva(true)}
            className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nueva importación
          </button>
        </div>
      </div>

      {/* Modal nueva importación */}
      {showNueva && (
        <Modal isOpen title="Nueva importación CRM" onClose={() => { setShowNueva(false); setNuevoNombre('') }}>
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Nombre</label>
              <input autoFocus value={nuevoNombre} onChange={e => setNuevoNombre(e.target.value)}
                placeholder="Ej: Base Julio 2026" className="field w-full" />
            </div>
            {ventasCampaigns.length > 0 && (
              <div>
                <label className="mb-1.5 block text-[0.75rem] font-semibold text-gray-600">Campaña</label>
                <FilterSelect value={nuevaCampana} onChange={v => setNuevaCampana(Number(v))}>
                  {ventasCampaigns.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </FilterSelect>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setShowNueva(false); setNuevoNombre('') }}
                className="rounded-xl border border-gray-200 px-4 py-2 text-[0.82rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={() => crearImp.mutate()} disabled={!nuevoNombre.trim() || crearImp.isPending}
                className="flex items-center gap-2 rounded-xl bg-brand px-4 py-2 text-[0.82rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
                {crearImp.isPending && <Spinner size="sm" />} Crear
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Vista detalle */}
      {selectedImp ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button onClick={() => { setSelectedImp(null); setSubView('lista') }}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[0.78rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
              ← Volver
            </button>
            <h3 className="text-[0.9rem] font-bold text-gray-900">{selectedImp.nombre}</h3>
            <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold', selectedImp.confirmada ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700')}>
              {selectedImp.confirmada ? 'Confirmada' : 'Borrador'}
            </span>
            {!selectedImp.confirmada && (
              <button onClick={() => confirmar.mutate(selectedImp.id)} disabled={confirmar.isPending}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors">
                {confirmar.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Confirmar
              </button>
            )}
          </div>
          <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
            <TabBtn active={subView === 'registros'} onClick={() => setSubView('registros')} icon={<FileText className="h-3.5 w-3.5" />} label={`Registros (${selectedImp.totalRegistros})`} />
            <TabBtn active={subView === 'campos'}    onClick={() => setSubView('campos')}    icon={<Settings  className="h-3.5 w-3.5" />} label="Campos" />
          </div>
          {subView === 'registros' && (
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
              {ldReg ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : registros.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-[0.82rem]">Sin registros</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.75rem]">
                    <thead><tr className="border-b border-gray-100 bg-gray-50">
                      <th className="px-3 py-2 text-left font-bold text-gray-400 uppercase">Teléfono</th>
                      <th className="px-3 py-2 text-left font-bold text-gray-400 uppercase">Nombre</th>
                      {registros[0] && Object.keys(registros[0].datos ?? {}).slice(0, 5).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-bold text-gray-400 uppercase whitespace-nowrap">{k}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {registros.slice(0, 200).map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-3 py-2 font-mono text-gray-600">{r.telefono}</td>
                          <td className="px-3 py-2 text-gray-700">{r.nombre}</td>
                          {Object.keys(registros[0]?.datos ?? {}).slice(0, 5).map(k => (
                            <td key={k} className="px-3 py-2 text-gray-500 whitespace-nowrap">{r.datos?.[k] ?? '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {registros.length > 200 && <p className="text-center text-[0.72rem] text-gray-400 py-2">Mostrando 200 de {registros.length}</p>}
                </div>
              )}
            </div>
          )}
          {subView === 'campos' && (
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
              {ldCampos ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : campos.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-[0.82rem]">Sin configuración de campos</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[0.78rem]">
                    <thead><tr className="border-b border-gray-100 bg-gray-50">
                      {['Campo','Etiqueta','Visible','Editable','Orden'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-bold text-gray-400 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {campos.map((c, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-gray-600">{c.campo}</td>
                          <td className="px-4 py-2.5 text-gray-700">{c.etiqueta || c.label}</td>
                          <td className="px-4 py-2.5">{c.visible ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}</td>
                          <td className="px-4 py-2.5">{c.editable ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <XCircle className="h-4 w-4 text-gray-300" />}</td>
                          <td className="px-4 py-2.5 text-gray-500">{c.orden}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Lista de importaciones — cards con tipificaciones */
        isLoading ? (
          <div className="flex justify-center py-10"><Spinner size="lg" /></div>
        ) : importaciones.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400 rounded-2xl border border-gray-200/60 bg-white shadow-sm">
            <FileText className="h-8 w-8 opacity-25" />
            <p className="text-[0.82rem]">Sin importaciones</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {importaciones.map(imp => (
              <ImportacionCard
                key={imp.id}
                imp={imp}
                campaNombre={ventasCampaigns.find(c => c.id === imp.campaignId)?.nombre ?? `Camp. ${imp.campaignId}`}
                onOpen={() => { setSelectedImp(imp); setSubView('registros') }}
                onCampos={() => { setSelectedImp(imp); setSubView('campos') }}
                onToggle={() => toggleActiva.mutate(imp.id)}
                onDelete={() => { if (window.confirm('¿Eliminar esta importación?')) eliminarImp.mutate(imp.id) }}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}

/* ─── ImportacionCard ─────────────────────────────────── */
const TIP_CARD_COLORS = ['#2563eb','#7c3aed','#db2777','#ea580c','#0891b2','#ca8a04','#16a34a','#dc2626','#059669','#d97706','#6366f1','#14b8a6']

function ImportacionCard({ imp, campaNombre, onOpen, onCampos, onToggle, onDelete }: {
  imp: CRMImportacion
  campaNombre: string
  onOpen: () => void
  onCampos: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const { data: tips = [], isLoading } = useQuery({
    queryKey: ['crm-tips', imp.id],
    queryFn: () => ventasService.getCRMTipificaciones(imp.id),
    staleTime: 120_000,
  })

  const totalTips = tips.reduce((s, t) => s + t.total, 0)
  const aprobadas = tips.find(t => t.resultado === 'Aprobada')?.total ?? 0
  const rechazadas = tips.find(t => t.resultado === 'Rechazada')?.total ?? 0
  const pctApr = totalTips > 0 ? (aprobadas / totalTips) * 100 : 0
  const pctRec = totalTips > 0 ? (rechazadas / totalTips) * 100 : 0
  const topTips = [...tips].sort((a, b) => b.total - a.total).slice(0, 6)

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <button onClick={onOpen} className="text-[0.88rem] font-bold text-gray-900 hover:text-brand transition-colors text-left leading-tight line-clamp-2">
              {imp.nombre}
            </button>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[0.68rem] text-gray-400">{campaNombre}</span>
              <span className="text-[0.68rem] text-gray-300">·</span>
              <span className="text-[0.68rem] text-gray-400">{imp.totalRegistros.toLocaleString()} reg.</span>
              {imp.creadoEn && (
                <>
                  <span className="text-[0.68rem] text-gray-300">·</span>
                  <span className="text-[0.68rem] text-gray-400">{new Date(imp.creadoEn).toLocaleDateString('es-MX')}</span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', imp.confirmada ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700')}>
              {imp.confirmada ? 'Confirmada' : 'Borrador'}
            </span>
          </div>
        </div>
      </div>

      {/* Tipificaciones */}
      <div className="px-4 py-3">
        {isLoading ? (
          <div className="flex justify-center py-3"><Spinner size="sm" /></div>
        ) : totalTips === 0 ? (
          <p className="text-[0.72rem] text-gray-400 text-center py-2">Sin gestiones registradas</p>
        ) : (
          <div className="space-y-1.5">
            {/* Barra Aprobadas */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[0.7rem] font-semibold text-emerald-600">Aprobadas</span>
                <span className="text-[0.7rem] text-gray-500">{aprobadas} ({pctApr.toFixed(0)}%)</span>
              </div>
              <div className="h-4 w-full rounded-md overflow-hidden bg-gray-100">
                <div style={{ width: `${pctApr}%`, backgroundColor: '#22c55e' }} className="h-full rounded-md transition-all" />
              </div>
            </div>
            {/* Barra Rechazadas */}
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[0.7rem] font-semibold text-red-500">Rechazadas</span>
                <span className="text-[0.7rem] text-gray-500">{rechazadas} ({pctRec.toFixed(0)}%)</span>
              </div>
              <div className="h-4 w-full rounded-md overflow-hidden bg-gray-100">
                <div style={{ width: `${pctRec}%`, backgroundColor: '#ef4444' }} className="h-full rounded-md transition-all" />
              </div>
            </div>
            {/* Tipificaciones breakdown */}
            {topTips.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-50">
                <div className="h-5 w-full rounded-md overflow-hidden flex">
                  {topTips.map((t, i) => {
                    const pct = totalTips > 0 ? (t.total / totalTips) * 100 : 0
                    const color = TIP_CARD_COLORS[i % TIP_CARD_COLORS.length]!
                    return (
                      <div key={t.resultado} style={{ width: `${pct}%`, backgroundColor: color }}
                        title={`${t.resultado}: ${t.total}`}
                        className="flex items-center justify-center overflow-hidden">
                        {pct >= 10 && <span className="text-[0.6rem] font-bold text-white leading-none truncate px-0.5">{t.resultado.slice(0,4)}</span>}
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-1.5">
                  {topTips.map((t, i) => (
                    <span key={t.resultado} className="flex items-center gap-1 text-[0.65rem] text-gray-500">
                      <span className="h-2 w-2 rounded-sm flex-shrink-0" style={{ backgroundColor: TIP_CARD_COLORS[i % TIP_CARD_COLORS.length] }} />
                      {t.resultado}: {t.total}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
        <div className="flex items-center gap-1">
          <button onClick={onOpen} className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-brand transition-colors" title="Ver registros">
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button onClick={onCampos} className="rounded-lg p-1.5 text-gray-400 hover:bg-white hover:text-brand transition-colors" title="Configurar campos">
            <Settings className="h-3.5 w-3.5" />
          </button>
          <button onClick={onDelete} className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors" title="Eliminar">
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
        <button onClick={onToggle} className="rounded-lg p-1 text-gray-400 hover:bg-white transition-colors" title={imp.activa ? 'Desactivar' : 'Activar'}>
          {imp.activa ? <ToggleRight className="h-5 w-5 text-emerald-500" /> : <ToggleLeft className="h-5 w-5 text-gray-300" />}
        </button>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   TRAZABILIDAD TAB
══════════════════════════════════════════════════════════ */
type TrazSubTab = 'frecuencia' | 'aprobadas' | 'detalle' | 'importacion'
type TrazPeriod = 'hoy' | '7d' | '30d' | 'todo' | 'custom'

const TIP_COLORS = ['#2563eb','#22c55e','#f59e0b','#ef4444','#8b5cf6','#0891b2','#ec4899','#14b8a6','#f97316','#6366f1','#84cc16','#a855f7']
function getTipColor(name: string, idx: number) {
  let h = 0; for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return TIP_COLORS[Math.abs(h) % TIP_COLORS.length] ?? TIP_COLORS[idx % TIP_COLORS.length]
}

function TrazabilidadTab() {
  const { ventasCampaigns } = useVentasStore()
  const [campanaId, setCampanaId] = useState<number>(ventasCampaigns[0]?.id ?? 1)
  const [subTab, setSubTab] = useState<TrazSubTab>('frecuencia')
  const [impId, setImpId] = useState<number | null>(null)
  const [impPeriod, setImpPeriod] = useState<TrazPeriod>('todo')
  const [impDateFrom, setImpDateFrom] = useState('')
  const [impDateTo,   setImpDateTo]   = useState('')
  const [impSearch,   setImpSearch]   = useState('')
  const [period, setPeriod] = useState<TrazPeriod>('todo')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [search, setSearch] = useState('')
  const [detPage, setDetPage] = useState(1)
  const DET_LIMIT = 100

  const periodParams = (() => {
    const now = new Date()
    if (period === 'hoy') { const d = now.toISOString().slice(0,10); return { dateFrom: d, dateTo: d } }
    if (period === '7d')  { const d = new Date(now.getTime() - 6*86400000).toISOString().slice(0,10); return { dateFrom: d, dateTo: now.toISOString().slice(0,10) } }
    if (period === '30d') { const d = new Date(now.getTime() - 29*86400000).toISOString().slice(0,10); return { dateFrom: d, dateTo: now.toISOString().slice(0,10) } }
    if (period === 'custom') return { dateFrom, dateTo }
    return {}
  })()

  const { data: statsArr = [] } = useQuery<TrazabilidadMesStat[]>({
    queryKey: ['trazabilidad-stats', campanaId],
    queryFn:  () => ventasService.getVentasTrazadasStats(campanaId),
    staleTime: 60_000,
  })

  // For frecuencia/aprobadas tabs: fetch full dataset (large limit) for chart
  const { data: chartRes, isLoading: ldChart } = useQuery({
    queryKey: ['trazabilidad-chart', campanaId, periodParams],
    queryFn:  () => ventasService.getVentasTrazadas(campanaId, { limit: 2000, ...periodParams }),
    staleTime: 60_000,
    enabled: subTab === 'frecuencia' || subTab === 'aprobadas',
  })
  const chartData = chartRes?.data ?? []

  // For detail tab: paginated with search
  const { data: detRes, isLoading: ldDet } = useQuery({
    queryKey: ['trazabilidad-det', campanaId, detPage, search, periodParams],
    queryFn:  () => ventasService.getVentasTrazadas(campanaId, { page: detPage, limit: DET_LIMIT, search, ...periodParams }),
    staleTime: 60_000,
    enabled: subTab === 'detalle',
  })
  const detData = detRes?.data ?? []
  const detTotal = detRes?.total ?? 0

  // Por importación
  const { data: importaciones = [] } = useQuery<CRMImportacion[]>({
    queryKey: ['crm-importaciones'],
    queryFn: () => ventasService.getCRMImportaciones(),
    staleTime: 60_000,
    enabled: subTab === 'importacion',
  })

  const impPeriodParams = (() => {
    const now = new Date()
    if (impPeriod === 'hoy') { const d = now.toISOString().slice(0,10); return { fechaDesde: d, fechaHasta: d } }
    if (impPeriod === '7d')  { const d = new Date(now.getTime() - 6*86400000).toISOString().slice(0,10); return { fechaDesde: d, fechaHasta: now.toISOString().slice(0,10) } }
    if (impPeriod === '30d') { const d = new Date(now.getTime() - 29*86400000).toISOString().slice(0,10); return { fechaDesde: d, fechaHasta: now.toISOString().slice(0,10) } }
    if (impPeriod === 'custom' && impDateFrom && impDateTo) return { fechaDesde: impDateFrom, fechaHasta: impDateTo }
    return {}
  })()

  const { data: impTrazRes, isLoading: ldImpTraz } = useQuery({
    queryKey: ['crm-trazabilidad', impId, impPeriodParams],
    queryFn: () => ventasService.getCRMTrazabilidad(impId!, impPeriodParams),
    staleTime: 60_000,
    enabled: subTab === 'importacion' && impId !== null,
  })
  const impResumen = impTrazRes?.resumen ?? []
  const impDetalle = impTrazRes?.detalle ?? []

  // Filtro local del detalle por búsqueda
  const impDetFiltrado = impSearch.trim()
    ? impDetalle.filter(r =>
        r.telefono.includes(impSearch) ||
        r.nombreCliente.toLowerCase().includes(impSearch.toLowerCase()) ||
        r.tipificacion.toLowerCase().includes(impSearch.toLowerCase()) ||
        r.agenteGestion.toLowerCase().includes(impSearch.toLowerCase())
      )
    : impDetalle

  // Agrupación del resumen: tipificacion → {estatus → total}
  const impTipMap = new Map<string, { estatus: Record<string, number>; total: number }>()
  for (const r of impResumen) {
    if (!impTipMap.has(r.tipificacion)) impTipMap.set(r.tipificacion, { estatus: {}, total: 0 })
    const entry = impTipMap.get(r.tipificacion)!
    entry.estatus[r.estatus] = (entry.estatus[r.estatus] ?? 0) + r.total
    entry.total += r.total
  }
  const impTipEntries = [...impTipMap.entries()]
    .map(([tip, { estatus, total }]) => ({ tip, estatus, total }))
    .sort((a, b) => b.total - a.total)

  const impAllStatuses = [...new Set(impResumen.map(r => r.estatus))]
  const impTotales = { total: impResumen.reduce((s, r) => s + r.total, 0), aprobadas: 0, rechazadas: 0, pendientes: 0 }
  for (const r of impResumen) {
    if (r.estatus === 'Aprobada')  impTotales.aprobadas  += r.total
    if (r.estatus === 'Rechazada') impTotales.rechazadas += r.total
    if (r.estatus === 'Pendiente') impTotales.pendientes += r.total
  }

  // Summary totals from monthly stats
  const totales = statsArr.reduce(
    (acc, s) => ({ total: acc.total + s.total, aprobadas: acc.aprobadas + s.aprobadas, pendientes: acc.pendientes + s.pendientes, rechazadas: acc.rechazadas + s.rechazadas, formalizadas: acc.formalizadas + s.formalizadas }),
    { total: 0, aprobadas: 0, pendientes: 0, rechazadas: 0, formalizadas: 0 }
  )

  // Group chart data by TipCRM and EstatusVenta for bar chart
  const tipMap = new Map<string, Record<string, number>>()
  for (const v of chartData) {
    const tip = v.TipCRM || 'Sin tipificación'
    const est = v.EstatusVenta || 'Sin estatus'
    if (!tipMap.has(tip)) tipMap.set(tip, {})
    const m = tipMap.get(tip)!
    m[est] = (m[est] ?? 0) + 1
  }
  const tipEntries = [...tipMap.entries()].map(([tip, counts]) => ({
    tip, counts, total: Object.values(counts).reduce((s, v) => s + v, 0)
  })).sort((a, b) => b.total - a.total)

  const allStatuses = [...new Set(chartData.map(v => v.EstatusVenta || 'Sin estatus'))]
  const statusColors: Record<string, string> = {
    'Aprobada': '#22c55e', 'Aprobadas': '#22c55e',
    'Rechazada': '#ef4444', 'Rechazadas': '#ef4444',
    'Pendiente': '#f59e0b', 'Agendada': '#3b82f6',
    'Formalizada': '#8b5cf6', 'Formalizado': '#8b5cf6',
    'Garantizada': '#14b8a6', 'Declinado': '#9ca3af',
    'Cancelada': '#f97316',
  }
  const getEstColor = (e: string) => statusColors[e] ?? '#9ca3af'

  const gestionados = chartData.filter(v => v.TipCRM).length
  const sinGestion  = chartData.length - gestionados
  const conVenta    = chartData.filter(v => v.EstatusVenta).length

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[1rem] font-bold text-gray-900 flex items-center gap-2"><Activity className="h-4 w-4 text-brand" /> Trazabilidad de ventas</h2>
          <p className="text-[0.75rem] text-gray-400 mt-0.5">Ventas cruzadas con Base Madre</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ventasCampaigns.length > 1 && (
            <FilterSelect value={campanaId} onChange={v => setCampanaId(Number(v))}>
              {ventasCampaigns.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </FilterSelect>
          )}
        </div>
      </div>

      {/* Cards de resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {([
          { label: 'Total trazados',  value: totales.total,                color: 'text-brand',        bg: 'bg-blue-50' },
          { label: 'Aprobadas',       value: totales.aprobadas,            color: 'text-emerald-600',  bg: 'bg-emerald-50' },
          { label: 'Rechazadas',      value: totales.rechazadas,           color: 'text-red-500',      bg: 'bg-red-50' },
          { label: 'Pendientes',      value: totales.pendientes,           color: 'text-yellow-600',   bg: 'bg-yellow-50' },
          { label: 'Formalizadas',    value: totales.formalizadas,         color: 'text-purple-600',   bg: 'bg-purple-50' },
        ] as const).map(card => (
          <div key={card.label} className={clsx('rounded-2xl border border-gray-200/60 shadow-sm px-5 py-4', card.bg)}>
            <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">{card.label}</p>
            <p className={`text-2xl font-black mt-1 ${card.color}`}>{card.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-gray-100 p-1 w-fit">
          <TabBtn active={subTab === 'frecuencia'}  onClick={() => setSubTab('frecuencia')}  icon={<BarChart2 className="h-3.5 w-3.5" />}  label="Por frecuencia" />
          <TabBtn active={subTab === 'aprobadas'}  onClick={() => setSubTab('aprobadas')}   icon={<TrendingUp className="h-3.5 w-3.5" />} label="Aprobadas / Rechazadas" />
          <TabBtn active={subTab === 'detalle'}    onClick={() => setSubTab('detalle')}     icon={<Activity className="h-3.5 w-3.5" />}   label="Trazabilidad de ventas" />
          <TabBtn active={subTab === 'importacion'} onClick={() => setSubTab('importacion')} icon={<FileText className="h-3.5 w-3.5" />}  label="Por importación CRM" />
        </div>
        {/* Period filter */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {(['hoy','7d','30d','todo'] as TrazPeriod[]).map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
                period === p ? 'bg-brand text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}>
              {p === 'hoy' ? 'Hoy' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : 'Todo'}
            </button>
          ))}
          <button onClick={() => setPeriod('custom')}
            className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
              period === 'custom' ? 'bg-brand text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}>
            <Calendar className="h-3.5 w-3.5 inline mr-1" />Rango
          </button>
          {period === 'custom' && (
            <>
              <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white py-1.5 px-2.5 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
              <span className="text-gray-400 text-[0.78rem]">—</span>
              <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                className="rounded-xl border border-gray-200 bg-white py-1.5 px-2.5 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
            </>
          )}
        </div>
      </div>

      {/* ── Sub-tab: Por frecuencia ── */}
      {subTab === 'frecuencia' && (
        <div className="space-y-4">
          {/* Mini stat cards */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Total en período', value: chartData.length, color: 'text-brand' },
              { label: 'Gestionados',      value: gestionados,      color: 'text-emerald-600' },
              { label: 'Sin gestión',      value: sinGestion,       color: 'text-gray-400' },
            ].map(c => (
              <div key={c.label} className="rounded-2xl border border-gray-200/60 bg-white shadow-sm px-5 py-4">
                <p className="text-[0.7rem] font-semibold text-gray-400 uppercase tracking-wider">{c.label}</p>
                <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Stacked bar chart by TipCRM */}
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-[0.85rem] font-bold text-gray-900">Frecuencia por tipificación CRM</h3>
              <p className="text-[0.7rem] text-gray-400 mt-0.5">Registros agrupados por TipCRM, coloreados por estatus de venta</p>
            </div>
            {ldChart ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : tipEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                <BarChart2 className="h-8 w-8 opacity-25" />
                <p className="text-[0.82rem]">Sin datos para el período seleccionado</p>
              </div>
            ) : (
              <div className="p-5 space-y-2.5">
                {tipEntries.map(({ tip, counts, total: tipTotal }, idx) => {
                  const allEsts = Object.keys(counts).sort((a, b) => counts[b] - counts[a])
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.78rem] font-semibold text-gray-700 truncate max-w-[220px]">{tip}</span>
                        <span className="text-[0.75rem] font-bold text-gray-500 ml-2 flex-shrink-0">{tipTotal.toLocaleString()}</span>
                      </div>
                      <div className="flex h-7 w-full rounded-lg overflow-hidden">
                        {allEsts.map(est => {
                          const cnt = counts[est]!
                          const pct = (cnt / tipTotal) * 100
                          const color = getEstColor(est)
                          return (
                            <div key={est} style={{ width: `${pct}%`, backgroundColor: color }}
                              title={`${est}: ${cnt}`}
                              className="flex items-center justify-center overflow-hidden transition-all">
                              {pct >= 8 && <span className="text-[0.65rem] font-bold text-white leading-none">{cnt}</span>}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
                {/* Legend */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-gray-100 mt-3">
                  {allStatuses.map(est => (
                    <span key={est} className="flex items-center gap-1.5 text-[0.72rem] text-gray-500">
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getEstColor(est) }} />{est}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-tab: Aprobadas / Rechazadas ── */}
      {subTab === 'aprobadas' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Con venta', value: conVenta, color: 'text-brand', bg: 'bg-blue-50' },
              { label: 'Aprobadas', value: chartData.filter(v => v.EstatusVenta === 'Aprobada').length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { label: 'Rechazadas', value: chartData.filter(v => v.EstatusVenta === 'Rechazada').length, color: 'text-red-500', bg: 'bg-red-50' },
              { label: 'Pendientes', value: chartData.filter(v => v.EstatusVenta === 'Pendiente').length, color: 'text-yellow-600', bg: 'bg-yellow-50' },
            ].map(c => (
              <div key={c.label} className={clsx('rounded-2xl border border-gray-200/60 shadow-sm px-5 py-4', c.bg)}>
                <p className="text-[0.7rem] font-semibold text-gray-500 uppercase tracking-wider">{c.label}</p>
                <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value.toLocaleString()}</p>
              </div>
            ))}
          </div>

          {/* Aprobadas/Rechazadas by TipCRM */}
          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3">
              <h3 className="text-[0.85rem] font-bold text-gray-900">Aprobadas y Rechazadas por tipificación</h3>
            </div>
            {ldChart ? (
              <div className="flex justify-center py-10"><Spinner size="lg" /></div>
            ) : tipEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                <TrendingUp className="h-8 w-8 opacity-25" />
                <p className="text-[0.82rem]">Sin datos para el período</p>
              </div>
            ) : (
              <div className="p-5 space-y-2.5">
                {tipEntries.map(({ tip, counts, total: tipTotal }, idx) => {
                  const aprobadas = counts['Aprobada'] ?? 0
                  const rechazadas = counts['Rechazada'] ?? 0
                  const pendientes = counts['Pendiente'] ?? 0
                  const pctApr = tipTotal > 0 ? (aprobadas / tipTotal) * 100 : 0
                  const pctRec = tipTotal > 0 ? (rechazadas / tipTotal) * 100 : 0
                  const pctPen = tipTotal > 0 ? (pendientes / tipTotal) * 100 : 0
                  const pctRest = 100 - pctApr - pctRec - pctPen
                  return (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[0.78rem] font-semibold text-gray-700 truncate max-w-[220px]">{tip}</span>
                        <div className="flex items-center gap-3 ml-2 flex-shrink-0">
                          <span className="text-[0.72rem] text-emerald-600 font-semibold">{aprobadas} apr.</span>
                          <span className="text-[0.72rem] text-red-500 font-semibold">{rechazadas} rec.</span>
                          <span className="text-[0.72rem] text-gray-400">{tipTotal} total</span>
                        </div>
                      </div>
                      <div className="flex h-6 w-full rounded-lg overflow-hidden bg-gray-100">
                        {pctApr > 0 && <div style={{ width: `${pctApr}%`, backgroundColor: '#22c55e' }} className="flex items-center justify-center"><span className="text-[0.62rem] font-bold text-white leading-none">{aprobadas > 0 && pctApr >= 5 ? aprobadas : ''}</span></div>}
                        {pctPen > 0 && <div style={{ width: `${pctPen}%`, backgroundColor: '#f59e0b' }} className="flex items-center justify-center"><span className="text-[0.62rem] font-bold text-white leading-none">{pendientes > 0 && pctPen >= 5 ? pendientes : ''}</span></div>}
                        {pctRec > 0 && <div style={{ width: `${pctRec}%`, backgroundColor: '#ef4444' }} className="flex items-center justify-center"><span className="text-[0.62rem] font-bold text-white leading-none">{rechazadas > 0 && pctRec >= 5 ? rechazadas : ''}</span></div>}
                        {pctRest > 0 && <div style={{ width: `${pctRest}%`, backgroundColor: '#e5e7eb' }} />}
                      </div>
                    </div>
                  )
                })}
                <div className="flex flex-wrap gap-x-4 gap-y-1 pt-2 border-t border-gray-100 mt-3">
                  {[['#22c55e','Aprobada'],['#f59e0b','Pendiente'],['#ef4444','Rechazada'],['#e5e7eb','Otros']].map(([c,l]) => (
                    <span key={l} className="flex items-center gap-1.5 text-[0.72rem] text-gray-500">
                      <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: c }} />{l}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Evolución mensual */}
          {statsArr.length > 0 && (
            <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-3">
                <h3 className="text-[0.85rem] font-bold text-gray-900">Evolución mensual</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Mes','Total','Aprobadas','Pendientes','Rechazadas','Agendadas','Formalizadas'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {statsArr.map((s, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 text-[0.82rem] font-semibold text-gray-700">{s.mes}</td>
                        <td className="px-4 py-2.5 text-[0.82rem] font-bold text-brand">{s.total.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-emerald-600">{s.aprobadas.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-yellow-600">{s.pendientes.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-red-500">{s.rechazadas.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-gray-500">{s.agendadas.toLocaleString()}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-blue-600">{s.formalizadas.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Sub-tab: Detalle ── */}
      {subTab === 'detalle' && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => { setSearch(e.target.value); setDetPage(1) }} placeholder="Buscar por teléfono, nombre o agente..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-4 text-[0.82rem] text-gray-700 placeholder-gray-400 outline-none focus:border-brand focus:ring-2 focus:ring-brand/10" />
          </div>

          <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
              <h3 className="text-[0.85rem] font-bold text-gray-900">{detTotal.toLocaleString()} registros trazados</h3>
              {detTotal > DET_LIMIT && (
                <p className="text-[0.72rem] text-gray-400">Página {detPage} de {Math.ceil(detTotal / DET_LIMIT)}</p>
              )}
            </div>
            {ldDet ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : detData.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 gap-2 text-gray-400">
                <Activity className="h-8 w-8 opacity-25" />
                <p className="text-[0.82rem]">Sin datos</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-100 bg-gray-50">
                    {['Teléfono','Cliente','Tip. CRM','Agente Gestión','Agente Venta','Estatus Venta','Fecha Venta','Veces Contactado'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[0.68rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {detData.map((v, i) => (
                      <tr key={i} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-2.5 font-mono text-[0.75rem] text-gray-600">{v.PhoneNumber || '—'}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-gray-700">{v.FirstName || '—'}</td>
                        <td className="px-4 py-2.5 text-[0.75rem] text-gray-500">{v.TipCRM || '—'}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-gray-600">{v.AgenteGestion || '—'}</td>
                        <td className="px-4 py-2.5 text-[0.78rem] text-gray-600">{v.AgenteVenta || '—'}</td>
                        <td className="px-4 py-2.5">
                          {v.EstatusVenta ? (
                            <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold',
                              v.EstatusVenta === 'Aprobada' ? 'bg-emerald-100 text-emerald-700' :
                              v.EstatusVenta === 'Rechazada' ? 'bg-red-100 text-red-600' : 'bg-yellow-100 text-yellow-700')}>
                              {v.EstatusVenta}
                            </span>
                          ) : <span className="text-[0.75rem] text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[0.75rem] text-gray-500 whitespace-nowrap">
                          {v.FechaVenta ? new Date(v.FechaVenta).toLocaleDateString('es-MX') : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-[0.75rem] text-gray-500 text-center">{v.VecesContactado ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {/* Pagination */}
            {detTotal > DET_LIMIT && (
              <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
                <p className="text-[0.72rem] text-gray-400">{detTotal.toLocaleString()} registros · página {detPage}</p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setDetPage(p => p - 1)} disabled={detPage === 1}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button onClick={() => setDetPage(p => p + 1)} disabled={detData.length < DET_LIMIT}
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 disabled:opacity-30 transition-colors">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Sub-tab: Por importación CRM ── */}
      {subTab === 'importacion' && (
        <div className="space-y-4 animate-fade-in">
          {/* Selector de importación + filtro de período */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-[200px]">
              <select
                value={impId ?? ''}
                onChange={e => { setImpId(e.target.value ? Number(e.target.value) : null); setImpSearch('') }}
                className="w-full rounded-xl border border-gray-200 bg-white py-2 px-3 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none shadow-sm"
              >
                <option value="">— Seleccionar importación CRM —</option>
                {importaciones.map(imp => (
                  <option key={imp.id} value={imp.id}>
                    {imp.nombre} ({imp.totalRegistros.toLocaleString()} reg{imp.activa ? ' · activa' : ''})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(['hoy','7d','30d','todo'] as TrazPeriod[]).map(p => (
                <button key={p} onClick={() => setImpPeriod(p)}
                  className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
                    impPeriod === p ? 'bg-brand text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}>
                  {p === 'hoy' ? 'Hoy' : p === '7d' ? '7 días' : p === '30d' ? '30 días' : 'Todo'}
                </button>
              ))}
              <button onClick={() => setImpPeriod('custom')}
                className={clsx('rounded-lg px-3 py-1.5 text-[0.75rem] font-semibold transition-colors',
                  impPeriod === 'custom' ? 'bg-brand text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Calendar className="h-3.5 w-3.5 inline mr-1" />Rango
              </button>
              {impPeriod === 'custom' && (
                <>
                  <input type="date" value={impDateFrom} onChange={e => setImpDateFrom(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white py-1.5 px-2.5 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
                  <span className="text-gray-400 text-[0.78rem]">—</span>
                  <input type="date" value={impDateTo} onChange={e => setImpDateTo(e.target.value)}
                    className="rounded-xl border border-gray-200 bg-white py-1.5 px-2.5 text-[0.78rem] text-gray-700 focus:border-brand focus:outline-none" />
                </>
              )}
            </div>
          </div>

          {!impId ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2 text-gray-300">
              <FileText className="h-10 w-10 opacity-40" />
              <p className="text-[0.85rem]">Selecciona una importación para ver la trazabilidad</p>
            </div>
          ) : ldImpTraz ? (
            <div className="flex justify-center py-14"><Spinner size="lg" /></div>
          ) : impResumen.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-gray-300">
              <Activity className="h-8 w-8 opacity-40" />
              <p className="text-[0.82rem]">Sin registros con venta para esta importación en el período seleccionado</p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Cards resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: 'Total cruzados', value: impTotales.total,      color: 'text-brand',       bg: 'bg-blue-50' },
                  { label: 'Aprobadas',      value: impTotales.aprobadas,  color: 'text-emerald-600', bg: 'bg-emerald-50' },
                  { label: 'Rechazadas',     value: impTotales.rechazadas, color: 'text-red-500',     bg: 'bg-red-50' },
                  { label: 'Pendientes',     value: impTotales.pendientes, color: 'text-yellow-600',  bg: 'bg-yellow-50' },
                ].map(c => (
                  <div key={c.label} className={clsx('rounded-2xl border border-gray-200/60 shadow-sm px-5 py-4', c.bg)}>
                    <p className="text-[0.68rem] font-bold text-gray-400 uppercase tracking-wider">{c.label}</p>
                    <p className={`text-2xl font-black mt-1 ${c.color}`}>{c.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>

              {/* Gráfica: tipificación → estatus de venta */}
              <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between">
                  <div>
                    <h3 className="text-[0.85rem] font-bold text-gray-900">Tipificación CRM → Estatus de venta</h3>
                    <p className="text-[0.7rem] text-gray-400 mt-0.5">Por cada tipificación, cómo terminaron las ventas</p>
                  </div>
                  {/* Leyenda de estatus */}
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {impAllStatuses.map(est => (
                      <span key={est} className="flex items-center gap-1 text-[0.68rem] text-gray-500">
                        <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: getEstColor(est) }} />
                        {est}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="p-5 space-y-3">
                  {impTipEntries.map(({ tip, estatus, total: tipTotal }) => {
                    const ests = Object.entries(estatus).sort((a, b) => b[1] - a[1])
                    const pctAprobadas = Math.round(((estatus['Aprobada'] ?? 0) / tipTotal) * 100)
                    return (
                      <div key={tip}>
                        <div className="flex items-center justify-between mb-1.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-[0.78rem] font-bold text-gray-800 truncate">{tip}</span>
                            {pctAprobadas > 0 && (
                              <span className="flex-shrink-0 rounded-full bg-emerald-100 text-emerald-700 text-[0.65rem] font-bold px-1.5 py-0.5">
                                {pctAprobadas}% apr.
                              </span>
                            )}
                          </div>
                          <span className="text-[0.75rem] font-bold text-gray-500 ml-2 flex-shrink-0">{tipTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex h-8 w-full rounded-lg overflow-hidden">
                          {ests.map(([est, cnt]) => {
                            const pct = (cnt / tipTotal) * 100
                            return (
                              <div key={est}
                                style={{ width: `${pct}%`, backgroundColor: getEstColor(est) }}
                                title={`${est}: ${cnt} (${pct.toFixed(1)}%)`}
                                className="flex items-center justify-center overflow-hidden transition-all">
                                {pct >= 7 && <span className="text-[0.65rem] font-bold text-white leading-none drop-shadow">{cnt}</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Tabla de detalle */}
              <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-gray-100 px-5 py-3 flex items-center justify-between gap-3">
                  <h3 className="text-[0.85rem] font-bold text-gray-900">
                    Detalle individual
                    <span className="ml-2 text-[0.72rem] font-normal text-gray-400">({impDetalle.length} registros, máx. 200)</span>
                  </h3>
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Buscar teléfono, cliente, tip, agente…"
                      value={impSearch}
                      onChange={e => setImpSearch(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 bg-gray-50 text-[0.78rem] text-gray-700 focus:outline-none focus:border-brand w-60"
                    />
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        {['Teléfono','Cliente','Tipificación CRM','Notas','Agente Gestión','Fecha Tip.','Estatus Venta','Agente Venta','Fecha Venta'].map(h => (
                          <th key={h} className="px-4 py-2.5 text-left text-[0.67rem] font-bold uppercase tracking-wider text-gray-400 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {impDetFiltrado.length === 0 ? (
                        <tr><td colSpan={9} className="px-4 py-8 text-center text-[0.78rem] text-gray-400">Sin resultados</td></tr>
                      ) : impDetFiltrado.map((r, i) => (
                        <tr key={i} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-2.5 font-mono text-[0.74rem] text-gray-600 whitespace-nowrap">{r.telefono}</td>
                          <td className="px-4 py-2.5 text-[0.78rem] text-gray-700 whitespace-nowrap">{r.nombreCliente || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className="rounded-full bg-gray-100 text-gray-700 text-[0.68rem] font-bold px-2 py-0.5">{r.tipificacion}</span>
                          </td>
                          <td className="px-4 py-2.5 text-[0.74rem] text-gray-500 max-w-[160px] truncate" title={r.notas}>{r.notas || '—'}</td>
                          <td className="px-4 py-2.5 text-[0.78rem] text-gray-600 whitespace-nowrap">{r.agenteGestion || '—'}</td>
                          <td className="px-4 py-2.5 text-[0.74rem] text-gray-400 whitespace-nowrap">
                            {r.fechaTip ? new Date(r.fechaTip).toLocaleDateString('es-MX') : '—'}
                          </td>
                          <td className="px-4 py-2.5">
                            {r.estatusVenta ? (
                              <span className="rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold whitespace-nowrap"
                                style={{ backgroundColor: getEstColor(r.estatusVenta) + '22', color: getEstColor(r.estatusVenta) }}>
                                {r.estatusVenta}
                              </span>
                            ) : <span className="text-[0.74rem] text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-2.5 text-[0.78rem] text-gray-600 whitespace-nowrap">{r.agenteVenta || '—'}</td>
                          <td className="px-4 py-2.5 text-[0.74rem] text-gray-400 whitespace-nowrap">
                            {r.fechaVenta ? new Date(r.fechaVenta).toLocaleDateString('es-MX') : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   ACCESOS TAB
══════════════════════════════════════════════════════════ */
function AccesosTab() {
  const qc = useQueryClient()
  const [selectedImp, setSelectedImp] = useState<CRMImportacion | null>(null)
  const [pendingIds, setPendingIds] = useState<number[]>([])
  const [dirty, setDirty] = useState(false)

  const { data: importaciones = [], isLoading: ldImp } = useQuery({
    queryKey: ['crm-importaciones'],
    queryFn: () => ventasService.getCRMImportaciones(),
    staleTime: 30_000,
  })

  const { data: accesos = [], isLoading: ldAcc } = useQuery({
    queryKey: ['crm-accesos', selectedImp?.id],
    queryFn: () => ventasService.getCRMAccesos(selectedImp!.id),
    enabled: !!selectedImp,
    staleTime: 30_000,
  })

  const guardar = useMutation({
    mutationFn: () => ventasService.setCRMAccesos(selectedImp!.id, pendingIds),
    onSuccess: () => { toast.success('Accesos guardados'); setDirty(false); qc.invalidateQueries({ queryKey: ['crm-accesos', selectedImp?.id] }) },
    onError: () => toast.error('Error al guardar accesos'),
  })

  const handleSelect = (imp: CRMImportacion) => {
    setSelectedImp(imp)
    setDirty(false)
  }

  const handleToggle = (agentId: number, tiene: boolean) => {
    const next = tiene ? pendingIds.filter(id => id !== agentId) : [...pendingIds, agentId]
    setPendingIds(next)
    setDirty(true)
  }

  // Sincronizar pendingIds cuando cargan los accesos
  useState(() => {
    if (accesos.length > 0) {
      setPendingIds(accesos.filter(a => a.tieneAcceso).map(a => a.agentId))
    }
  })

  const tieneMap = new Set(pendingIds)

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h2 className="text-[1rem] font-bold text-gray-900 flex items-center gap-2"><Shield className="h-4 w-4 text-brand" /> Accesos CRM</h2>
        <p className="text-[0.75rem] text-gray-400 mt-0.5">Controla qué agentes pueden ver cada importación</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Lista importaciones */}
        <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          <div className="border-b border-gray-100 px-4 py-3">
            <h3 className="text-[0.82rem] font-bold text-gray-900">Importaciones</h3>
          </div>
          {ldImp ? <div className="flex justify-center py-6"><Spinner size="sm" /></div> : (
            <div className="divide-y divide-gray-50">
              {importaciones.map(imp => (
                <button key={imp.id} onClick={() => handleSelect(imp)}
                  className={clsx('w-full text-left px-4 py-3 transition-colors', selectedImp?.id === imp.id ? 'bg-brand/5 border-l-2 border-brand' : 'hover:bg-gray-50')}>
                  <p className="text-[0.82rem] font-semibold text-gray-800">{imp.nombre}</p>
                  <p className="text-[0.68rem] text-gray-400 mt-0.5">{imp.totalRegistros.toLocaleString()} registros</p>
                </button>
              ))}
              {importaciones.length === 0 && <p className="px-4 py-6 text-[0.78rem] text-gray-400 text-center">Sin importaciones</p>}
            </div>
          )}
        </div>

        {/* Lista agentes con acceso */}
        <div className="md:col-span-2 rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
          {!selectedImp ? (
            <div className="flex flex-col items-center justify-center h-full py-16 gap-2 text-gray-400">
              <Shield className="h-10 w-10 opacity-20" />
              <p className="text-[0.82rem]">Selecciona una importación</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
                <h3 className="text-[0.85rem] font-bold text-gray-900">Agentes — {selectedImp.nombre}</h3>
                {dirty && (
                  <button onClick={() => guardar.mutate()} disabled={guardar.isPending}
                    className="flex items-center gap-1.5 rounded-xl bg-brand px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-brand-dark disabled:opacity-50 transition-colors">
                    {guardar.isPending ? <Spinner size="sm" /> : <CheckCircle2 className="h-3.5 w-3.5" />} Guardar cambios
                  </button>
                )}
              </div>
              {ldAcc ? <div className="flex justify-center py-10"><Spinner size="lg" /></div> : accesos.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-gray-400 text-[0.82rem]">Sin agentes disponibles</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {accesos.map(a => {
                    const tiene = tieneMap.has(a.agentId)
                    return (
                      <div key={a.agentId} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand text-[0.72rem] font-bold text-white">
                            {a.nombreAgente.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="text-[0.82rem] font-semibold text-gray-800">{a.nombreAgente}</p>
                            <p className="text-[0.68rem] text-gray-400">{a.username}</p>
                          </div>
                        </div>
                        <button onClick={() => handleToggle(a.agentId, tiene)}
                          className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 transition-colors">
                          {tiene
                            ? <Lock className="h-4 w-4 text-emerald-500" />
                            : <Unlock className="h-4 w-4 text-gray-300" />}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════
   VICIDIAL TAB  —  iframe embebido al dashboard de gestión
══════════════════════════════════════════════════════════ */
function VicidialTab() {
  return (
    <div className="animate-fade-in" style={{ height: 'calc(100vh - 200px)', minHeight: '600px' }}>
      <iframe
        src="/gestion-vicidial/"
        className="w-full h-full rounded-2xl border border-gray-200/60 shadow-sm bg-white"
        style={{ display: 'block' }}
        title="Gestión Vicidial"
      />
    </div>
  )
}

/* ─── Helper select ──────────────────────────────────────── */
function FilterSelect({ value, onChange, children }: {
  value: string | number; onChange: (v: string) => void; children: React.ReactNode
}) {
  return (
    <div className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-gray-200 bg-white py-2 pl-3 pr-8 text-[0.82rem] text-gray-700 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/10">
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
    </div>
  )
}
