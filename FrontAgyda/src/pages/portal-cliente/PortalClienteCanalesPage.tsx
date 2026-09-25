import { clsx } from 'clsx'
import { useQuery } from '@tanstack/react-query'
import {
  Megaphone, ChevronRight, ArrowRight, Mail, Phone, Globe, Video, Zap,
  Clock, CalendarClock, Copy, MessageCircle, Sun, Cloud, Moon,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Reveal } from '@/pages/portal-cliente/components/Reveal'
import { Ardabito } from '@/components/effects/Ardabito'
import { personalizacionService } from '@/services/personalizacion.service'
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

// Distingue "celular real" (tiene app de teléfono para recibir un tel:) de
// tablet/computadora (aunque sea táctil, no hay con qué llamar). Un ancho de
// pantalla angosto + puntero de tipo touch es la señal más confiable sin
// depender del user-agent (que un iPad puede falsear como desktop).
function useEsCelular() {
  const [esCelular, setEsCelular] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px) and (pointer: coarse)')
    setEsCelular(mq.matches)
    const onChange = (e: MediaQueryListEvent) => setEsCelular(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return esCelular
}

// --- Conectado a datos reales: personalizacionService.get() ->
// config.canalesPortal (editable en Configuración → General → Portal de
// Cliente → Canales de contacto). Solo se muestran los canales que el
// empleado haya habilitado; si ninguno está habilitado, se ve un mensaje
// en vez de datos inventados. "Agendar reunión" es la única entrada fija,
// ya que no depende de esa configuración (usa el propio calendario real). ---

const DIAS_LABEL: Record<string, string> = {
  '1': 'Lun', '2': 'Mar', '3': 'Mié', '4': 'Jue', '5': 'Vie', '6': 'Sáb', '7': 'Dom',
}

// Agrupa días consecutivos en rangos ("Lun - Vie") en vez de listarlos todos,
// para que se lea igual de natural que el texto libre que reemplaza.
function formatearDias(diasSemana: string): string {
  const dias = diasSemana.split(',').map((d) => d.trim()).filter((d) => DIAS_LABEL[d]).sort()
  if (dias.length === 0) return ''
  const grupos: string[][] = []
  let actual: string[] = [dias[0]]
  for (let i = 1; i < dias.length; i++) {
    if (Number(dias[i]) === Number(actual[actual.length - 1]) + 1) {
      actual.push(dias[i])
    } else {
      grupos.push(actual)
      actual = [dias[i]]
    }
  }
  grupos.push(actual)
  return grupos
    .map((g) => (g.length > 1 ? `${DIAS_LABEL[g[0]]} - ${DIAS_LABEL[g[g.length - 1]]}` : DIAS_LABEL[g[0]]))
    .join(', ')
}

function formatearHorario(cfg: {
  diasSemana: string; horarioInicio: string; horarioFin: string
  sabadoHabilitado?: boolean; sabadoHorarioInicio?: string; sabadoHorarioFin?: string
} | undefined): string {
  if (!cfg || !cfg.horarioInicio || !cfg.horarioFin) return ''
  const dias = formatearDias(cfg.diasSemana)
  const principal = dias ? `${dias} · ${cfg.horarioInicio} - ${cfg.horarioFin}` : `${cfg.horarioInicio} - ${cfg.horarioFin}`
  if (cfg.sabadoHabilitado && cfg.sabadoHorarioInicio && cfg.sabadoHorarioFin) {
    return `${principal} · Sáb ${cfg.sabadoHorarioInicio} - ${cfg.sabadoHorarioFin}`
  }
  return principal
}

interface FilaHorario {
  dia: string
  horario: string
  icon: typeof Sun
  color: string
}

