import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { crmCatalogosClienteService } from '@/services/crmCatalogosCliente.service'
import { CLIENTE_ESTATUS_COLORES, type ClienteEstatusColor } from '@/types/crm.types'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

const MEDIOS_CONTACTO = ['Referido', 'Llamada', 'Web', 'Redes sociales', 'Otro']

export function NuevoClienteModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()

  const { data: tipos } = useQuery({ queryKey: ['crm-catalogo-tipos-cliente'], queryFn: () => crmCatalogosClienteService.tipos.list() })
  const { data: segmentos } = useQuery({ queryKey: ['crm-catalogo-segmentos'], queryFn: () => crmCatalogosClienteService.segmentos.list() })
  const { data: categorias } = useQuery({ queryKey: ['crm-catalogo-categorias-cliente'], queryFn: () => crmCatalogosClienteService.categorias.list() })
  const { data: industrias } = useQuery({ queryKey: ['crm-catalogo-industrias'], queryFn: () => crmCatalogosClienteService.industrias.list() })
  const { data: clasificaciones } = useQuery({ queryKey: ['crm-catalogo-clasificaciones-cliente'], queryFn: () => crmCatalogosClienteService.clasificaciones.list() })
  const { data: etiquetas } = useQuery({ queryKey: ['crm-catalogo-etiquetas'], queryFn: () => crmCatalogosClienteService.etiquetas.list() })
  const { data: tiposAcceso } = useQuery({ queryKey: ['crm-catalogo-tipos-acceso-portal'], queryFn: () => crmCatalogosClienteService.tiposAcceso.list() })

  const [nombre, setNombre] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [telefono, setTelefono] = useState('')
  const [correo, setCorreo] = useState('')
  const [direccion, setDireccion] = useState('')
  const [tipoClienteId, setTipoClienteId] = useState('')
  const [segmentoId, setSegmentoId] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [industriaId, setIndustriaId] = useState('')
  const [clasificacionId, setClasificacionId] = useState('')
  const [etiquetaIds, setEtiquetaIds] = useState<number[]>([])
  const [productoServicio, setProductoServicio] = useState('')
  const [responsableId, setResponsableId] = useState('')
  const [medioContacto, setMedioContacto] = useState('')
  const [estatusCliente, setEstatusCliente] = useState<ClienteEstatusColor>('verde')
  const [observacionesIniciales, setObservacionesIniciales] = useState('')
  const [generarAccesoPortal, setGenerarAccesoPortal] = useState(false)
  const [passwordPortal, setPasswordPortal] = useState('')
  const [tipoAccesoId, setTipoAccesoId] = useState('')
  const [enviarInvitacion, setEnviarInvitacion] = useState(true)

  const toggleEtiqueta = (id: number) =>
    setEtiquetaIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))

  const crear = useMutation({
    mutationFn: async () => {
      const { data: creado } = await crmService.createContacto({ nombre: nombre.trim(), empresa: empresa || undefined, telefono: telefono || undefined, correo: correo || undefined })
      const id = creado?.data?.id
      if (!id) throw new Error('No se pudo crear el contacto')
      await crmService.altaCliente(id, {
        direccion: direccion || undefined,
        productoServicio: productoServicio || undefined,
        responsableId: responsableId ? Number(responsableId) : undefined,
        estatusCliente,
        medioContacto: medioContacto || undefined,
        observacionesIniciales: observacionesIniciales || undefined,
        tipoClienteId: tipoClienteId ? Number(tipoClienteId) : undefined,
        segmentoId: segmentoId ? Number(segmentoId) : undefined,
        categoriaId: categoriaId ? Number(categoriaId) : undefined,
        industriaId: industriaId ? Number(industriaId) : undefined,
        clasificacionId: clasificacionId ? Number(clasificacionId) : undefined,
        etiquetaIds,
        generarAccesoPortal: generarAccesoPortal || undefined,
        passwordPortal: generarAccesoPortal && passwordPortal ? passwordPortal : undefined,
        tipoAccesoId: generarAccesoPortal && tipoAccesoId ? Number(tipoAccesoId) : undefined,
        enviarInvitacion: generarAccesoPortal ? enviarInvitacion : undefined,
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
            <select value={tipoClienteId} onChange={(e) => setTipoClienteId(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {tipos?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Segmento</label>
            <select value={segmentoId} onChange={(e) => setSegmentoId(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {segmentos?.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
            <select value={categoriaId} onChange={(e) => setCategoriaId(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {categorias?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Industria</label>
            <select value={industriaId} onChange={(e) => setIndustriaId(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {industrias?.map((i) => <option key={i.id} value={i.id}>{i.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Clasificación</label>
            <select value={clasificacionId} onChange={(e) => setClasificacionId(e.target.value)} className="field">
              <option value="">Sin especificar</option>
              {clasificaciones?.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
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

        {etiquetas && etiquetas.length > 0 && (
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Etiquetas</label>
            <div className="flex flex-wrap gap-1.5">
              {etiquetas.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleEtiqueta(e.id)}
                  className={clsx(
                    'rounded-full border px-3 py-1 text-[0.72rem] font-medium transition-colors',
                    etiquetaIds.includes(e.id) ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300',
                  )}
                >
                  {e.nombre}
                </button>
              ))}
            </div>
          </div>
        )}

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

        <div className="rounded-xl border border-gray-100 p-3 space-y-2.5">
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={generarAccesoPortal} onChange={(e) => setGenerarAccesoPortal(e.target.checked)} />
            <span>
              <span className="block text-xs font-semibold text-gray-700">Generar acceso al portal de cliente</span>
              <span className="block text-[0.68rem] text-gray-400">Crea un usuario de login para que el cliente entre a su propio portal.</span>
            </span>
          </label>
          {generarAccesoPortal && (
            <>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de acceso</label>
                <select value={tipoAccesoId} onChange={(e) => setTipoAccesoId(e.target.value)} className="field">
                  <option value="">Sin especificar</option>
                  {tiposAcceso?.map((t) => <option key={t.id} value={t.id}>{t.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Contraseña</label>
                <input type="password" value={passwordPortal} onChange={(e) => setPasswordPortal(e.target.value)} className="field" placeholder="Dejar en blanco para asignarla después" />
              </div>
              <label className="flex cursor-pointer items-start gap-2">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-violet-600" checked={enviarInvitacion} onChange={(e) => setEnviarInvitacion(e.target.checked)} />
                <span>
                  <span className="block text-xs font-semibold text-gray-700">Enviar invitación por correo</span>
                  <span className="block text-[0.68rem] text-gray-400">
                    {correo
                      ? `Se enviará a ${correo} con su usuario, contraseña y la liga de acceso.`
                      : 'Captura un correo arriba para poder enviar la invitación.'}
                  </span>
                </span>
              </label>
            </>
          )}
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
