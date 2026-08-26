import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Radar, Building2, Users, DollarSign, ShoppingCart, Headphones, ShieldCheck,
  Megaphone, Cpu, MessageCircle, Scale, ChevronDown, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
} from 'lucide-react'
import { clsx } from 'clsx'
import { direccionGeneralService, type AreaSupervision, type Semaforo } from '@/services/direccionGeneral.service'
import { DashboardStatRow, type DashboardStat } from '@/components/ui/DashboardStatRow'
import type { AreaKey } from '@/config/areas'
import { rhAreaService } from '@/services/rhArea.service'
import { ventasAreaService } from '@/services/ventasArea.service'
import { finanzasService } from '@/services/finanzas.service'
import { operacionesService } from '@/services/operaciones.service'
import { calidadService } from '@/services/calidad.service'
import { marketingService } from '@/services/marketing.service'
import { tecnologiaService } from '@/services/tecnologia.service'
import { atencionClienteService } from '@/services/atencionCliente.service'
import { legalService } from '@/services/legal.service'
import { direccionGeneralService as dgService } from '@/services/direccionGeneral.service'

const currentPeriodo = new Date().toISOString().slice(0, 7)

const AREA_ICONS: Record<AreaKey, React.ElementType> = {
  'direccion-general': Building2,
  rh: Users,
  finanzas: DollarSign,
  ventas: ShoppingCart,
  operaciones: Headphones,
  calidad: ShieldCheck,
  marketing: Megaphone,
  ti: Cpu,
  'atencion-cliente': MessageCircle,
  legal: Scale,
}

const SEMAFORO_CONFIG: Record<NonNullable<Semaforo> | 'sin-datos', { label: string; cls: string; dot: string }> = {
  success: { label: 'En orden', cls: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  warn: { label: 'En riesgo', cls: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
  critical: { label: 'Crítico', cls: 'bg-red-100 text-red-700', dot: 'bg-red-500' },
  'sin-datos': { label: 'Sin datos', cls: 'bg-gray-100 text-gray-500', dot: 'bg-gray-400' },
}

function formatMoney(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

// ── Contenido de drill-down por área ────────────────────────────────────
function DetalleArea({ areaKey }: { areaKey: AreaKey }) {
  const { data: rh, isLoading: lRh } = useQuery({ queryKey: ['supervision-rh'], queryFn: () => rhAreaService.getDashboard(), enabled: areaKey === 'rh' })
  const { data: ventas, isLoading: lVentas } = useQuery({ queryKey: ['supervision-ventas'], queryFn: () => ventasAreaService.getDashboard(), enabled: areaKey === 'ventas' })
  const { data: finanzas, isLoading: lFinanzas } = useQuery({ queryKey: ['supervision-finanzas'], queryFn: () => finanzasService.getDashboard(), enabled: areaKey === 'finanzas' })
  const { data: operaciones, isLoading: lOperaciones } = useQuery({ queryKey: ['supervision-operaciones'], queryFn: () => operacionesService.getDashboard(), enabled: areaKey === 'operaciones' })
  const { data: calidad, isLoading: lCalidad } = useQuery({ queryKey: ['supervision-calidad'], queryFn: () => calidadService.getDashboard(), enabled: areaKey === 'calidad' })
  const { data: marketing, isLoading: lMarketing } = useQuery({ queryKey: ['supervision-marketing'], queryFn: () => marketingService.getDashboard(), enabled: areaKey === 'marketing' })
  const { data: ti, isLoading: lTi } = useQuery({ queryKey: ['supervision-ti'], queryFn: () => tecnologiaService.getDashboard(), enabled: areaKey === 'ti' })
  const { data: atencion, isLoading: lAtencion } = useQuery({ queryKey: ['supervision-atencion'], queryFn: () => atencionClienteService.getDashboard(), enabled: areaKey === 'atencion-cliente' })
  const { data: legal, isLoading: lLegal } = useQuery({ queryKey: ['supervision-legal'], queryFn: () => legalService.getDashboard(), enabled: areaKey === 'legal' })
  const { data: dg, isLoading: lDg } = useQuery({ queryKey: ['supervision-dg'], queryFn: () => dgService.getResumen(), enabled: areaKey === 'direccion-general' })

  const Metric = ({ label, value }: { label: string; value: string | number }) => (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-tertiary">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink">{value}</p>
    </div>
  )

  if (areaKey === 'rh') {
    if (lRh) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Vacantes abiertas" value={rh?.vacantesAbiertas ?? 0} />
        <Metric label="Candidatos activos" value={rh?.candidatosActivos ?? 0} />
      </div>
    )
  }
  if (areaKey === 'ventas') {
    if (lVentas) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Metas definidas" value={ventas?.metasDefinidas ?? 0} />
        <Metric label="Meta total" value={formatMoney(ventas?.metaMontoTotal ?? 0)} />
      </div>
    )
  }
  if (areaKey === 'finanzas') {
    if (lFinanzas) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Ingresos del mes" value={formatMoney(finanzas?.ingresosMes ?? 0)} />
        <Metric label="CxC pendiente" value={formatMoney(finanzas?.cxcPendiente ?? 0)} />
        <Metric label="CxP pendiente" value={formatMoney(finanzas?.cxpPendiente ?? 0)} />
        <Metric label="CxC vencidas" value={formatMoney(finanzas?.cxcVencidas ?? 0)} />
      </div>
    )
  }
  if (areaKey === 'operaciones') {
    if (lOperaciones) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Campañas activas" value={operaciones?.campaniasActivas ?? 0} />
        <Metric label="Total asignado" value={operaciones?.totalAsignado ?? 0} />
      </div>
    )
  }
  if (areaKey === 'calidad') {
    if (lCalidad) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Evaluaciones del mes" value={calidad?.evaluacionesMes ?? 0} />
        <Metric label="Promedio QA" value={(calidad?.promedioQa ?? 0).toFixed(1)} />
      </div>
    )
  }
  if (areaKey === 'marketing') {
    if (lMarketing) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Campañas activas" value={marketing?.campaniasActivas ?? 0} />
        <Metric label="Presupuesto total" value={formatMoney(marketing?.presupuestoTotal ?? 0)} />
      </div>
    )
  }
  if (areaKey === 'ti') {
    if (lTi) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Incidentes abiertos" value={ti?.incidentesAbiertos ?? 0} />
        <Metric label="Mantenimientos del mes" value={ti?.mantenimientosMes ?? 0} />
      </div>
    )
  }
  if (areaKey === 'atencion-cliente') {
    if (lAtencion) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Clientes en riesgo" value={atencion?.clientesEnRiesgo ?? 0} />
        <Metric label="Total evaluados" value={atencion?.totalEvaluados ?? 0} />
      </div>
    )
  }
  if (areaKey === 'legal') {
    if (lLegal) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Documentos activos" value={legal?.documentosActivos ?? 0} />
        <Metric label="Subidos este mes" value={legal?.documentosMes ?? 0} />
      </div>
    )
  }
  if (areaKey === 'direccion-general') {
    if (lDg) return <p className="text-xs text-ink-tertiary">Cargando...</p>
    return (
      <div className="grid grid-cols-2 gap-2">
        <Metric label="Áreas reportando" value={`${dg?.areasReportando ?? 0} / ${dg?.totalAreas ?? 0}`} />
      </div>
    )
  }
  return <p className="text-xs text-ink-tertiary">Sin detalle disponible.</p>
}

