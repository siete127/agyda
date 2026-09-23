import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { clsx } from 'clsx'
import { Plus } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { casoService } from '@/services/caso.service'
import {
  CASO_TIPO_CONFIG, PRIORIDAD_CASO_CONFIG, ESTATUS_CASO_CONFIG, type Caso,
} from '@/types/caso.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { NuevoCasoModal } from '../../components/NuevoCasoModal'
import { CasoDetalleModal } from '../../components/CasoDetalleModal'

// Reemplaza a IncidenciasTab: los 4 tipos de caso (consulta, aclaración, queja,
// incidencia) de este cliente en una sola lista. Reusa el modal único y el
// detalle unificado de la Fase 4.
export function ClienteCasosTab({ contactoId, clienteNombre }: { contactoId: number; clienteNombre: string }) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'casos-gestionar')
  const [nuevo, setNuevo] = useState(false)
  const [detalle, setDetalle] = useState<Caso | null>(null)

  const { data: casos = [], isLoading } = useQuery({
    queryKey: ['cliente-casos', contactoId],
    queryFn: () => casoService.getByContacto(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Casos del cliente</p>
        {puedeGestionar && (
          <button onClick={() => setNuevo(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nuevo caso
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : casos.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin casos registrados</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {casos.map((c) => {
            const tipoCfg = CASO_TIPO_CONFIG[c.tipo]
            const estCfg = ESTATUS_CASO_CONFIG[c.estatus]
            const prioCfg = PRIORIDAD_CASO_CONFIG[c.prioridad]
            const vencida = c.fechaLimiteSla && c.estatus !== 'resuelto' && c.estatus !== 'cerrado' && new Date(c.fechaLimiteSla) < new Date()
            return (
              <button key={c.id} onClick={() => setDetalle(c)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="text-[0.8rem] font-semibold text-gray-800 truncate">{c.folio} — {c.titulo}</p>
                  <p className="text-[0.7rem] text-gray-400">{new Date(c.fechaCreacion).toLocaleDateString('es-MX')}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', tipoCfg.bg, tipoCfg.text)}>{tipoCfg.label}</span>
                  {vencida && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[0.62rem] font-bold text-red-700">SLA</span>}
                  {c.tipo === 'incidencia' && <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-bold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>}
                  <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold', estCfg.bg, estCfg.text)}>
                    <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}
      {nuevo && (
        <NuevoCasoModal
          contactoPreset={{ id: contactoId, nombre: clienteNombre }}
          onClose={() => setNuevo(false)}
        />
      )}
      {detalle && (
        <CasoDetalleModal
          caso={detalle}
          onClose={() => setDetalle(null)}
          queryKeysToInvalidate={[['cliente-casos', contactoId], ['casos']]}
        />
      )}
    </div>
  )
}
