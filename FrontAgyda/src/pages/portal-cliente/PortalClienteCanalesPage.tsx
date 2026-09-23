import { clsx } from 'clsx'
import {
  Megaphone, ChevronRight, ArrowRight, Mail, Phone, Globe, Video, Zap,
  Clock, CalendarClock, Sun, Cloud, Moon, Copy,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Ardabito } from '@/components/effects/Ardabito'
import canalesHero from '@/assets/canales-hero.png'

// Efecto máquina de escribir: revela el texto letra por letra al montar —
// da la sensación de que Ardabito "está escribiendo" su saludo en vez de
// aparecer todo de golpe.
function useTypewriter(texto: string, velocidadMs = 28) {
  const [visible, setVisible] = useState('')

  useEffect(() => {
    setVisible('')
    let i = 0
    const id = setInterval(() => {
      i += 1
      setVisible(texto.slice(0, i))
      if (i >= texto.length) clearInterval(id)
    }, velocidadMs)
    return () => clearInterval(id)
  }, [texto, velocidadMs])

  return visible
}

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
  imgBoton?: string
  colorIcono: string
}

const CANALES: Canal[] = [
  {
    nombre: 'WhatsApp', descripcion: 'Resuelve tus dudas al instante por nuestro WhatsApp.',
    estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
    puntos: [{ icon: Zap, texto: 'Respuesta rápida' }, { icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    accion: 'Abrir WhatsApp', href: 'https://wa.me/', colorBoton: 'bg-emerald-500 hover:bg-emerald-600',
    img: '/whatsapp.png', imgBoton: '/whatsapp-white.png', colorIcono: 'bg-emerald-500/10',
  },
  {
    nombre: 'Messenger', descripcion: 'Escríbenos por Facebook Messenger.',
    estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
    puntos: [{ icon: Zap, texto: 'Respuesta en minutos' }, { icon: Clock, texto: 'Lun - Vie · 9:00 a.m. - 6:00 p.m.' }],
    accion: 'Abrir Messenger', href: 'https://m.me/', colorBoton: 'bg-blue-500 hover:bg-blue-600',
    img: '/messenger.png', imgBoton: '/messenger-white.png', colorIcono: 'bg-blue-500/10',
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
  { dia: 'Lunes - Viernes', horario: '9:00 a.m. - 6:00 p.m.', icon: Sun, color: 'text-amber-500' },
  { dia: 'Sábados', horario: '9:00 a.m. - 2:00 p.m.', icon: Cloud, color: 'text-blue-500' },
  { dia: 'Domingos', horario: 'Cerrado', icon: Moon, color: 'text-violet-500' },
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
    <div
      className="relative flex h-[170px] flex-shrink-0 items-center justify-between gap-6 overflow-hidden rounded-3xl bg-cover bg-center px-6 shadow-md sm:px-8"
      style={{ backgroundImage: `url(${canalesHero})` }}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#0a2f71]/90 via-[#0a2f71]/70 to-[#0a2f71]/30" />
      <div className="relative flex items-center gap-4">
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#19b6bc] to-[#00537f] text-white shadow-md">
          <Megaphone className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold text-white">Canales</h1>
          <p className="mt-0.5 text-sm text-white/80">
            Conéctate con nosotros por el medio que más te convenga. Estamos para ayudarte.
          </p>
        </div>
      </div>

      <div className="relative hidden flex-shrink-0 flex-col gap-1.5 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm md:flex">
        <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/90">
          <Clock className="h-3.5 w-3.5" />
          Horarios de atención
        </p>
        {HORARIOS.map((h) => (
          <div key={h.dia} className="flex items-center gap-2">
            <h.icon className={clsx('h-3.5 w-3.5 flex-shrink-0', h.color)} />
            <span className="text-[11px] text-white/80">{h.dia}: <span className="font-semibold text-white">{h.horario}</span></span>
          </div>
        ))}
      </div>
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
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center">
          {c.img ? (
            <img src={c.img} alt="" className="h-9 w-9 object-contain" />
          ) : (
            c.icono && <c.icono className={clsx('h-8 w-8', c.colorIcono.split(' ').filter((cl) => cl.startsWith('text-')).join(' '))} />
          )}
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
        {c.imgBoton ? (
          <img src={c.imgBoton} alt="" className="h-4 w-4 object-contain" />
        ) : c.img ? (
          <img src={c.img} alt="" className="h-4 w-4 object-contain brightness-0 invert" />
        ) : (
          c.icono && <c.icono className="h-3.5 w-3.5" />
        )}
        {c.accion}
        <ArrowRight className="h-3.5 w-3.5" />
      </a>
    </div>
  )
}

const SALUDO_ARDABITO = '¡Hola! Soy Ardabito. ¿En qué puedo ayudarte?'

function ArdabitoCard() {
  const textoVisible = useTypewriter(SALUDO_ARDABITO)

  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex justify-center pt-14">
        <div className="h-64 w-64 flex-shrink-0">
          <Ardabito />
        </div>
        <div className="absolute right-4 top-0 z-10 flex aspect-square w-24 flex-shrink-0 items-center justify-center rounded-full border border-surface-border bg-card px-2.5 text-center shadow-card">
          <p className="text-[10px] font-semibold leading-tight text-ink">
            {textoVisible}
            <span className="ml-0.5 inline-block w-[2px] animate-pulse bg-ink align-middle" style={{ height: '0.85em' }} />
          </p>
          {/* Pico del globo apuntando hacia Ardabito — triángulo CSS puro
             (border-trick), no un cuadrado rotado, para que la punta salga
             limpia sin esquinas rectas visibles. Doble capa: una ligeramente
             más grande con el color del borde, y encima la del color de
             fondo, para simular el contorno del globo en la punta. */}
          <span className="absolute -bottom-[9px] left-5 h-0 w-0 border-x-[9px] border-t-[9px] border-x-transparent border-t-surface-border" />
          <span className="absolute -bottom-2 left-[22px] h-0 w-0 border-x-[7px] border-t-[7px] border-x-transparent border-t-card" />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 p-3 text-[11px] text-amber-600 dark:text-amber-400">
        <Zap className="h-4 w-4 flex-shrink-0" />
        <span>Para temas urgentes, te recomendamos escribirnos por WhatsApp.</span>
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
    </div>
  )
}
