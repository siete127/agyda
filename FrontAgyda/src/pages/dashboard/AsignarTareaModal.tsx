import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import { tareaPersonalService, type CrearTareaPersonalPayload } from '@/services/tareaPersonal.service'
import type { TareaPersonalPrioridad } from '@/types/tareaPersonal.types'

const PRIORIDADES: { value: TareaPersonalPrioridad; label: string }[] = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
]

export function AsignarTareaModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: usuarios = [] } = useUsuariosSimple()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [asignadoA, setAsignadoA] = useState<number | ''>('')
  const [prioridad, setPrioridad] = useState<TareaPersonalPrioridad>('media')
  const [fechaLimite, setFechaLimite] = useState('')

  const reset = () => {
    setTitulo(''); setDescripcion(''); setAsignadoA(''); setPrioridad('media'); setFechaLimite('')
  }

  const crear = useMutation({
    mutationFn: (payload: CrearTareaPersonalPayload) => tareaPersonalService.create(payload),
    onSuccess: () => {
      toast.success('Tarea asignada')
      qc.invalidateQueries({ queryKey: ['tareas-personales-todas'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo asignar la tarea'),
  })

  const handleSubmit = () => {
    if (!titulo.trim()) return toast.error('Escribe un título')
    if (!asignadoA) return toast.error('Selecciona a quién asignar la tarea')
    crear.mutate({
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      asignadoA: Number(asignadoA),
      prioridad,
      fechaLimite: fechaLimite || null,
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="Asignar tarea" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Asignar a</label>
          <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value ? Number(e.target.value) : '')} className="field w-full">
            <option value="">Selecciona un usuario…</option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>{u.nombre}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field w-full" placeholder="¿Qué hay que hacer?" maxLength={200} />
        </div>

        <div>
          <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field w-full resize-none" rows={3} placeholder="Opcional — agrega notas o instrucciones…" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Fecha límite</label>
            <input type="date" value={fechaLimite} onChange={(e) => setFechaLimite(e.target.value)} className="field w-full" />
          </div>
          <div>
            <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Prioridad</label>
            <select value={prioridad} onChange={(e) => setPrioridad(e.target.value as TareaPersonalPrioridad)} className="field w-full">
              {PRIORIDADES.map((p) => (
                <option key={p.value} value={p.value}>{p.label}</option>
              ))}
            </select>
          </div>
        </div>

        <Button onClick={handleSubmit} isLoading={crear.isPending} className="w-full">
          Asignar tarea
        </Button>
      </div>
    </Modal>
  )
}
