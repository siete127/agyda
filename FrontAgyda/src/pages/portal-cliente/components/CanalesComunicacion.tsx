import { useEffect, useState } from 'react'
import { clsx } from 'clsx'
import { ChevronRight, ArrowRight, Mail, Phone, Globe, Video, Zap, Clock, CalendarClock, Copy } from 'lucide-react'
import type { CanalesPortalConfig } from '@/services/personalizacion.service'

// Compartido entre PortalClienteCanalesPage (vista completa) y
// PortalClientePrincipalPage (resumen en el dashboard) — ambos deben mostrar
// exactamente los mismos canales, textos y comportamiento, ya que salen de la
// misma configuración real (Configuración → Portal de Cliente → Canales).

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

export function formatearHorario(cfg: CanalesPortalConfig | undefined): string {
  if (!cfg || !cfg.horarioInicio || !cfg.horarioFin) return ''
  const dias = formatearDias(cfg.diasSemana)
  const principal = dias ? `${dias} · ${cfg.horarioInicio} - ${cfg.horarioFin}` : `${cfg.horarioInicio} - ${cfg.horarioFin}`
  if (cfg.sabadoHabilitado && cfg.sabadoHorarioInicio && cfg.sabadoHorarioFin) {
    return `${principal} · Sáb ${cfg.sabadoHorarioInicio} - ${cfg.sabadoHorarioFin}`
  }
  return principal
}

export interface Canal {
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
  // La primera vez, el clic se intercepta para preguntar Gmail/Outlook (ver
  // ModalProveedorCorreo) en vez de navegar directo — se pregunta cada vez,
  // sin recordar una elección previa (puede variar según dónde esté el
  // cliente en ese momento).
  esCorreo?: boolean
  email?: string
}

function construirHrefCorreo(email: string, proveedor: 'gmail' | 'outlook'): string {
  return proveedor === 'gmail'
    ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email)}`
    : `mailto:${email}`
}

// Solo se muestran los canales que el empleado haya habilitado en
// Configuración → Portal de Cliente → Canales; si ninguno está habilitado,
// el consumidor decide qué mostrar en su lugar (mensaje vacío, etc.).
// "Agendar reunión" es la única entrada fija, ya que no depende de esa
// configuración (usa el propio calendario real).
export function construirCanales(cfg: CanalesPortalConfig | undefined): Canal[] {
  if (!cfg) return []
  const horario = formatearHorario(cfg) || 'Horario no configurado'
  const canales: Canal[] = []

  if (cfg.whatsappHabilitado && cfg.whatsappNumero) {
    canales.push({
      nombre: 'WhatsApp', descripcion: 'Resuelve tus dudas al instante por nuestro WhatsApp.',
      estado: 'En línea', estadoColor: 'bg-emerald-500/10 text-emerald-500',
      puntos: [{ icon: Zap, texto: 'Respuesta rápida' }, { icon: Clock, texto: horario }],
      accion: 'Enviar mensaje', href: `https://wa.me/${cfg.whatsappNumero.replace(/\D/g, '')}`, colorBoton: 'bg-emerald-500 hover:bg-emerald-600',
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
      esCorreo: true, email: cfg.email,
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

