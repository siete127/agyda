/* eslint-disable react-refresh/only-export-components --
   Módulo de catálogo: expone el registro RESUMEN_CARDS junto a los componentes
   que renderiza. No es un módulo de UI con hot-reload crítico. */
import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Ticket, FolderKanban, ClipboardList, MessageSquareWarning, Scale, BookOpenCheck,
  Headset, CalendarClock, Newspaper, PlaneTakeoff, GraduationCap, HeartPulse,
  Users, Target, ChevronRight, Star, TrendingUp, Link2, Plus, type LucideIcon,
} from 'lucide-react'
import { clsx } from 'clsx'
import toast from 'react-hot-toast'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { EnlacesEditor } from '@/components/enlaces/EnlacesEditor'
import { hayEnlacesInvalidos } from '@/components/enlaces/enlaces.utils'
import { ENLACE_ICONOS } from '@/lib/enlaceTopbarIconos'
import { useEnlaceFrameStore } from '@/stores/enlaceFrame.store'
import { enlacesPersonalesService } from '@/services/enlacesPersonales.service'
import type { EnlaceTopbar } from '@/services/personalizacion.service'
import { api } from '@/lib/axios'
import { useCurrentUser } from '@/hooks/useAuth'
import { useActionAccess } from '@/hooks/useActionAccess'
import { ticketsService } from '@/services/tickets.service'
import { proyectosService } from '@/services/proyectos.service'
import { encuestasService } from '@/services/encuestas.service'
import { legalService } from '@/services/legal.service'
import { livechatService } from '@/services/livechat.service'
import { capacitacionService } from '@/services/capacitacion.service'
import { incapacidadesService } from '@/services/incapacidades.service'
import { ventasService } from '@/services/ventas.service'
import { tiemposService } from '@/services/tiempos.service'
import { ventasAreaService, type MiMeta } from '@/services/ventasArea.service'
import { PausasMetaBloque } from '@/components/ventas/PausasMetaBloque'

/* ════════════════════════════════════════════════════════════════════════
   CATÁLOGO DE CARDS DE RESUMEN
   ────────────────────────────────────────────────────────────────────────
   Cada card resume un módulo del sistema. Se ofrecen en el catálogo de
   Configuración → Diseño del inicio, y solo aparecen si la empresa tiene el
   módulo activo (moduleKey + isAllowed).

   Contrato: `render()` devuelve el nodo listo; la card gestiona su propio
   fetch (useQuery), es defensiva ante formas de respuesta y degrada bien
   cuando no hay datos.
   ════════════════════════════════════════════════════════════════════════ */

export interface ResumenCardDef {
  id: string
  titulo: string
  descripcion: string
  categoria: 'Portada' | 'Operación' | 'Personas' | 'Comercial' | 'Contenido'
  // Sin moduleKey = no depende de un módulo (p. ej. "Mis enlaces", personal).
  moduleKey?: string
  /** Tamaño sugerido al agregarla (grilla de 12 columnas, fila = 64px). */
  size: { w: number; h: number }
  Icon: LucideIcon
  render: () => ReactNode
}

/* ── Shell visual común ─────────────────────────────────────────────── */

function CardShell({
  titulo, Icon, to, onVer, verLabel = 'Abrir', children, tono = 'brand',
}: {
  titulo: string
  Icon: LucideIcon
  to?: string
  onVer?: () => void // acción del botón del encabezado en lugar de navegar a `to`
  verLabel?: string
  children: ReactNode
  tono?: 'brand' | 'amber' | 'rose' | 'emerald' | 'violet'
}) {
  const navigate = useNavigate()
  const tonos: Record<string, string> = {
    brand: 'text-brand', amber: 'text-amber-500', rose: 'text-rose-500',
    emerald: 'text-emerald-500', violet: 'text-violet-500',
  }
  return (
    <div className="dash-card flex h-full flex-col overflow-hidden rounded-2xl border border-surface-border bg-card">
      <div className="flex items-center justify-between border-b border-surface-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className={clsx('h-4 w-4', tonos[tono])} />
          <h3 className="text-[0.82rem] font-bold text-ink">{titulo}</h3>
        </div>
        <button
          onClick={() => (onVer ? onVer() : to && navigate(to))}
          className="flex items-center gap-1 text-[0.68rem] font-semibold text-brand transition-colors hover:text-brand-dark"
        >
          {verLabel} <ChevronRight className="h-3 w-3" />
        </button>
      </div>
      <div className="flex-1 overflow-auto p-4">{children}</div>
    </div>
  )
}

