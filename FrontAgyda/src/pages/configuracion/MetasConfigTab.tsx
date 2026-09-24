import { ListChecks, Info } from 'lucide-react'
import { EstatusContadosCard } from './EstatusContadosCard'

export function MetasConfigTab() {
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <ListChecks className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Metas</h2>
            <p className="text-[0.82rem] text-gray-400">
              Las metas se capturan por asesor/campaña desde CRM → Metas. Aquí se define qué cuenta como venta para su avance.
            </p>
          </div>
        </div>
      </div>

      <EstatusContadosCard uso="metas" />

      <div className="flex items-start gap-2 rounded-xl bg-violet-50/60 px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-violet-500" />
        <p className="text-[0.72rem] text-gray-500">
          Metas no tiene parámetros propios adicionales por ahora — la creación y edición de metas por asesor/campaña se hace desde CRM → Metas.
        </p>
      </div>
    </div>
  )
}
