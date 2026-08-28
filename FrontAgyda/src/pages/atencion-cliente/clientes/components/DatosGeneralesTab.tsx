import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { CLIENTE_ESTATUS_COLORES, type CRMContacto, type ClienteEstatusColor } from '@/types/crm.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const MEDIOS_CONTACTO = ['Referido', 'Llamada', 'Web', 'Redes sociales', 'Otro']

function Campo({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-0.5 text-sm text-gray-800">{value || '—'}</p>
    </div>
  )
}

export function DatosGeneralesTab({ cliente }: { cliente: CRMContacto }) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'clientes-gestionar')
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [editando, setEditando] = useState(false)

  const [tipoCliente, setTipoCliente] = useState(cliente.tipoCliente ?? '')
  const [direccion, setDireccion] = useState(cliente.direccion ?? '')
  const [productoServicio, setProductoServicio] = useState(cliente.productoServicio ?? '')
  const [responsableId, setResponsableId] = useState(cliente.responsableId ? String(cliente.responsableId) : '')
  const [medioContacto, setMedioContacto] = useState(cliente.medioContacto ?? '')
  const [estatusCliente, setEstatusCliente] = useState<ClienteEstatusColor>(cliente.estatusCliente)
  const [observacionesIniciales, setObservacionesIniciales] = useState(cliente.observacionesIniciales ?? '')

  const responsableNombre = usuarios?.find((u) => u.id === cliente.responsableId)?.nombre

  const guardar = useMutation({
    mutationFn: () => crmService.altaCliente(cliente.id, {
      tipoCliente: tipoCliente || undefined,
      direccion: direccion || undefined,
      productoServicio: productoServicio || undefined,
      responsableId: responsableId ? Number(responsableId) : undefined,
      estatusCliente,
      medioContacto: medioContacto || undefined,
      observacionesIniciales: observacionesIniciales || undefined,
    }),
    onSuccess: () => {
      toast.success('Datos actualizados')
      qc.invalidateQueries({ queryKey: ['cliente-expediente', cliente.id] })
      setEditando(false)
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const cfgActual = CLIENTE_ESTATUS_COLORES.find((e) => e.key === cliente.estatusCliente) ?? CLIENTE_ESTATUS_COLORES[0]

  if (!editando) {
    return (
      <div className="space-y-3">
        {!cliente.esCliente && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[0.78rem] text-amber-700">
            Este contacto viene de Ventas (CRM Interno) y aún no tiene alta formal como cliente.
            {puedeGestionar ? ' Completa sus datos y guarda para activar seguimiento, tareas e incidencias.' : ''}
          </div>
        )}
        <div className="rounded-2xl border border-gray-200/60 bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <p className="text-[0.8rem] font-bold text-gray-700">Datos generales</p>
            {puedeGestionar && (
              <button onClick={() => setEditando(true)} className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-[0.72rem] font-semibold text-gray-600 hover:bg-gray-50 transition-colors">
                <Pencil className="h-3.5 w-3.5" /> {cliente.esCliente ? 'Editar' : 'Completar alta'}
              </button>
            )}
          </div>
        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-semibold', cfgActual.bg, cfgActual.text)}>
              <span className={clsx('h-1.5 w-1.5 rounded-full', cfgActual.dot)} /> {cfgActual.label}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Campo label="Empresa" value={cliente.empresa} />
            <Campo label="Tipo de cliente" value={cliente.tipoCliente} />
            <Campo label="Teléfono" value={cliente.telefono} />
            <Campo label="Correo" value={cliente.correo} />
            <Campo label="Dirección" value={cliente.direccion} />
            <Campo label="Producto/servicio contratado" value={cliente.productoServicio} />
            <Campo label="Responsable" value={responsableNombre} />
            <Campo label="Medio de contacto" value={cliente.medioContacto} />
          </div>
          {cliente.observacionesIniciales && (
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Observaciones iniciales</p>
              <p className="mt-0.5 text-sm text-gray-700 leading-relaxed">{cliente.observacionesIniciales}</p>
            </div>
          )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border-2 border-brand/30 bg-brand/5 overflow-hidden">
      <div className="flex items-center justify-between border-b border-brand/10 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Editar datos generales</p>
        <button onClick={() => setEditando(false)} className="rounded-lg p-1 text-gray-400 hover:bg-card hover:text-gray-600 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de cliente</label>
            <input value={tipoCliente} onChange={(e) => setTipoCliente(e.target.value)} className="field" maxLength={50} />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Responsable</label>
            <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
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
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Medio de contacto</label>
            <select value={medioContacto} onChange={(e) => setMedioContacto(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {MEDIOS_CONTACTO.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estatus</label>
          <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-7">
            {CLIENTE_ESTATUS_COLORES.map((cfg) => (
              <button
                key={cfg.key}
                type="button"
                onClick={() => setEstatusCliente(cfg.key)}
                title={cfg.label}
                className={clsx(
                  'flex flex-col items-center gap-1 rounded-xl border-2 py-2 text-[0.65rem] font-semibold transition-all',
                  estatusCliente === cfg.key ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 bg-card text-gray-400 hover:border-gray-300',
                )}
              >
                <span className={clsx('h-2 w-2 rounded-full', cfg.dot)} />
                {cfg.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Observaciones</label>
          <textarea value={observacionesIniciales} onChange={(e) => setObservacionesIniciales(e.target.value)} rows={3} className="field resize-none" />
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          <Button isLoading={guardar.isPending} onClick={() => guardar.mutate()}>
            <Check className="h-3.5 w-3.5" /> Guardar cambios
          </Button>
        </div>
      </div>
    </div>
  )
}
