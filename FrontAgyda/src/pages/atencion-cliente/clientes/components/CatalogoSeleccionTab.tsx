import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, type LucideIcon } from 'lucide-react'
import { crmService } from '@/services/crm.service'
import { CatalogoListaGestion, type CatalogoService } from '@/components/crm/CatalogoListaGestion'
import type { CRMContacto } from '@/types/crm.types'

// Pestaña de catálogo de selección única (Tipo/Segmento/Categoría/Industria/
// Clasificación) dentro del expediente de un cliente: arriba, elegir/cambiar
// el valor de ESTE cliente; abajo, gestionar las opciones del catálogo sin
// salir del expediente (mismo bloque que usa Configuración).
export function CatalogoSeleccionTab({
  cliente, titulo, subtitulo, icon: Icon, service, queryKey, campo, valorActualId, valorActualNombre,
}: {
  cliente: CRMContacto
  titulo: string
  subtitulo: string
  icon: LucideIcon
  service: CatalogoService
  queryKey: string
  campo: 'tipoClienteId' | 'segmentoId' | 'categoriaId' | 'industriaId' | 'clasificacionId'
  valorActualId: number | null
  valorActualNombre: string | null
}) {
  const qc = useQueryClient()
  const [seleccionId, setSeleccionId] = useState(valorActualId ? String(valorActualId) : '')

  const { data: items = [], isLoading } = useQuery({
    queryKey: [queryKey],
    queryFn: () => service.list(true),
  })

  const guardar = useMutation({
    mutationFn: () => crmService.altaCliente(cliente.id, { [campo]: seleccionId ? Number(seleccionId) : undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
      toast.success('Actualizado')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const cambio = seleccionId !== (valorActualId ? String(valorActualId) : '')

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
            <Icon className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-[1.35rem] font-bold text-gray-900">{titulo}</h2>
            <p className="text-[0.82rem] text-gray-400">{subtitulo}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-100 bg-card p-5 shadow-card space-y-3">
        <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
          Valor asignado a este cliente: <span className="text-gray-900">{valorActualNombre ?? 'Sin asignar'}</span>
        </p>
        <div className="flex items-center gap-2">
          <select value={seleccionId} onChange={(e) => setSeleccionId(e.target.value)} className="field flex-1">
            <option value="">Sin especificar</option>
            {items.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
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
        <CatalogoListaGestion items={items} isLoading={isLoading} service={service} queryKey={queryKey} />
      </div>
    </div>
  )
}
