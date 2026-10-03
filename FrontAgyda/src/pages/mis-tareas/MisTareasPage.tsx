import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { clsx } from 'clsx'
import {
  CheckSquare, Plus, Search, MoreVertical,
  CalendarDays, Sun, BarChart3, Clock, CheckCircle2, Trash2,
} from 'lucide-react'
import misTareasHero from '@/assets/mis-tareas-hero.png'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useCurrentUser } from '@/hooks/useAuth'
import { tareaPersonalService, type CrearTareaPersonalPayload } from '@/services/tareaPersonal.service'
import type { TareaPersonal, TareaPersonalPrioridad } from '@/types/tareaPersonal.types'

const PRIORIDAD_STYLE: Record<TareaPersonalPrioridad, string> = {
  alta: 'bg-rose-100 text-rose-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-sky-100 text-sky-700',
}
const PRIORIDADES: { value: TareaPersonalPrioridad; label: string }[] = [
  { value: 'baja', label: 'Baja' },
  { value: 'media', label: 'Media' },
  { value: 'alta', label: 'Alta' },
]

type Tab = 'todas' | 'pendientes' | 'completadas'

function formatFechaLabel(iso: string | null): string {
  if (!iso) return 'Sin fecha'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Sin fecha'
  const hoy = new Date()
  const esMismoDia = d.toDateString() === hoy.toDateString()
  if (esMismoDia) return 'Hoy'
  const manana = new Date(hoy); manana.setDate(hoy.getDate() + 1)
  if (d.toDateString() === manana.toDateString()) return 'Mañana'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}

/* Modal de creación — tarea personal para uno mismo (sin selector de
   destinatario, a diferencia de AsignarTareaModal que usa un AD para asignar
   a otros). */
function NuevaTareaModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const qc = useQueryClient()
  const user = useCurrentUser()
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [prioridad, setPrioridad] = useState<TareaPersonalPrioridad>('media')
  const [fechaLimite, setFechaLimite] = useState('')

  const reset = () => { setTitulo(''); setDescripcion(''); setPrioridad('media'); setFechaLimite('') }

  const crear = useMutation({
    mutationFn: (payload: CrearTareaPersonalPayload) => tareaPersonalService.create(payload),
    onSuccess: () => {
      toast.success('Tarea creada')
      qc.invalidateQueries({ queryKey: ['tareas-personales-mias'] })
      reset()
      onClose()
    },
    onError: () => toast.error('No se pudo crear la tarea'),
  })

  const handleSubmit = () => {
    if (!titulo.trim()) return toast.error('Escribe un título')
    if (!user?.id) return
    crear.mutate({
      titulo: titulo.trim(),
      descripcion: descripcion.trim() || undefined,
      asignadoA: user.id,
      prioridad,
      fechaLimite: fechaLimite || null,
    })
  }

  return (
    <Modal isOpen={isOpen} onClose={() => { reset(); onClose() }} title="Nueva tarea" size="sm">
      <div className="flex flex-col gap-4">
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Título</label>
          <input value={titulo} onChange={(e) => setTitulo(e.target.value)} className="field w-full" placeholder="¿Qué hay que hacer?" maxLength={200} />
        </div>
        <div>
          <label className="mb-1.5 block text-[0.7rem] font-semibold uppercase tracking-wide text-ink-tertiary">Descripción</label>
          <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} className="field w-full resize-none" rows={3} placeholder="Opcional — agrega notas…" />
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
          Crear tarea
        </Button>
      </div>
    </Modal>
  )
}

