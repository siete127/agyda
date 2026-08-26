import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES, type ClienteEstatusColor } from '@/types/crm.types'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const MEDIOS_CONTACTO = ['Referido', 'Llamada', 'Web', 'Redes sociales', 'Otro']

export function NuevoClienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()

  const [nombre, setNombre] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tipoCliente, setTipoCliente] = useState('')
  const [productoServicio, setProductoServicio] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [medioContacto, setMedioContacto] = useState('')
  const [estatusCliente, setEstatusCliente] = useState<ClienteEstatusColor>('verde')
  const [observacionesIniciales, setObservacionesIniciales] = useState('')

  const crear = useMutation({
    mutationFn: async () => {
      const { data: creado } = await crmService.createContacto({ nombre: nombre.trim(), empresa: empresa || undefined, telefono: telefono || undefined, correo: correo || undefined })
      const id = creado?.data?.id
      if (!id) throw new Error('No se pudo crear el contacto')
      await crmService.altaCliente(id, {
        tipoCliente: tipoCliente || undefined,
        direccion: direccion || undefined,
        productoServicio: productoServicio || undefined,
        responsableId: responsableId ? Number(responsableId) : undefined,
        estatusCliente,
        medioContacto: medioContacto || undefined,
        observacionesIniciales: observacionesIniciales || undefined,
      })
      return id as number
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ['clientes-lista'] })
      toast.success('Cliente registrado')
      onCreated(id)
    },
    onError: () => toast.error('No se pudo registrar el cliente'),
  })

  const puedeGuardar = nombre.trim().length > 0

  return (
    <Modal isOpen onClose={onClose} title="Nuevo cliente" size="lg">
      <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre completo / Razón social *</label>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="field" placeholder="Nombre del cliente" autoFocus maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Empresa</label>
            <input value={empresa} onChange={(e) => setEmpresa(e.target.value)} className="field" maxLength={200} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de cliente</label>
            <input value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value)} className="field" placeholder="Persona física, moral..." maxLength={50} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Teléfono</label>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="field" maxLength={30} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Correo electrónico</label>
            <input value={correo} onChange={(e) => setCorreo(e.target.value)} className="field" type="email" maxLength={200} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Dirección</label>
            <input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="field" maxLength={300} />
          </div>
          <div className="col-span-2">
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Producto o servicio contratado</label>
            <input value={productoServicio} onChange={(e) => setProductoServicio(e.target.value)} className="field" maxLength={300} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Ejecutivo responsable</label>
            <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Medio de contacto</label>
            <select value={medioContacto} onChange={(e) => setMedioContacto(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {MEDIOS_CONTACTO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estatus inicial</label>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {CLIENTE_ESTATUS_COLORES.map((cfg) => (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setEstatusCliente(cfg.key)}
                title={cfg.label}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-[0.65rem] font-semibold transition-all',
                  estatusCliente === cfg.key ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300',
                )}
              >
                <span className={clsx('h-2 w-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Observaciones iniciales</label>
          <textarea
            value={observacionesIniciales}
            onChange={(e) => setObservacionesIniciales(e.target.value)}
            rows={3}
            className="field resize-none"
            placeholder="Notas relevantes sobre el alta del cliente (opcional)"
          />
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>
            Registrar cliente
          </Button>
        </div>
      </div>
    </Modal>
  )
}
