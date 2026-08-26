import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { incidenciaService } from '@/services/incidencia.service'
import { PRIORIDAD_INCIDENCIA_CONFIG, ESTATUS_INCIDENCIA_CONFIG, type Incidencia } from '@/types/incidencia.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevaIncidenciaModal } from './NuevaIncidenciaModal'
import { IncidenciaDetalleModal } from './IncidenciaDetalleModal'

export function IncidenciasTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'incidencias-gestionar')
  const [showNueva, setShowNueva] = useState(false)
  const [detalle, setDetalle] = useState<Incidencia | null>(null)

  const { data: incidencias = [], isLoading } = useQuery({
    queryKey: ['cliente-incidencias', contactoId],
    queryFn: () => incidenciaService.getByContacto(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Incidencias</p>
        {puedeGestionar && (
          <button onClick={() => setShowNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nueva incidencia
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : incidencias.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin incidencias registradas</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {incidencias.map((inc) => {
            const prioCfg = PRIORIDAD_INCIDENCIA_CONFIG[inc.prioridad]
            const estCfg = ESTATUS_INCIDENCIA_CONFIG[inc.estatus]
            return (
              <button key={inc.id} onClick={() => setDetalle(inc)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{inc.folio} — {inc.titulo}</p>
                  <p className="text-[0.7rem] text-gray-400">{new Date(inc.fechaCreacion).toLocaleDateString('es-MX')}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {showNueva && <NuevaIncidenciaModal contactoId={contactoId} onClose={() => setShowNueva(false)} onCreated={() => setShowNueva(false)} />}
      {detalle && <IncidenciaDetalleModal incidencia={detalle} onClose={() => setDetalle(null)} queryKeysToInvalidate={[['cliente-incidencias', contactoId], ['incidencias']]} />}
    </div>
  )
}
