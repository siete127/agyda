import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { ChevronRight, FileSpreadsheet, CheckCircle2, XCircle, Clock } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalCotizacion } from '@/types/portalCliente.types'
import { PortalHero } from './components/PortalHero'

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Cotizaciones</span>
    </div>
  )
}

const ESTATUS_INFO: Record<string, { label: string; badge: string; icon: React.ReactNode }> = {
  borrador: { label: 'Solicitada', badge: 'bg-blue-100 text-blue-700', icon: <Clock className="h-3.5 w-3.5" /> },
  enviada: { label: 'En revisión', badge: 'bg-amber-100 text-amber-700', icon: <Clock className="h-3.5 w-3.5" /> },
  aprobada: { label: 'Aprobada', badge: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
  rechazada: { label: 'Rechazada', badge: 'bg-red-100 text-red-700', icon: <XCircle className="h-3.5 w-3.5" /> },
}

const FILTROS = ['todas', 'borrador', 'enviada', 'aprobada', 'rechazada'] as const
const FILTRO_LABEL: Record<(typeof FILTROS)[number], string> = {
  todas: 'Todas', borrador: 'Solicitada', enviada: 'En revisión', aprobada: 'Aprobada', rechazada: 'Rechazada',
}
// Color propio por estatus: texto/subrayado del tab activo, gris cuando no lo está.
const FILTRO_COLOR: Record<(typeof FILTROS)[number], { texto: string; linea: string }> = {
  todas: { texto: 'text-ink', linea: 'bg-ink' },
  borrador: { texto: 'text-blue-600', linea: 'bg-blue-600' },
  enviada: { texto: 'text-amber-600', linea: 'bg-amber-600' },
  aprobada: { texto: 'text-emerald-600', linea: 'bg-emerald-600' },
  rechazada: { texto: 'text-red-600', linea: 'bg-red-600' },
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleDateString('es-MX', { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatMonto(total: number) {
  return total.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' })
}

export function PortalClienteCotizacionesPage() {
  const { data: cotizaciones = [], isLoading } = useQuery({
    queryKey: ['portal-cotizaciones'],
    queryFn: () => portalClienteService.getCotizaciones(),
  })
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number]>('todas')

  const filtradas = filtro === 'todas' ? cotizaciones : cotizaciones.filter((c) => c.estatus === filtro)

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />

      <PortalHero icon={FileSpreadsheet} titulo="Cotizaciones" descripcion="Propuestas que te hemos enviado y su estatus." />

      <div className="flex gap-6 overflow-x-auto border-b border-surface-border">
        {FILTROS.map((f) => {
          const count = f === 'todas' ? cotizaciones.length : cotizaciones.filter((c) => c.estatus === f).length
          const activo = filtro === f
          const color = FILTRO_COLOR[f]
          return (
            <button
              key={f}
              type="button"
              onClick={() => setFiltro(f)}
              className="group relative flex flex-shrink-0 items-center gap-1.5 pb-3 pt-1 text-sm font-semibold transition-colors"
            >
              <span className={clsx(activo ? color.texto : 'text-ink-tertiary group-hover:text-ink')}>
                {FILTRO_LABEL[f]}
              </span>
              <span className={clsx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                activo ? clsx(color.texto, 'bg-current/10') : 'bg-surface text-ink-tertiary'
              )}>
                {count}
              </span>
              <span className={clsx('absolute inset-x-0 -bottom-px h-0.5 rounded-full transition-colors', activo ? color.linea : 'bg-transparent')} />
            </button>
          )
        })}
      </div>

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        {isLoading ? (
          <div className="h-24 animate-pulse rounded-xl bg-surface" />
        ) : filtradas.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-surface text-ink-tertiary">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <p className="text-sm font-bold text-ink">
              {cotizaciones.length === 0 ? 'Aún no tienes cotizaciones disponibles.' : 'No hay cotizaciones con este estatus.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {filtradas.map((c: PortalCotizacion) => {
              const info = ESTATUS_INFO[c.estatus] ?? { label: c.estatus, badge: 'bg-gray-100 text-gray-600', icon: <Clock className="h-3.5 w-3.5" /> }
              return (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-surface-border px-3.5 py-3">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                    <FileSpreadsheet className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{c.titulo || `Cotización ${c.folio}`}</p>
                    <span className="text-[11px] text-ink-tertiary">{c.folio} · {formatFecha(c.fecha)}</span>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1">
                    <p className="text-sm font-bold text-ink">{formatMonto(c.total)}</p>
                    <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold', info.badge)}>
                      {info.icon} {info.label}
                    </span>
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
