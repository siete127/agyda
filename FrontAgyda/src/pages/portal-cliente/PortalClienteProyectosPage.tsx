import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Box, Eye, Calendar, CheckCircle2, Circle, AlertTriangle, Users, Package, Clock, FolderOpen, ListChecks, History,
} from 'lucide-react'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalProyecto, PortalProyectoDetalle, PortalProyectoTarea } from '@/types/portalCliente.types'
import { PortalHero } from './components/PortalHero'
import { PortalBreadcrumb } from './components/PortalBreadcrumb'
import { ProgressGauge } from './components/ProgressGauge'

const hoy = () => new Date().toISOString().slice(0, 10)
function fecha(iso: string | null | undefined, conAnio = true) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', ...(conAnio ? { year: 'numeric' } : {}) })
}
const iniciales = (n: string) => n.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
const ROL: Record<string, string> = { lider: 'Líder', 'líder': 'Líder', leader: 'Líder', revisor: 'Revisor', reviewer: 'Revisor' }
const rolLabel = (r: string) => ROL[r?.toLowerCase()] ?? 'Equipo'
const ESTADO_CHIP: Record<string, string> = {
  Activo: 'bg-emerald-100 text-emerald-700', Pausado: 'bg-amber-100 text-amber-700',
  Completado: 'bg-blue-100 text-blue-700', Cancelado: 'bg-gray-100 text-gray-600',
}
const vencida = (t: PortalProyectoTarea) => !t.completada && !!t.fechaFin && t.fechaFin < hoy()

/**
 * Portal del cliente → Proyectos. El cliente es espectador: ve el avance de
 * sus proyectos según el tablero del equipo (estatus y tareas) y su
 * seguimiento, sin poder mover ni editar nada.
 */
export function PortalClienteProyectosPage() {
  const [params, setParams] = useSearchParams()
  const { data: proyectos = [], isLoading } = useQuery({ queryKey: ['portal-proyectos'], queryFn: () => portalClienteService.getProyectos() })
  const elegido = Number(params.get('id')) || proyectos[0]?.id || null

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <PortalBreadcrumb seccion="Proyectos" />
      <PortalHero icon={Box} titulo="Mis proyectos" descripcion="Sigue el avance de tus proyectos: el equipo actualiza estatus y tareas, y aquí lo ves al momento." />

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-2xl bg-surface" />
      ) : proyectos.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-surface-border bg-card p-10 text-center shadow-card">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-ink-tertiary"><FolderOpen className="h-7 w-7" /></span>
          <p className="text-sm font-bold text-ink">Aún no tienes proyectos.</p>
          <p className="max-w-md text-xs text-ink-tertiary">Cuando el equipo inicie un proyecto contigo, aquí verás su avance, sus tareas y las próximas entregas.</p>
        </div>
      ) : (
        <>
          {proyectos.length > 1 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {proyectos.map((p) => (
                <TarjetaProyecto key={p.id} proyecto={p} activo={p.id === elegido} onClick={() => setParams({ id: String(p.id) })} />
              ))}
            </div>
          )}
          {elegido && <DetalleProyecto key={elegido} id={elegido} />}
        </>
      )}
    </div>
  )
}

function TarjetaProyecto({ proyecto: p, activo, onClick }: { proyecto: PortalProyecto; activo: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={clsx('rounded-2xl border bg-card p-4 text-left shadow-card transition', activo ? 'border-brand ring-1 ring-brand' : 'border-surface-border hover:border-brand/40')}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold text-ink">{p.nombre}</p>
        <span className={clsx('flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold', ESTADO_CHIP[p.estatus] ?? 'bg-surface text-ink-secondary')}>{p.estatus}</span>
      </div>
      {p.productoNombre && <p className="mt-0.5 text-[11px] text-ink-tertiary">{p.productoNombre}</p>}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
          <div className="h-full rounded-full bg-brand" style={{ width: `${p.avance}%` }} />
        </div>
        <span className="text-xs font-bold tabular-nums text-ink">{p.avance}%</span>
      </div>
      <p className="mt-1.5 text-[11px] text-ink-tertiary">{p.tareas.completadas} de {p.tareas.total} tareas · {p.proximaEntrega ? `próxima entrega ${fecha(p.proximaEntrega, false)}` : 'sin entregas pendientes'}</p>
    </button>
  )
}

