import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Tags, Check } from 'lucide-react'
import { crmService } from '@/services/crm.service'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import { CatalogoListaGestion } from '@/components/crm/CatalogoListaGestion'
import type { CRMContacto } from '@/types/crm.types'

export function EtiquetasClienteTab({ cliente }: { cliente: CRMContacto }) {
  const qc = useQueryClient()
  const [etiquetaIds, setEtiquetaIds] = useState<number[]>(cliente.etiquetas.map((e) => e.id))

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['crm-catalogo-etiquetas'],
    queryFn: () => crmCatalogosClienteService.etiquetas.list(true),
  })

  const toggleEtiqueta = (id: number) =>
    setEtiquetaIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const guardar = useMutation({
    mutationFn: () => crmService.altaCliente(cliente.id, { etiquetaIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
      toast.success('Etiquetas actualizadas')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const idsActuales = cliente.etiquetas.map((e) => e.id).sort().join(',')
  const idsSeleccionados = [...etiquetaIds].sort().join(',')
  const cambio = idsActuales !== idsSeleccionados

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Tags className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">Etiquetas</h2>
            <p className="text-[0.82rem] text-gray-400">Un cliente puede tener varias etiquetas a la vez.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card space-y-3">
        {items.length === 0 ? (
          <p className="text-xs text-ink-tertiary py-2">Sin etiquetas definidas — agrega la primera abajo.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {items.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => toggleEtiqueta(e.id)}
                className={clsx(
                  'rounded-full border px-3 py-1 text-[0.75rem] font-medium transition-colors',
                  etiquetaIds.includes(e.id) ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                {e.nombre}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end pt-1">
          <button
            onClick={() => guardar.mutate()}
            disabled={!cambio || guardar.isPending}
            className="flex items-center gap-1.5 rounded-xl bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-sm shadow-violet-600/20 transition-all hover:bg-violet-700 active:scale-[0.98] disabled:opacity-60"
          >
            <Check className="h-3.5 w-3.5" /> Guardar
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <p className="mb-3 text-[0.8rem] font-bold text-ink">Opciones del catálogo</p>
        <CatalogoListaGestion items={items} isLoading={isLoading} service={crmCatalogosClienteService.etiquetas} queryKey="crm-catalogo-etiquetas" />
      </div>
    </div>
  )
}