// Desglosa la config real en 3 filas fijas para el header (Lun-Vie, Sábado,
// Domingo), con su propio ícono — Domingo siempre "Cerrado" porque hoy no
// hay un tercer bloque de horario para ese día en la configuración.
function construirFilasHorario(cfg: {
  horarioInicio: string; horarioFin: string
  sabadoHabilitado?: boolean; sabadoHorarioInicio?: string; sabadoHorarioFin?: string
} | undefined): FilaHorario[] {
  if (!cfg || !cfg.horarioInicio || !cfg.horarioFin) return []
  const sabado = cfg.sabadoHabilitado && cfg.sabadoHorarioInicio && cfg.sabadoHorarioFin
    ? `${cfg.sabadoHorarioInicio} - ${cfg.sabadoHorarioFin}`
    : 'Cerrado'
  return [
    { dia: 'Lunes - Viernes', horario: `${cfg.horarioInicio} - ${cfg.horarioFin}`, icon: Sun, color: 'text-amber-400' },
    { dia: 'Sábado', horario: sabado, icon: Cloud, color: 'text-sky-400' },
    { dia: 'Domingo', horario: 'Cerrado', icon: Moon, color: 'text-violet-400' },
  ]
}

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
  // El botón "Llamar ahora" (href=tel:) solo tiene sentido en un celular real
  // — en tablet/computadora no hay app de teléfono que lo reciba, así que se
  // reemplaza por una descripción de qué hacer con el número copiable.
  esTelefono?: boolean
}

function construirCanales(cfg: import('@/services/personalizacion.service').CanalesPortalConfig | undefined): Canal[] {
  if (!cfg) return []
  const horario = formatearHorario(cfg) || 'Horario no configurado'
  const canales: Canal[] = []

  if (cfg.whatsappHabilitado && cfg.whatsappNumero) {
    canales.push({
      nombre: 'WhatsApp', descripcion: 'Resuelve tus dudas al instante por nuestro WhatsApp.',
      estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
      puntos: [{ icon: Zap, texto: 'Respuesta rápida' }, { icon: Clock, texto: horario }],
      accion: 'Abrir WhatsApp', href: `https://wa.me/${cfg.whatsappNumero.replace(/\D/g, '')}`, colorBoton: 'bg-emerald-500 hover:bg-emerald-600',
      img: '/whatsapp.png', imgBoton: '/whatsapp-white.png', colorIcono: 'bg-emerald-500/10',
    })
  }
  if (cfg.messengerHabilitado && cfg.messengerUrl) {
    canales.push({
      nombre: 'Messenger', descripcion: 'Escríbenos por Facebook Messenger.',
      estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
      puntos: [{ icon: Zap, texto: 'Respuesta en minutos' }, { icon: Clock, texto: horario }],
      accion: 'Abrir Messenger', href: cfg.messengerUrl, colorBoton: 'bg-blue-500 hover:bg-blue-600',
      img: '/messenger.png', imgBoton: '/messenger-white.png', colorIcono: 'bg-blue-500/10',
    })
  }
  if (cfg.emailHabilitado && cfg.email) {
    canales.push({
      nombre: 'Correo electrónico', descripcion: 'Envíanos un correo con el detalle de tu solicitud.',
      estado: 'Siempre disponible', estadoColor: 'bg-[#19b6bc]/10 text-[#19b6bc]',
      puntos: [{ icon: Clock, texto: 'Respuesta en menos de 24 h' }, { icon: CalendarClock, texto: 'Todos los días' }],
      accion: 'Redactar correo', href: `mailto:${cfg.email}`, colorBoton: 'bg-brand hover:bg-brand-dark',
      icono: Mail, colorIcono: 'bg-[#19b6bc]/10 text-[#19b6bc]',
    })
  }
  if (cfg.telefonoHabilitado && cfg.telefono) {
    canales.push({
      nombre: 'Teléfono', descripcion: 'Si prefieres, llámanos directamente.',
      estado: 'Disponible', estadoColor: 'bg-violet-500/10 text-violet-500',
      puntos: [{ icon: Clock, texto: horario }],
      telefono: cfg.telefono,
      accion: 'Llamar ahora', href: `tel:${cfg.telefono.replace(/\D/g, '')}`, colorBoton: 'bg-violet-500 hover:bg-violet-600',
      icono: Phone, colorIcono: 'bg-violet-500/10 text-violet-500',
      esTelefono: true,
    })
  }
  canales.push({
    nombre: 'Google Meet', descripcion: 'Agenda una videollamada con nuestro equipo.',
    estado: 'Con cita previa', estadoColor: 'bg-amber-500/10 text-amber-500',
    puntos: [{ icon: Video, texto: 'Reuniones personalizadas' }, { icon: Clock, texto: horario }],
    accion: 'Agendar reunión', href: '/portal-cliente/reuniones', colorBoton: 'bg-brand hover:bg-brand-dark',
    img: '/google-meet.png', colorIcono: 'bg-[#19b6bc]/10',
  })
  if (cfg.sitioWebHabilitado && cfg.sitioWebUrl) {
    canales.push({
      nombre: 'Sitio web', descripcion: 'Conoce más sobre nuestros servicios y soluciones.',
      estado: 'Siempre disponible', estadoColor: 'bg-[#19b6bc]/10 text-[#19b6bc]',
      puntos: [{ icon: Zap, texto: 'Información actualizada' }, { icon: Clock, texto: 'Disponible 24/7' }],
      accion: 'Visitar sitio web', href: cfg.sitioWebUrl, colorBoton: 'bg-brand hover:bg-brand-dark',
      icono: Globe, colorIcono: 'bg-sky-500/10 text-sky-500',
    })
  }

  return canales
}

