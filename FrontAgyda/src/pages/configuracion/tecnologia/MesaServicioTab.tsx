import { CLASIFICACION_LABELS, MOTIVO_ESPERA_LABELS } from '@/types/ticket.types'

export function MesaServicioTab() {
  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Clasificaciones de ticket</p>
        <p className="mb-3 text-xs text-ink-tertiary">Catálogo de solo lectura, usado al crear un ticket.</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(CLASIFICACION_LABELS).map(([key, label]) => (
            <span key={key} className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary">
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Motivos de espera</p>
        <p className="mb-3 text-xs text-ink-tertiary">Motivos disponibles al poner un ticket en estado "en espera".</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(MOTIVO_ESPERA_LABELS).map(([key, label]) => (
            <span key={key} className="rounded-full bg-surface px-3 py-1 text-xs font-medium text-ink-secondary">
              {label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
