import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Inbox, CalendarDays, Gift, Smile, ShieldAlert, TrendingUp } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { crmService, type ClienteResumen } from '@/services/crm.service'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import type { CRMContacto } from '@/types/crm.types'
import { InformacionGeneralTab } from './InformacionGeneralTab'
import { HistorialEventosList } from './HistorialEventosList'
import { CatalogoSelectInline } from './CatalogoSelectInline'

const ACTIVIDAD_RECIENTE_LIMIT = 6

const PERIODOS = [
  { key: 3, label: 'Últimos 3 meses' },
  { key: 6, label: 'Últimos 6 meses' },
  { key: 12, label: 'Último año' },
  { key: 0, label: 'Todo el historial' },
] as const

function fmtMoneda(n: number) {
  return n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
}

function TarjetaMetrica({ icon: Icon, label, valor, detalle, tono }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  valor: string
  detalle?: string
  tono: 'blue' | 'sky' | 'amber' | 'violet' | 'red' | 'emerald'
}) {
  const tonos: Record<string, string> = {
    blue: 'bg-blue-600', sky: 'bg-sky-600', amber: 'bg-amber-500',
    violet: 'bg-violet-600', red: 'bg-red-600', emerald: 'bg-emerald-600',
  }
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <div className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', tonos[tono])}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <p className="min-w-0 flex-1 text-[0.72rem] font-semibold text-gray-500 leading-tight">{label}</p>
      </div>
      <p className="mt-2 truncate text-xl font-bold text-gray-900">{valor}</p>
      {detalle && <p className="mt-0.5 truncate text-[0.7rem] text-gray-400">{detalle}</p>}
    </div>
  )
}

function MetricasRapidas({ resumen }: { resumen: ClienteResumen }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <TarjetaMetrica icon={Inbox} label="Casos" tono="blue"
        valor={String(resumen.casos.total)} detalle={`${resumen.casos.abiertos} abierto${resumen.casos.abiertos !== 1 ? 's' : ''}`} />
      <TarjetaMetrica icon={CalendarDays} label="Citas" tono="sky"
        valor={String(resumen.citas.total)} detalle={`${resumen.citas.proximas} próxima${resumen.citas.proximas !== 1 ? 's' : ''}`} />
      <TarjetaMetrica icon={Gift} label="Ofertas" tono="amber"
        valor={String(resumen.ofertas.enviosTotal)} detalle="envíos" />
      <TarjetaMetrica icon={Smile} label="Satisfacción" tono="violet"
        valor={`${resumen.satisfaccion.respondidas}/${resumen.satisfaccion.encuestasEnviadas}`} detalle={`${resumen.satisfaccion.satisfechos} satisfecho${resumen.satisfaccion.satisfechos !== 1 ? 's' : ''}`} />
      <TarjetaMetrica icon={ShieldAlert} label="Retención" tono={resumen.retencion?.enRiesgo ? 'red' : 'emerald'}
        valor={resumen.retencion ? (resumen.retencion.estatus === 'riesgo' ? 'En riesgo' : resumen.retencion.estatus === 'recuperado' ? 'Recuperado' : 'Estable') : 'Sin evaluar'}
        detalle={resumen.retencion ? new Date(resumen.retencion.fecha).toLocaleDateString('es-MX') : undefined} />
      <TarjetaMetrica icon={TrendingUp} label="Valor comercial" tono="emerald"
        valor={fmtMoneda(resumen.valorComercial.totalGanado)} detalle={`${fmtMoneda(resumen.valorComercial.pipelineAbierto)} en pipeline`} />
    </div>
  )
}

function CatalogacionClienteBlock({ cliente }: { cliente: CRMContacto }) {
  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Catalogación</p>
      </div>
      <div className="p-4 space-y-3">
        <CatalogoSelectInline
          cliente={cliente} label="Tipo de cliente" service={crmCatalogosClienteService.tipos}
          queryKey="crm-catalogo-tipos-cliente" campo="tipoClienteId" valorActualId={cliente.tipoClienteId}
        />
        <CatalogoSelectInline
          cliente={cliente} label="Segmento" service={crmCatalogosClienteService.segmentos}
          queryKey="crm-catalogo-segmentos" campo="segmentoId" valorActualId={cliente.segmentoId}
        />
        <CatalogoSelectInline
          cliente={cliente} label="Categoría" service={crmCatalogosClienteService.categorias}
          queryKey="crm-catalogo-categorias-cliente" campo="categoriaId" valorActualId={cliente.categoriaId}
        />
        <CatalogoSelectInline
          cliente={cliente} label="Industria" service={crmCatalogosClienteService.industrias}
          queryKey="crm-catalogo-industrias" campo="industriaId" valorActualId={cliente.industriaId}
        />
        <CatalogoSelectInline
          cliente={cliente} label="Clasificación" service={crmCatalogosClienteService.clasificaciones}
          queryKey="crm-catalogo-clasificaciones-cliente" campo="clasificacionId" valorActualId={cliente.clasificacionId}
        />
      </div>
    </div>
  )
}

export function ResumenTab({ cliente }: { cliente: CRMContacto }) {
  const [meses, setMeses] = useState<number>(6)

  const { data: resumen, isLoading: cargandoResumen } = useQuery({
    queryKey: ['cliente-resumen', cliente.id, meses],
    queryFn: () => crmService.getResumen(cliente.id, meses || undefined),
    staleTime: 15_000,
  })

  const { data: actividad = [], isLoading: cargandoActividad } = useQuery({
    queryKey: ['cliente-historial', cliente.id, ACTIVIDAD_RECIENTE_LIMIT],
    queryFn: () => clienteSeguimientoService.getHistorial(cliente.id, ACTIVIDAD_RECIENTE_LIMIT),
    staleTime: 15_000,
  })

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <InformacionGeneralTab cliente={cliente} />

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[0.8rem] font-bold text-gray-700">Métricas rápidas</p>
            <select
              value={meses}
              onChange={(e) => setMeses(Number(e.target.value))}
              className="rounded-lg border border-gray-200 bg-card px-2 py-1 text-[0.72rem] font-semibold text-gray-600"
            >
              {PERIODOS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
            </select>
          </div>
          {cargandoResumen || !resumen ? (
            <div className="flex justify-center py-10"><Spinner size="sm" /></div>
          ) : (
            <MetricasRapidas resumen={resumen} />
          )}

          <div className="mt-4">
            <CatalogacionClienteBlock cliente={cliente} />
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
        <div className="border-b border-gray-100 px-4 py-3">
          <p className="text-[0.8rem] font-bold text-gray-700">Actividad reciente</p>
        </div>
        {cargandoActividad ? (
          <div className="flex justify-center py-10"><Spinner size="sm" /></div>
        ) : (
          <HistorialEventosList eventos={actividad} />
        )}
      </div>
    </div>
  )
}
