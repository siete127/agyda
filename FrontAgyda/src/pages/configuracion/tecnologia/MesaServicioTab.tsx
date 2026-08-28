import { Lock } from 'lucide-react'
import { CLASIFICACION_LABELS, MOTIVO_ESPERA_LABELS } from '@/types/ticket.types'

export function MesaServicioTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border border-amber-100 bg-amber-50 p-3 text-xs text-amber-800">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <p>
          Este catálogo es fijo por diseño (no editable desde aquí): son valores estándar del flujo de
          soporte que se validan directamente en el backend al crear o gestionar un ticket. Cambiarlos
          requeriría una migración de datos, no solo una edición de texto.
        </p>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
        <p className="mb-1 text-sm font-semibold text-ink">Clasificaciones de ticket</p>
        <p className="mb-3 text-xs text-ink-tertiary">Catálogo fijo, usado al crear un ticket.</p>
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
