import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Briefcase, FileText, ExternalLink, ChevronRight } from 'lucide-react'
import { CRM_ETAPAS } from '@/types/crm.types'
import type { ExpedienteOportunidad, ExpedienteCotizacion } from '@/services/crm.service'

// Sub-pestaña "Comercial" del expediente del cliente (solo lectura). Muestra el
// pipeline de ese contacto — oportunidades + cotizaciones — para dar contexto de
// venta sin salir de Atención al Cliente. Editar sigue viviendo en Oportunidades.

const COT_ESTATUS_CFG: Record<ExpedienteCotizacion['estatus'], { label: string; bg: string; text: string }> = {
  borrador:  { label: 'Borrador',  bg: 'bg-gray-100',    text: 'text-gray-600' },
  enviada:   { label: 'Enviada',   bg: 'bg-blue-50',     text: 'text-blue-700' },
  aprobada:  { label: 'Aprobada',  bg: 'bg-emerald-50',  text: 'text-emerald-700' },
  rechazada: { label: 'Rechazada', bg: 'bg-red-50',      text: 'text-red-600' },
  facturada: { label: 'Facturada', bg: 'bg-purple-50',   text: 'text-purple-700' },
}

function money(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function fechaCorta(f: string | null) {
  if (!f) return null
  try { return new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) }
  catch { return f }
}

export function ComercialTab({ oportunidades }: { oportunidades: ExpedienteOportunidad[] }) {
  const navigate = useNavigate()

  if (!oportunidades.length) {
    return (
      <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm">
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50">
            <Briefcase className="h-6 w-6 text-blue-300" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-700">Sin oportunidades de venta</p>
            <p className="mt-0.5 text-xs text-gray-400">Este cliente no tiene oportunidades registradas en el pipeline.</p>
          </div>
          <button
            onClick={() => navigate('/crm-interno')}
            className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[0.72rem] font-semibold text-gray-500 hover:border-brand hover:text-brand transition-colors"
          >
            Ir a Oportunidades <ExternalLink className="h-3 w-3" />
          </button>
        </div>
      </div>
    )
  }

  const totalPipeline = oportunidades
    .filter((o) => o.etapa !== 'perdido')
    .reduce((s, o) => s + (o.valor ?? 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
        <p className="text-[0.78rem] text-gray-500">
          {oportunidades.length} oportunidad{oportunidades.length !== 1 ? 'es' : ''}
          {' · '}pipeline abierto <span className="font-bold text-gray-700">{money(totalPipeline)}</span>
        </p>
        <button
          onClick={() => navigate('/crm-interno')}
          className="inline-flex items-center gap-1 text-[0.72rem] font-semibold text-brand hover:underline"
        >
          Abrir en Oportunidades <ExternalLink className="h-3 w-3" />
        </button>
      </div>

      {oportunidades.map((o) => {
        const etapaCfg = CRM_ETAPAS.find((e) => e.key === o.etapa) ?? CRM_ETAPAS[0]
        return (
          <div key={o.id} className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
            <button
              onClick={() => navigate('/crm-interno')}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50/60 transition-colors"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-[0.85rem] font-bold text-gray-800 truncate">{o.nombre}</p>
                  <span className={clsx('inline-flex items-center rounded-full px-2 py-0.5 text-[0.62rem] font-bold', etapaCfg.bgColor, etapaCfg.color)}>
                    {etapaCfg.label}
                  </span>
                </div>
                <p className="mt-0.5 text-[0.7rem] text-gray-400">
                  {money(o.valor)}
                  {o.asignadoNombre && ` · ${o.asignadoNombre}`}
                  {fechaCorta(o.fecha) && ` · creada ${fechaCorta(o.fecha)}`}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-300" />
            </button>

            {o.cotizaciones.length > 0 && (
              <div className="border-t border-gray-100 bg-gray-50/40 divide-y divide-gray-100">
                {o.cotizaciones.map((c) => {
                  const cfg = COT_ESTATUS_CFG[c.estatus] ?? COT_ESTATUS_CFG.borrador
                  return (
                    <div key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText className="h-3.5 w-3.5 flex-shrink-0 text-gray-400" />
                        <div className="min-w-0">
                          <p className="text-[0.76rem] font-semibold text-gray-700 truncate">
                            {c.folio ?? 'Cotización'}{c.titulo ? ` · ${c.titulo}` : ''}
                          </p>
                          <p className="text-[0.66rem] text-gray-400">
                            {money(c.total)}
                            {fechaCorta(c.fecha) && ` · ${fechaCorta(c.fecha)}`}
                            {c.fechaVto && ` · vence ${fechaCorta(c.fechaVto)}`}
                          </p>
                        </div>
                      </div>
                      <span className={clsx('inline-flex flex-shrink-0 items-center rounded-full px-2 py-0.5 text-[0.62rem] font-bold', cfg.bg, cfg.text)}>
                        {cfg.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