function BigStat({ value, label, hint, tono = 'brand' }: {
  value: ReactNode; label: string; hint?: string; tono?: string
}) {
  const tonos: Record<string, string> = {
    brand: 'text-brand', amber: 'text-amber-500', rose: 'text-rose-500',
    emerald: 'text-emerald-500', violet: 'text-violet-500',
  }
  return (
    <div>
      <p className={clsx('text-3xl font-black leading-none tabular-nums', tonos[tono])}>{value}</p>
      <p className="mt-1.5 text-[0.78rem] font-semibold text-ink">{label}</p>
      {hint && <p className="mt-0.5 text-[0.68rem] text-ink-tertiary">{hint}</p>}
    </div>
  )
}

function MiniLista({ items }: { items: { k: string; a: string; b?: string }[] }) {
  if (items.length === 0) {
    return <p className="text-center text-[0.72rem] text-ink-tertiary py-4">Sin pendientes 🎉</p>
  }
  return (
    <ul className="flex flex-col divide-y divide-surface-border/60">
      {items.map((it) => (
        <li key={it.k} className="flex items-center justify-between gap-2 py-2">
          <span className="min-w-0 flex-1 truncate text-[0.74rem] text-ink">{it.a}</span>
          {it.b && <span className="flex-shrink-0 text-[0.66rem] font-semibold text-ink-tertiary">{it.b}</span>}
        </li>
      ))}
    </ul>
  )
}

// `color` (hex) tiene prioridad sobre `tono` — p. ej. el color de un tipo de pausa.
function Barra({ pct, tono = 'brand', color }: { pct: number; tono?: 'brand' | 'emerald' | 'amber' | 'rose' | 'violet'; color?: string }) {
  const colores: Record<string, string> = {
    brand: 'bg-brand', emerald: 'bg-emerald-500', amber: 'bg-amber-500',
    rose: 'bg-rose-500', violet: 'bg-violet-500',
  }
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-border">
      <div
        className={clsx('h-full rounded-full transition-all', !color && colores[tono])}
        style={{ width: `${Math.max(0, Math.min(100, pct))}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  )
}

/* Normaliza {data:[...]} | {x:[...]} | [...] → array */
function arr<T = unknown>(d: unknown, ...keys: string[]): T[] {
  if (Array.isArray(d)) return d as T[]
  if (d && typeof d === 'object') {
    for (const k of ['data', ...keys]) {
      const v = (d as Record<string, unknown>)[k]
      if (Array.isArray(v)) return v as T[]
    }
  }
  return []
}

/* ── Cards ──────────────────────────────────────────────────────────── */

function TicketsResumen() {
  const { data = [] } = useQuery({
    queryKey: ['tickets'], queryFn: () => ticketsService.getAll(), staleTime: 60_000,
  })
  const cerrados = ['cerrado', 'resuelto', 'cancelado']
  const abiertos = data.filter((t) => !cerrados.includes(t.estado?.toLowerCase() ?? ''))
  const sinAsignar = abiertos.filter((t) => !(t as { asignadoA?: unknown }).asignadoA).length
  return (
    <CardShell titulo="Tickets" Icon={Ticket} to="/tickets" verLabel="Ver tickets" tono="amber">
      <BigStat value={abiertos.length} label="tickets abiertos" tono="amber"
        hint={sinAsignar > 0 ? `${sinAsignar} sin asignar` : 'Todos asignados'} />
    </CardShell>
  )
}

function ProyectosResumen() {
  const { data = [] } = useQuery({
    queryKey: ['proyectos'], queryFn: () => proyectosService.getAll(), staleTime: 60_000,
  })
  const activos = data.filter((p) => p.estado === 'Activo')
  return (
    <CardShell titulo="Proyectos" Icon={FolderKanban} to="/proyectos" verLabel="Ver proyectos">
      <BigStat value={activos.length} label="proyectos activos"
        hint={data.length > 0 ? `${data.length} en total` : 'Sin proyectos'} />
    </CardShell>
  )
}

function EncuestasResumen() {
  const user = useCurrentUser()
  const { data = [] } = useQuery({
    queryKey: ['encuestas-mis-pendientes', user?.id],
    queryFn: () => encuestasService.getMisPendientes(user?.id ?? 0),
    enabled: !!user?.id, staleTime: 60_000,
  })
  return (
    <CardShell titulo="Encuestas" Icon={ClipboardList} to="/mis-encuestas" verLabel="Responder" tono="violet">
      <BigStat value={data.length} label="encuestas por responder" tono="violet"
        hint={data.length === 0 ? 'Estás al día' : 'Tienes pendientes'} />
      {data.length > 0 && (
        <div className="mt-3">
          <MiniLista items={data.slice(0, 3).map((e) => ({
            k: String(e.id), a: (e as { titulo?: string }).titulo ?? `Encuesta #${e.id}`,
          }))} />
        </div>
      )}
    </CardShell>
  )
}

