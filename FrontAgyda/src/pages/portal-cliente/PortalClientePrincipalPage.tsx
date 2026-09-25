import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import {
  Box, Monitor, Calendar, ChevronRight, FileText,
  Star, Mail, Phone, Globe, Headphones, Receipt, Plus, MessageCircle,
  FolderOpen, Wrench, DollarSign,
} from 'lucide-react'
import { useAuthStore } from '@/stores/auth.store'
import { useThemeStore, resolveTheme } from '@/stores/theme.store'
import { portalClienteService } from '@/services/portalCliente.service'
import type { PortalProyecto, PortalCita, PortalFactura } from '@/types/portalCliente.types'
import { ProgressGauge } from '@/pages/portal-cliente/components/ProgressGauge'
import { CountUp } from '@/pages/portal-cliente/components/CountUp'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'

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

function iniciales(nombre: string) {
  return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('')
}

function CardHeader({ icon, title, cta, onCta }: { icon: React.ReactNode; title: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-bold text-ink">{title}</h3>
      </div>
      {cta && (
        <button type="button" onClick={onCta} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
          {cta}
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

function ProyectoCard() {
  const navigate = useNavigate()
  const { data: proyectos, isLoading } = useQuery({ queryKey: ['portal-proyectos'], queryFn: () => portalClienteService.getProyectos() })
  const proyecto: PortalProyecto | undefined = proyectos?.[0]

  if (!isLoading && !proyecto) {
    return (
      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <CardHeader icon={<Box className="h-4 w-4 text-brand" />} title="Mis proyectos" cta="Ver todos" onCta={() => navigate('/portal-cliente/atencion')} />
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-ink-tertiary">
            <FolderOpen className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Aún no tienes proyectos activos.</p>
            <p className="mt-1 text-xs text-ink-tertiary">Cuando tengas un proyecto, podrás ver aquí su estado, progreso y detalles importantes.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal-cliente/canales')}
            className="mt-1 rounded-full bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-dark"
          >
            Conocer nuestros servicios
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-[#0a2f71] p-5 shadow-card">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Box className="h-4 w-4 text-white" />
          <h3 className="text-sm font-bold text-white">Mis proyectos</h3>
        </div>
      </div>

      {isLoading || !proyecto ? (
        <div className="h-24 animate-pulse rounded-xl bg-white/10" />
      ) : (
        <>
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <p className="text-sm font-bold text-white">{proyecto.nombre}</p>
              <span className="mt-1 inline-block rounded-full bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-[#5eead4]">
                {proyecto.estatus}
              </span>
            </div>
            <ProgressGauge
              value={proyecto.avance}
              size={172}
              strokeWidth={13}
              segments={20}
              trackColor="rgba(255,255,255,0.15)"
              progressColor="#5eead4"
              tooltip={`${proyecto.avance}% completado`}
            />
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4">
            <div className="flex items-center gap-2 text-xs text-white/60">
              <Calendar className="h-3.5 w-3.5" />
              <div>
                <p className="font-semibold text-white/90">Entrega de proyecto</p>
                <p>{proyecto.fechaFin ?? 'Sin fecha definida'}</p>
              </div>
            </div>
            {proyecto.equipo.length > 0 && (
              <div className="text-right">
                <p className="mb-1 text-[11px] text-white/60">Equipo asignado</p>
                <div className="flex -space-x-2">
                  {proyecto.equipo.slice(0, 3).map((m, i) => (
                    <span
                      key={i}
                      title={m.nombre}
                      className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a2f71] bg-[#5eead4] text-[11px] font-bold text-[#0a2f71]"
                    >
                      {iniciales(m.nombre)}
                    </span>
                  ))}
                  {proyecto.equipo.length > 3 && (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#0a2f71] bg-white/20 text-[11px] font-bold text-white">
                      +{proyecto.equipo.length - 3}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-end">
            <button type="button" onClick={() => navigate('/portal-cliente/atencion')} className="flex items-center gap-1 rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0a2f71] hover:bg-white/90">
              Ver proyecto
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function ReunionCard() {
  const navigate = useNavigate()
  const { data: citas, isLoading } = useQuery({ queryKey: ['portal-citas'], queryFn: () => portalClienteService.getCitas() })
  const cita: PortalCita | undefined = citas?.[0]

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <CardHeader icon={<Calendar className="h-4 w-4 text-brand" />} title="Próxima reunión" cta="Ver todas" onCta={() => navigate('/portal-cliente/reuniones')} />
      {isLoading ? (
        <div className="h-24 animate-pulse rounded-xl bg-surface" />
      ) : !cita ? (
        <p className="text-xs text-ink-tertiary">No tienes reuniones próximas.</p>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-violet-50 text-violet-500">
              <Calendar className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-ink">{cita.titulo}</p>
              <p className="mt-1 text-xs text-ink-tertiary">
                {new Date(cita.fechaHora).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="text-xs text-ink-tertiary">
                {new Date(cita.fechaHora).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 text-xs font-semibold text-ink-secondary capitalize">
            {cita.modalidad}
          </div>
          <div className="mt-5 flex gap-2">
            {cita.enlace && (
              <a href={cita.enlace} target="_blank" rel="noreferrer" className="flex-1 rounded-full bg-brand py-2.5 text-center text-xs font-bold text-white hover:bg-brand-dark">
                Unirme
              </a>
            )}
            <button type="button" onClick={() => navigate('/portal-cliente/reuniones')} className="flex-1 rounded-full border border-surface-border py-2.5 text-xs font-bold text-ink-secondary hover:bg-surface">
              Ver detalles
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const FACTURA_ESTATUS_BADGE: Record<string, string> = {
  pagada: 'bg-emerald-50 text-emerald-600',
  timbrada: 'bg-emerald-50 text-emerald-600',
  pendiente: 'bg-amber-50 text-amber-600',
  'pre-factura': 'bg-amber-50 text-amber-600',
}

function FacturasSeccion() {
  const navigate = useNavigate()
  const { data: facturas } = useQuery({ queryKey: ['portal-facturas'], queryFn: () => portalClienteService.getFacturas() })
  const ultimas = (facturas ?? []).slice(0, 5)

  if (ultimas.length === 0) {
    return (
      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <CardHeader icon={<Receipt className="h-4 w-4 text-brand" />} title="Facturas" cta="Ver todas" onCta={() => navigate('/portal-cliente/facturas')} />
        <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface text-ink-tertiary">
            <Receipt className="h-7 w-7" />
          </span>
          <div>
            <p className="text-sm font-bold text-ink">Sin facturas registradas.</p>
            <p className="mt-1 text-xs text-ink-tertiary">Aquí aparecerán tus facturas emitidas.</p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/portal-cliente/facturas')}
            className="mt-1 rounded-full bg-brand px-5 py-2.5 text-xs font-bold text-white hover:bg-brand-dark"
          >
            Ver todas las facturas
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_1fr]">
      <div className="relative overflow-hidden rounded-2xl bg-[#0a2f71] p-6">
        <div className="relative z-10">
          <div className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-white" />
            <h3 className="text-lg font-bold text-white">Facturas</h3>
          </div>
          <p className="mt-2 text-sm text-white/70">
            Consulta tus facturas de forma rápida y segura.
          </p>
          <button type="button" onClick={() => navigate('/portal-cliente/facturas')} className="mt-5 flex items-center gap-1 rounded-full bg-brand px-4 py-2.5 text-xs font-bold text-white hover:bg-brand-dark">
            Ver todas las facturas
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        <Receipt className="pointer-events-none absolute -bottom-6 -right-6 h-32 w-32 text-white/10" />
      </div>

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">Últimas facturas</h3>
          <button type="button" onClick={() => navigate('/portal-cliente/facturas')} className="flex items-center gap-1 text-xs font-semibold text-brand hover:underline">
            Ver todas
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {ultimas.length === 0 ? (
          <p className="py-6 text-center text-xs text-ink-tertiary">Sin facturas registradas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <tbody>
                {ultimas.map((f: PortalFactura) => (
                  <tr key={f.id} className="border-b border-surface-border last:border-0">
                    <td className="py-3 pr-3 font-semibold text-ink">{f.serie ?? ''}{f.folio ?? f.id}</td>
                    <td className="py-3 pr-3 text-ink-tertiary">{f.fecha}</td>
                    <td className="py-3 pr-3 font-semibold text-ink">
                      <CountUp end={f.total} prefix="$" suffix={` ${f.moneda}`} />
                    </td>
                    <td className="py-3 text-right">
                      <span className={clsx('rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize', FACTURA_ESTATUS_BADGE[f.estatus] ?? 'bg-surface text-ink-tertiary')}>
                        {f.estatus}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

function LoImportanteDelDia() {
  const navigate = useNavigate()
  const { data: resumen } = useQuery({ queryKey: ['portal-resumen'], queryFn: () => portalClienteService.getResumen() })
  const { data: items } = useQuery({ queryKey: ['portal-productos-servicios'], queryFn: () => portalClienteService.getProductosServicios() })

  const productos = (items ?? []).filter((p) => p.tipo === 'PRODUCTO')
  const servicios = (items ?? []).filter((p) => p.tipo === 'SERVICIO')
  const costoMensual = (items ?? []).filter((p) => p.recurrencia === 'MENSUAL').reduce((sum, p) => sum + p.precio, 0)

  const cajas = [
    {
      icon: FileText, color: 'text-blue-500', bg: 'bg-blue-500/10',
      valor: resumen?.stats.incidenciasAbiertas ?? 0, label: 'Solicitudes abiertas',
      cta: 'Ver solicitudes', ruta: '/portal-cliente/atencion',
    },
    {
      icon: Calendar, color: 'text-emerald-500', bg: 'bg-emerald-500/10',
      valor: resumen?.stats.citasProximas ?? 0, label: 'Citas próximas',
      cta: 'Ver calendario', ruta: '/portal-cliente/reuniones',
    },
    {
      icon: Box, color: 'text-brand', bg: 'bg-brand/10',
      valor: productos.length, label: 'Productos contratados',
      cta: 'Ver detalle', ruta: '/portal-cliente/productos',
    },
    {
      icon: Wrench, color: 'text-violet-500', bg: 'bg-violet-500/10',
      valor: servicios.length, label: 'Servicios contratados',
      cta: 'Ver detalle', ruta: '/portal-cliente/productos',
    },
    {
      icon: DollarSign, color: 'text-amber-500', bg: 'bg-amber-500/10',
      valor: costoMensual, prefix: '$', label: 'Costo mensual contratado',
      cta: 'Ver detalle', ruta: '/portal-cliente/productos',
    },
  ]

  return (
    <div>
      <h3 className="mb-4 text-sm font-bold text-ink">Lo importante hoy</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cajas.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => navigate(c.ruta)}
            className="flex flex-col items-center gap-2 rounded-xl border border-surface-border bg-card p-3.5 text-center shadow-card hover:bg-surface"
          >
            <span className="flex w-full items-center justify-center gap-2.5">
              <span className={clsx('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full', c.bg, c.color)}>
                <c.icon className="h-6 w-6" />
              </span>
              <CountUp end={c.valor} prefix={c.prefix} className="text-2xl font-bold text-ink" />
            </span>
            <span className="flex items-center justify-center gap-1.5 whitespace-nowrap text-[11px] leading-tight text-ink-tertiary">
              {c.label}
              <span className="text-base font-bold leading-none text-brand">→</span>
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

const ACTIVIDAD_ICONOS: Record<string, { icon: typeof Monitor; color: string; badge: string; label: string }> = {
  interaccion: { icon: Monitor, color: 'text-blue-500 bg-blue-50', badge: 'bg-blue-50 text-blue-600', label: 'Interacción' },
  cita: { icon: Calendar, color: 'text-purple-500 bg-purple-50', badge: 'bg-purple-50 text-purple-600', label: 'Reunión' },
  incidencia: { icon: Headphones, color: 'text-ink-tertiary bg-surface', badge: 'bg-surface text-ink-tertiary', label: 'Atención' },
}

function tiempoRelativo(fecha: string) {
  const ms = Date.now() - new Date(fecha).getTime()
  const horas = Math.floor(ms / 3_600_000)
  if (horas < 1) return 'Hace unos minutos'
  if (horas < 24) return `Hace ${horas} ${horas === 1 ? 'hora' : 'horas'}`
  const dias = Math.floor(horas / 24)
  return `Hace ${dias} ${dias === 1 ? 'día' : 'días'}`
}

function ActividadReciente() {
  const { data: resumen } = useQuery({ queryKey: ['portal-resumen'], queryFn: () => portalClienteService.getResumen() })
  const actividad = resumen?.actividad ?? []

  return (
    <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-ink">Actividad reciente</h3>
      </div>
      {actividad.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-tertiary">Sin actividad reciente.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {actividad.map((a, i) => {
            const cfg = ACTIVIDAD_ICONOS[a.tipo] ?? ACTIVIDAD_ICONOS.interaccion
            return (
              <li key={i} className="flex items-start gap-3">
                <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full', cfg.color)}>
                  <cfg.icon className="h-4 w-4" />
                </span>
                <div className="flex flex-1 items-start justify-between gap-3">
                  <div>
                    <p className="text-sm text-ink">{a.texto}</p>
                    <p className="mt-0.5 text-xs text-ink-tertiary">{tiempoRelativo(a.fecha)}</p>
                  </div>
                  <span className={clsx('flex-shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold', cfg.badge)}>
                    {cfg.label}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      )}
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

function AccesosRapidos() {
  const navigate = useNavigate()

  const items = [
    {
      label: 'Solicitar soporte', desc: 'Crea una nueva solicitud', icon: Plus,
      destacado: true, onClick: () => navigate('/portal-cliente/atencion'),
    },
    {
      label: 'Agendar reunión', desc: 'Reúnete con tu equipo', icon: Calendar,
      destacado: false, onClick: () => navigate('/portal-cliente/reuniones'),
    },
    {
      label: 'Ver canales', desc: 'Novedades y anuncios', icon: MessageCircle,
      destacado: false, onClick: () => navigate('/portal-cliente/canales'),
    },
  ]

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className={clsx(
            'flex items-center gap-3 rounded-2xl px-4 py-3.5 text-left transition-colors',
            item.destacado
              ? 'bg-[#0a2f71] text-white hover:bg-[#0a2f71]/90'
              : 'border border-surface-border bg-card text-ink hover:bg-surface'
          )}
        >
          <span className={clsx(
            'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full',
            item.destacado ? 'bg-white/15 text-white' : 'bg-brand/10 text-brand'
          )}>
            <item.icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className={clsx('truncate text-sm font-bold', item.destacado ? 'text-white' : 'text-ink')}>{item.label}</p>
            <p className={clsx('truncate text-xs', item.destacado ? 'text-white/70' : 'text-ink-tertiary')}>{item.desc}</p>
          </div>
        </button>
      ))}
    </div>
  )
}

export function PortalClientePrincipalPage() {
  const user = useAuthStore((s) => s.user)
  const primerNombre = user?.nombres?.split(' ')[0] ?? 'Cliente'

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-ink">
            Buenos días, {primerNombre}!
          </h1>
          <p className="mt-1 text-sm capitalize text-ink-tertiary">{saludoFecha()}</p>
          <p className="mt-2 max-w-md text-sm text-ink-tertiary">
            Aquí puedes consultar el estado de tus proyectos, reuniones, solicitudes, facturas y más.
          </p>
        </div>
        <div className="w-full lg:w-auto">
          <AccesosRapidos />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Reveal index={0}><ProyectoCard /></Reveal>
        <Reveal index={1}><ReunionCard /></Reveal>
        <Reveal index={2}><EncuestaCard /></Reveal>
      </div>

      <Reveal index={3}><LoImportanteDelDia /></Reveal>

      <Reveal index={4}><FacturasSeccion /></Reveal>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Reveal index={5}><ActividadReciente /></Reveal>
        <Reveal index={6}><CanalesComunicacion /></Reveal>
      </div>
    </div>
  )
}
