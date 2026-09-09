import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { crmService } from '@/services/crm.service'
import { casoService } from '@/services/caso.service'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'
import {
  CASO_TIPO_CONFIG, PRIORIDAD_CASO_CONFIG, CATEGORIAS_CASO,
  type CasoTipo, type CasoPrioridad,
} from '@/types/caso.types'

// Modal único que reemplaza NuevaConsultaModal / NuevaAclaracionModal /
// NuevaQuejaModal / NuevaIncidenciaModal. El selector de tipo arriba adapta
// qué campos se muestran, replicando lo que cada modal viejo pedía.
export function NuevoCasoModal({ onClose, onCreated, contactoPreset }: {
  onClose: () => void
  onCreated?: (id: number) => void
  // Cuando se abre desde el expediente de un cliente: el contacto viene fijo.
  contactoPreset?: { id: number; nombre: string }
}) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [tipo, setTipo] = useState<CasoTipo>('consulta')
  const [contactoId, setContactoId] = useState(contactoPreset ? String(contactoPreset.id) : '')
  const [clienteNombreLibre, setClienteNombreLibre] = useState(contactoPreset?.nombre ?? '')
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [referencia, setReferencia] = useState('')
  const [categoria, setCategoria] = useState('')
  const [prioridad, setPrioridad] = useState<CasoPrioridad>('media')
  const [asignadoA, setAsignadoA] = useState('')

  const { data: clientes } = useQuery({
    queryKey: ['clientes-lista'],
    queryFn: () => crmService.getClientes(),
    staleTime: 60_000,
  })

  const seleccionarCliente = (id: string) => {
    setContactoId(id)
    const c = clientes?.find((x) => String(x.id) === id)
    if (c) setClienteNombreLibre(c.nombre)
  }

  // Etiquetas y reglas por tipo (equivalentes a los modales viejos).
  const esQueja = tipo === 'queja'
  const esIncidencia = tipo === 'incidencia'
  const muestraCliente = !esQueja // consulta/aclaracion/incidencia llevan cliente
  const tituloLabel = tipo === 'aclaracion' ? 'Motivo' : esQueja ? 'Título' : 'Asunto'
  const descLabel = tipo === 'aclaracion' ? 'Detalle' : esQueja || esIncidencia ? 'Descripción' : 'Mensaje'

  const crear = useMutation({
    mutationFn: () => casoService.create({
      tipo,
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      contactoId: contactoId ? Number(contactoId) : undefined,
      clienteNombreLibre: muestraCliente && !contactoId && clienteNombreLibre.trim() ? clienteNombreLibre.trim() : undefined,
      referencia: tipo === 'aclaracion' && referencia.trim() ? referencia.trim() : undefined,
      categoria: esIncidencia && categoria ? categoria : undefined,
      prioridad: esIncidencia ? prioridad : undefined,
      asignadoA: esIncidencia && asignadoA ? Number(asignadoA) : undefined,
    }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['casos'] })
      const cid = contactoId ? Number(contactoId) : contactoPreset?.id
      if (cid) qc.invalidateQueries({ queryKey: ['cliente-casos', cid] })
      toast.success(`Caso ${r?.data?.folio ?? ''} registrado`)
      onCreated?.(r?.data?.id)
      onClose()
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message
      toast.error(msg ?? 'No se pudo registrar el caso')
    },
  })

  const puedeGuardar = titulo.trim() && (esQueja || contactoId || clienteNombreLibre.trim())

  return (
    <Modal isOpen onClose={onClose} title="Nuevo caso" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de caso</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(CASO_TIPO_CONFIG) as CasoTipo[]).map((t) => {
              const cfg = CASO_TIPO_CONFIG[t]
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTipo(t)}
                  className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all',
                    tipo === t ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300')}
                >
                  {cfg.label}
                </button>
              )
            })}
          </div>
        </div>

        {muestraCliente && contactoPreset ? (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
            <input value={contactoPreset.nombre} disabled className="field bg-gray-50 text-gray-500" />
          </div>
        ) : muestraCliente && (
          <>
            {clientes && clientes.length > 0 && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente registrado{esIncidencia ? '' : ' (opcional)'}</label>
                <select value={contactoId} onChange={(e) => seleccionarCliente(e.target.value)} className="field">
                  <option value="">{esIncidencia ? 'Selecciona un cliente' : 'Escribir manualmente'}</option>
                  {clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>
            )}
            {!esIncidencia && (
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre del cliente</label>
                <input value={clienteNombreLibre} onChange={(e) => { setClienteNombreLibre(e.target.value); setContactoId('') }}
                  className="field" placeholder="Nombre completo" maxLength={200} />
              </div>
            )}
          </>
        )}

        {tipo === 'aclaracion' && (
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Referencia (folio / orden / factura)</label>
            <input value={referencia} onChange={(e) => setReferencia(e.target.value)} className="field" placeholder="FAC-1234" maxLength={100} />
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{tituloLabel}</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" placeholder={`Breve descripción`} maxLength={200} autoFocus />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">{descLabel}</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={4} className="field resize-none" placeholder="Detalle del caso..." />
        </div>

        {esIncidencia && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Categoría</label>
                <select value={categoria} onChange={(e) => setCategoria(e.target.value)} className="field">
                  <option value="">Sin especificar</option>
                  {CATEGORIAS_CASO.map((c) => <option key={c} value={c}>{c}</option>)}
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
                {(Object.keys(PRIORIDAD_CASO_CONFIG) as CasoPrioridad[]).map((p) => {
                  const cfg = PRIORIDAD_CASO_CONFIG[p]
                  return (
                    <button key={p} type="button" onClick={() => setPrioridad(p)}
                      className={clsx('rounded-xl border-2 py-2 text-[0.72rem] font-semibold transition-all',
                        prioridad === p ? `${cfg.bg} ${cfg.text} border-current` : 'border-gray-200 text-gray-400 hover:border-gray-300')}>
                      {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button isLoading={crear.isPending} disabled={!puedeGuardar} onClick={() => crear.mutate()}>Registrar caso</Button>
        </div>
      </div>
    </Modal>
  )
}
