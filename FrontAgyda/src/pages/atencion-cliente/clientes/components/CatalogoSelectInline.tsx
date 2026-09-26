import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check } from 'lucide-react'
import { crmService } from '@/services/crm.service'
import type { CatalogoService } from '@/components/crm/CatalogoListaGestion'
import type { CRMContacto } from '@/types/crm.types'

// Versión reducida de CatalogoSeleccionTab.tsx, sin header de tarjeta grande
// ni gestión del catálogo (CatalogoListaGestion) — pensada para embeberse
// como un campo más dentro de "Información general" (tab Resumen), en vez
// de ocupar una pestaña completa. La gestión del catálogo en sí (agregar,
// editar, desactivar opciones) se sigue haciendo solo desde Configuración.
export function CatalogoSelectInline({
  cliente, label, service, queryKey, campo, valorActualId,
}: {
  cliente: CRMContacto
  label: string
  service: CatalogoService
  queryKey: string
  campo: 'tipoClienteId' | 'segmentoId' | 'categoriaId' | 'industriaId' | 'clasificacionId'
  valorActualId: number | null
}) {
  const qc = useQueryClient()
  const [seleccionId, setSeleccionId] = useState(valorActualId ? String(valorActualId) : '')

  const { data: items = [] } = useQuery({
    queryKey: [queryKey],
    queryFn: () => service.list(true),
  })

  const guardar = useMutation({
    mutationFn: (id: string) => crmService.altaCliente(cliente.id, { [campo]: id ? Number(id) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
      qc.invalidateQueries({ queryKey: ['clientes-lista'] })
      toast.success('Actualizado')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const onChange = (id: string) => {
    setSeleccionId(id)
    guardar.mutate(id)
  }

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{label}</label>
      <select value={seleccionId} onChange={(e) => onChange(e.target.value)} disabled={guardar.isPending} className="field">
        <option value="">Sin especificar</option>
        {items.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
      </select>
    </div>
  )
}
