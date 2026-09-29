import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import { Briefcase, Package, ChevronDown, ChevronUp, Link2, Plus, Ban, Info } from 'lucide-react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { getApiError } from '@/lib/axios'
import { proyectosService } from '@/services/proyectos.service'
import { IntegrantesEditor } from './IntegrantesEditor'
import type {
  SugerenciaProyecto, ItemProyectoProducto, IntegranteProyecto, ProyectoEstado, ProyectoExistente,
} from '@/types/proyecto.types'

type Modo = 'nuevo' | 'existente' | 'omitir'
interface Borrador {
  modo: Modo
  proyectoId: number | null
  nombre: string
  descripcion: string
  fechaInicio: string
  fechaFin: string
  estado: ProyectoEstado
  miembros: IntegranteProyecto[]
  abierto: boolean
}

// Un producto que ya tiene proyecto con este cliente empieza en "No crear" para no duplicar.
const borradorDe = (s: SugerenciaProyecto, primero: boolean): Borrador => ({
  modo: s.yaTiene.length ? 'omitir' : 'nuevo',
  proyectoId: null,
  nombre: s.nombre,
  descripcion: s.descripcion,
  fechaInicio: s.fechaInicio,
  fechaFin: s.fechaFin,
  estado: 'Activo',
  miembros: s.miembros,
  abierto: primero && !s.yaTiene.length,
})

function origenTexto(s: SugerenciaProyecto) {
  const o = s.origenMiembros
  if (!o) return 'Agrega a los integrantes y su rol.'
  if (o.tipo === 'proyecto') return `Integrantes y roles del último proyecto de este producto ("${o.nombre}").`
  if (o.tipo === 'responsable') return 'Líder: el ejecutivo responsable del cliente (este producto aún no tiene proyectos).'
  return 'Líder: tú (este producto aún no tiene proyectos y el cliente no tiene responsable).'
}

/**
 * Al asignar productos a un cliente (Clientes), propone crear el proyecto de
 * cada producto con la información precargada: nombre, descripción, fechas
 * según su recurrencia e integrantes con sus roles. También permite ligar un
 * proyecto que el cliente ya tiene o no crear nada.
 */