// ── Tarjeta de área ──────────────────────────────────────────────────────
function AreaSupervisionCard({ area, expandida, onToggle }: { area: AreaSupervision; expandida: boolean; onToggle: () => void }) {
  const Icon = AREA_ICONS[area.areaKey]
  const semCfg = SEMAFORO_CONFIG[area.semaforo ?? 'sin-datos']

  return (
    <div className="rounded-2xl border border-gray-100 bg-white shadow-card transition-all">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-4 text-left">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand/10">
          <Icon className="h-4.5 w-4.5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-ink">{area.label}</h3>
          <p className="text-[11px] text-ink-tertiary">
            {area.kpiCount} KPI{area.kpiCount !== 1 ? 's' : ''}
            {area.ultimaActualizacion ? ` · actualizado ${new Date(area.ultimaActualizacion).toLocaleDateString()}` : ''}
          </p>
        </div>
        <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold', semCfg.cls)}>
          <span className={clsx('h-1.5 w-1.5 rounded-full', semCfg.dot)} /> {semCfg.label}
        </span>
        <ChevronDown className={clsx('h-4 w-4 shrink-0 text-gray-400 transition-transform', expandida && 'rotate-180')} />
      </button>
      {expandida && (
        <div className="border-t border-gray-100 p-4">
          <DetalleArea areaKey={area.areaKey} />
        </div>
      )}
    </div>
  )
}

// ── Página ────────────────────────────────────────────────────────────────
export function SupervisionGeneralPage() {
  const [periodo, setPeriodo] = useState(currentPeriodo)
  const [areaExpandida, setAreaExpandida] = useState<AreaKey | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['supervision-general', periodo],
    queryFn: () => direccionGeneralService.getSupervisionGeneral(periodo),
    staleTime: 30_000,
  })

  const stats: DashboardStat[] = useMemo(() => {
    const areas = data?.areas || []
    return [
      { key: 'success', icon: CheckCircle2, label: 'En orden', value: areas.filter((a) => a.semaforo === 'success').length, tone: 'success' },
      { key: 'warn', icon: AlertTriangle, label: 'En riesgo', value: areas.filter((a) => a.semaforo === 'warn').length, tone: 'warn' },
      { key: 'critical', icon: XCircle, label: 'Críticas', value: areas.filter((a) => a.semaforo === 'critical').length, tone: 'critical' },
      { key: 'sin-datos', icon: HelpCircle, label: 'Sin datos', value: areas.filter((a) => !a.semaforo).length, tone: 'brand' },
    ]
  }, [data])

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-br from-[#0D1B3E] via-[#1a2f5e] to-[#0D1B3E] p-6 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Radar className="h-6 w-6 text-blue-300" />
            <div>
              <h1 className="text-lg font-bold">Supervisión general</h1>
              <p className="text-xs text-blue-200/70">Panorama consolidado de todas las áreas</p>
            </div>
          </div>
          <input
            type="month"
            value={periodo}
            onChange={(e) => setPeriodo(e.target.value)}
            className="rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-sm text-white [color-scheme:dark]"
          />
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-ink-tertiary">Cargando...</p>
      ) : (
        <>
          <DashboardStatRow stats={stats} />
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {(data?.areas || []).map((area) => (
              <AreaSupervisionCard
                key={area.areaKey}
                area={area}
                expandida={areaExpandida === area.areaKey}
                onToggle={() => setAreaExpandida((prev) => (prev === area.areaKey ? null : area.areaKey))}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
