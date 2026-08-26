import React, { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import {
  Plus, RefreshCw, ChevronLeft, Users, Calendar,
  Briefcase, CheckCircle2, Circle, Clock, Ban,
  Pencil, Trash2, GripVertical, X, Settings,
} from 'lucide-react'
import { proyectosService } from '@/services/proyectos.service'
import { api, getApiError } from '@/lib/axios'
import { useAuthStore } from '@/stores/auth.store'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { ProyectosDashboard } from './ProyectosDashboard'
import { ProyectoCronograma } from './ProyectoCronograma'
import { ProyectoCalendario } from './ProyectoCalendario'
import {
  type Proyecto, type Tarea, type TareaEstado, type TareaPrioridad, type ProyectoEstado,
  PROYECTO_ESTADO_COLORS, TAREA_ESTADO_LABELS, TAREA_COLUMNAS,
} from '@/types/proyecto.types'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'

const PRIORIDAD_DOT: Record<string, string> = {
  alta:  'bg-red-500',
  media: 'bg-yellow-400',
  baja:  'bg-emerald-500',
}

const ESTADO_ICON: Record<ProyectoEstado, React.ElementType> = {
  Activo:     CheckCircle2,
  Pausado:    Clock,
  Completado: Circle,
  Cancelado:  Ban,
}

/* ── Skeleton ── */
function SkeletonCard() {
  return (
    <div className="card p-5 animate-pulse space-y-3">
      <div className="flex justify-between">
        <div className="h-4 w-3/5 rounded-lg bg-gray-100" />
        <div className="h-5 w-16 rounded-full bg-gray-100" />
      </div>
      <div className="h-3 w-full rounded-lg bg-gray-100" />
      <div className="h-3 w-4/5 rounded-lg bg-gray-100" />
      <div className="h-1.5 w-full rounded-full bg-gray-100" />
      <div className="flex gap-2">
        <div className="h-3 w-20 rounded-full bg-gray-100" />
        <div className="h-3 w-24 rounded-full bg-gray-100" />
      </div>
    </div>
  )
}

/* ── Tarjeta kanban con drag-and-drop ── */
function TareaCard({ tarea, onMover, onEliminar, onEditar, puedeMover, puedeEliminar, onDragStart, estatusList, proyectoId }: {
  tarea: Tarea
  onMover: (id: number, estado: string) => void
  onEliminar: (id: number) => void
  onEditar: (tarea: Tarea) => void
  puedeMover: boolean
  puedeEliminar: boolean
  onDragStart?: (e: React.DragEvent, id: number) => void
  estatusList?: string[]
  proyectoId: number
}) {
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [checked, setChecked] = useState(false)
  const [notifEnviada, setNotifEnviada] = useState(false)

  async function handleCheck(e: React.MouseEvent) {
    e.stopPropagation()
    if (notifEnviada) return
    const next = !checked
    setChecked(next)
    if (next) {
      try {
        await proyectosService.completarTarea(proyectoId, tarea.id)
        setNotifEnviada(true)
        toast.success('Notificación enviada al líder y revisor')
      } catch {
        setChecked(false)
        toast.error('No se pudo enviar la notificación')
      }
    }
  }

  return (
    <div
      draggable={puedeMover}
      onDragStart={(e) => { setDragging(true); onDragStart?.(e, tarea.id) }}
      onDragEnd={() => setDragging(false)}
      className={clsx(
        'rounded-xl bg-white border transition-all duration-150 p-3 space-y-2',
        dragging ? 'opacity-40 scale-95 border-brand/50' : '',
        !dragging && hovered ? 'border-brand/30 shadow-card-md -translate-y-0.5' : 'border-gray-200/60 shadow-card',
        puedeMover ? 'cursor-grab active:cursor-grabbing' : '',
      )}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-start gap-2">
        {puedeMover && (
          <GripVertical className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-gray-300" />
        )}
        {/* Checkbox de completado — notifica al líder/revisor/creador */}
        <button
          onClick={handleCheck}
          title={notifEnviada ? 'Notificación ya enviada' : 'Marcar como completada y notificar'}
          className={clsx(
            'mt-0.5 flex-shrink-0 h-4 w-4 rounded border-2 flex items-center justify-center transition-all',
            checked
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : 'border-gray-300 hover:border-emerald-400',
          )}
        >
          {checked && <svg className="h-2.5 w-2.5" viewBox="0 0 12 10" fill="none"><path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
        </button>
        <span className={clsx('mt-1.5 h-2 w-2 rounded-full flex-shrink-0', PRIORIDAD_DOT[tarea.prioridad] ?? 'bg-gray-400')} />
        <p className={clsx('flex-1 text-[0.82rem] font-semibold leading-snug', checked ? 'line-through text-gray-400' : 'text-gray-800')}>{tarea.titulo}</p>
        {puedeEliminar && (
          <button
            onClick={() => onEditar(tarea)}
            className="flex-shrink-0 text-gray-300 hover:text-brand transition-colors"
            title="Editar tarea"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {tarea.descripcion && (
        <p className="text-[0.72rem] text-gray-400 line-clamp-2 pl-4">{tarea.descripcion}</p>
      )}
      {tarea.asignados.length > 0 && (
        <p className="text-[0.68rem] text-gray-400 pl-4 flex items-center gap-1">
          <Users className="h-2.5 w-2.5" /> {tarea.asignados.join(', ')}
        </p>
      )}
      {puedeMover && (
        <div className="flex flex-wrap items-center gap-1 pl-4 pt-1 border-t border-gray-100">
          {(estatusList ?? []).filter((s) => s.trim().toLowerCase() !== tarea.estado.trim().toLowerCase()).map((s) => (
            <button
              key={s}
              onClick={() => onMover(tarea.id, s)}
              className="text-[0.65rem] text-gray-400 hover:text-brand transition-colors font-medium"
            >
              → {s}
            </button>
          ))}
          {puedeEliminar && (
            <button onClick={() => onEliminar(tarea.id)} className="ml-auto text-[0.65rem] text-red-400 hover:text-red-600 transition-colors">
              Eliminar
            </button>
          )}
        </div>
      )}
    </div>
  )
}

const COLORES_PRESET = [
  '#6B7280','#1B4FD8','#059669','#D97706','#DC2626',
  '#7C3AED','#0891B2','#DB2777','#65A30D','#9333EA',
]

/* ── Modal de gestión de estatus ── */
function EstatusModal({ proyectoId, onClose }: { proyectoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoColor, setNuevoColor] = useState('#1B4FD8')
  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [editNombre, setEditNombre] = useState('')
  const [editColor, setEditColor] = useState('')

  const { data: estatus = [], isLoading } = useQuery({
    queryKey: ['estatus', proyectoId],
    queryFn: () => proyectosService.getEstatus(proyectoId),
  })

  const crearMut = useMutation({
    mutationFn: () => proyectosService.createEstatus(proyectoId, nuevoNombre.trim(), nuevoColor),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estatus', proyectoId] }); setNuevoNombre(''); toast.success('Estatus creado') },
    onError: (e) => toast.error(getApiError(e)),
  })

  const actualizarMut = useMutation({
    mutationFn: ({ id }: { id: number }) => proyectosService.updateEstatus(proyectoId, id, { nombre: editNombre.trim(), color: editColor }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estatus', proyectoId] }); setEditandoId(null); toast.success('Actualizado') },
    onError: (e) => toast.error(getApiError(e)),
  })

  const eliminarMut = useMutation({
    mutationFn: (id: number) => proyectosService.deleteEstatus(proyectoId, id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['estatus', proyectoId] }); toast.success('Estatus eliminado') },
    onError: (e) => toast.error(getApiError(e)),
  })

  const iniciarEdicion = (e: { id: number; nombre: string; color: string }) => {
    setEditandoId(e.id); setEditNombre(e.nombre); setEditColor(e.color)
  }

  return (
    <Modal isOpen onClose={onClose} title="Gestionar estatus" size="md">
      <div className="space-y-5">
        {/* Lista actual */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Estatus del proyecto</p>
          {isLoading ? (
            <div className="h-20 bg-gray-100 rounded-lg animate-pulse" />
          ) : (
            <div className="space-y-1.5">
              {estatus.map((e, idx) => (
                <div key={e.id}>
                  {editandoId === e.id ? (
                    <div className="flex items-center gap-2 rounded-lg border border-brand/30 bg-brand/5 px-3 py-2">
                      <input value={editNombre} onChange={(ev) => setEditNombre(ev.target.value)} className="field flex-1 text-sm py-1" />
                      <div className="flex gap-1 flex-wrap">
                        {COLORES_PRESET.map((c) => (
                          <button key={c} onClick={() => setEditColor(c)} className={clsx('h-5 w-5 rounded-full border-2 transition-transform', editColor === c ? 'border-gray-800 scale-110' : 'border-transparent')} style={{ background: c }} />
                        ))}
                      </div>
                      <button onClick={() => actualizarMut.mutate({ id: e.id })} disabled={!editNombre.trim() || actualizarMut.isPending} className="text-[0.72rem] font-semibold text-brand hover:text-brand/80">Guardar</button>
                      <button onClick={() => setEditandoId(null)} className="text-gray-400 hover:text-gray-600"><X className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-gray-50 border border-gray-100 group">
                      <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: e.color }} />
                      <span className="flex-1 text-[0.82rem] font-medium text-gray-800">{e.nombre}</span>
                      <span className="text-[0.65rem] text-gray-400 mr-1">#{idx + 1}</span>
                      <button onClick={() => iniciarEdicion(e)} className="text-gray-300 hover:text-brand opacity-0 group-hover:opacity-100 transition-all"><Pencil className="h-3 w-3" /></button>
                      <button onClick={() => eliminarMut.mutate(e.id)} disabled={eliminarMut.isPending} className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  )}
                </div>
              ))}
              {estatus.length === 0 && <p className="text-xs text-gray-400 py-2">Sin estatus definidos</p>}
            </div>
          )}
        </div>

        {/* Crear nuevo */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nuevo estatus</p>
          <div className="flex gap-2 items-center mb-2">
            <input
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && nuevoNombre.trim()) crearMut.mutate() }}
              placeholder="Ej: Validación, En revisión..."
              className="field flex-1 text-sm"
            />
            <Button size="sm" isLoading={crearMut.isPending} disabled={!nuevoNombre.trim()} onClick={() => crearMut.mutate()}>
              <Plus className="h-3.5 w-3.5" /> Agregar
            </Button>
          </div>
          <div className="flex gap-1.5 flex-wrap">
            {COLORES_PRESET.map((c) => (
              <button key={c} onClick={() => setNuevoColor(c)} className={clsx('h-6 w-6 rounded-full border-2 transition-transform', nuevoColor === c ? 'border-gray-700 scale-110' : 'border-transparent')} style={{ background: c }} />
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Modal de gestión de miembros ── */
function MiembrosModal({ proyectoId, onClose }: { proyectoId: number; onClose: () => void }) {
  const qc = useQueryClient()
  const [busqueda, setBusqueda] = useState('')
  const [rol, setRol] = useState('miembro')
  const [agregando, setAgregando] = useState<string | null>(null)

  const { data: miembros = [], isLoading } = useQuery({
    queryKey: ['miembros', proyectoId],
    queryFn: () => proyectosService.getMiembros(proyectoId),
  })

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-asignables'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({
          id: Number(r['id'] ?? r['ID'] ?? 0),
          nombre: String(r['nombres'] ?? r['NOMBRES'] ?? r['nombre'] ?? ''),
          tipoUsuario: String(r['tipoUsuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
          activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? true),
        }))
        .filter((u) => u.activo && u.nombre)
    },
  })

  const agregarMut = useMutation({
    mutationFn: ({ nombre, rol }: { nombre: string; rol: string }) =>
      proyectosService.addMiembro(proyectoId, nombre, rol),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['miembros', proyectoId] })
      setAgregando(null)
      toast.success('Miembro agregado')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const eliminarMut = useMutation({
    mutationFn: (miembroId: number) => proyectosService.deleteMiembro(proyectoId, miembroId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['miembros', proyectoId] })
      toast.success('Miembro eliminado')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  const miembrosNombres = new Set(miembros.map((m) => m.nombre))
  const disponibles = usuarios.filter(
    (u) => !miembrosNombres.has(u.nombre) && u.nombre.toLowerCase().includes(busqueda.toLowerCase())
  )

  return (
    <Modal isOpen onClose={onClose} title="Miembros del proyecto" size="md">
      <div className="space-y-4">
        {/* Miembros actuales */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Asignados</p>
          {isLoading ? (
            <div className="h-10 bg-gray-100 rounded-lg animate-pulse" />
          ) : miembros.length === 0 ? (
            <p className="text-xs text-gray-400 py-2">Sin miembros asignados</p>
          ) : (
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {miembros.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg px-3 py-2 bg-gray-50 border border-gray-100">
                  <div>
                    <span className="text-[0.82rem] font-medium text-gray-800">{m.nombre}</span>
                    <span className="ml-2 text-[0.68rem] text-gray-400">{m.rol}</span>
                  </div>
                  <button
                    onClick={() => eliminarMut.mutate(m.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                    disabled={eliminarMut.isPending}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Agregar miembro */}
        <div className="border-t border-gray-100 pt-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Agregar miembro</p>
          <div className="flex gap-2 mb-2">
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar usuario..."
              className="field flex-1 text-sm"
            />
            <select value={rol} onChange={(e) => setRol(e.target.value)} className="field w-28 text-sm">
              <option value="miembro">Miembro</option>
              <option value="lider">Líder</option>
              <option value="revisor">Revisor</option>
            </select>
          </div>
          <div className="max-h-44 overflow-y-auto space-y-1 rounded-lg border border-gray-200 p-1">
            {disponibles.length === 0 ? (
              <p className="px-2 py-2 text-[0.72rem] text-gray-400">
                {busqueda ? 'Sin resultados' : 'Todos los usuarios ya están asignados'}
              </p>
            ) : (
              disponibles.map((u) => (
                <button
                  key={u.id}
                  onClick={() => {
                    setAgregando(u.nombre)
                    agregarMut.mutate({ nombre: u.nombre, rol })
                  }}
                  disabled={agregarMut.isPending && agregando === u.nombre}
                  className="w-full flex items-center justify-between rounded-md px-2.5 py-1.5 text-[0.78rem] text-gray-700 hover:bg-brand/5 transition-colors"
                >
                  <span>{u.nombre}</span>
                  <span className="text-[0.65rem] text-gray-400">{u.tipoUsuario}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <Button variant="ghost" onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </Modal>
  )
}

/* ── Kanban de un proyecto ── */
function ProyectoKanban({ proyecto, onVolver }: { proyecto: Proyecto; onVolver: () => void }) {
  const qc = useQueryClient()
  const [vista, setVista] = useState<'kanban' | 'cronograma' | 'calendario'>('kanban')
  const [showNuevaTarea, setShowNuevaTarea] = useState(false)
  const [showMiembros, setShowMiembros] = useState(false)
  const [showEstatus, setShowEstatus] = useState(false)
  const [tareaEditando, setTareaEditando] = useState<Tarea | null>(null)
  const [formTarea, setFormTarea] = useState<{
    titulo: string; descripcion: string; prioridad: TareaPrioridad
    fechaInicio: string; fechaFin: string; asignados: string[]
    estado: string
  }>({ titulo: '', descripcion: '', prioridad: 'media', fechaInicio: '', fechaFin: '', asignados: [], estado: '' })

  const user = useAuthStore((s) => s.user)
  const isTI = ['AD', 'TI'].includes(user?.tipoUsuario?.toUpperCase() ?? '')
  const dragTareaId = useRef<number | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['tareas', proyecto.id],
    queryFn: () => proyectosService.getTareas(proyecto.id),
  })

  const { data: estatus = [], isLoading: loadingEstatus } = useQuery({
    queryKey: ['estatus', proyecto.id],
    queryFn: () => proyectosService.getEstatus(proyecto.id),
  })

  const { data: miembros = [] } = useQuery({
    queryKey: ['miembros', proyecto.id],
    queryFn: () => proyectosService.getMiembros(proyecto.id),
  })

  const esAD = isTI && user?.tipoUsuario?.toUpperCase() === 'AD'

  const miembroActual = miembros.find((m) =>
    m.nombre.trim().toLowerCase() === (user?.nombres ?? '').trim().toLowerCase()
  )
  const rolActual = miembroActual?.rol?.toLowerCase() ?? ''
  const esLider = ['lider', 'líder', 'leader'].includes(rolActual)
  const esCreador = !!proyecto.creadorId && user?.id === proyecto.creadorId

  const esRevisor = ['revisor', 'reviewer'].includes(rolActual)

  // AD siempre puede administrar; líder o creador también
  const puedeAdministrar = esAD || esLider || esCreador
  // Puede crear tareas: AD, líder o creador (revisor NO)
  const puedeCrearTarea = puedeAdministrar
  // Puede mover tareas entre estatus: AD, líder, revisor o creador
  const puedeMoverTareas = puedeAdministrar || esRevisor

  // Solo los miembros del proyecto pueden ser asignados a tareas
  const asignables = miembros.map((m) => ({ id: m.id, nombre: m.nombre, tipoUsuario: m.rol }))

  const primerEstatus = estatus[0]?.nombre ?? 'Pendiente'

  const abrirNuevaTarea = () => {
    setTareaEditando(null)
    setFormTarea({ titulo: '', descripcion: '', prioridad: 'media', fechaInicio: '', fechaFin: '', asignados: [], estado: primerEstatus })
    setShowNuevaTarea(true)
  }
  const abrirEditarTarea = (t: Tarea) => {
    setTareaEditando(t)
    setFormTarea({
      titulo: t.titulo, descripcion: t.descripcion, prioridad: t.prioridad,
      fechaInicio: t.fechaInicio ? t.fechaInicio.slice(0, 10) : '',
      fechaFin: t.fechaFin ? t.fechaFin.slice(0, 10) : '',
      asignados: t.asignados, estado: t.estado,
    })
    setShowNuevaTarea(true)
  }

  const moverMutation = useMutation({
    mutationFn: ({ tareaId, estado }: { tareaId: number; estado: string }) =>
      proyectosService.cambiarEstadoTarea(proyecto.id, tareaId, estado),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas', proyecto.id] }),
    onError: (e) => toast.error(getApiError(e)),
  })

  const eliminarTarea = useMutation({
    mutationFn: (tareaId: number) => proyectosService.deleteTarea(proyecto.id, tareaId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas', proyecto.id] }),
    onError: (e) => toast.error(getApiError(e)),
  })

  const guardarTarea = useMutation({
    mutationFn: () => tareaEditando
      ? proyectosService.updateTarea(proyecto.id, tareaEditando.id, formTarea)
      : proyectosService.createTarea(proyecto.id, { ...formTarea }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tareas', proyecto.id] })
      setShowNuevaTarea(false)
      setTareaEditando(null)
      toast.success(tareaEditando ? 'Tarea actualizada' : 'Tarea creada')
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  // Calcular progreso basado en el último estatus (el de mayor orden)
  const ultimoEstatus = estatus[estatus.length - 1]?.nombre ?? 'Completada'
  const completadas = tareas.filter((t) => t.estado.trim().toLowerCase() === ultimoEstatus.trim().toLowerCase()).length
  const progreso = tareas.length > 0 ? Math.round((completadas / tareas.length) * 100) : 0

  const numCols = estatus.length || 3

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5 space-y-3"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />

          {/* Fila 1: identidad del proyecto */}
          <div className="relative flex items-start gap-3">
            <button onClick={onVolver} className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white truncate">{proyecto.nombre}</h2>
                <span className={clsx('chip text-[0.65rem]', PROYECTO_ESTADO_COLORS[proyecto.estado])}>{proyecto.estado}</span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-[0.7rem] text-blue-200/60 flex-wrap">
                {proyecto.cliente && <span className="flex items-center gap-1"><Users className="h-3 w-3" />{proyecto.cliente}</span>}
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {new Date(proyecto.fechaInicio).toLocaleDateString('es-MX')} – {new Date(proyecto.fechaFin).toLocaleDateString('es-MX')}
                </span>
                {miembros.length > 0 && <span>{miembros.length} miembro{miembros.length !== 1 ? 's' : ''}</span>}
              </div>
            </div>
          </div>

          {/* Fila 2: selector de vista + acciones admin agrupadas */}
          <div className="relative flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
              <button onClick={() => setVista('kanban')} className={clsx('rounded-md px-2.5 py-1 text-[0.72rem] font-semibold transition-colors', vista === 'kanban' ? 'bg-white text-brand' : 'text-white/70 hover:text-white')}>Kanban</button>
              <button onClick={() => setVista('cronograma')} className={clsx('rounded-md px-2.5 py-1 text-[0.72rem] font-semibold transition-colors', vista === 'cronograma' ? 'bg-white text-brand' : 'text-white/70 hover:text-white')}>Cronograma</button>
              <button onClick={() => setVista('calendario')} className={clsx('rounded-md px-2.5 py-1 text-[0.72rem] font-semibold transition-colors', vista === 'calendario' ? 'bg-white text-brand' : 'text-white/70 hover:text-white')}>Calendario</button>
            </div>
            {puedeAdministrar && (
              <div className="flex items-center gap-2">
                <button onClick={() => setShowEstatus(true)} className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors" title="Gestionar estatus">
                  <Settings className="h-4 w-4" />
                </button>
                <Button size="sm" onClick={() => setShowMiembros(true)} className="bg-white/10 !text-white hover:bg-white/20 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Users className="h-3.5 w-3.5" /> Miembros
                </Button>
                <Button size="sm" onClick={abrirNuevaTarea} className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Plus className="h-3.5 w-3.5" /> Tarea
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Barra de progreso */}
        <div className="flex items-center gap-4 px-6 py-2.5 border-b border-gray-100">
          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand to-brand-muted transition-all duration-500" style={{ width: `${progreso}%` }} />
          </div>
          <span className="text-[0.72rem] font-semibold text-gray-400 flex-shrink-0">{progreso}% completado</span>
        </div>

        {/* Lista de miembros */}
        {miembros.length > 0 && (
          <div className="px-6 py-2.5 flex items-center gap-2 flex-wrap border-b border-gray-100 bg-gray-50/50">
            <span className="text-[0.68rem] font-semibold text-gray-400 uppercase tracking-wide mr-1">Equipo:</span>
            {miembros.map((m) => {
              const iniciales = m.nombre.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase()
              const ROL_COLOR: Record<string, string> = {
                lider: 'bg-brand text-white', líder: 'bg-brand text-white', leader: 'bg-brand text-white',
                revisor: 'bg-purple-500 text-white', reviewer: 'bg-purple-500 text-white',
                miembro: 'bg-gray-400 text-white', member: 'bg-gray-400 text-white',
              }
              const avatarClass = ROL_COLOR[m.rol.toLowerCase()] ?? 'bg-gray-400 text-white'
              return (
                <div
                  key={m.id}
                  className="flex items-center gap-1.5 rounded-full bg-white border border-gray-200 px-2 py-0.5 shadow-sm transition-all duration-150 origin-center hover:scale-110 hover:shadow-md hover:border-brand/40 hover:z-10 relative"
                  title={`${m.nombre} · ${m.rol}`}
                >
                  <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[0.58rem] font-bold flex-shrink-0', avatarClass)}>
                    {iniciales}
                  </span>
                  <span className="text-[0.72rem] font-medium text-gray-700 whitespace-nowrap">{m.nombre}</span>
                  <span className="text-[0.6rem] text-gray-400 capitalize">{m.rol}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Kanban / Cronograma / Calendario */}
      {vista === 'cronograma' ? (
        <ProyectoCronograma proyecto={proyecto} tareas={tareas} onTareaClick={abrirEditarTarea} />
      ) : vista === 'calendario' ? (
        <ProyectoCalendario tareas={tareas} onTareaClick={abrirEditarTarea} />
      ) : (isLoading || loadingEstatus) ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${numCols}, minmax(0,1fr))` }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl border-2 border-gray-200 bg-gray-50 p-4 space-y-2.5 min-h-32 animate-pulse">
              <div className="h-3 w-24 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${Math.min(numCols, 5)}, minmax(0,1fr))` }}>
          {estatus.map((col) => {
            const colTareas = tareas.filter((t) => t.estado.trim().toLowerCase() === col.nombre.trim().toLowerCase())
            const isOver = dropTarget === col.nombre
            return (
              <div
                key={col.id}
                onDragOver={(e) => { if (puedeMoverTareas) e.preventDefault(); if (puedeMoverTareas) setDropTarget(col.nombre) }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null) }}
                onDrop={(e) => {
                  e.preventDefault(); setDropTarget(null)
                  if (!puedeMoverTareas) return
                  const tid = dragTareaId.current
                  if (tid == null) return
                  const tarea = tareas.find((t) => t.id === tid)
                  if (tarea && tarea.estado.trim().toLowerCase() !== col.nombre.trim().toLowerCase()) moverMutation.mutate({ tareaId: tid, estado: col.nombre })
                  dragTareaId.current = null
                }}
                className={clsx('rounded-2xl border-2 p-4 space-y-2.5 min-h-32 transition-all duration-150 bg-gray-50', isOver && 'ring-2 ring-brand/40 ring-offset-1 scale-[1.01]')}
                style={{ borderColor: col.color + '40' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: col.color }} />
                    <h3 className="text-[0.8rem] font-bold text-gray-700">{col.nombre}</h3>
                  </div>
                  <span className="text-[0.65rem] bg-white rounded-full px-2 py-0.5 text-gray-500 border border-gray-200 font-semibold">{colTareas.length}</span>
                </div>
                {colTareas.length === 0 ? (
                  <div className={clsx('flex items-center justify-center rounded-xl border-2 border-dashed py-6 transition-colors', isOver ? 'border-brand/40 bg-brand/5' : 'border-gray-200')}>
                    <p className="text-[0.72rem] text-gray-400">{isOver ? 'Soltar aquí' : 'Sin tareas'}</p>
                  </div>
                ) : (
                  colTareas.map((t) => (
                    <TareaCard
                      key={t.id} tarea={t}
                      proyectoId={proyecto.id}
                      puedeMover={puedeMoverTareas}
                      puedeEliminar={puedeAdministrar}
                      onDragStart={(e, id) => { dragTareaId.current = id; e.dataTransfer.effectAllowed = 'move' }}
                      onMover={(id, estado) => moverMutation.mutate({ tareaId: id, estado })}
                      onEliminar={(id) => eliminarTarea.mutate(id)}
                      onEditar={abrirEditarTarea}
                      estatusList={estatus.map((e) => e.nombre)}
                    />
                  ))
                )}
              </div>
            )
          })}
        </div>
      )}

      {showEstatus && <EstatusModal proyectoId={proyecto.id} onClose={() => setShowEstatus(false)} />}
      {showMiembros && <MiembrosModal proyectoId={proyecto.id} onClose={() => setShowMiembros(false)} />}

      {showNuevaTarea && (
        <Modal isOpen onClose={() => { setShowNuevaTarea(false); setTareaEditando(null) }} title={tareaEditando ? 'Editar tarea' : 'Nueva tarea'} size="lg">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Título</label>
                <input value={formTarea.titulo} onChange={(e) => setFormTarea({ ...formTarea, titulo: e.target.value })} className="field" placeholder="Nombre de la tarea" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
                <textarea value={formTarea.descripcion} onChange={(e) => setFormTarea({ ...formTarea, descripcion: e.target.value })} rows={4} className="field resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Prioridad</label>
                  <select value={formTarea.prioridad} onChange={(e) => setFormTarea({ ...formTarea, prioridad: e.target.value as TareaPrioridad })} className="field">
                    <option value="baja">Baja</option>
                    <option value="media">Media</option>
                    <option value="alta">Alta</option>
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estatus</label>
                  <select value={formTarea.estado} onChange={(e) => setFormTarea({ ...formTarea, estado: e.target.value })} className="field">
                    {estatus.map((e) => <option key={e.id} value={e.nombre}>{e.nombre}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
                  <input type="date" value={formTarea.fechaInicio} onChange={(e) => setFormTarea({ ...formTarea, fechaInicio: e.target.value })} className="field" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
                  <input type="date" min={formTarea.fechaInicio || undefined} value={formTarea.fechaFin} onChange={(e) => setFormTarea({ ...formTarea, fechaFin: e.target.value })} className="field" />
                </div>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Participantes (TI / Administración)</label>
              <div className="max-h-[19rem] space-y-1 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {asignables.map((u) => {
                  const checked = formTarea.asignados.includes(u.nombre)
                  return (
                    <label key={u.id} className="flex items-center gap-2 rounded-md px-1.5 py-1 text-[0.78rem] text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={checked} onChange={() => setFormTarea({ ...formTarea, asignados: checked ? formTarea.asignados.filter((n) => n !== u.nombre) : [...formTarea.asignados, u.nombre] })} className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand" />
                      {u.nombre}
                      <span className="ml-auto text-[0.65rem] text-gray-400">{u.tipoUsuario}</span>
                    </label>
                  )
                })}
                {asignables.length === 0 && <p className="px-1.5 py-1 text-[0.72rem] text-gray-400">No hay usuarios disponibles.</p>}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-5 mt-1 border-t border-gray-100">
            <Button variant="ghost" onClick={() => { setShowNuevaTarea(false); setTareaEditando(null) }}>Cancelar</Button>
            <Button isLoading={guardarTarea.isPending} disabled={!formTarea.titulo.trim()} onClick={() => guardarTarea.mutate()}>
              {tareaEditando ? 'Guardar cambios' : 'Crear'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  )
}

/* ── Tarjeta de proyecto ── */
function ProyectoCard({
  proyecto, onClick, onEditar, onEliminar,
}: {
  proyecto: Proyecto
  onClick: () => void
  onEditar?: () => void
  onEliminar?: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const EIcon = ESTADO_ICON[proyecto.estado]

  const fechaFin = new Date(proyecto.fechaFin).toLocaleDateString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
  const diasRestantes = Math.ceil((new Date(proyecto.fechaFin).getTime() - Date.now()) / 86_400_000)
  const vencido = diasRestantes < 0 && proyecto.estado === 'Activo'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={clsx(
        'group/admin relative flex flex-col gap-3 rounded-2xl bg-white border transition-all duration-200 p-5',
        hovered ? '-translate-y-1 shadow-card-lg border-gray-300/60' : 'shadow-card border-gray-200/60',
      )}
    >
      {/* Admin overlay */}
      {(onEditar || onEliminar) && (
        <div className="absolute top-3 right-3 hidden group-hover/admin:flex items-center gap-1 z-10">
          {onEditar && (
            <button
              onClick={(e) => { e.stopPropagation(); onEditar() }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow border border-gray-200 text-brand hover:bg-brand hover:text-white transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onEliminar && (
            <button
              onClick={(e) => { e.stopPropagation(); onEliminar() }}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow border border-gray-200 text-red-400 hover:bg-red-500 hover:text-white transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Clickable area */}
      <div onClick={onClick} className="flex flex-col gap-3 cursor-pointer flex-1">
        {/* Título + estado */}
        <div className="flex items-start justify-between gap-2 pr-10">
          <h3 className={clsx('text-[0.88rem] font-bold leading-snug transition-colors', hovered ? 'text-brand' : 'text-gray-900')}>
            {proyecto.nombre}
          </h3>
          <span className={clsx('chip text-[0.65rem] flex-shrink-0 flex items-center gap-1', PROYECTO_ESTADO_COLORS[proyecto.estado])}>
            <EIcon className="h-2.5 w-2.5" /> {proyecto.estado}
          </span>
        </div>

        {/* Descripción */}
        {proyecto.descripcion && (
          <p className="text-[0.75rem] text-gray-400 line-clamp-2 leading-relaxed">{proyecto.descripcion}</p>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 text-[0.68rem] text-gray-400 mt-auto pt-2 border-t border-gray-100">
          {proyecto.cliente && (
            <span className="flex items-center gap-1"><Users className="h-3 w-3" />{proyecto.cliente}</span>
          )}
          <span className={clsx('flex items-center gap-1 ml-auto', vencido ? 'text-red-500' : '')}>
            <Calendar className="h-3 w-3" />
            {vencido ? `Venció hace ${Math.abs(diasRestantes)}d` : `Vence: ${fechaFin}`}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Selector de miembros reutilizable ── */
function MiembrosSelector({
  seleccionados,
  onChange,
}: {
  seleccionados: string[]
  onChange: (nombres: string[]) => void
}) {
  const [busqueda, setBusqueda] = useState('')

  const { data: usuarios = [] } = useQuery({
    queryKey: ['usuarios-todos'],
    queryFn: async () => {
      const { data } = await api.get('/usuarios')
      const list = Array.isArray(data) ? data : (data?.data ?? data?.usuarios ?? [])
      return (list as Record<string, unknown>[])
        .map((r) => ({
          id: Number(r['id'] ?? r['ID'] ?? 0),
          nombre: String(r['nombres'] ?? r['NOMBRES'] ?? r['nombre'] ?? ''),
          tipoUsuario: String(r['tipoUsuario'] ?? r['TIPO_USUARIO'] ?? '').toUpperCase(),
          activo: Boolean(r['activo'] ?? r['ACTIVO'] ?? true),
        }))
        .filter((u) => u.activo && u.nombre)
    },
  })

  const filtrados = busqueda
    ? usuarios.filter((u) => u.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : usuarios

  const toggle = (nombre: string) => {
    onChange(
      seleccionados.includes(nombre)
        ? seleccionados.filter((n) => n !== nombre)
        : [...seleccionados, nombre]
    )
  }

  return (
    <div className="space-y-2">
      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar usuario..."
        className="field text-sm"
      />
      <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-200 p-1 space-y-0.5">
        {filtrados.length === 0 ? (
          <p className="px-2 py-1.5 text-[0.72rem] text-gray-400">Sin resultados</p>
        ) : (
          filtrados.map((u) => {
            const checked = seleccionados.includes(u.nombre)
            return (
              <label key={u.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.78rem] text-gray-700 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(u.nombre)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-brand focus:ring-brand"
                />
                <span className="flex-1">{u.nombre}</span>
                <span className="text-[0.65rem] text-gray-400">{u.tipoUsuario}</span>
              </label>
            )
          })
        )}
      </div>
      {seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-1">
          {seleccionados.map((n) => (
            <span key={n} className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[0.68rem] font-medium text-brand">
              {n}
              <button onClick={() => toggle(n)} className="hover:text-red-500 transition-colors"><X className="h-2.5 w-2.5" /></button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── Formulario nuevo proyecto ── */
function NuevoProyectoModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<{
    nombre: string; descripcion: string; cliente: string;
    fechaInicio: string; fechaFin: string; estado: ProyectoEstado;
  }>({
    nombre: '', descripcion: '', cliente: '',
    fechaInicio: new Date().toISOString().slice(0, 10),
    fechaFin: '', estado: 'Activo',
  })
  const [miembros, setMiembros] = useState<string[]>([])

  const crear = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/proyectos', { ...form, miembros: miembros.map((n) => ({ nombre: n, rol: 'miembro' })) })
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      toast.success('Proyecto creado')
      onClose()
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="Nuevo proyecto" size="lg">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Columna izquierda: datos */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className="field resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
              <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</label>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as ProyectoEstado })} className="field">
                <option value="Activo">Activo</option>
                <option value="Pausado">Pausado</option>
                <option value="Completado">Completado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
              <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
              <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} className="field" />
            </div>
          </div>
        </div>

        {/* Columna derecha: miembros */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Miembros <span className="text-gray-400 normal-case font-normal">({miembros.length} seleccionados)</span>
          </label>
          <MiembrosSelector seleccionados={miembros} onChange={setMiembros} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button isLoading={crear.isPending} disabled={!form.nombre.trim() || !form.fechaFin} onClick={() => crear.mutate()}>
          Crear proyecto
        </Button>
      </div>
    </Modal>
  )
}

/* ── Editar proyecto ── */
function EditarProyectoModal({ proyecto, onClose }: { proyecto: Proyecto; onClose: () => void }) {
  const qc = useQueryClient()
  const [form, setForm] = useState<{
    nombre: string; descripcion: string; cliente: string;
    fechaInicio: string; fechaFin: string; estado: ProyectoEstado;
  }>({
    nombre:      proyecto.nombre,
    descripcion: proyecto.descripcion ?? '',
    cliente:     proyecto.cliente ?? '',
    fechaInicio: proyecto.fechaInicio?.slice(0, 10) ?? '',
    fechaFin:    proyecto.fechaFin?.slice(0, 10) ?? '',
    estado:      proyecto.estado,
  })

  // Cargar miembros actuales
  const { data: miembrosActuales = [] } = useQuery({
    queryKey: ['miembros', proyecto.id],
    queryFn: () => proyectosService.getMiembros(proyecto.id),
  })

  const [miembros, setMiembros] = useState<string[]>([])

  // Inicializar miembros cuando carguen
  useState(() => {
    if (miembrosActuales.length > 0 && miembros.length === 0) {
      setMiembros(miembrosActuales.map((m) => m.nombre))
    }
  })

  // Sincronizar cuando llegan los datos
  const miembrosRef = React.useRef(false)
  if (!miembrosRef.current && miembrosActuales.length > 0) {
    miembrosRef.current = true
    if (miembros.length === 0) setMiembros(miembrosActuales.map((m) => m.nombre))
  }

  const guardar = useMutation({
    mutationFn: async () => {
      // Actualizar datos del proyecto
      await proyectosService.update(proyecto.id, form)

      // Sincronizar miembros: agregar nuevos, eliminar removidos
      const nombresActuales = new Set(miembrosActuales.map((m) => m.nombre))
      const nombresNuevos = new Set(miembros)

      // Agregar los que no estaban
      for (const nombre of miembros) {
        if (!nombresActuales.has(nombre)) {
          await proyectosService.addMiembro(proyecto.id, nombre, 'miembro')
        }
      }
      // Eliminar los que se quitaron
      for (const m of miembrosActuales) {
        if (!nombresNuevos.has(m.nombre)) {
          await proyectosService.deleteMiembro(proyecto.id, m.id)
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proyectos'] })
      qc.invalidateQueries({ queryKey: ['miembros', proyecto.id] })
      toast.success('Proyecto actualizado')
      onClose()
    },
    onError: (e) => toast.error(getApiError(e)),
  })

  return (
    <Modal isOpen onClose={onClose} title="Editar proyecto" size="lg">
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        {/* Columna izquierda: datos */}
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Nombre</label>
            <input value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} className="field" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Descripción</label>
            <textarea value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} rows={3} className="field resize-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Cliente</label>
              <input value={form.cliente} onChange={(e) => setForm({ ...form, cliente: e.target.value })} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Estado</label>
              <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as ProyectoEstado })} className="field">
                <option value="Activo">Activo</option>
                <option value="Pausado">Pausado</option>
                <option value="Completado">Completado</option>
                <option value="Cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha inicio</label>
              <input type="date" value={form.fechaInicio} onChange={(e) => setForm({ ...form, fechaInicio: e.target.value })} className="field" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">Fecha fin</label>
              <input type="date" value={form.fechaFin} onChange={(e) => setForm({ ...form, fechaFin: e.target.value })} className="field" />
            </div>
          </div>
        </div>

        {/* Columna derecha: miembros */}
        <div>
          <label className="mb-1 block text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Miembros <span className="text-gray-400 normal-case font-normal">({miembros.length} seleccionados)</span>
          </label>
          <MiembrosSelector seleccionados={miembros} onChange={setMiembros} />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-4 mt-2 border-t border-gray-100">
        <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        <Button isLoading={guardar.isPending} disabled={!form.nombre.trim() || !form.fechaFin} onClick={() => guardar.mutate()}>
          Guardar cambios
        </Button>
      </div>
    </Modal>
  )
}

/* ── Página principal ── */
export function ProyectosPage() {
  const [selected,         setSelected]         = useState<Proyecto | null>(null)
  const [showNuevo,        setShowNuevo]        = useState(false)
  const [editando,         setEditando]         = useState<Proyecto | null>(null)
  const [confirmEliminar,  setConfirmEliminar]  = useState<Proyecto | null>(null)
  const [vistaPrincipal,   setVistaPrincipal]   = useState<'lista' | 'dashboard'>('lista')
  const [showConfigAD,     setShowConfigAD]     = useState(false)
  const [searchParams, setSearchParams]         = useSearchParams()
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const tipoUsuario = user?.tipoUsuario?.toUpperCase() ?? ''
  const isTI = ['AD', 'TI'].includes(tipoUsuario)
  const isADM = user?.usuario === 'ADM_0001'

  const eliminarMut = useMutation({
    mutationFn: (id: number) => proyectosService.delete(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proyectos'] }); toast.success('Proyecto eliminado') },
    onError: (e) => toast.error(getApiError(e)),
  })

  const { data: configAD, isLoading: loadingConfig } = useQuery({
    queryKey: ['proyectos-config-ad'],
    queryFn: () => proyectosService.getConfigAD(),
    enabled: isADM,
  })

  const toggleConfigAD = useMutation({
    mutationFn: (v: boolean) => proyectosService.setConfigAD(v),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['proyectos-config-ad'] }); toast.success('Configuración guardada') },
    onError: (e) => toast.error(getApiError(e)),
  })

  const { data: proyectos = [], isLoading, refetch, isRefetching } = useQuery({
    queryKey: ['proyectos', user?.id, tipoUsuario],
    queryFn: () => proyectosService.getAll({
      usuarioId: user?.id ?? 0,
      tipoUsuario,
      usuario: user?.usuario ?? '',
    }),
    enabled: !!user,
  })

  // Abrir proyecto directamente desde URL ?id=123 (ej. redirigido desde notificación)
  useEffect(() => {
    const idParam = searchParams.get('id')
    if (idParam && proyectos.length > 0 && !selected) {
      const proy = proyectos.find((p) => p.id === Number(idParam))
      if (proy) {
        setSelected(proy)
        setSearchParams({}, { replace: true })
      }
    }
  }, [searchParams, proyectos])

  if (selected) {
    return <ProyectoKanban proyecto={selected} onVolver={() => setSelected(null)} />
  }

  const activos    = proyectos.filter((p) => p.estado === 'Activo')
  const pausados   = proyectos.filter((p) => p.estado === 'Pausado')
  const finalizados = proyectos.filter((p) => ['Completado', 'Cancelado'].includes(p.estado))

  const stats = [
    { label: 'Activos',    val: activos.length,    icon: CheckCircle2, from: '#059669', to: '#10B981' },
    { label: 'Pausados',   val: pausados.length,   icon: Clock,        from: '#D97706', to: '#F59E0B' },
    { label: 'Finalizados',val: finalizados.length, icon: Briefcase,   from: '#6B7280', to: '#9CA3AF' },
  ]

  return (
    <div className="space-y-5 animate-fade-in">

      {/* ── Banner ── */}
      <div className="card overflow-hidden">
        <div
          className="animate-gradient-x relative overflow-hidden px-6 py-5"
          style={{
            backgroundImage: 'linear-gradient(90deg, #0D1B3E 0%, #1B4FD8 25%, #5FA8FF 50%, #1B4FD8 75%, #0D1B3E 100%)',
            backgroundSize: '200% 100%',
          }}
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/5" />
          <div className="relative flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
                <Briefcase className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight">Proyectos</h1>
                <p className="mt-0.5 text-xs text-blue-200/70">{proyectos.length} proyecto{proyectos.length !== 1 ? 's' : ''} registrados</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 rounded-lg bg-white/10 p-1">
                <button
                  onClick={() => setVistaPrincipal('lista')}
                  className={clsx('rounded-md px-2.5 py-1 text-[0.72rem] font-semibold transition-colors', vistaPrincipal === 'lista' ? 'bg-white text-brand' : 'text-white/70 hover:text-white')}
                >
                  Lista
                </button>
                <button
                  onClick={() => setVistaPrincipal('dashboard')}
                  className={clsx('rounded-md px-2.5 py-1 text-[0.72rem] font-semibold transition-colors', vistaPrincipal === 'dashboard' ? 'bg-white text-brand' : 'text-white/70 hover:text-white')}
                >
                  Dashboard
                </button>
              </div>
              <button
                onClick={() => refetch()}
                className={clsx('flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors', isRefetching && 'animate-spin')}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
              {isADM && (
                <button
                  onClick={() => setShowConfigAD(true)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                  title="Configuración de proyectos"
                >
                  <Settings className="h-3.5 w-3.5" />
                </button>
              )}
              {isTI && (
                <Button onClick={() => setShowNuevo(true)} className="bg-white !text-brand hover:bg-gray-50 !shadow-none border-0 text-[0.78rem] py-1.5 px-3">
                  <Plus className="h-3.5 w-3.5" /> Nuevo proyecto
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      {vistaPrincipal === 'dashboard' ? (
        <ProyectosDashboard proyectos={proyectos} />
      ) : (
      <>
      {/* ── Stats ── */}
      <div className="flex flex-wrap gap-3">
        {stats.map((s) => (
          <div key={s.label} className="card inline-flex items-center gap-3 p-4 hover:shadow-card-md transition-shadow">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${s.from}, ${s.to})` }}>
              <s.icon className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 leading-none">{s.val}</p>
              <p className="text-[0.7rem] text-gray-400 mt-0.5 whitespace-nowrap">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Lista ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : proyectos.length === 0 ? (
        <div className="card flex flex-col items-center justify-center gap-4 py-20">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand/8">
            <Briefcase className="h-7 w-7 text-brand/40" />
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-700">Sin proyectos</p>
            <p className="text-xs text-gray-400 mt-0.5">No hay proyectos registrados aún</p>
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          {activos.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-emerald-500" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Activos</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activos.map((p) => <ProyectoCard key={p.id} proyecto={p} onClick={() => setSelected(p)}
                  onEditar={isTI ? () => setEditando(p) : undefined}
                  onEliminar={isTI ? () => setConfirmEliminar(p) : undefined}
                />)}
              </div>
            </section>
          )}
          {pausados.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-yellow-400" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Pausados</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pausados.map((p) => <ProyectoCard key={p.id} proyecto={p} onClick={() => setSelected(p)}
                  onEditar={isTI ? () => setEditando(p) : undefined}
                  onEliminar={isTI ? () => setConfirmEliminar(p) : undefined}
                />)}
              </div>
            </section>
          )}
          {finalizados.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <div className="h-4 w-1 rounded-full bg-gray-300" />
                <h2 className="text-[0.78rem] font-bold text-gray-600 uppercase tracking-widest">Finalizados</h2>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 opacity-60">
                {finalizados.map((p) => <ProyectoCard key={p.id} proyecto={p} onClick={() => setSelected(p)}
                  onEditar={isTI ? () => setEditando(p) : undefined}
                  onEliminar={isTI ? () => setConfirmEliminar(p) : undefined}
                />)}
              </div>
            </section>
          )}
        </div>
      )}
      </>
      )}

      {showNuevo && <NuevoProyectoModal onClose={() => setShowNuevo(false)} />}
      {editando && <EditarProyectoModal proyecto={editando} onClose={() => setEditando(null)} />}

      {showConfigAD && (
        <Modal isOpen onClose={() => setShowConfigAD(false)} title="Configuración de proyectos" size="sm">
          <div className="space-y-4">
            <p className="text-[0.82rem] text-gray-500">
              Controla qué usuarios pueden ver todos los proyectos o solo los que tienen asignados.
            </p>
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <div>
                <p className="text-[0.85rem] font-semibold text-gray-800">Usuarios AD ven todos los proyectos</p>
                <p className="text-[0.72rem] text-gray-400 mt-0.5">Si está desactivado, los AD solo ven proyectos donde son miembros</p>
              </div>
              {loadingConfig ? (
                <div className="h-6 w-10 rounded-full bg-gray-200 animate-pulse" />
              ) : (
                <button
                  onClick={() => toggleConfigAD.mutate(!configAD)}
                  disabled={toggleConfigAD.isPending}
                  className={clsx(
                    'relative h-6 w-11 rounded-full transition-colors duration-200',
                    configAD ? 'bg-brand' : 'bg-gray-300'
                  )}
                >
                  <span className={clsx(
                    'absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
                    configAD ? 'translate-x-5' : 'translate-x-0'
                  )} />
                </button>
              )}
            </div>
            <p className="text-[0.72rem] text-gray-400">
              ADM_0001 siempre ve todos los proyectos independientemente de esta configuración.
            </p>
          </div>
        </Modal>
      )}

      <ConfirmDialog
        isOpen={confirmEliminar !== null}
        onClose={() => setConfirmEliminar(null)}
        onConfirm={() => { if (confirmEliminar) eliminarMut.mutate(confirmEliminar.id) }}
        title="Eliminar proyecto"
        message={`¿Seguro que deseas eliminar "${confirmEliminar?.nombre ?? 'este proyecto'}"? Se perderán todas las tareas asociadas.`}
        confirmLabel="Eliminar"
        isPending={eliminarMut.isPending}
      />
    </div>
  )
}