function QuejasResumen() {
  const { data } = useQuery({
    queryKey: ['quejas-resumen'],
    queryFn: async () => {
      // Fase 9: Quejas es un tipo de Caso.
      const { data } = await api.get('/atencion-cliente/casos', { params: { tipo: 'queja' } })
      const list = arr<{ estatus?: string }>(data, 'data')
      const abiertas = list.filter((q) => {
        const e = (q.estatus ?? '').toLowerCase()
        return e !== 'resuelto' && e !== 'cerrado'
      })
      return { total: list.length, abiertas: abiertas.length }
    },
    staleTime: 60_000,
  })
  return (
    <CardShell titulo="Quejas y sugerencias" Icon={MessageSquareWarning} to="/atencion-cliente/casos?tipo=queja" verLabel="Ver quejas" tono="rose">
      <BigStat value={data?.abiertas ?? 0} label="quejas abiertas" tono="rose"
        hint={data ? `${data.total} en total` : ''} />
    </CardShell>
  )
}

function LegalesResumen() {
  const { data } = useQuery({
    queryKey: ['legal-dashboard'], queryFn: () => legalService.getDashboard(), staleTime: 120_000,
  })
  const d = data as unknown as Record<string, number> | undefined
  const pendientes = d?.pendientesFirma ?? d?.porFirmar ?? d?.pendientes ?? 0
  return (
    <CardShell titulo="Legal" Icon={Scale} to="/legal" verLabel="Ver documentos">
      <BigStat value={pendientes} label="documentos por firmar"
        hint={pendientes === 0 ? 'Todo firmado' : 'Requieren tu firma'} />
    </CardShell>
  )
}

function ReglamentoResumen() {
  const { data } = useQuery({
    queryKey: ['reglamento-mi-estado'],
    queryFn: async () => {
      const { data } = await api.get('/reglamento/mi-estado').catch(() => ({ data: null }))
      return data as { aceptado?: boolean; pendiente?: boolean } | null
    },
    staleTime: 120_000,
  })
  const pendiente = data ? (data.pendiente ?? data.aceptado === false) : false
  return (
    <CardShell titulo="Reglamento interno" Icon={BookOpenCheck} to="/reglamento" verLabel="Abrir">
      <BigStat
        value={pendiente ? '1' : '0'}
        label={pendiente ? 'lectura pendiente' : 'sin pendientes'}
        tono={pendiente ? 'amber' : 'emerald'}
        hint={pendiente ? 'Debes aceptar el reglamento' : 'Reglamento al día'}
      />
    </CardShell>
  )
}

function LivechatResumen() {
  const { data = [] } = useQuery({
    queryKey: ['livechat-mis-conversaciones-resumen'],
    queryFn: () => livechatService.getMisConversaciones('activa').catch(() => []),
    staleTime: 20_000, refetchInterval: 30_000,
  })
  return (
    <CardShell titulo="Chat en vivo" Icon={Headset} to="/atencion-cliente" verLabel="Atender" tono="emerald">
      <BigStat value={data.length} label="conversaciones activas" tono="emerald"
        hint={data.length === 0 ? 'Sin chats en curso' : 'Requieren atención'} />
    </CardShell>
  )
}