function Breadcrumb() {
  return (
    <div className="flex items-center gap-1.5 text-xs text-ink-tertiary">
      <span>Inicio</span>
      <ChevronRight className="h-3 w-3" />
      <span className="font-semibold text-ink">Canales</span>
    </div>
  )
}

function HeaderCanales({ filasHorario }: { filasHorario: FilaHorario[] }) {
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

      {filasHorario.length > 0 && (
        <div className="relative hidden flex-shrink-0 flex-col gap-1.5 rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm md:flex">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-white/90">
            <Clock className="h-3.5 w-3.5" />
            Horario de atención
          </p>
          {filasHorario.map((f) => (
            <div key={f.dia} className="flex items-center gap-2">
              <f.icon className={clsx('h-3.5 w-3.5 flex-shrink-0', f.color)} />
              <span className="text-[11px] text-white/80">{f.dia}: <span className="font-semibold text-white">{f.horario}</span></span>
            </div>
          ))}
        </div>
      )}
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
  const esCelular = useEsCelular()
  // En tablet/computadora no hay app de teléfono que reciba un tel: — se
  // oculta el botón de llamar y se explica qué hacer con el número copiable
  // de arriba en su lugar, para no mostrar una acción que no va a funcionar.
  const ocultarBotonLlamar = c.esTelefono && !esCelular

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

      {ocultarBotonLlamar ? (
        <p className="mt-1 rounded-xl bg-surface px-3 py-2.5 text-center text-[11px] text-ink-tertiary">
          Copia el número de arriba y márcalo desde tu teléfono.
        </p>
      ) : (
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
      )}
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
  const { data } = useQuery({ queryKey: ['personalizacion'], queryFn: () => personalizacionService.get() })
  const canales = construirCanales(data?.canalesPortal)

  return (
    <div className="mx-auto flex max-w-[1280px] flex-col gap-6">
      <Breadcrumb />
      <HeaderCanales filasHorario={construirFilasHorario(data?.canalesPortal)} />

      <Reveal index={0} className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_280px]">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {canales.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-surface-border py-12 text-center">
              <MessageCircle className="h-8 w-8 text-ink-tertiary" />
              <p className="text-sm font-semibold text-ink">Aún no hay canales de contacto configurados.</p>
            </div>
          ) : (
            canales.map((c) => <CanalCard key={c.nombre} c={c} />)
          )}
        </div>
        <ArdabitoCard />
      </Reveal>
    </div>
  )
}
