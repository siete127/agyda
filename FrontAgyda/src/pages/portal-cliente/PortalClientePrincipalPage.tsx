import { useState } from 'react'
import { clsx } from 'clsx'
import {
  Box, Megaphone, Calendar, ChevronRight, FileText, CheckCircle2,
  BarChart3, Users, Star, MessageCircle, Mail, Phone, Globe,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'

// --- Datos de ejemplo — reemplazar por datos reales del backend cuando el
// panel se conecte a los endpoints de proyectos/campañas/reuniones/actividad
// de la empresa cliente. ---

const PROYECTO_EJEMPLO = {
  nombre: 'Reclutamiento TOTIS',
  estatus: 'En desarrollo',
  avance: 75,
  entrega: 'Lunes 12 de octubre de 2026',
  equipo: ['A', 'M', 'R'],
  extra: 2,
}

const CAMPANA_EJEMPLO = {
  nombre: 'Campaña reclutamiento',
  cliente: 'Totis',
  estatus: 'Activa',
  periodo: '01 sep - 30 sep 2026',
  alcance: 2000,
  interacciones: 1320,
  conversiones: 86,
}

const REUNION_EJEMPLO = {
  titulo: 'Revisión de avances',
  fecha: 'Jueves 17 de septiembre de 2026',
  hora: '10:00 am – 1:00 pm',
  plataforma: 'Google Meet',
}

const STATS = [
  { label: 'Solicitudes abiertas', valor: 2, icon: FileText, color: 'text-emerald-500 bg-emerald-50' },
  { label: 'Tareas pendientes', valor: 3, icon: CheckCircle2, color: 'text-emerald-500 bg-emerald-50' },
  { label: 'Campañas activas', valor: 2, icon: BarChart3, color: 'text-blue-500 bg-blue-50' },
  { label: 'Reunión próxima', valor: 1, icon: Users, color: 'text-purple-500 bg-purple-50' },
]

const ACTIVIDAD = [
  { tipo: 'Campaña', color: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-600', texto: 'Tu campaña "Q3 - Redes Sociales" fue publicada.', tiempo: 'Hace 2 horas' },
  { tipo: 'Proyecto', color: 'bg-blue-500', badge: 'bg-blue-50 text-blue-600', texto: 'Se actualizó el proyecto Sitio web corporativo.', tiempo: 'Hace 5 horas' },
  { tipo: 'Reunión', color: 'bg-purple-500', badge: 'bg-purple-50 text-purple-600', texto: 'Reunión confirmada: Revisión de avances.', tiempo: 'Hace 1 día' },
  { tipo: 'Atención', color: 'bg-ink-tertiary', badge: 'bg-surface text-ink-tertiary', texto: 'Tu solicitud #A123 fue respondida.', tiempo: 'Hace 1 día' },
]

const FILTROS = ['Todas', 'Proyectos', 'Campañas', 'Reuniones', 'Atención']

const CANALES = [
  { nombre: 'WhatsApp', desc: 'Chat directo', icon: MessageCircle, color: 'text-emerald-500 bg-emerald-50', accion: 'Abrir' },
  { nombre: 'Messenger', desc: 'Chat directo', icon: MessageCircle, color: 'text-blue-500 bg-blue-50', accion: 'Abrir' },
  { nombre: 'Email', desc: 'Escríbenos', icon: Mail, color: 'text-red-500 bg-red-50', accion: 'Redactar' },
  { nombre: 'Teléfono', desc: 'Llámanos', icon: Phone, color: 'text-ink-secondary bg-surface', accion: 'Llamar' },
  { nombre: 'Sitio web', desc: 'Visita nuestro sitio', icon: Globe, color: 'text-sky-500 bg-sky-50', accion: 'Ir al sitio' },
]

function saludoFecha() {
  const hoy = new Date()
  return hoy.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function CardHeader({ icon, title, cta }: { icon: React.ReactNode; title: string; cta?: string }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      {cta && (
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function ProyectoCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <CardHeader icon={<Box className="h-4 w-4 text-brand" />} title="Mis proyectos" cta="Ver todos" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-blue-50 text-brand">
          <Box className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold text-ink">{PROYECTO_EJEMPLO.nombre}</p>
            <span className="text-xs font-bold text-emerald-600">{PROYECTO_EJEMPLO.avance}%</span>
          </div>
          <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
            {PROYECTO_EJEMPLO.estatus}
          </span>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
            <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-brand" style={{ width: `${PROYECTO_EJEMPLO.avance}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-surface-border pt-4">
        <div className="flex items-center gap-2 text-xs text-ink-tertiary">
          <Calendar className="h-3.5 w-3.5" />
          <div>
            <p className="font-semibold text-ink-secondary">Entrega de proyecto</p>
            <p>{PROYECTO_EJEMPLO.entrega}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[11px] text-ink-tertiary">Equipo asignado</p>
          <div className="flex -space-x-2">
            {PROYECTO_EJEMPLO.equipo.map((letra, i) => (
              <span
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-brand text-[11px] font-bold text-white"
              >
                {letra}
              </span>
            ))}
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface-border text-[11px] font-bold text-ink-secondary">
              +{PROYECTO_EJEMPLO.extra}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" />
          <span className="h-1.5 w-1.5 rounded-full bg-surface-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-surface-border" />
          <span className="h-1.5 w-1.5 rounded-full bg-surface-border" />
        </div>
        <button type="button" className="flex items-center gap-1 rounded-full bg-brand px-4 py-2 text-xs font-bold text-white hover:bg-brand-dark">
          Ver proyecto
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

function CampanaCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <CardHeader icon={<Megaphone className="h-4 w-4 text-brand" />} title="Mis campañas" cta="Ver todas" />
      <div className="flex items-center gap-3">
        <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black italic text-white">
          Totis
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">{CAMPANA_EJEMPLO.nombre}</p>
          <span className="mt-1 inline-block rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
            ● {CAMPANA_EJEMPLO.estatus}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-ink-tertiary">{CAMPANA_EJEMPLO.periodo}</p>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-surface-border pt-4 text-center">
        <div>
          <p className="text-base font-bold text-ink">{CAMPANA_EJEMPLO.alcance.toLocaleString('es-MX')}</p>
          <p className="text-[11px] text-ink-tertiary">Alcance</p>
        </div>
        <div>
          <p className="text-base font-bold text-ink">{CAMPANA_EJEMPLO.interacciones.toLocaleString('es-MX')}</p>
          <p className="text-[11px] text-ink-tertiary">Interacciones</p>
        </div>
        <div>
          <p className="text-base font-bold text-ink">{CAMPANA_EJEMPLO.conversiones}</p>
          <p className="text-[11px] text-ink-tertiary">Conversiones</p>
        </div>
      </div>
    </div>
  )
}

function ReunionCard() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <CardHeader icon={<Calendar className="h-4 w-4 text-brand" />} title="Próxima reunión" cta="Ver todas" />
      <p className="text-sm font-bold text-ink">{REUNION_EJEMPLO.titulo}</p>
      <p className="mt-1 text-xs text-ink-tertiary">{REUNION_EJEMPLO.fecha}</p>
      <p className="text-xs text-ink-tertiary">{REUNION_EJEMPLO.hora}</p>
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-secondary">
        <span className="flex h-5 w-5 items-center justify-center rounded bg-card shadow-card text-[10px]">📹</span>
        {REUNION_EJEMPLO.plataforma}
      </div>
      <div className="mt-5 flex gap-2">
        <button type="button" className="flex-1 rounded-full bg-brand py-2.5 text-xs font-bold text-white hover:bg-brand-dark">
          Unirme
        </button>
        <button type="button" className="flex-1 rounded-full border border-surface-border py-2.5 text-xs font-bold text-ink-secondary hover:bg-surface">
          Ver detalles
        </button>
      </div>
    </div>
  )
}

function LoImportanteDelDia() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="mb-4 text-sm font-bold text-ink">Lo importante del día</h3>
      <div className="grid grid-cols-4 gap-3">
        {STATS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="flex flex-col items-center gap-2 rounded-xl border border-surface-border py-4 text-center hover:bg-surface"
          >
            <span className={clsx('flex h-9 w-9 items-center justify-center rounded-full', s.color)}>
              <s.icon className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold text-ink">{s.valor}</span>
            <span className="flex items-center gap-0.5 text-[11px] leading-tight text-ink-tertiary">
              {s.label}
              <ChevronRight className="h-3 w-3" />
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

function EncuestaCard() {
  const [rating, setRating] = useState(4)
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-center gap-2">
        <img src="/Logo_AGYDA.png" alt="" className="h-6 w-auto" />
        <p className="text-xs font-extrabold uppercase tracking-wide text-ink">ArdaBytec</p>
      </div>
      <p className="mt-3 text-sm font-semibold text-ink">
        Califícanos y da tu opinión sobre nuestro servicio
      </p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} estrellas`}>
            <Star className={clsx('h-5 w-5', n <= rating ? 'fill-amber-400 text-amber-400' : 'text-surface-border')} />
          </button>
        ))}
      </div>
      <p className="mt-1 text-xs text-ink-tertiary">Tu opinión también nos ayuda a mejorar</p>
      <textarea
        rows={2}
        placeholder="Escribe un comentario (opcional)"
        className="mt-3 w-full resize-none rounded-lg border border-surface-border p-2.5 text-xs text-ink-secondary placeholder:text-ink-tertiary focus:border-brand focus:outline-none"
      />
    </div>
  )
}

function ActividadReciente() {
  const [filtro, setFiltro] = useState('Todas')
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Actividad reciente</h3>
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          Ver toda la actividad
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mb-4 flex gap-2">
        {FILTROS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFiltro(f)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filtro === f ? 'bg-brand text-white' : 'bg-surface text-ink-tertiary hover:bg-surface'
            )}
          >
            {f}
          </button>
        ))}
      </div>
      <ul className="flex flex-col gap-4 border-l border-surface-border pl-4">
        {ACTIVIDAD.map((a, i) => (
          <li key={i} className="relative">
            <span className={clsx('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full', a.color)} />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-ink">{a.texto}</p>
                <p className="mt-0.5 text-xs text-ink-tertiary">{a.tiempo}</p>
              </div>
              <span className={clsx('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', a.badge)}>
                {a.tipo}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CanalesComunicacion() {
  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <h3 className="text-sm font-bold text-ink">Canales de comunicación</h3>
      <p className="mt-1 text-xs text-ink-tertiary">Conecta con nosotros por el canal que prefieras.</p>
      <div className="mt-4 grid grid-cols-5 gap-3">
        {CANALES.map((c) => (
          <div key={c.nombre} className="flex flex-col items-center gap-2 rounded-xl border border-surface-border p-3 text-center">
            <span className={clsx('flex h-10 w-10 items-center justify-center rounded-full', c.color)}>
              <c.icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-bold text-ink">{c.nombre}</p>
              <p className="text-[10px] text-ink-tertiary">{c.desc}</p>
            </div>
            <button
              type="button"
              className="mt-1 w-full rounded-full border border-surface-border py-1.5 text-[11px] font-semibold text-ink-secondary hover:bg-surface"
            >
              {c.accion}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export function PortalClientePrincipalPage() {
  const user = useAuthStore((s) => s.user)
  const primerNombre = user?.nombres?.split(' ')[0] ?? 'Cliente'

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">
          Buenos días, {primerNombre}!
        </h1>
        <p className="mt-1 text-sm capitalize text-ink-tertiary">{saludoFecha()}</p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <ProyectoCard />
        <CampanaCard />
        <ReunionCard />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <LoImportanteDelDia />
        <EncuestaCard />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <ActividadReciente />
        <CanalesComunicacion />
      </div>
    </div>
  )
}