function fmtDuracion(s: number): string {
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`
}

/* "Mis tiempos de hoy" — disponible (jornada − pausas) + desglose de pausas,
   con barras proporcionales a la jornada del día. Mismo id que la card
   anterior ("r-pausas") para no romper los layouts ya guardados. */
function MisTiemposResumen() {
  const { data } = useQuery({
    queryKey: ['tiempos-hoy'],
    queryFn: () => tiemposService.getTiemposHoy(),
    staleTime: 30_000, refetchInterval: 60_000,
  })

  if (!data) return <CardShell titulo="Mis tiempos de hoy" Icon={CalendarClock} to="/reportes/pausas" verLabel="Reporte"><p className="text-[0.72rem] text-ink-tertiary">Cargando…</p></CardShell>

  if (data.sinEntrada) {
    return (
      <CardShell titulo="Mis tiempos de hoy" Icon={CalendarClock} to="/reportes/pausas" verLabel="Reporte">
        <p className="text-center text-[0.72rem] text-ink-tertiary py-4">Sin registro de entrada hoy</p>
      </CardShell>
    )
  }

  // Disponible + un renglón por tipo de pausa configurado (con su color). Si el
  // backend aún no manda `pausasPorTipo`, se usan los 4 campos de siempre.
  const filas: { label: string; seg: number; tono: 'emerald' | 'amber' | 'brand' | 'violet' | 'rose'; color?: string }[] = [
    { label: 'Disponible', seg: data.disponibleSeg, tono: 'emerald' },
    ...(data.pausasPorTipo
      ? data.pausasPorTipo.map((p) => ({ label: p.etiqueta, seg: p.seg, tono: 'brand' as const, color: p.color }))
      : [
          { label: 'Comida', seg: data.comidaSeg, tono: 'amber' as const },
          { label: 'Baño', seg: data.banioSeg, tono: 'brand' as const },
          { label: 'Capacitación', seg: data.capacitacionSeg, tono: 'violet' as const },
          { label: 'Permiso', seg: data.permisoSeg, tono: 'rose' as const },
        ]),
  ]

  return (
    <CardShell titulo="Mis tiempos de hoy" Icon={CalendarClock} to="/reportes/pausas" verLabel="Reporte" tono="emerald">
      <BigStat value={fmtDuracion(data.disponibleSeg)} label="disponible hoy" tono="emerald" />
      <div className="mt-3 flex flex-col gap-2.5">
        {filas.filter((f) => f.label === 'Disponible' || f.seg > 0).map((f) => (
          <div key={f.label}>
            <div className="mb-1 flex items-center justify-between text-[0.7rem]">
              <span className="text-ink-secondary">{f.label}</span>
              <span className="font-semibold text-ink-tertiary">{fmtDuracion(f.seg)}</span>
            </div>
            <Barra pct={data.jornadaSeg > 0 ? (f.seg / data.jornadaSeg) * 100 : 0} tono={f.tono} color={f.color} />
          </div>
        ))}
      </div>
    </CardShell>
  )
}

/* "Tiempos del equipo" — mismo desglose por agente, solo para quien tenga
   reports:ver-equipo (supervisor / a quien se le dé la función). Si no tiene
   el permiso, la card no se renderiza aunque esté en el layout guardado. */
function TiemposEquipoResumen() {
  const { can, isLoading: cargandoPermiso } = useActionAccess()
  const puedeVerEquipo = can('reports', 'ver-equipo')

  const { data = [] } = useQuery({
    queryKey: ['tiempos-hoy-equipo'],
    queryFn: () => tiemposService.getTiemposHoyEquipo(),
    staleTime: 30_000, refetchInterval: 60_000,
    enabled: puedeVerEquipo,
  })

  if (cargandoPermiso) return null
  if (!puedeVerEquipo) {
    return (
      <CardShell titulo="Tiempos del equipo" Icon={Users} to="/reportes/pausas" verLabel="Reporte" tono="brand">
        <p className="text-center text-[0.72rem] text-ink-tertiary py-4">No tienes permiso para ver esta tarjeta</p>
      </CardShell>
    )
  }
  return (
    <CardShell titulo="Tiempos del equipo" Icon={Users} to="/reportes/pausas" verLabel="Reporte" tono="brand">
      {data.length === 0 ? (
        <p className="text-center text-[0.72rem] text-ink-tertiary py-4">Sin datos aún</p>
      ) : (
        <ul className="flex flex-col divide-y divide-surface-border/60">
          {data.slice(0, 8).map((u) => (
            <li key={u.usuarioId} className="py-2">
              <div className="flex items-center justify-between text-[0.74rem]">
                <span className="min-w-0 flex-1 truncate text-ink">{u.nombre}</span>
                <span className="flex-shrink-0 font-semibold text-emerald-600">
                  {u.sinEntrada ? '—' : fmtDuracion(u.disponibleSeg)}
                </span>
              </div>
              {!u.sinEntrada && u.jornadaSeg > 0 && (
                <div className="mt-1"><Barra pct={(u.disponibleSeg / u.jornadaSeg) * 100} tono="emerald" /></div>
              )}
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  )
}

/* "Metas de ventas" — barra que avanza con ventas exitosas del día. Incluye la
   meta individual del agente y, si aplica, la meta global de su campaña. */
function MetasVentasResumen() {
  const { data = [] } = useQuery({
    queryKey: ['mis-metas-ventas'],
    queryFn: () => ventasAreaService.getMisMetas(),
    staleTime: 30_000, refetchInterval: 60_000,
  })

  if (data.length === 0) {
    return (
      <CardShell titulo="Metas de ventas" Icon={Target} to="/ventas-area/metas" verLabel="Ver metas" tono="violet">
        <p className="text-center text-[0.72rem] text-ink-tertiary py-4">Sin metas asignadas hoy</p>
      </CardShell>
    )
  }

  return (
    <CardShell titulo="Metas de ventas" Icon={Target} to="/ventas-area/metas" verLabel="Ver metas" tono="violet">
      <div className="flex flex-col gap-4">
        {data.map((m) => (
          <MetaProgreso key={m.id} meta={m} />
        ))}
      </div>
    </CardShell>
  )
}

/* Tarjeta de progreso de una meta — estilo "hero": avatar de campaña, badge de
   alcance, contador grande, barra tipo slider con extremos, grid de KPIs y
   banner motivacional. */
function MetaProgreso({ meta }: { meta: MiMeta }) {
  const objetivo = meta.metaUnidades > 0 ? meta.metaUnidades : 0
  const actual = meta.avanceUnidades
  const pct = objetivo > 0 ? Math.min(100, (actual / objetivo) * 100) : 0
  const pctReal = objetivo > 0 ? (actual / objetivo) * 100 : 0
  const cumplida = pct >= 100
  const esEquipo = meta.alcance === 'campana'
  const nombre = meta.campanaNombre ?? 'Meta de ventas'
  const iniciales = nombre.replace(/[^A-Za-zÁÉÍÓÚÑ ]/g, '').trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase() || 'MV'

  return (
    <div className="rounded-2xl border border-surface-border bg-surface/50 p-4">
      {/* cabecera: avatar + nombre + contador */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className={clsx(
            'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[0.7rem] font-bold text-white',
            cumplida ? 'bg-gradient-to-br from-emerald-500 to-emerald-600' : 'bg-gradient-to-br from-violet-500 to-violet-700',
          )}>
            {iniciales}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[0.85rem] font-bold text-ink">{nombre}</span>
              <span className={clsx(
                'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold uppercase tracking-wide',
                esEquipo ? 'bg-violet-100 text-violet-700' : 'bg-brand/10 text-brand',
              )}>
                {esEquipo ? 'Equipo' : 'Individual'}
              </span>
            </div>
            <p className="text-[0.68rem] text-ink-tertiary">Meta de ventas</p>
          </div>
        </div>
        <div className="flex-shrink-0 text-right">
          <p className={clsx('text-[1.15rem] font-black leading-none tabular-nums', cumplida ? 'text-emerald-600' : 'text-violet-600')}>
            {actual} <span className="text-ink-tertiary">/ {objetivo}</span>
          </p>
          <p className="mt-0.5 text-[0.66rem] text-ink-tertiary">{pctReal.toFixed(1)}% del objetivo</p>
        </div>
      </div>

      {/* barra tipo slider con extremos */}
      <div className="mt-3.5">
        <div className="relative h-2 w-full rounded-full bg-surface-border">
          <div
            className={clsx('absolute inset-y-0 left-0 rounded-full', cumplida ? 'bg-emerald-500' : 'bg-violet-500')}
            style={{ width: `${Math.max(pct, 3)}%` }}
          />
          <div
            className={clsx(
              'absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card shadow',
              cumplida ? 'bg-emerald-500' : 'bg-violet-500',
            )}
            style={{ left: `${Math.max(pct, 2)}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-[0.62rem] text-ink-tertiary">
          <span>0</span>
          <span>{objetivo}</span>
        </div>
      </div>

      {/* grid de KPIs */}
      <div className="mt-3.5 grid grid-cols-4 gap-1 border-t border-surface-border pt-3 text-center">
        <MetaKpi valor={actual} label="Actual" tono="text-violet-600" />
        <MetaKpi valor={objetivo} label="Objetivo" tono="text-brand" />
        <MetaKpi valor={`${pctReal.toFixed(1)}%`} label="Progreso" tono="text-emerald-600" />
        <MetaKpi valor={cumplida ? 'Lista' : 'Activa'} label="Estado" tono={cumplida ? 'text-emerald-600' : 'text-amber-500'} />
      </div>

      {/* tiempos de pausa de hoy — clic para desglose por persona */}
      <PausasMetaBloque metaId={meta.id} nombreMeta={nombre} />

      {/* banner motivacional */}
      <div className="mt-3 flex items-center gap-2.5 rounded-xl bg-violet-50 px-3 py-2.5">
        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-violet-100">
          {cumplida ? <Star className="h-3.5 w-3.5 text-violet-600" /> : <TrendingUp className="h-3.5 w-3.5 text-violet-600" />}
        </div>
        <div className="min-w-0">
          <p className="text-[0.72rem] font-bold text-ink">{cumplida ? '¡Meta cumplida! 🎉' : '¡Sigue así!'}</p>
          <p className="text-[0.66rem] text-ink-tertiary">
            {cumplida ? 'Excelente trabajo del equipo' : 'Cada venta te acerca más a tu objetivo'}
          </p>
        </div>
      </div>
    </div>
  )
}

