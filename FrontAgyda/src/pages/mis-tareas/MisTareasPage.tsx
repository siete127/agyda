import { useState } from 'react'
import { clsx } from 'clsx'
import {
  CheckSquare, Plus, Search, SlidersHorizontal, MoreVertical,
  CalendarDays, Sun, BarChart3, Clock, CheckCircle2,
} from 'lucide-react'
import misTareasHero from '@/assets/mis-tareas-hero.png'

/* TEMPORAL — datos de ejemplo fijos en el código, no se guarda ni se lee de
   BD. Vista para el usuario que NO es AD (ve y administra sus propias
   tareas, puede crear tareas para sí mismo, pero no asigna a otros). */
type EstadoTarea = 'pendiente' | 'en-proceso' | 'completada'
type Prioridad = 'baja' | 'media' | 'alta'

interface TareaEjemplo {
  id: number
  titulo: string
  descripcion: string
  prioridad: Prioridad
  estado: EstadoTarea
  fechaLimite: string
  fechaLimiteLabel: string
  asignadoPorMi: boolean
}

const TAREAS_EJEMPLO: TareaEjemplo[] = [
  { id: 1, titulo: 'Revisar propuesta de campaña', descripcion: 'Validar ajustes con el equipo de marketing.', prioridad: 'alta', estado: 'pendiente', fechaLimite: '2026-10-01', fechaLimiteLabel: 'Hoy', asignadoPorMi: false },
  { id: 2, titulo: 'Responder correos pendientes', descripcion: 'Dar seguimiento a solicitudes de clientes.', prioridad: 'media', estado: 'pendiente', fechaLimite: '2026-10-01', fechaLimiteLabel: 'Hoy', asignadoPorMi: true },
  { id: 3, titulo: 'Entregar reporte semanal', descripcion: 'Consolidar información y enviarlo a dirección.', prioridad: 'baja', estado: 'en-proceso', fechaLimite: '2026-10-02', fechaLimiteLabel: 'Mañana', asignadoPorMi: false },
  { id: 4, titulo: 'Actualizar base de datos de clientes', descripcion: 'Verificar y completar información faltante.', prioridad: 'media', estado: 'en-proceso', fechaLimite: '2026-10-02', fechaLimiteLabel: '2 oct', asignadoPorMi: true },
  { id: 5, titulo: 'Reunión de seguimiento con equipo', descripcion: 'Revisar avances y próximos pasos.', prioridad: 'alta', estado: 'pendiente', fechaLimite: '2026-10-03', fechaLimiteLabel: '3 oct', asignadoPorMi: false },
  { id: 6, titulo: 'Preparar presentación para dirección', descripcion: 'Definir estructura y diseño de diapositivas.', prioridad: 'media', estado: 'pendiente', fechaLimite: '2026-10-03', fechaLimiteLabel: '3 oct', asignadoPorMi: true },
  { id: 7, titulo: 'Seguimiento a tickets pendientes', descripcion: 'Revisar estado y cerrar tickets.', prioridad: 'baja', estado: 'completada', fechaLimite: '2026-09-30', fechaLimiteLabel: '30 sep', asignadoPorMi: false },
  { id: 8, titulo: 'Capacitación: Atención al Cliente', descripcion: 'Asistir a la sesión y tomar notas.', prioridad: 'baja', estado: 'completada', fechaLimite: '2026-09-28', fechaLimiteLabel: '28 sep', asignadoPorMi: false },
]

const PRIORIDAD_STYLE: Record<Prioridad, string> = {
  alta: 'bg-rose-100 text-rose-700',
  media: 'bg-amber-100 text-amber-700',
  baja: 'bg-sky-100 text-sky-700',
}
const ESTADO_STYLE: Record<EstadoTarea, string> = {
  pendiente: 'bg-rose-50 text-rose-600',
  'en-proceso': 'bg-amber-50 text-amber-600',
  completada: 'bg-emerald-50 text-emerald-600',
}
const ESTADO_LABEL: Record<EstadoTarea, string> = {
  pendiente: 'Pendiente', 'en-proceso': 'En proceso', completada: 'Completada',
}

