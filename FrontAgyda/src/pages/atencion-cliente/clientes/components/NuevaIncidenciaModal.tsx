import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { incidenciaService } from '@/services/incidencia.service'
import { PRIORIDAD_INCIDENCIA_CONFIG, type IncidenciaPrioridad } from '@/types/incidencia.types'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const CATEGORIAS = ['Servicio', 'Facturación', 'Producto', 'Atención', 'Otro']

export function NuevaIncidenciaModal({ contactoId, onClose, onCreated }: { contactoId: number; onClose: () => void; onCreated: () => void }) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prioridad, setPrioridad] = useState<IncidenciaPrioridad>('media')
  const [asignadoA, setAsignadoA] = useState('')

  const crear = useMutation({
    mutationFn: () => incidenciaService.create({
      contactoId, titulo: titulo.trim(), descripcion: descripcion || undefined,
      categoria: categoria || undefined, prioridad, asignadoA: asignadoA ? Number(asignadoA) : undefined,
    }),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['cliente-incidencias', contactoId] })
      qc.invalidateQueries({ queryKey: ['incidencias'] })
      toast.success(`Incidencia ${data?.data?.folio ?? ''} creada`)
      onCreated()
    },
    onError: () => toast.error('No se pudo crear la incidencia'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nueva incidencia" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder="Ej. Retraso en entrega del servicio" autoFocus maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={3} className="field resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
            <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Asignar a</label>
            <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Prioridad</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(PRIORIDAD_INCIDENCIA_CONFIG) as IncidenciaPrioridad[]).map((p) => {
              const cfg = PRIORIDAD_INCIDENCIA_CONFIG[p]
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPrioridad(p)}
                  className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all', prioridad === p ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300')}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!titulo.trim()} onClick={() => crear.mutate()}>Crear incidencia</Button>
        </div>
      </div>
    </Modal>
  )
}