export function ProyectosDesdeProductosModal({ clienteId, clienteNombre, productoIds, onClose }: {
  clienteId: number
  clienteNombre: string
  productoIds: number[]
  onClose: () => void
}) {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['proyectos-prellenado', clienteId, productoIds.join(',')],
    queryFn: () => proyectosService.prellenado(clienteId, productoIds),
    gcTime: 0,
  })
  // Lo que el usuario edita, por producto (se inicia con la sugerencia).
  const [cambios, setCambios] = useState<Record<number, Borrador>>({})
  const sugerencias = data?.sugerencias ?? []
  const existentes = data?.existentes ?? []
  const borrador = (s: SugerenciaProyecto, i: number) => cambios[s.productoId] ?? borradorDe(s, i === 0)
  const set = (s: SugerenciaProyecto, i: number, patch: Partial<Borrador>) =>
    setCambios((c) => ({ ...c, [s.productoId]: { ...borrador(s, i), ...patch } }))

  const items: ItemProyectoProducto[] = sugerencias.flatMap((s, i): ItemProyectoProducto[] => {
    const b = borrador(s, i)
    if (b.modo === 'nuevo') {
      return [{ productoId: s.productoId, modo: 'nuevo' as const, nombre: b.nombre.trim(), descripcion: b.descripcion, fechaInicio: b.fechaInicio, fechaFin: b.fechaFin, estado: b.estado, miembros: b.miembros }]
    }
    if (b.modo === 'existente' && b.proyectoId) return [{ productoId: s.productoId, modo: 'existente' as const, proyectoId: b.proyectoId }]
    return []
  })
  const nuevos = items.filter((i) => i.modo === 'nuevo')
  const faltaNombre = nuevos.some((i) => !i.nombre)
  const faltaExistente = sugerencias.some((s, i) => borrador(s, i).modo === 'existente' && !borrador(s, i).proyectoId)

  const crear = useMutation({
    mutationFn: () => proyectosService.crearDesdeProductos(clienteId, items),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      const partes = [
        r.creados.length ? `${r.creados.length} proyecto${r.creados.length > 1 ? 's' : ''} creado${r.creados.length > 1 ? 's' : ''}` : null,
        r.vinculados ? `${r.vinculados} vinculado${r.vinculados > 1 ? 's' : ''}` : null,
      ].filter(Boolean)
      toast.success(partes.length ? `${partes.join(' y ')} para ${clienteNombre}` : 'Listo')
      onClose()
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="" size="xl">
      <div className="mb-4 rounded-xl bg-gradient-to-r from-brand to-indigo-500 px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20">
            <Briefcase className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-[0.95rem] font-bold leading-tight text-white">¿Crear los proyectos de {productoIds.length > 1 ? 'estos productos' : 'este producto'}?</p>
            <p className="mt-0.5 text-[0.7rem] text-white/75">
              {clienteNombre} · cada proyecto queda ligado al cliente y a su producto, con la información precargada. Revísala y ajústala.
            </p>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner size="lg" /></div>
      ) : error ? (
        <p className="py-8 text-center text-sm text-red-600">{getApiError(error)}</p>
      ) : (
        <div className="max-h-[62vh] space-y-3 overflow-y-auto pr-1">
          {sugerencias.map((s, i) => {
            const b = borrador(s, i)
            const opcionesExistentes: ProyectoExistente[] = [...existentes].sort((a, z) => Number(!!a.productoId) - Number(!!z.productoId))
            return (
              <div key={s.productoId} className={clsx('rounded-xl border p-3 transition', b.modo === 'omitir' ? 'border-gray-100 bg-gray-50/60' : 'border-gray-200 bg-card')}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand"><Package className="h-4 w-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.85rem] font-semibold text-gray-800">{s.productoNombre}</p>
                    <p className="text-[0.64rem] uppercase tracking-wide text-gray-400">
                      {s.productoTipo === 'SERVICIO' ? 'Servicio' : 'Producto'}{s.recurrencia ? ` · ${s.recurrencia.toLowerCase()}` : ''}
                    </p>
                  </div>
                  <div className="flex overflow-hidden rounded-lg border border-gray-200 text-[0.7rem] font-semibold">
                    {([['nuevo', 'Crear proyecto', Plus], ['existente', 'Vincular existente', Link2], ['omitir', 'No crear', Ban]] as const).map(([m, label, Icon]) => (
                      <button key={m} type="button" disabled={m === 'existente' && !existentes.length}
                        onClick={() => set(s, i, { modo: m, abierto: m === 'nuevo' ? true : b.abierto })}
                        title={m === 'existente' && !existentes.length ? 'El cliente todavía no tiene proyectos' : undefined}
                        className={clsx('flex items-center gap-1 px-2.5 py-1 transition disabled:cursor-not-allowed disabled:opacity-40',
                          b.modo === m ? (m === 'omitir' ? 'bg-gray-200 text-gray-700' : 'bg-brand/10 text-brand') : 'bg-white text-gray-500 hover:bg-gray-50')}>
                        <Icon className="h-3 w-3" /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                {s.yaTiene.length > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-[0.7rem] text-amber-700">
                    <Info className="h-3.5 w-3.5 flex-shrink-0" /> El cliente ya tiene {s.yaTiene.length === 1 ? `el proyecto "${s.yaTiene[0].nombre}"` : `${s.yaTiene.length} proyectos`} de este producto.
                  </p>
                )}

                {b.modo === 'existente' && (
                  <select className="field mt-2 text-sm" value={b.proyectoId ?? ''} onChange={(e) => set(s, i, { proyectoId: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Elige el proyecto del cliente…</option>
                    {opcionesExistentes.map((p) => (
                      <option key={p.id} value={p.id}>{p.nombre}{p.productoNombre ? ` (ahora ligado a ${p.productoNombre})` : ' (sin producto)'} · {p.estado}</option>
                    ))}
                  </select>
                )}

                {b.modo === 'nuevo' && (
                  <>
                    <button type="button" onClick={() => set(s, i, { abierto: !b.abierto })}
                      className="mt-2 flex w-full items-center justify-between rounded-lg bg-gray-50 px-2.5 py-1.5 text-left text-[0.75rem] text-gray-600 hover:bg-gray-100">
                      <span className="min-w-0 truncate"><b className="text-gray-800">{b.nombre || '(sin nombre)'}</b> · vence {b.fechaFin || '—'} · {b.miembros.length} integrante{b.miembros.length !== 1 ? 's' : ''}</span>
                      {b.abierto ? <ChevronUp className="h-3.5 w-3.5 flex-shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 flex-shrink-0" />}
                    </button>
                    {b.abierto && (
                      <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-3">
                          <div>
                            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Nombre</label>
                            <input className="field" value={b.nombre} onChange={(e) => set(s, i, { nombre: e.target.value })} />
                          </div>
                          <div>
                            <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Descripción</label>
                            <textarea className="field resize-none" rows={2} value={b.descripcion} onChange={(e) => set(s, i, { descripcion: e.target.value })} />
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Inicio</label>
                              <input type="date" className="field text-sm" value={b.fechaInicio} onChange={(e) => set(s, i, { fechaInicio: e.target.value })} />
                            </div>
                            <div>
                              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Fin</label>
                              <input type="date" className="field text-sm" min={b.fechaInicio || undefined} value={b.fechaFin} onChange={(e) => set(s, i, { fechaFin: e.target.value })} />
                            </div>
                            <div>
                              <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Estado</label>
                              <select className="field text-sm" value={b.estado} onChange={(e) => set(s, i, { estado: e.target.value as ProyectoEstado })}>
                                <option value="Activo">Activo</option>
                                <option value="Pausado">Pausado</option>
                              </select>
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="mb-1 block text-[0.68rem] font-semibold uppercase tracking-wide text-gray-500">Integrantes y roles</label>
                          <p className="mb-1.5 text-[0.66rem] text-gray-400">{origenTexto(s)}</p>
                          <IntegrantesEditor value={b.miembros} onChange={(v) => set(s, i, { miembros: v })} alto="max-h-32" />
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
        <p className="text-[0.7rem] text-gray-400">También puedes crearlos después desde Proyectos → Nuevo proyecto.</p>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onClose}>Ahora no</Button>
          <Button isLoading={crear.isPending} disabled={!items.length || faltaNombre || faltaExistente} onClick={() => crear.mutate()}>
            {nuevos.length ? `Crear ${nuevos.length} proyecto${nuevos.length > 1 ? 's' : ''}` : 'Vincular'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
