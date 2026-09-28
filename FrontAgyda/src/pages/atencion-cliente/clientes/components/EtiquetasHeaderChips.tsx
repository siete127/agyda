import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, X } from 'lucide-react'
import { crmService } from '@/services/crm.service'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import type { CRMContacto } from '@/types/crm.types'

// Chips de etiquetas del cliente, visibles en el header fijo del expediente
// (no dentro de una tab) — agregar/quitar guarda de inmediato, a diferencia
// del flujo de EtiquetasClienteTab (selección múltiple + botón "Guardar").
export function EtiquetasHeaderChips({ cliente }: { cliente: CRMContacto }) {
  const qc = useQueryClient()
  const [agregando, setAgregando] = useState(false)

  const { data: catalogo = [] } = useQuery({
    queryKey: ['crm-catalogo-etiquetas'],
    queryFn: () => crmCatalogosClienteService.etiquetas.list(true),
    enabled: agregando,
  })

  const actualizar = useMutation({
    mutationFn: (etiquetaIds: number[]) => crmService.altaCliente(cliente.id, { etiquetaIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
    },
    onError: () => toast.error('No se pudo actualizar la etiqueta'),
  })

  const quitar = (id: number) => actualizar.mutate(cliente.etiquetas.filter((e) => e.id !== id).map((e) => e.id))
  const agregar = (id: number) => {
    actualizar.mutate([...cliente.etiquetas.map((e) => e.id), id])
    setAgregando(false)
  }

  const disponibles = catalogo.filter((c) => !cliente.etiquetas.some((e) => e.id === c.id))

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {cliente.etiquetas.map((e) => (
        <span key={e.id} className="group inline-flex items-center gap-1 rounded-full bg-violet-500/20 px-2.5 py-1 text-[0.7rem] font-semibold text-violet-100">
          {e.nombre}
          <button onClick={() => quitar(e.id)} className="opacity-60 hover:opacity-100">
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      {agregando ? (
        <div className="relative">
          <select
            autoFocus
            onChange={(e) => e.target.value && agregar(Number(e.target.value))}
            onBlur={() => setAgregando(false)}
            className="rounded-full border-0 bg-white/10 px-2.5 py-1 text-[0.7rem] font-semibold text-white outline-none"
            defaultValue=""
          >
            <option value="" disabled>Elegir etiqueta…</option>
            {disponibles.map((c) => <option key={c.id} value={c.id} className="text-gray-900">{c.nombre}</option>)}
          </select>
        </div>
      ) : (
        <button
          onClick={() => setAgregando(true)}
          className={clsx('inline-flex items-center gap-1 rounded-full border border-dashed border-white/30 px-2.5 py-1 text-[0.7rem] font-semibold text-white/70 hover:border-white/50 hover:text-white transition-colors')}
        >
          <Plus className="h-3 w-3" /> Agregar etiqueta
        </button>
      )}
    </div>
  )
}