function MetaKpi({ valor, label, tono }: { valor: ReactNode; label: string; tono: string }) {
  return (
    <div>
      <p className={clsx('text-[0.95rem] font-black leading-none tabular-nums', tono)}>{valor}</p>
      <p className="mt-1 text-[0.6rem] uppercase tracking-wide text-ink-tertiary">{label}</p>
    </div>
  )
}

function VacacionesResumen() {
  const { data } = useQuery({
    queryKey: ['vacaciones-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/vacaciones/solicitudes').catch(() => ({ data: [] }))
      const list = arr<{ estado?: string; estatus?: string }>(data, 'solicitudes')
      const pend = list.filter((s) => (s.estado ?? s.estatus ?? '').toLowerCase().includes('pend'))
      return { total: list.length, pendientes: pend.length }
    },
    staleTime: 120_000,
  })
  return (
    <CardShell titulo="Vacaciones" Icon={PlaneTakeoff} to="/vacaciones" verLabel="Ver solicitudes" tono="emerald">
      <BigStat value={data?.pendientes ?? 0} label="solicitudes por aprobar" tono="emerald"
        hint={data ? `${data.total} registradas` : ''} />
    </CardShell>
  )
}

function CapacitacionResumen() {
  const { data = [] } = useQuery({
    queryKey: ['capacitacion-mis-cursos'],
    queryFn: () => capacitacionService.getMisCursos().catch(() => []),
    staleTime: 120_000,
  })
  const pendientes = data.filter((c) => {
    const done = (c as { completado?: boolean; estado?: string }).completado
      ?? (c as { estado?: string }).estado === 'completado'
    return !done
  })
  return (
    <CardShell titulo="Capacitación" Icon={GraduationCap} to="/capacitacion" verLabel="Ir a cursos" tono="violet">
      <BigStat value={pendientes.length} label="cursos en curso" tono="violet"
        hint={data.length > 0 ? `${data.length} inscritos` : 'Sin cursos asignados'} />
    </CardShell>
  )
}