function DetalleProyecto({ id }: { id: number }) {
  const { data: p, isLoading, error } = useQuery({ queryKey: ['portal-proyecto', id], queryFn: () => portalClienteService.getProyecto(id) })
  if (isLoading) return <div className="h-72 animate-pulse rounded-2xl bg-surface" />
  if (error || !p) return <p className="rounded-2xl border border-surface-border bg-card p-6 text-sm text-ink-tertiary">No se pudo cargar el proyecto.</p>

  return (
    <div className="flex flex-col gap-5">
      {/* Encabezado + avance */}
      <div className="grid gap-5 rounded-2xl bg-[#0a2f71] p-6 text-white shadow-card lg:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{p.nombre}</h2>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#5eead4]">{p.estatus}</span>
            <span className="flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[11px] text-white/70"><Eye className="h-3 w-3" /> Solo lectura</span>
          </div>
          {p.productoNombre && <p className="mt-1 flex items-center gap-1.5 text-xs text-white/70"><Package className="h-3.5 w-3.5" /> {p.productoNombre}</p>}
          {p.descripcion && <p className="mt-3 max-w-2xl text-sm text-white/80">{p.descripcion}</p>}
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Dato icono={<Calendar className="h-3.5 w-3.5" />} titulo="Inicio" valor={fecha(p.fechaInicio)} />
            <Dato icono={<Calendar className="h-3.5 w-3.5" />} titulo="Entrega del proyecto" valor={fecha(p.fechaFin)} />
            <Dato icono={<Clock className="h-3.5 w-3.5" />} titulo="Próxima entrega" valor={p.proximaEntrega ? fecha(p.proximaEntrega) : 'Sin pendientes'} />
            <Dato icono={<AlertTriangle className="h-3.5 w-3.5" />} titulo="Tareas atrasadas" valor={String(p.tareas.vencidas)} />
          </div>
        </div>
        <div className="flex flex-col items-center justify-center">
          <ProgressGauge value={p.avance} size={180} strokeWidth={13} segments={20} trackColor="rgba(255,255,255,0.15)" progressColor="#5eead4" tooltip={`${p.avance}% completado`} textColor="#ffffff" />
          <p className="-mt-2 text-xs text-white/70">{p.tareas.completadas} de {p.tareas.total} tareas completadas</p>
        </div>
      </div>

      {/* Avance por estatus */}
      {p.tareas.total > 0 && <AvancePorEstatus proyecto={p} />}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <Tablero proyecto={p} />
        <div className="flex flex-col gap-5">
          <Seguimiento tareas={p.listaTareas} />
          {p.equipo.length > 0 && (
            <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><Users className="h-4 w-4 text-brand" /> Equipo del proyecto</h3>
              <ul className="space-y-2">
                {p.equipo.map((m, i) => (
                  <li key={i} className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-brand/10 text-[11px] font-bold text-brand">{iniciales(m.nombre)}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-ink">{m.nombre}</span>
                    <span className="text-[11px] text-ink-tertiary">{rolLabel(m.rol)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Dato({ icono, titulo, valor }: { icono: React.ReactNode; titulo: string; valor: string }) {
  return (
    <div className="rounded-xl bg-white/5 px-3 py-2">
      <p className="flex items-center gap-1 text-[11px] text-white/60">{icono} {titulo}</p>
      <p className="mt-0.5 text-sm font-semibold">{valor}</p>
    </div>
  )
}

/* Barra apilada: cuántas tareas hay en cada estatus del tablero. */
function AvancePorEstatus({ proyecto: p }: { proyecto: PortalProyectoDetalle }) {
  const conTareas = p.porEstatus.filter((e) => e.total > 0)
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><ListChecks className="h-4 w-4 text-brand" /> Avance por estatus</h3>
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-full bg-surface">
        {conTareas.map((e) => (
          <div key={e.nombre} title={`${e.nombre}: ${e.total}`} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(e.total * 100) / p.tareas.total}%`, background: e.color }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {p.porEstatus.map((e) => (
          <span key={e.nombre} className="flex items-center gap-1.5 text-xs text-ink-secondary">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: e.color }} />
            {e.nombre} <b className="tabular-nums text-ink">{e.total}</b>
            {e.completa && <CheckCircle2 className="h-3 w-3 text-ink-tertiary" />}
          </span>
        ))}
      </div>
    </div>
  )
}

/* Tablero del equipo, solo para ver: una columna por estatus. */
function Tablero({ proyecto: p }: { proyecto: PortalProyectoDetalle }) {
  const nombres = new Set(p.columnas.map((c) => c.nombre.toLowerCase()))
  const extras = p.porEstatus.filter((e) => e.total > 0 && !nombres.has(e.nombre.toLowerCase())).map((e) => ({ nombre: e.nombre, color: e.color }))
  const columnas = [...p.columnas, ...extras]
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink"><Box className="h-4 w-4 text-brand" /> Tareas del proyecto</h3>
        <span className="text-[11px] text-ink-tertiary">Las actualiza el equipo</span>
      </div>
      {p.listaTareas.length === 0 ? (
        <p className="py-8 text-center text-xs text-ink-tertiary">El equipo todavía no ha registrado tareas.</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {columnas.map((c) => {
            const tareas = p.listaTareas.filter((t) => t.estado.toLowerCase() === c.nombre.toLowerCase())
            return (
              <div key={c.nombre} className="flex w-60 flex-shrink-0 flex-col rounded-xl bg-surface/70 p-2.5">
                <p className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold text-ink">
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.nombre}
                  <span className="ml-auto rounded-full bg-card px-1.5 text-[10px] font-semibold text-ink-tertiary">{tareas.length}</span>
                </p>
                <div className="space-y-2">
                  {tareas.map((t) => (
                    <div key={t.id} className="rounded-lg border border-surface-border bg-card p-2.5">
                      <p className={clsx('text-[13px] font-semibold leading-snug', t.completada ? 'text-ink-secondary' : 'text-ink')}>{t.titulo}</p>
                      {t.descripcion && <p className="mt-0.5 line-clamp-2 text-[11px] text-ink-tertiary">{t.descripcion}</p>}
                      <div className="mt-2 flex items-center justify-between gap-2">
                        <span className={clsx('flex items-center gap-1 text-[11px]', vencida(t) ? 'font-semibold text-red-600' : 'text-ink-tertiary')}>
                          {vencida(t) ? <AlertTriangle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                          {t.fechaFin ? fecha(t.fechaFin, false) : 'Sin fecha'}
                        </span>
                        {t.responsables.length > 0 && (
                          <span className="flex -space-x-1.5">
                            {t.responsables.slice(0, 3).map((r) => (
                              <span key={r} title={r} className="flex h-5 w-5 items-center justify-center rounded-full border border-card bg-brand/10 text-[9px] font-bold text-brand">{iniciales(r)}</span>
                            ))}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {tareas.length === 0 && <p className="px-1 py-2 text-[11px] text-ink-tertiary">Sin tareas</p>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* Seguimiento: las tareas en orden de fecha, con lo ya completado y lo que sigue. */
function Seguimiento({ tareas }: { tareas: PortalProyectoTarea[] }) {
  const conFecha = [...tareas].sort((a, b) => (a.fechaFin ?? '9999').localeCompare(b.fechaFin ?? '9999'))
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><History className="h-4 w-4 text-brand" /> Seguimiento</h3>
      {conFecha.length === 0 ? (
        <p className="text-xs text-ink-tertiary">Sin actividad todavía.</p>
      ) : (
        <ol className="relative space-y-3 border-l border-surface-border pl-4">
          {conFecha.map((t) => (
            <li key={t.id} className="relative">
              <span className={clsx('absolute -left-[23px] top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-card',
                t.completada ? 'text-emerald-600' : vencida(t) ? 'text-red-600' : 'text-ink-tertiary')}>
                {t.completada ? <CheckCircle2 className="h-4 w-4" /> : vencida(t) ? <AlertTriangle className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
              </span>
              <p className={clsx('text-[13px] font-semibold leading-snug', t.completada ? 'text-ink-secondary' : 'text-ink')}>{t.titulo}</p>
              <p className="text-[11px] text-ink-tertiary">
                {t.completada
                  ? `Completada${t.fechaAprobacion ? ` el ${fecha(t.fechaAprobacion, false)}` : ''}`
                  : vencida(t) ? `Atrasada · era para el ${fecha(t.fechaFin, false)}`
                    : t.fechaFin ? `${t.estado} · para el ${fecha(t.fechaFin, false)}` : t.estado}
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}
