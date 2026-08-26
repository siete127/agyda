import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Plus, Trash2, Check, Calendar } from 'lucide-react'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { clienteSeguimientoService } from '@/services/clienteSeguimiento.service'
import { PRIORIDAD_CONFIG, ESTATUS_TAREA_CONFIG, TIPO_TAREA_LABEL, type Prioridad, type TipoTarea, type CliTarea } from '@/types/clienteSeguimiento.types'
import { useActionAccess } from '@/hooks/useActionAccess'
import { useUsuariosSimple } from '@/pages/direccion-general/useUsuariosSimple'

function NuevaTareaModal({ contactoId, onClose }: { contactoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const { data: usuarios } = useUsuariosSimple()
  const [tipo, setTipo] = useState<TipoTarea>('llamar_cliente')
  const [titulo, setTitulo] = useState(TIPO_TAREA_LABEL.llamar_cliente)
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<Prioridad>('media')
  const [asignadoA, setAsignadoA] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')

  const handleTipoChange = (t: TipoTarea) => {
    setTipo(t)
    // El título sigue al tipo elegido salvo que el usuario ya lo haya editado a mano.
    if (!titulo.trim() || Object.values(TIPO_TAREA_LABEL).includes(titulo)) setTitulo(TIPO_TAREA_LABEL[t])
  }

  const crear = useMutation({
    mutationFn: () => clienteSeguimientoService.createTarea(contactoId, {
      tipo, titulo: titulo.trim(), descripcion: descripcion || undefined, prioridad,
      asignadoA: asignadoA ? Number(asignadoA) : undefined, fechaVencimiento: fechaVencimiento || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-tareas', contactoId] })
      toast.success('Tarea creada')
      onClose()
    },
    onError: () => toast.error('No se pudo crear la tarea'),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nueva tarea" size="md">
      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Tipo de actividad</label>
          <select value={tipo} onChange={(e) => handleTipoChange(e.target.value as TipoTarea)} className="field" autoFocus>
            {(Object.keys(TIPO_TAREA_LABEL) as TipoTarea[]).map((t) => (
              <option key={t} value={t}>{TIPO_TAREA_LABEL[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Actividad</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field" maxLength={200} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} rows={2} className="field resize-none" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Responsable</label>
            <select value={asignadoA} onChange={(e) => setAsignadoA(e.target.value)} className="field">
              <option value="">Sin asignar</option>
              {usuarios?.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha límite</label>
            <input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} className="field" />
          </div>
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Prioridad</label>
          <div className="grid grid-cols-4 gap-1.5">
            {(Object.keys(PRIORIDAD_CONFIG) as Prioridad[]).map((p) => {
              const cfg = PRIORIDAD_CONFIG[p]
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
          <Button isLoading={crear.isPending} disabled={!titulo.trim()} onClick={() => crear.mutate()}>Crear tarea</Button>
        </div>
      </div>
    </Modal>
  )
}

function TareaRow({ tarea, contactoId, puedeGestionar, showCliente }: { tarea: CliTarea; contactoId: number; puedeGestionar: boolean; showCliente?: boolean }) {
  const qc = useQueryClient()
  const estCfg = ESTATUS_TAREA_CONFIG[tarea.estatus]
  const prioCfg = PRIORIDAD_CONFIG[tarea.prioridad]

  const completar = useMutation({
    mutationFn: () => clienteSeguimientoService.updateTareaEstatus(tarea.id, 'completada'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-tareas', contactoId] })
      qc.invalidateQueries({ queryKey: ['tareas-mias'] })
      toast.success('Tarea completada')
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const eliminar = useMutation({
    mutationFn: () => clienteSeguimientoService.deleteTarea(tarea.id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cliente-tareas', contactoId] })
      qc.invalidateQueries({ queryKey: ['tareas-mias'] })
      toast.success('Tarea eliminada')
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className={clsx('text-[0.8rem] font-semibold', tarea.estatus === 'completada' ? 'text-gray-400 line-through' : 'text-gray-800')}>{tarea.titulo}</p>
          <span className={clsx('rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', prioCfg.bg, prioCfg.text)}>{prioCfg.label}</span>
          <span className={clsx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold', estCfg.bg, estCfg.text)}>
            <span className={clsx('h-1.5 w-1.5 rounded-full', estCfg.dot)} /> {estCfg.label}
          </span>
        </div>
        <p className="mt-0.5 text-[0.68rem] font-medium text-brand">{TIPO_TAREA_LABEL[tarea.tipo]}</p>
        {showCliente && tarea.contactoNombre && <p className="mt-0.5 text-[0.7rem] text-gray-500">{tarea.contactoNombre}</p>}
        {tarea.descripcion && <p className="mt-0.5 text-xs text-gray-500">{tarea.descripcion}</p>}
        <div className="mt-1 flex items-center gap-3 text-[0.68rem] text-gray-400">
          {tarea.fechaVencimiento && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(tarea.fechaVencimiento).toLocaleDateString('es-MX')}</span>}
          {tarea.asignadoNombre && <span>{tarea.asignadoNombre}</span>}
        </div>
      </div>
      {puedeGestionar && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {tarea.estatus !== 'completada' && (
            <button onClick={() => completar.mutate()} title="Marcar completada" className="rounded-lg p-1.5 text-gray-400 hover:bg-emerald-50 hover:text-emerald-600 transition-colors">
              <Check className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => { if (window.confirm('¿Eliminar esta tarea?')) eliminar.mutate() }}
            title="Eliminar"
            className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

export function TareasTab({ contactoId }: { contactoId: number }) {
  const { can } = useActionAccess()
  const puedeGestionar = can('atencion-cliente', 'clientes-tareas')
  const [showNueva, setShowNueva] = useState(false)

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['cliente-tareas', contactoId],
    queryFn: () => clienteSeguimientoService.getTareasByContacto(contactoId),
    staleTime: 15_000,
  })

  return (
    <div className="rounded-2xl border border-gray-200/60 bg-white shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <p className="text-[0.8rem] font-bold text-gray-700">Tareas</p>
        {puedeGestionar && (
          <button onClick={() => setShowNueva(true)} className="flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-[0.72rem] font-bold text-white hover:bg-brand-dark transition-colors">
            <Plus className="h-3.5 w-3.5" /> Nueva tarea
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner size="sm" /></div>
      ) : tareas.length === 0 ? (
        <p className="py-10 text-center text-[0.78rem] text-gray-400">Sin tareas registradas</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {tareas.map((t) => <TareaRow key={t.id} tarea={t} contactoId={contactoId} puedeGestionar={puedeGestionar} />)}
        </div>
      )}
      {showNueva && <NuevaTareaModal contactoId={contactoId} onClose={() => setShowNueva(false)} />}
    </div>
  )
}

export { TareaRow }