type Tab = 'todas' | 'pendientes' | 'en-proceso' | 'completadas'

export function MisTareasPage() {
  const [tab, setTab] = useState<Tab>('todas')
  const [busqueda, setBusqueda] = useState('')

  const pendientes = TAREAS_EJEMPLO.filter((t) => t.estado === 'pendiente').length
  const enProceso = TAREAS_EJEMPLO.filter((t) => t.estado === 'en-proceso').length
  const completadas = TAREAS_EJEMPLO.filter((t) => t.estado === 'completada').length
  const total = TAREAS_EJEMPLO.length

  const visibles = TAREAS_EJEMPLO.filter((t) => {
    if (busqueda && !t.titulo.toLowerCase().includes(busqueda.toLowerCase())) return false
    if (tab === 'pendientes') return t.estado === 'pendiente'
    if (tab === 'en-proceso') return t.estado === 'en-proceso'
    if (tab === 'completadas') return t.estado === 'completada'
    return true
  })

  const proximas = TAREAS_EJEMPLO.filter((t) => t.estado !== 'completada').slice(0, 3)
  const recientes = [...TAREAS_EJEMPLO].slice(-3).reverse()

  const TABS: { key: Tab; label: string }[] = [
    { key: 'todas', label: 'Todas' },
    { key: 'pendientes', label: 'Pendientes' },
    { key: 'en-proceso', label: 'En proceso' },
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
                <div className="rounded-xl bg-amber-500/10 px-3 py-1.5 text-center">
                  <p className="text-[1.05rem] font-extrabold leading-none text-amber-500">{enProceso}</p>
                  <p className="mt-0.5 text-[0.6rem] font-semibold text-amber-500">En proceso</p>
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
            <button className="flex items-center gap-1.5 rounded-xl border border-surface-border bg-card px-3 py-2 text-[0.78rem] font-semibold text-ink-secondary hover:bg-surface transition-colors">
              <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros
            </button>
            <button className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-[0.78rem] font-semibold text-white hover:bg-brand-dark transition-colors">
              <Plus className="h-3.5 w-3.5" /> Nueva tarea
            </button>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-card">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-surface-border text-[0.68rem] font-semibold uppercase tracking-wide text-ink-tertiary">
                <th className="w-10 px-5 py-3"><input type="checkbox" className="h-3.5 w-3.5 rounded border-surface-border" /></th>
                <th className="px-2 py-3">Tarea</th>
                <th className="px-2 py-3">Prioridad</th>
                <th className="px-2 py-3">Estado</th>
                <th className="px-2 py-3">Fecha límite</th>
                <th className="w-12 px-2 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr key={t.id} className="border-b border-surface-border last:border-0 hover:bg-surface transition-colors">
                  <td className="px-5 py-3.5"><input type="checkbox" defaultChecked={t.estado === 'completada'} className="h-3.5 w-3.5 rounded border-surface-border" /></td>
                  <td className="px-2 py-3.5">
                    <p className={clsx('text-[0.82rem] font-semibold', t.estado === 'completada' ? 'text-ink-tertiary line-through' : 'text-ink')}>{t.titulo}</p>
                    <p className="text-[0.68rem] text-ink-tertiary">{t.descripcion}</p>
                  </td>
                  <td className="px-2 py-3.5">
                    <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold capitalize', PRIORIDAD_STYLE[t.prioridad])}>{t.prioridad}</span>
                  </td>
                  <td className="px-2 py-3.5">
                    <span className={clsx('rounded-full px-2.5 py-0.5 text-[0.68rem] font-semibold', ESTADO_STYLE[t.estado])}>{ESTADO_LABEL[t.estado]}</span>
                  </td>
                  <td className="px-2 py-3.5">
                    <span className="flex items-center gap-1.5 text-[0.76rem] text-ink-secondary">
                      <CalendarDays className="h-3.5 w-3.5 text-ink-tertiary" /> {t.fechaLimiteLabel}
                    </span>
                  </td>
                  <td className="px-2 py-3.5">
                    <button className="rounded-lg p-1.5 text-ink-tertiary hover:bg-surface-border/50 hover:text-ink-secondary transition-colors">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {visibles.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-12 text-center text-[0.8rem] text-ink-tertiary">Sin tareas que mostrar.</td></tr>
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
            <span className="text-[0.7rem] font-medium text-ink-tertiary">Esta semana</span>
          </div>
          <div className="flex items-center gap-5">
            <div className="relative h-24 w-24 flex-shrink-0">
              <svg viewBox="0 0 36 36" className="h-24 w-24 -rotate-90">
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgb(var(--surface-border))" strokeWidth="4" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#10b981" strokeWidth="4"
                  strokeDasharray={`${(completadas / total) * 100} ${100 - (completadas / total) * 100}`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f59e0b" strokeWidth="4"
                  strokeDasharray={`${(enProceso / total) * 100} ${100 - (enProceso / total) * 100}`}
                  strokeDashoffset={-(completadas / total) * 100} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9" fill="none" stroke="#ef4444" strokeWidth="4"
                  strokeDasharray={`${(pendientes / total) * 100} ${100 - (pendientes / total) * 100}`}
                  strokeDashoffset={-((completadas + enProceso) / total) * 100} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-xl font-extrabold text-ink">{total}</span>
                <span className="text-[0.6rem] font-semibold text-ink-tertiary">Total</span>
              </div>
            </div>
            <div className="flex flex-1 flex-col gap-2">
              <div className="flex items-center justify-between text-[0.76rem]">
                <span className="flex items-center gap-1.5 text-ink-secondary"><span className="h-2 w-2 rounded-full bg-rose-500" /> Pendientes</span>
                <span className="font-bold text-ink">{pendientes} <span className="font-normal text-ink-tertiary">{Math.round((pendientes / total) * 100)}%</span></span>
              </div>
              <div className="flex items-center justify-between text-[0.76rem]">
                <span className="flex items-center gap-1.5 text-ink-secondary"><span className="h-2 w-2 rounded-full bg-amber-500" /> En proceso</span>
                <span className="font-bold text-ink">{enProceso} <span className="font-normal text-ink-tertiary">{Math.round((enProceso / total) * 100)}%</span></span>
              </div>
              <div className="flex items-center justify-between text-[0.76rem]">
                <span className="flex items-center gap-1.5 text-ink-secondary"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completadas</span>
                <span className="font-bold text-ink">{completadas} <span className="font-normal text-ink-tertiary">{Math.round((completadas / total) * 100)}%</span></span>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-brand" />
              <h3 className="text-[0.85rem] font-bold text-ink">Próximas tareas</h3>
            </div>
            <button className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:text-brand-dark transition-colors">Ver todas →</button>
          </div>
          <div className="flex flex-col gap-2.5">
            {proximas.map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.78rem] font-semibold text-ink">{t.titulo}</p>
                  <p className="flex items-center gap-1 text-[0.68rem] text-ink-tertiary"><CalendarDays className="h-3 w-3" /> {t.fechaLimiteLabel}</p>
                </div>
                <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold capitalize', PRIORIDAD_STYLE[t.prioridad])}>{t.prioridad}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-surface-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-brand" />
              <h3 className="text-[0.85rem] font-bold text-ink">Tareas recientes</h3>
            </div>
            <button className="flex items-center gap-1 text-[0.7rem] font-semibold text-brand hover:text-brand-dark transition-colors">Ver todas →</button>
          </div>
          <div className="flex flex-col gap-2.5">
            {recientes.map((t) => (
              <div key={t.id} className="flex items-center gap-2.5">
                {t.estado === 'completada'
                  ? <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  : <CheckSquare className="h-4 w-4 flex-shrink-0 text-ink-tertiary" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.78rem] font-semibold text-ink">{t.titulo}</p>
                  <p className="text-[0.68rem] text-ink-tertiary">
                    {t.estado === 'completada' ? 'Completada' : 'Creada'} - {t.fechaLimiteLabel}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
