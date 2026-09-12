import { useState } from 'react'
import { clsx } from 'clsx'
import {
  Box, Monitor, Megaphone, Calendar, ChevronRight, FileText, CheckCircle2,
  BarChart3, Users, Star, Mail, Phone, Globe, Headphones, Receipt,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, resolveTheme } from '@/stores/theme.store'
import { ProgressGauge } from '@/pages/portal-cliente/components/ProgressGauge'
import { CountUp } from '@/pages/portal-cliente/components/CountUp'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'

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

const FACTURAS = [
  { folio: 'FAC-00128', desc: 'Campaña de reclutamiento Totis', fecha: '05 sep 2026', monto: 12500, estatus: 'Pagada', accion: 'PDF' },
  { folio: 'FAC-00127', desc: 'Reclutamiento TOTIS', fecha: '01 sep 2026', monto: 8700, estatus: 'Pendiente', accion: 'Ver detalles' },
  { folio: 'FAC-00116', desc: 'Campaña Agosto', fecha: '03 ago 2026', monto: 10200, estatus: 'Pagada', accion: 'PDF' },
]

const STATS = [
  { label: 'Solicitudes abiertas', valor: 2, icon: FileText, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
  { label: 'Tareas pendientes', valor: 3, icon: CheckCircle2, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
  { label: 'Campañas activas', valor: 2, icon: BarChart3, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
  { label: 'Reunión próxima', valor: 1, icon: Users, color: 'text-[#19b6bc] bg-[#19b6bc]/10' },
]

const ACTIVIDAD = [
  { tipo: 'Campaña', icon: Megaphone, color: 'text-emerald-500 bg-emerald-50', badge: 'bg-emerald-50 text-emerald-600', texto: 'Tu campaña "Campaña de reclutamiento Totis" fue publicada.', tiempo: 'Hace 2 horas' },
  { tipo: 'Proyecto', icon: Monitor, color: 'text-blue-500 bg-blue-50', badge: 'bg-blue-50 text-blue-600', texto: 'Se actualizó el proyecto Sitio web corporativo.', tiempo: 'Hace 5 horas' },
  { tipo: 'Reunión', icon: Calendar, color: 'text-purple-500 bg-purple-50', badge: 'bg-purple-50 text-purple-600', texto: 'Reunión confirmada: Revisión de avances.', tiempo: 'Hace 1 día' },
  { tipo: 'Atención', icon: Headphones, color: 'text-ink-tertiary bg-surface', badge: 'bg-surface text-ink-tertiary', texto: 'Tu solicitud #A123 fue respondida.', tiempo: 'Hace 1 día' },
]

const FILTROS = ['Todas', 'Proyectos', 'Campañas', 'Reuniones', 'Atención']

const CANALES = [
  { nombre: 'WhatsApp', desc: 'Chat directo', img: '/whatsapp.png', color: '', accion: 'Abrir' },
  { nombre: 'Messenger', desc: 'Chat directo', img: '/messenger.png', color: '', accion: 'Abrir' },
  { nombre: 'Email', desc: 'Escríbenos', icon: Mail, color: 'text-red-500 bg-red-50', accion: 'Redactar' },
  { nombre: 'Teléfono', desc: 'Llámanos', icon: Phone, color: 'text-emerald-500 bg-emerald-50', accion: 'Llamar' },
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
    <div className="rounded-2xl bg-[#0a2f71] p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-white" />
          <h3 className="text-sm font-bold text-white">Mis proyectos</h3>
        </div>
        <button type="button" className="flex items-center gap-1 text-xs font-semibold text-white/70 hover:text-white hover:underline">
          Ver todos
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex-1">
          <p className="text-sm font-bold text-white">{PROYECTO_EJEMPLO.nombre}</p>
          <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#5eead4]">
            {PROYECTO_EJEMPLO.estatus}
          </span>
        </div>
        <ProgressGauge
          value={PROYECTO_EJEMPLO.avance}
          size={84}
          trackColor="rgba(255,255,255,0.15)"
          progressColor="#5eead4"
          tooltip={`${PROYECTO_EJEMPLO.avance}% completado`}
        />
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
        <div className="flex items-center gap-2 text-xs text-white/60">
          <Calendar className="h-3.5 w-3.5" />
          <div>
            <p className="font-semibold text-white/90">Entrega de proyecto</p>
            <p>{PROYECTO_EJEMPLO.entrega}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="mb-1 text-[11px] text-white/60">Equipo asignado</p>
          <div className="flex -space-x-2">
            {PROYECTO_EJEMPLO.equipo.map((letra, i) => (
              <span
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a2f71] bg-[#5eead4] text-[11px] font-bold text-[#0a2f71]"
              >
                {letra}
              </span>
            ))}
            <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a2f71] bg-white/20 text-[11px] font-bold text-white">
              +{PROYECTO_EJEMPLO.extra}
            </span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#5eead4]" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
          <span className="h-1.5 w-1.5 rounded-full bg-white/20" />
        </div>
        <button type="button" className="flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0a2f71] hover:bg-white/90">
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
        <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-lg font-black italic text-white">
          Totis
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">{CAMPANA_EJEMPLO.nombre}</p>
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-[#19b6bc]/10 px-2 py-0.5 text-[11px] font-semibold text-[#19b6bc]">
            <CheckCircle2 className="h-3 w-3" />
            {CAMPANA_EJEMPLO.estatus}
          </span>
          <p className="mt-1 text-xs text-ink-tertiary">{CAMPANA_EJEMPLO.periodo}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-surface-border pt-4 text-center">
        <div>
          <CountUp end={CAMPANA_EJEMPLO.alcance} className="text-base font-bold text-ink" />
          <p className="text-[11px] text-ink-tertiary">Alcance</p>
        </div>
        <div>
          <CountUp end={CAMPANA_EJEMPLO.interacciones} className="text-base font-bold text-ink" />
          <p className="text-[11px] text-ink-tertiary">Interacciones</p>
        </div>
        <div>
          <CountUp end={CAMPANA_EJEMPLO.conversiones} className="text-base font-bold text-ink" />
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
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-[#19b6bc]/10 text-[#19b6bc]">
          <Calendar className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-ink">{REUNION_EJEMPLO.titulo}</p>
          <p className="mt-1 text-xs text-ink-tertiary">{REUNION_EJEMPLO.fecha}</p>
          <p className="text-xs text-ink-tertiary">{REUNION_EJEMPLO.hora}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-secondary">
        <img src="/google-meet.png" alt="" className="h-7 w-7 object-contain" />
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

const FACTURA_ESTATUS_BADGE: Record<string, string> = {
  Pagada: 'bg-emerald-50 text-emerald-600',
  Pendiente: 'bg-amber-50 text-amber-600',
}

function FacturasSeccion() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-[#0a2f71] p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-white" />
            <h3 className="text-lg font-bold text-white">Facturas</h3>
          </div>
          <p className="mt-2 text-sm text-white/70">
            Consulta y descarga tus facturas de forma rápida y segura.
          </p>
          <button type="button" className="mt-5 flex items-center gap-1 rounded-full bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark">
            Ver todas las facturas
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {/* Ícono decorativo grande, a modo de placeholder de ilustración */}
        <Receipt className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/10" />
      </div>

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Últimas facturas</h3>
          <button type="button" className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            Ver todas
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <tbody>
              {FACTURAS.map((f) => (
                <tr key={f.folio} className="border-b border-surface-border last:border-0">
                  <td className="py-3 pr-3 font-semibold text-ink">{f.folio}</td>
                  <td className="py-3 pr-3 text-ink-secondary">{f.desc}</td>
                  <td className="py-3 pr-3 text-ink-tertiary">{f.fecha}</td>
                  <td className="py-3 pr-3 font-semibold text-ink">
                    <CountUp end={f.monto} prefix="$" suffix=".00 MXN" />
                  </td>
                  <td className="py-3 pr-3">
                    <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold', FACTURA_ESTATUS_BADGE[f.estatus])}>
                      {f.estatus}
                    </span>
                  </td>
                  <td className="py-3 text-right">
                    <button type="button" className="rounded-full border border-brand px-3 py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/5">
                      {f.accion}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function LoImportanteDelDia() {
  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-ink">Lo importante del día</h3>
      <div className="grid grid-cols-4 gap-3">
        {STATS.map((s) => (
          <button
            key={s.label}
            type="button"
            className="flex flex-col items-start gap-2 rounded-2xl border border-surface-border bg-card p-3 text-left shadow-card hover:bg-surface"
          >
            <span className="flex items-center gap-2">
              <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', s.color)}>
                <s.icon className="h-4 w-4" />
              </span>
              <CountUp end={s.valor} className="text-xl font-bold text-ink" />
            </span>
            <span className="flex items-center gap-0.5 whitespace-nowrap text-[11px] leading-tight text-ink-tertiary">
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
  const theme = useThemeStore((s) => s.theme)
  const isDark = resolveTheme(theme) === 'dark'
  // Fondo distinto por tema (no fijo): celeste claro en claro, azul marino
  // oscuro en oscuro — con su propio logo/texto/borde para que cada
  // versión tenga buen contraste sobre su propio fondo.
  const logoArdabytec = isDark ? '/logos-empresa/logo1-modo-oscuro.png' : '/logos-empresa/logo1.png'

  return (
    <div
      className={clsx(
        'rounded-2xl border p-5 shadow-card',
        isDark ? 'border-[#12294f] bg-[#0f2042]' : 'border-surface-border bg-[#ebf5fc]'
      )}
    >
      <img src={logoArdabytec} alt="ArdaBytec" className="h-9 w-auto" />
      <p className={clsx('mt-3 text-sm font-semibold', isDark ? 'text-white' : 'text-[#0F2042]')}>
        Califícanos y da tu opinión sobre nuestro servicio
      </p>
      <div className="mt-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => setRating(n)} aria-label={`${n} estrellas`}>
            <Star className={clsx('h-5 w-5', n <= rating ? 'fill-amber-400 text-amber-400' : isDark ? 'text-[#2c4270]' : 'text-gray-300')} />
          </button>
        ))}
      </div>
      <p className={clsx('mt-1 text-xs', isDark ? 'text-[#93a5c9]' : 'text-[#556075]')}>Tu opinión también nos ayuda a mejorar</p>
      <textarea
        rows={2}
        placeholder="Escribe un comentario (opcional)"
        className={clsx(
          'mt-3 w-full resize-none rounded-lg border p-2.5 text-xs focus:outline-none',
          isDark
            ? 'border-[#2c4270] bg-[#0a1730] text-white placeholder:text-[#6b7fa8] focus:border-brand'
            : 'border-surface-border text-ink-secondary placeholder:text-ink-tertiary focus:border-brand'
        )}
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
      <ul className="flex flex-col gap-4">
        {ACTIVIDAD.map((a, i) => (
          <li key={i} className="flex items-start gap-3">
            <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', a.color)}>
              <a.icon className="h-4 w-4" />
            </span>
            <div className="flex flex-1 items-start justify-between gap-3">
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
            {c.img ? (
              <img src={c.img} alt={c.nombre} className="h-10 w-10 object-contain" />
            ) : (
              <span className={clsx('flex h-10 w-10 items-center justify-center rounded-full', c.color)}>
                {c.icon && <c.icon className="h-5 w-5" />}
              </span>
            )}
            <div>
              <p className="text-xs font-bold text-ink">{c.nombre}</p>
              <p className="text-[10px] text-ink-tertiary">{c.desc}</p>
            </div>
            <button
              type="button"
              className="mt-1 w-full rounded-full border border-brand py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/5"
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
        <Reveal index={0}><ProyectoCard /></Reveal>
        <Reveal index={1}><CampanaCard /></Reveal>
        <Reveal index={2}><ReunionCard /></Reveal>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal index={3}><LoImportanteDelDia /></Reveal>
        <Reveal index={4}><EncuestaCard /></Reveal>
      </div>

      <Reveal index={5}><FacturasSeccion /></Reveal>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal index={6}><ActividadReciente /></Reveal>
        <Reveal index={7}><CanalesComunicacion /></Reveal>
      </div>
    </div>
  )
}
