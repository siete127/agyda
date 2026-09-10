import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { citaService } from '@/services/cita.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

export function NuevoTratamientoModal({ contactoId, clienteNombre, onClose, onCreated }: {
  contactoId: number
  clienteNombre: string
  onClose: () => void
  onCreated?: (id: number) => void
}) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [nombre, setNombre] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [totalSesiones, setTotalSesiones] = useState('')
  const [asignadoA, setAsignadoA] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')

  const crear = useMutation({
    mutationFn: () => citaService.createTratamiento({
      contactoId,
      nombre: nombre.trim(),
      descripcion: descripcion.trim() || undefined,
      totalSesiones: totalSesiones ? Number(totalSesiones) : undefined,
      asignadoA: asignadoA ? Number(asignadoA) : undefined,
      fechaInicio: fechaInicio || undefined,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['cliente-tratamientos', contactoId] })
      toast.success('Tratamiento creado')
      onCreated?.(r?.data?.id)
      onClose()
    },
    onError: () => toast.error('No se pudo crear el tratamiento'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo tratamiento" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
          <input value={clienteNombre} disabled className="field bg-gray-50 text-gray-500" />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre del tratamiento</label>
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Ej. Plan de seguimiento fiscal" maxLength={200} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción (opcional)</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="field resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Total de sesiones</label>
            <input type="number" min={1} value={totalSesiones} onChange={(e) => setTotalSesiones(e.target.value)} className="field" placeholder="Ej. 6" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Inicio</label>
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Responsable</label>
          <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className="field">
            <option value="">Sin asignar</option>
            {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
          </select>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!nombre.trim()} onClick={() => crear.mutate()}>Crear</Button>
        </div>
      </div>
    </Modal>
  )
}