export function MisTareasPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [nuevaAbierta, setNuevaAbierta] = useState(false)
  const [menuAbiertoId, setMenuAbiertoId] = useState<number | null>(null)

  const { data: tareas = [], isLoading } = useQuery({
    queryKey: ['tareas-personales-mias'],
    queryFn: () => tareaPersonalService.getMisTareas(),
  })

  const completar = useMutation({
    mutationFn: ({ id, completada }: { id: number; completada: boolean }) => tareaPersonalService.completar(id, completada),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tareas-personales-mias'] }),
    onError: () => toast.error('No se pudo actualizar la tarea'),
  })

  const eliminar = useMutation({
    mutationFn: (id: number) => tareaPersonalService.remove(id),
    onSuccess: () => { toast.success('Tarea eliminada'); qc.invalidateQueries({ queryKey: ['tareas-personales-mias'] }) },
    onError: () => toast.error('No se pudo eliminar la tarea'),
  })

  const pendientes = tareas.filter((t) => !t.completada).length
  const completadas = tareas.filter((t) => t.completada).length
  const total = tareas.length || 1 // evita división entre 0 en el resumen

  const visibles = tareas.filter((t) => {
    if (busqueda && !t.titulo.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (tab === 'pendientes') return !t.completada
    if (tab === 'completadas') return t.completada
    return true
  })

  const proximas = tareas.filter((t) => !t.completada).slice(0, 3)
  const recientes = [...tareas].sort((a, b) => b.fechaCreacion.localeCompare(a.fechaCreacion)).slice(0, 3)

  const TABS: { key: Tab; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'completadas', label: 'Completadas' },
  ]

  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
      <div className="min-w-0 flex-1">
        {/* Hero */}
        <div className="relative mb-5 overflow-hidden rounded-2xl">
          <div
            className="flex items-center justify-between gap-6 bg-cover bg-center px-7 py-8"
            style={{ backgroundImage: `linear-gradient(90deg, rgba(10,47,113,0.35) 0%, rgba(10,47,113,0.1) 40%, rgba(10,47,113,0) 70%), url(${misTareasHero})`, backgroundSize: 'cover', backgroundPosition: '62% center' }}
          >
            <div>
              <h1 className="text-[1.9rem] font-extrabold text-white">Mis tareas</h1>
              <p className="mt-1 text-[0.85rem] text-white/80">Organiza, da seguimiento y cumple tus actividades.</p>
            </div>
            <div className="hidden flex-shrink-0 items-center gap-3 rounded-2xl bg-card/95 px-5 py-4 shadow-lg backdrop-blur sm:flex">
              <div className="flex items-center gap-2 border-r border-surface-border pr-4">
                <Sun className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="text-[0.68rem] font-semibold text-ink-tertiary">Hoy</p>
                  <p className="text-[0.78rem] font-bold text-ink capitalize">
                    {new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                </div>
              </div>
              <div className="flex gap-2.5">
                <div className="rounded-xl bg-rose-500/10 px-3 py-1.5 text-center">
                  <p className="text-[1.05rem] font-extrabold leading-none text-rose-500">{pendientes}</p>
                  <p className="mt-0.5 text-[0.6rem] font-semibold text-rose-500">Pendientes</p>
                </div>
                <div className="rounded-xl bg-emerald-500/10 px-3 py-1.5 text-center">
                  <p className="text-[1.05rem] font-extrabold leading-none text-emerald-500">{completadas}</p>
                  <p className="mt-0.5 text-[0.6rem] font-semibold text-emerald-500">Completadas</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs + búsqueda + acciones */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-surface p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={clsx(
                  'rounded-lg px-3 py-1.5 text-[0.76rem] font-semibold transition-colors',
                  tab === t.key ? 'bg-card text-brand shadow-sm' : 'text-ink-tertiary hover:text-ink-secondary',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-tertiary" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar tarea…"
                className="field w-44 py-2 pl-8 text-[0.78rem]"
              />
            </div>
            <button onClick={() => setNuevaAbierta(true)} className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nueva tarea
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-surface-border text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <th className="w-10 px-5 py-3"></th>
                <th className="px-2 py-3">Tarea</th>
                <th className="px-2 py-3">Prioridad</th>
                <th className="px-2 py-3">Fecha límite</th>
                <th className="w-12 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center"><Spinner size="sm" /></td></tr>
              ) : visibles.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-12 text-center text-[0.8rem] text-ink-tertiary">Sin tareas que mostrar.</td></tr>
              ) : (
                visibles.map((t) => (
                  <tr key={t.id} className="border-b border-surface-border last:border-0 hover:bg-surface transition-colors">
                    <td className="px-5 py-3.5">
                      <input
                        type="checkbox"
                        checked={t.completada}
                        onChange={() => completar.mutate({ id: t.id, completada: !t.completada })}
                        className="h-3.5 w-3.5 rounded border-surface-border"
                      />
                    </td>
                    <td className="px-2 py-3.5">
                      <p className={clsx('text-[0.82rem] font-semibold', t.completada ? 'text-ink-tertiary line-through' : 'text-ink')}>{t.titulo}</p>
                      {t.descripcion && <p className="text-[0.68rem] text-ink-tertiary">{t.descripcion}</p>}
                    </td>
                    <td className="px-2 py-3.5">
                      <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold capitalize', PRIORIDAD_STYLE[t.prioridad])}>{t.prioridad}</span>
                    </td>
                    <td className="px-2 py-3.5">
                      <span className="flex items-center gap-1.5 text-[0.76rem] text-ink-secondary">
                        <CalendarDays className="h-3.5 w-3.5 text-ink-tertiary" /> {formatFechaLabel(t.fechaLimite)}
                      </span>
                    </td>
                    <td className="relative px-2 py-3.5">
                      <button
                        onClick={() => setMenuAbiertoId((v) => (v === t.id ? null : t.id))}
                        className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface-border/50 hover:text-ink-secondary transition-colors"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {menuAbiertoId === t.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setMenuAbiertoId(null)} />
                          <div className="absolute right-2 top-10 z-20 w-40 overflow-hidden rounded-xl border border-surface-border bg-card shadow-lg">
                            <button
                              onClick={() => { setMenuAbiertoId(null); eliminar.mutate(t.id) }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="h-3.5 w-3.5" /> Eliminar
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel lateral */}
      <div className="w-full flex-shrink-0 space-y-4 lg:w-80">
        <div className="rounded-2xl border border-surface-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-brand" />
              <h3 className="text-[0.85rem] font-bold text-ink">Resumen de tareas</h3>
            </div>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgb(var(--surface-border))" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="4"
                  strokeDasharray={`${(completadas / total) * 100} ${100 - (completadas / total) * 100}`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ef4444" strokeWidth="4"
                  strokeDasharray={`${(pendientes / total) * 100} ${100 - (pendientes / total) * 100}`}
                  strokeDashoffset={-(completadas / total) * 100} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-ink">{tareas.length}</span>
                <span className="text-[0.6rem] font-semibold text-ink-tertiary">Total</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between text-[0.76rem]">
                <span className="flex items-center gap-1.5 text-ink-secondary"><span className="h-2 w-2 rounded-full bg-rose-500" /> Pendientes</span>
                <span className="font-bold text-ink">{pendientes} <span className="font-normal text-ink-tertiary">{Math.round((pendientes / total) * 100)}%</span></span>
              </div>
              <div className="flex items-center justify-between text-[0.76rem]">
                <span className="flex items-center gap-1.5 text-ink-secondary"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completadas</span>
                <span className="font-bold text-ink">{completadas} <span className="font-normal text-ink-tertiary">{Math.round((completadas / total) * 100)}%</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-brand" />
            <h3 className="text-[0.85rem] font-bold text-ink">Próximas tareas</h3>
          </div>
          <div className="flex flex-col gap-2.5">
            {proximas.length === 0 && <p className="text-[0.76rem] text-ink-tertiary">Sin tareas pendientes.</p>}
            {proximas.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.78rem] font-semibold text-ink">{t.titulo}</p>
                  <p className="flex items-center gap-1 text-[0.68rem] text-ink-tertiary"><CalendarDays className="h-3 w-3" /> {formatFechaLabel(t.fechaLimite)}</p>
                </div>
                <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold capitalize', PRIORIDAD_STYLE[t.prioridad])}>{t.prioridad}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-brand" />
            <h3 className="text-[0.85rem] font-bold text-ink">Tareas recientes</h3>
          </div>
          <div className="flex flex-col gap-2.5">
            {recientes.length === 0 && <p className="text-[0.76rem] text-ink-tertiary">Aún no tienes tareas.</p>}
            {recientes.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5">
                {t.completada
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  : <CheckSquare className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.78rem] font-semibold text-ink">{t.titulo}</p>
                  <p className="text-[0.68rem] text-ink-tertiary">
                    {t.completada ? 'Completada' : 'Creada'} - {formatFechaLabel(t.completada ? t.fechaCompletada : t.fechaCreacion)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NuevaTareaModal isOpen={nuevaAbierta} onClose={() => setNuevaAbierta(false)} />
    </div>
  )
}
