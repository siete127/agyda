import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Plus, Headphones, Clock } from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'

const ESTATUS_BADGE: Record<string, string> = {
  abierto: 'bg-amber-50 text-amber-600',
  en_proceso: 'bg-blue-50 text-blue-600',
  resuelto: 'bg-emerald-50 text-emerald-600',
  cerrado: 'bg-surface text-ink-tertiary',
}

const PRIORIDAD_BADGE: Record<string, string> = {
  alta: 'bg-red-50 text-red-600',
  media: 'bg-amber-50 text-amber-600',
  baja: 'bg-surface text-ink-tertiary',
}

export function AtencionPage() {
  const navigate = useNavigate()
  const { data: incidencias = [], isLoading } = useQuery({ queryKey: ['portal-incidencias'], queryFn: () => portalClienteService.getIncidencias() })

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-ink">Atención</h1>
          <p className="mt-1 text-sm text-ink-tertiary">Tus solicitudes de soporte.</p>
        </div>
        <button onClick={() => navigate('/portal-cliente/atencion/nueva')} className="flex items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark">
          <Plus className="h-3.5 w-3.5" /> Nueva solicitud
        </button>
      </div>

      {isLoading ? (
        <div className="flex flex-col gap-3">
          {[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-surface" />)}
        </div>
      ) : incidencias.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-surface-border bg-card p-10 text-center">
          <Headphones className="h-8 w-8 text-ink-tertiary/50" />
          <p className="text-sm font-semibold text-ink">No tienes solicitudes registradas</p>
          <p className="text-xs text-ink-tertiary">¿Necesitas ayuda? Crea tu primera solicitud.</p>
          <button onClick={() => navigate('/portal-cliente/atencion/nueva')} className="mt-2 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark">
            Nueva solicitud
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {incidencias.map((inc) => (
            <div key={inc.id} className="rounded-2xl border border-surface-border bg-card p-4 shadow-card">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-ink-tertiary">{inc.folio}</p>
                  <p className="text-sm font-bold text-ink">{inc.titulo}</p>
                  {inc.categoria && <p className="text-xs text-ink-tertiary">{inc.categoria}</p>}
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                  <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', ESTATUS_BADGE[inc.estatus] ?? 'bg-surface text-ink-tertiary')}>
                    {inc.estatus.replace('_', ' ')}
                  </span>
                  <span className={clsx('rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize', PRIORIDAD_BADGE[inc.prioridad] ?? '')}>
                    {inc.prioridad}
                  </span>
                </div>
              </div>
              {inc.solucionPropuesta && (
                <p className="mt-2 rounded-lg bg-surface px-3 py-2 text-xs text-ink-secondary">{inc.solucionPropuesta}</p>
              )}
              <p className="mt-2 flex items-center gap-1 text-[11px] text-ink-tertiary">
                <Clock className="h-3 w-3" />
                {new Date(inc.fechaCreacion).toLocaleDateString('es-MX', { dateStyle: 'medium' })}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