function IncapacidadesResumen() {
  const { data = [] } = useQuery({
    queryKey: ['incapacidades-mis'],
    queryFn: () => incapacidadesService.getMisIncapacidades().catch(() => []),
    staleTime: 120_000,
  })
  const activas = data.filter((i) => {
    const e = (i as { estado?: string }).estado?.toLowerCase() ?? ''
    return e === 'aprobada' || e === 'pendiente'
  })
  return (
    <CardShell titulo="Incapacidades" Icon={HeartPulse} to="/incapacidades" verLabel="Ver" tono="rose">
      <BigStat value={activas.length} label="incapacidades vigentes" tono="rose"
        hint={data.length > 0 ? `${data.length} en tu historial` : 'Sin registros'} />
    </CardShell>
  )
}

function NoticiasNuevasResumen() {
  const { data } = useQuery({
    queryKey: ['noticias-nuevas-resumen'],
    queryFn: async () => {
      const { data } = await api.get('/noticias').catch(() => ({ data: [] }))
      const list = arr<{ id: number; leida?: boolean; vista?: boolean; fecha?: string; fechaPublicacion?: string }>(data, 'noticias')
      const noLeidas = list.filter((n) => n.leida === false || n.vista === false).length
      return { total: list.length, noLeidas }
    },
    staleTime: 60_000,
  })
  return (
    <CardShell titulo="Noticias" Icon={Newspaper} to="/noticias" verLabel="Leer">
      <BigStat value={data?.noLeidas ?? 0} label="noticias sin leer"
        hint={data ? `${data.total} publicadas` : ''} />
    </CardShell>
  )
}

function VacantesResumen() {
  const { data } = useQuery({
    queryKey: ['vacantes-dashboard'],
    queryFn: async () => {
      const { data } = await api.get('/vacantes/dashboard-stats').catch(() => ({ data: null }))
      return (data?.data ?? data) as Record<string, number> | null
    },
    staleTime: 120_000,
  })
  const abiertas = data?.vacantesAbiertas ?? data?.abiertas ?? 0
  const postulantes = data?.postulantesNuevos ?? data?.postulantes ?? 0
  return (
    <CardShell titulo="Reclutamiento" Icon={Users} to="/vacantes" verLabel="Ver vacantes">
      <BigStat value={abiertas} label="vacantes abiertas"
        hint={postulantes > 0 ? `${postulantes} postulantes nuevos` : 'Sin postulantes nuevos'} />
    </CardShell>
  )
}

