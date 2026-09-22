import { clsx } from 'clsx'
import {
  Megaphone, ChevronRight, Mail, Phone, Globe, Video, Zap,
  Clock, CalendarClock, Sun, Cloud, Moon, Send, Copy,
} from 'lucide-react'
import { useState } from 'react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Ardabito } from '@/components/effects/Ardabito'

// --- Datos de ejemplo — reemplazar por datos reales (horarios/enlaces de
// contacto configurados por la empresa) cuando el panel se conecte al
// backend. ---

interface Canal {
  nombre: string
  descripcion: string
  estado: string
  estadoColor: string
  puntos: { icon: React.ComponentType<{ className?: string }>; texto: string }[]
  telefono?: string
  accion: string
  href: string
  colorBoton: string
  icono?: React.ComponentType<{ className?: string }>
  img?: string
  colorIcono: string
}

const CANALES: Canal[] = [
  {
    nombre: 'WhatsApp', descripcion: 'Resuelve tus dudas al instante por nuestro WhatsApp.',
    estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
    puntos: [{ icon: Zap, texto: 'Respuesta rápida' }, { icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    accion: 'Abrir WhatsApp', href: 'https://wa.me/', colorBoton: 'bg-emerald-500 hover:bg-emerald-600',
    img: '/whatsapp.png', colorIcono: 'bg-emerald-500/10',
  },
  {
    nombre: 'Messenger', descripcion: 'Escríbenos por Facebook Messenger.',
    estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
    puntos: [{ icon: Zap, texto: 'Respuesta en minutos' }, { icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    accion: 'Abrir Messenger', href: 'https://m.me/', colorBoton: 'bg-blue-500 hover:bg-blue-600',
    img: '/messenger.png', colorIcono: 'bg-blue-500/10',
  },
  {
    nombre: 'Correo electrónico', descripcion: 'Envíanos un correo con el detalle de tu solicitud.',
    estado: 'Siempre disponible', estadoColor: 'bg-[#19b6bc]/10 text-[#19b6bc]',
    puntos: [{ icon: Clock, texto: 'Respuesta en menos de 24 h' }, { icon: CalendarClock, texto: 'Todos los días' }],
    accion: 'Redactar correo', href: 'mailto:contacto@agyda.com', colorBoton: 'bg-brand hover:bg-brand-dark',
    icono: Mail, colorIcono: 'bg-[#19b6bc]/10 text-[#19b6bc]',
  },
  {
    nombre: 'Teléfono', descripcion: 'Si prefieres, llámanos directamente.',
    estado: 'Disponible', estadoColor: 'bg-violet-500/10 text-violet-500',
    puntos: [{ icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    telefono: '+52 81 1234 5678',
    accion: 'Llamar ahora', href: 'tel:+528112345678', colorBoton: 'bg-violet-500 hover:bg-violet-600',
    icono: Phone, colorIcono: 'bg-violet-500/10 text-violet-500',
  },
  {
    nombre: 'Google Meet', descripcion: 'Agenda una videollamada con nuestro equipo.',
    estado: 'Con cita previa', estadoColor: 'bg-amber-500/10 text-amber-500',
    puntos: [{ icon: Video, texto: 'Reuniones personalizadas' }, { icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    accion: 'Agendar reunión', href: '/portal-cliente/reuniones', colorBoton: 'bg-brand hover:bg-brand-dark',
    img: '/google-meet.png', colorIcono: 'bg-[#19b6bc]/10',
  },
  {
    nombre: 'Sitio web', descripcion: 'Conoce más sobre nuestros servicios y soluciones.',
    estado: 'Siempre disponible', estadoColor: 'bg-[#19b6bc]/10 text-[#19b6bc]',
    puntos: [{ icon: Zap, texto: 'Información actualizada' }, { icon: Clock, texto: 'Disponible 24/7' }],
    accion: 'Visitar sitio web', href: 'https://ardabytec.com', colorBoton: 'bg-brand hover:bg-brand-dark',
    icono: Globe, colorIcono: 'bg-sky-500/10 text-sky-500',
  },
]

const HORARIOS = [
  { dia: 'Lunes - Viernes', horario: '9:00 a.m. - 6:00 p.m.', icon: Sun },
  { dia: 'Sábados', horario: '9:00 a.m. - 1:00 p.m.', icon: Cloud },
  { dia: 'Domingos', horario: 'Cerrado', icon: Moon },
]

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Canales</span>
    </div>
  )
}

function HeaderCanales() {
  return (
    <div className="relative flex flex-wrap items-center justify-between gap-4 overflow-hidden rounded-3xl border border-surface-border bg-card px-6 py-6 shadow-card sm:px-8">
      <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[#19b6bc]/10" />
      <div className="pointer-events-none absolute -right-24 bottom-0 h-40 w-40 rounded-full bg-brand/10" />

      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md">
          <Megaphone className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-ink">Canales</h1>
          <p className="mt-0.5 text-sm text-ink-tertiary">
            Conéctate con nosotros por el medio que más te convenga. Estamos para ayudarte.
          </p>
        </div>
      </div>

      <p className="relative hidden text-right text-sm font-semibold italic text-ink-tertiary md:block">
        Diferentes formas.<br />el mismo compromiso.
      </p>
    </div>
  )
}

function TelefonoCopiable({ telefono }: { telefono: string }) {
  const [copiado, setCopiado] = useState(false)
  function copiar() {
    navigator.clipboard?.writeText(telefono)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 1500)
  }
  return (
    <button
      type="button"
      onClick={copiar}
      className="flex items-center gap-1.5 text-sm font-bold text-violet-500 hover:underline"
    >
      {telefono}
      <Copy className="h-3.5 w-3.5" />
      {copiado && <span className="text-[10px] font-normal text-ink-tertiary">¡Copiado!</span>}
    </button>
  )
}

function CanalCard({ c }: { c: Canal }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-surface-border bg-card p-5 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <span className={clsx('flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl', c.colorIcono)}>
          {c.img ? <img src={c.img} alt="" className="h-7 w-7 object-contain" /> : c.icono && <c.icono className="h-6 w-6" />}
        </span>
        <span className={clsx('rounded-full px-2.5 py-1 text-[10px] font-bold', c.estadoColor)}>{c.estado}</span>
      </div>

      <div>
        <p className="flex items-center gap-1 text-sm font-bold text-ink">
          {c.nombre}
          <ChevronRight className="h-3.5 w-3.5 text-ink-tertiary" />
        </p>
        <p className="mt-0.5 text-xs text-ink-tertiary">{c.descripcion}</p>
      </div>

      {c.telefono && <TelefonoCopiable telefono={c.telefono} />}

      <div className="flex flex-col gap-1">
        {c.puntos.map((p) => (
          <span key={p.texto} className="flex items-center gap-1.5 text-[11px] text-ink-tertiary">
            <p.icon className="h-3.5 w-3.5 flex-shrink-0" />
            {p.texto}
          </span>
        ))}
      </div>

      <a
        href={c.href}
        target={c.href.startsWith('http') ? '_blank' : undefined}
        rel={c.href.startsWith('http') ? 'noreferrer' : undefined}
        className={clsx('mt-1 flex items-center justify-center gap-1.5 rounded-full py-2.5 text-xs font-bold text-white transition-colors', c.colorBoton)}
      >
        {c.img ? <img src={c.img} alt="" className="h-4 w-4 object-contain brightness-0 invert" /> : c.icono && <c.icono className="h-3.5 w-3.5" />}
        {c.accion}
        <ChevronRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

function ArdabitoCard() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center">
        <div className="mb-1 flex aspect-square w-36 flex-shrink-0 items-center justify-center rounded-full bg-surface px-4 text-center shadow-sm">
          <div>
            <p className="text-sm font-bold leading-tight text-ink">¡Hola!<br />Soy Ardabito</p>
            <p className="mt-1 text-[11px] leading-tight text-ink-tertiary">¿En qué puedo<br />ayudarte?</p>
          </div>
        </div>
        <div className="h-44 w-44 flex-shrink-0">
          <Ardabito />
        </div>
      </div>

      <div className="rounded-2xl border border-surface-border bg-card p-5 shadow-card">
        <h3 className="text-sm font-bold text-ink">¿Necesitas ayuda?</h3>
        <p className="mt-1 text-xs text-ink-tertiary">
          Si no sabes qué canal usar, cuéntanos brevemente tu consulta y te orientamos.
        </p>
        <a
          href="/portal-cliente/atencion"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full bg-brand py-2.5 text-xs font-bold text-white hover:bg-brand-dark"
        >
          <Send className="h-3.5 w-3.5" />
          Enviar mensaje rápido
        </a>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-600 dark:text-amber-400">
        <Zap className="h-4 w-4 flex-shrink-0" />
        <span>Para temas urgentes, te recomendamos escribirnos por WhatsApp.</span>
      </div>
    </div>
  )
}

function HorariosFooter() {
  return (
    <div className="flex flex-col items-center justify-between gap-5 rounded-2xl border border-surface-border bg-card p-5 shadow-card sm:flex-row">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
          <Clock className="h-4 w-4 text-brand" />
          Horarios de atención
        </h3>
        <p className="mt-0.5 text-xs text-ink-tertiary">Te atendemos en los siguientes horarios:</p>
        <div className="mt-3 flex flex-wrap gap-6">
          {HORARIOS.map((h) => (
            <div key={h.dia} className="flex items-center gap-2">
              <h.icon className="h-5 w-5 flex-shrink-0 text-amber-500" />
              <div>
                <p className="text-xs font-bold text-ink">{h.dia}</p>
                <p className="text-[11px] text-ink-tertiary">{h.horario}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="hidden items-center gap-3 border-l border-surface-border pl-5 sm:flex">
        <CalendarClock className="h-8 w-8 flex-shrink-0 text-brand/40" />
        <p className="max-w-[140px] text-xs font-semibold italic text-ink-tertiary">
          Estamos aquí cuando nos necesites.
        </p>
      </div>
    </div>
  )
}

export function PortalClienteCanalesPage() {
  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderCanales />

      <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CANALES.map((c) => <CanalCard key={c.nombre} c={c} />)}
        </div>
        <ArdabitoCard />
      </Reveal>

      <Reveal index={1}>
        <HorariosFooter />
      </Reveal>
    </div>
  )
}