// Distingue "celular real" (tiene app de teléfono para recibir un tel:) de
// tablet/computadora (aunque sea táctil, no hay con qué llamar). Un ancho de
// pantalla angosto + puntero de tipo touch es la señal más confiable sin
// depender del user-agent (que un iPad puede falsear como desktop).
export function useEsCelular() {
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

export function TelefonoCopiable({ telefono }: { telefono: string }) {
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

// Se pregunta Gmail (navegador) u Outlook (aplicación) cada vez que el
// cliente da clic en "Redactar correo" — no se recuerda una elección previa.
function ModalProveedorCorreo({ email, onElegir, onClose }: {
  email: string
  onElegir: (proveedor: 'gmail' | 'outlook') => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <p className="text-base font-bold text-ink">¿Dónde quieres abrir tu correo?</p>
        <p className="mt-1 text-xs text-ink-tertiary">Se abrirá una redacción nueva para {email}. Recordaremos tu elección en este navegador.</p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => onElegir('gmail')}
            className="rounded-xl border-2 border-gray-200 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-brand/5"
          >
            Gmail
            <span className="block text-[11px] font-normal text-ink-tertiary">Se abre en una pestaña del navegador</span>
          </button>
          <button
            type="button"
            onClick={() => onElegir('outlook')}
            className="rounded-xl border-2 border-gray-200 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:border-brand hover:bg-brand/5"
          >
            Outlook u otra aplicación
            <span className="block text-[11px] font-normal text-ink-tertiary">Se abre con tu programa de correo predeterminado</span>
          </button>
        </div>
        <button type="button" onClick={onClose} className="mt-3 w-full text-center text-xs font-semibold text-ink-tertiary hover:underline">
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function CanalCard({ c }: { c: Canal }) {
  const esCelular = useEsCelular()
  const [modalCorreoAbierto, setModalCorreoAbierto] = useState(false)
  // En tablet/computadora no hay app de teléfono que reciba un tel: — se
  // oculta el botón de llamar y se explica qué hacer con el número copiable
  // de arriba en su lugar, para no mostrar una acción que no va a funcionar.
  const ocultarBotonLlamar = c.esTelefono && !esCelular

  function abrirCorreo(proveedor: 'gmail' | 'outlook') {
    window.open(construirHrefCorreo(c.email!, proveedor), proveedor === 'gmail' ? '_blank' : '_self')
    setModalCorreoAbierto(false)
  }

  function onClickBoton(e: React.MouseEvent) {
    if (!c.esCorreo) return
    e.preventDefault()
    setModalCorreoAbierto(true)
  }

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
          onClick={onClickBoton}
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

      {modalCorreoAbierto && c.email && (
        <ModalProveedorCorreo
          email={c.email}
          onElegir={abrirCorreo}
          onClose={() => setModalCorreoAbierto(false)}
        />
      )}
    </div>
  )
}

// Versión compacta para el dashboard/Principal — mismo Canal y comportamiento
// que CanalCard (incluido el modal de correo), en una tarjeta angosta tipo
// ícono+botón en vez de la tarjeta completa con descripción/puntos.
export function CanalCardCompacta({ c }: { c: Canal }) {
  const esCelular = useEsCelular()
  const [modalCorreoAbierto, setModalCorreoAbierto] = useState(false)
  const ocultarBotonLlamar = c.esTelefono && !esCelular

  function abrirCorreo(proveedor: 'gmail' | 'outlook') {
    window.open(construirHrefCorreo(c.email!, proveedor), proveedor === 'gmail' ? '_blank' : '_self')
    setModalCorreoAbierto(false)
  }

  function onClickBoton(e: React.MouseEvent) {
    if (!c.esCorreo) return
    e.preventDefault()
    setModalCorreoAbierto(true)
  }

  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-surface-border p-3 text-center">
      {c.img ? (
        <img src={c.img} alt={c.nombre} className="h-10 w-10 object-contain" />
      ) : (
        <span className={clsx('flex h-10 w-10 items-center justify-center rounded-full', c.colorIcono)}>
          {c.icono && <c.icono className={clsx('h-5 w-5', c.colorIcono.split(' ').filter((cl) => cl.startsWith('text-')).join(' '))} />}
        </span>
      )}
      <div>
        <p className="text-xs font-bold text-ink">{c.nombre}</p>
        <p className="text-[10px] text-ink-tertiary">{c.descripcion}</p>
      </div>
      {c.telefono && <TelefonoCopiable telefono={c.telefono} />}
      {ocultarBotonLlamar ? (
        <p className="mt-1 w-full text-center text-[10px] text-ink-tertiary">Copia y marca desde tu celular</p>
      ) : (
        <a
          href={c.href}
          onClick={onClickBoton}
          target={c.href.startsWith('http') ? '_blank' : undefined}
          rel={c.href.startsWith('http') ? 'noreferrer' : undefined}
          className="mt-1 w-full rounded-full border border-brand py-1.5 text-[11px] font-semibold text-brand hover:bg-brand/5"
        >
          {c.accion}
        </a>
      )}
      {modalCorreoAbierto && c.email && (
        <ModalProveedorCorreo
          email={c.email}
          onElegir={abrirCorreo}
          onClose={() => setModalCorreoAbierto(false)}
        />
      )}
    </div>
  )
}