function VentasResumen() {
  const { data, isError } = useQuery({
    queryKey: ['ventas-stats-day-resumen'],
    queryFn: () => ventasService.getStatsDay(),
    staleTime: 60_000,
    refetchInterval: 120_000,
    retry: 1,
  })
  const t = data?.totales
  const total = t?.total ?? 0
  const aprob = t?.aprobadas ?? 0
  const rech = t?.rechazadas ?? 0
  const pctAprob = total > 0 ? Math.round((aprob / total) * 100) : null
  return (
    <CardShell titulo="Ventas del día" Icon={Target} to="/ventas" verLabel="Ver ventas" tono="emerald">
      {isError ? (
        <p className="text-[0.74rem] text-ink-tertiary">
          No se pudo cargar. Abre <b>Ventas</b> para iniciar sesión.
        </p>
      ) : (
        <>
          <BigStat
            value={aprob}
            label="ventas aprobadas hoy"
            tono="emerald"
            hint={pctAprob !== null ? `${pctAprob}% de aprobación · ${total} registradas` : 'Sin registros hoy'}
          />
          {total > 0 && (
            <>
              <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-surface-border">
                <div className="h-full bg-emerald-500" style={{ width: `${(aprob / total) * 100}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${(rech / total) * 100}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-[0.66rem] font-semibold">
                <span className="text-emerald-500">Aprobadas {aprob}</span>
                <span className="text-rose-500">Rechazadas {rech}</span>
              </div>
            </>
          )}
        </>
      )}
    </CardShell>
  )
}

/* "Mis enlaces" — accesos a sitios externos PERSONALES: cada usuario agrega,
   ve y edita solo los suyos (USUARIO_ENLACES_PERSONALES). Mismo editor y mismo
   comportamiento (pestaña nueva / panel flotante) que los enlaces del
   encabezado de la empresa. */
const ENLACES_PERSONALES_KEY = ['enlaces-personales'] as const

function MisEnlacesResumen() {
  const qc = useQueryClient()
  const abrirFlotante = useEnlaceFrameStore((s) => s.abrir)
  const { data: enlaces = [], isLoading } = useQuery({
    queryKey: ENLACES_PERSONALES_KEY,
    queryFn: () => enlacesPersonalesService.getMios(),
    staleTime: 5 * 60_000,
  })

  const [editando, setEditando] = useState(false)
  // El panel flotante (z-40) quedaría detrás del modal: mientras se ve una
  // vista previa flotante, el editor se oculta sin perder el borrador.
  const [oculto, setOculto] = useState(false)
  const [draft, setDraft] = useState<EnlaceTopbar[]>([])
  const abrirEditor = () => { setDraft(enlaces); setOculto(false); setEditando(true) }
  const cerrarEditor = () => { setEditando(false); setOculto(false) }

  const guardar = useMutation({
    mutationFn: () => enlacesPersonalesService.guardarMios(draft),
    onSuccess: (guardados) => {
      qc.setQueryData(ENLACES_PERSONALES_KEY, guardados)
      toast.success('Tus enlaces se guardaron')
      cerrarEditor()
    },
    onError: () => toast.error('No se pudieron guardar tus enlaces'),
  })

  const abrir = (e: EnlaceTopbar) => {
    if (e.modo === 'flotante') abrirFlotante({ id: e.id, label: e.label, url: e.url, color: e.color })
    else window.open(e.url, '_blank', 'noopener,noreferrer')
  }
  const visibles = enlaces.filter((e) => e.visible)

  return (
    <CardShell titulo="Mis enlaces" Icon={Link2} onVer={abrirEditor} verLabel={enlaces.length ? 'Editar' : 'Agregar'} tono="violet">
      {isLoading ? (
        <p className="text-[0.72rem] text-ink-tertiary">Cargando…</p>
      ) : visibles.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 py-2 text-center">
          <p className="text-[0.74rem] text-ink-secondary">Agrega tus sitios frecuentes. Solo tú los ves.</p>
          <button
            onClick={abrirEditor}
            className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-[0.72rem] font-semibold text-white transition-colors hover:bg-violet-700"
          >
            <Plus className="h-3.5 w-3.5" /> Agregar enlaces
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2">
          {visibles.map((e) => {
            const Ico = ENLACE_ICONOS[e.icono] ?? ENLACE_ICONOS.link
            return (
              <button
                key={e.id}
                onClick={() => abrir(e)}
                title={e.url}
                className="group flex min-w-0 flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-surface"
              >
                <span
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-white shadow-sm transition-transform group-hover:scale-105"
                  style={{ backgroundColor: e.color }}
                >
                  <Ico className="h-5 w-5" />
                </span>
                <span className="w-full truncate text-center text-[0.68rem] font-semibold text-ink-secondary">{e.label}</span>
              </button>
            )
          })}
        </div>
      )}

      <Modal isOpen={editando && !oculto} onClose={cerrarEditor} title="Mis enlaces" size="xl">
        <p className="mb-4 text-[0.78rem] leading-relaxed text-gray-500">
          Estos enlaces son solo tuyos: nadie más los ve. Algunos sitios (Google, bancos…) no se dejan mostrar
          en el modo <b>Flotante</b>; para esos usa <b>Pestaña nueva</b>.
        </p>
        <EnlacesEditor enlaces={draft} onChange={setDraft} donde="tarjeta" alAbrirFlotante={() => setOculto(true)} />
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={cerrarEditor}>Cancelar</Button>
          <Button onClick={() => guardar.mutate()} disabled={hayEnlacesInvalidos(draft)} isLoading={guardar.isPending}>
            Guardar
          </Button>
        </div>
      </Modal>
      {editando && oculto && createPortal(
        <button
          onClick={() => setOculto(false)}
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-violet-600 px-4 py-2.5 text-[0.8rem] font-semibold text-white shadow-lg hover:bg-violet-700"
        >
          <Link2 className="h-4 w-4" /> Volver a editar mis enlaces
        </button>,
        document.body,
      )}
    </CardShell>
  )
}

/* ── Registro del catálogo ──────────────────────────────────────────── */

export const RESUMEN_CARDS: ResumenCardDef[] = [
  { id: 'r-tickets', titulo: 'Resumen de Tickets', descripcion: 'Tickets abiertos y sin asignar.', categoria: 'Operación', moduleKey: 'tickets', size: { w: 3, h: 3 }, Icon: Ticket, render: () => <TicketsResumen /> },
  { id: 'r-proyectos', titulo: 'Resumen de Proyectos', descripcion: 'Proyectos activos de tu empresa.', categoria: 'Operación', moduleKey: 'proyectos', size: { w: 3, h: 3 }, Icon: FolderKanban, render: () => <ProyectosResumen /> },
  { id: 'r-encuestas', titulo: 'Encuestas pendientes', descripcion: 'Encuestas que te falta responder.', categoria: 'Contenido', moduleKey: 'encuestas', size: { w: 3, h: 4 }, Icon: ClipboardList, render: () => <EncuestasResumen /> },
  { id: 'r-quejas', titulo: 'Quejas abiertas', descripcion: 'Quejas y sugerencias sin resolver.', categoria: 'Operación', moduleKey: 'atencion-cliente', size: { w: 3, h: 3 }, Icon: MessageSquareWarning, render: () => <QuejasResumen /> },
  { id: 'r-legal', titulo: 'Legal — por firmar', descripcion: 'Documentos legales que requieren tu firma.', categoria: 'Contenido', moduleKey: 'legal', size: { w: 3, h: 3 }, Icon: Scale, render: () => <LegalesResumen /> },
  { id: 'r-reglamento', titulo: 'Reglamento interno', descripcion: 'Estado de aceptación del reglamento.', categoria: 'Personas', moduleKey: 'reglamento', size: { w: 3, h: 3 }, Icon: BookOpenCheck, render: () => <ReglamentoResumen /> },
  { id: 'r-livechat', titulo: 'Chat en vivo — cola', descripcion: 'Conversaciones activas asignadas a ti.', categoria: 'Operación', moduleKey: 'livechat', size: { w: 3, h: 3 }, Icon: Headset, render: () => <LivechatResumen /> },
  { id: 'r-pausas', titulo: 'Mis tiempos de hoy', descripcion: 'Disponible, comida, baño, capacitación y permiso de hoy.', categoria: 'Personas', moduleKey: 'reports', size: { w: 3, h: 5 }, Icon: CalendarClock, render: () => <MisTiemposResumen /> },
  { id: 'r-tiempos-equipo', titulo: 'Tiempos del equipo', descripcion: 'Tiempo disponible de cada agente del área, hoy.', categoria: 'Personas', moduleKey: 'reports', size: { w: 3, h: 5 }, Icon: Users, render: () => <TiemposEquipoResumen /> },
  { id: 'r-vacaciones', titulo: 'Vacaciones', descripcion: 'Solicitudes de vacaciones por aprobar.', categoria: 'Personas', moduleKey: 'vacaciones', size: { w: 3, h: 3 }, Icon: PlaneTakeoff, render: () => <VacacionesResumen /> },
  { id: 'r-capacitacion', titulo: 'Capacitación', descripcion: 'Tus cursos en curso e inscritos.', categoria: 'Personas', moduleKey: 'capacitacion', size: { w: 3, h: 3 }, Icon: GraduationCap, render: () => <CapacitacionResumen /> },
  { id: 'r-incapacidades', titulo: 'Incapacidades', descripcion: 'Incapacidades vigentes.', categoria: 'Personas', moduleKey: 'incapacidades', size: { w: 3, h: 3 }, Icon: HeartPulse, render: () => <IncapacidadesResumen /> },
  { id: 'r-noticias', titulo: 'Noticias sin leer', descripcion: 'Publicaciones que aún no has visto.', categoria: 'Contenido', moduleKey: 'noticias', size: { w: 3, h: 3 }, Icon: Newspaper, render: () => <NoticiasNuevasResumen /> },
  { id: 'r-vacantes', titulo: 'Reclutamiento', descripcion: 'Vacantes abiertas y postulantes nuevos.', categoria: 'Personas', moduleKey: 'vacantes', size: { w: 3, h: 3 }, Icon: Users, render: () => <VacantesResumen /> },
  { id: 'r-ventas', titulo: 'Ventas del día', descripcion: 'Ventas aprobadas y rechazadas de hoy (VICIdial).', categoria: 'Comercial', moduleKey: 'ventas', size: { w: 3, h: 4 }, Icon: Target, render: () => <VentasResumen /> },
  { id: 'r-mis-enlaces', titulo: 'Mis enlaces', descripcion: 'Accesos personales a sitios externos: cada usuario agrega y ve solo los suyos.', categoria: 'Portada', size: { w: 4, h: 3 }, Icon: Link2, render: () => <MisEnlacesResumen /> },
  { id: 'r-metas-ventas', titulo: 'Metas de ventas', descripcion: 'Avance de tus metas diarias por campaña, individual y de equipo.', categoria: 'Comercial', moduleKey: 'ventas-area', size: { w: 3, h: 5 }, Icon: Target, render: () => <MetasVentasResumen /> },
]

export const RESUMEN_CARD_IDS = RESUMEN_CARDS.map((c) => c.id)
