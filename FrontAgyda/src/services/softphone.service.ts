import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  SessionState,
  UserAgent,
  Web,
  type Session,
} from 'sip.js'
import { api } from '@/lib/axios'
import { useSoftphoneStore } from '@/stores/softphone.store'

/**
 * Softphone SIP propio: sip.js registra la extensión del agente contra el PBX
 * (Asterisk por WSS) y el audio va por WebRTC directo en esta pestaña. La UI
 * nunca toca sip.js: llama a estas funciones y lee useSoftphoneStore.
 *
 * Todo vive a nivel de módulo (no en un componente) para que el registro y la
 * llamada sobrevivan a la navegación entre módulos — a diferencia del iframe
 * de VICIdial, aquí no hay nada que se recree al cambiar de ruta.
 */

export interface PbxConfig {
  pbx: string | null
  wss: string
  sipDomain: string
}

const AUDIO_CONSTRAINTS = { audio: true, video: false } as const
const REGISTER_EXPIRES_S = 300
const FIN_VISIBLE_MS = 2500
const RECONEXION_MAX_MS = 30_000
const ECHO_TEST = '600'

let userAgent: UserAgent | null = null
let registerer: Registerer | null = null
let sesion: Session | null = null
let config: PbxConfig | null = null
let desconexionManual = false
let intentosReconexion = 0
let timerReconexion: ReturnType<typeof setTimeout> | null = null
let timerFin: ReturnType<typeof setTimeout> | null = null

const store = () => useSoftphoneStore.getState()

// La config se pide al backend (proxy con caché): el PBX solo permite CORS
// desde el dominio de producción, así que en local fallaría directo.
async function getPbxConfig(vistaId: number): Promise<PbxConfig> {
  const { data } = await api.get('/webphone/pbx/config', { params: { vistaId } })
  return data.data as PbxConfig
}

// Extensión y contraseña SIP que el admin le asignó al agente en esta vista
// (Configuración → Telefonía → Credenciales). null = aún no tiene.
export async function getMiCredencialSip(vistaId: number): Promise<{ extension: string; password: string } | null> {
  const { data } = await api.get('/webphone/credenciales/mi-sip', { params: { vistaId } })
  return data.data ?? null
}

// ── Protección contra intentos repetidos ────────────────────────────────
// Cada intento con contraseña mala son varios REGISTER rechazados, y un
// Asterisk con fail2ban banea la IP de toda la oficina. Por eso: (1) nunca dos
// conexiones en paralelo (React StrictMode monta dos veces), y (2) si el PBX
// rechazó estas credenciales, no se reintenta solo — ni al recargar ni al
// volver a /webphone — hasta que el agente pulse Conectar o cambien las
// credenciales. Se recuerda una huella, nunca la contraseña.
const CLAVE_RECHAZO = 'softphone:credenciales-rechazadas'
const MSG_RECHAZO = 'El PBX rechazó la extensión o contraseña. Pide a tu administrador que la verifique y luego pulsa Reintentar.'
let conexionEnCurso: Promise<void> | null = null

function huella(vistaId: number, extension: string, password: string): string {
  let h = 5381
  for (const c of `${vistaId}|${extension}|${password}`) h = ((h << 5) + h + c.charCodeAt(0)) | 0
  return String(h)
}
function leerRechazo(): string | null {
  try { return sessionStorage.getItem(CLAVE_RECHAZO) } catch { return null }
}
function guardarRechazo(valor: string | null) {
  try {
    if (valor) sessionStorage.setItem(CLAVE_RECHAZO, valor)
    else sessionStorage.removeItem(CLAVE_RECHAZO)
  } catch { /* sin storage: solo se pierde la protección entre recargas */ }
}
let huellaActual: string | null = null

// Punto de entrada de la UI: conecta con la extensión asignada en la vista.
// `manual` = el agente pulsó Conectar/Reintentar; solo así se reintenta con
// credenciales que el PBX ya rechazó.
export function conectarVista(vistaId: number, { manual = false } = {}): Promise<void> {
  conexionEnCurso ??= conectarVistaInterno(vistaId, manual).finally(() => { conexionEnCurso = null })
  return conexionEnCurso
}

async function conectarVistaInterno(vistaId: number, manual: boolean): Promise<void> {
  store().setRegistro('conectando')
  let cred: Awaited<ReturnType<typeof getMiCredencialSip>>
  try {
    cred = await getMiCredencialSip(vistaId)
  } catch {
    store().setRegistro('error', 'No se pudieron obtener tus credenciales')
    return
  }
  if (!cred) {
    store().setRegistro('error', 'Aún no tienes extensión asignada. Pídesela a tu administrador.')
    return
  }
  const h = huella(vistaId, cred.extension, cred.password)
  if (!manual && leerRechazo() === h) {
    store().setExtension(cred.extension)
    store().setRegistro('error', MSG_RECHAZO)
    return
  }
  huellaActual = h
  await conectar(vistaId, cred.extension, cred.password)
}

// Deja solo lo marcable (dígitos, *, #, + inicial) — el agente puede pegar
// números con espacios, guiones o paréntesis desde la ficha del cliente.
export function limpiarNumero(numero: string): string {
  const s = numero.trim()
  return (s.startsWith('+') ? '+' : '') + s.replace(/[^\d*#]/g, '')
}

// ── Registro ─────────────────────────────────────────────────────────────

export async function conectar(vistaId: number, extension: string, password: string): Promise<void> {
  if (userAgent) await desconectar()
  desconexionManual = false
  intentosReconexion = 0
  store().setExtension(extension)
  store().setVistaId(vistaId)
  store().setRegistro('conectando')

  // Probar el micrófono al conectar y no en la primera llamada: si falla, el
  // agente se entera ahora. No bloquea el registro (registrarse no necesita
  // micrófono): sirve para validar la extensión aunque falte la diadema.
  store().setAvisoMic(await probarMicrofono())

  try {
    const cfg = await getPbxConfig(vistaId)
    config = cfg
    const uri = UserAgent.makeURI(`sip:${extension}@${cfg.sipDomain}`)
    if (!uri) throw new Error('Extensión inválida')

    userAgent = new UserAgent({
      uri,
      authorizationUsername: extension,
      authorizationPassword: password,
      transportOptions: { server: cfg.wss },
      logLevel: 'error',
      delegate: {
        onInvite: recibirLlamada,
        onDisconnect: (error?: Error) => { if (error && !desconexionManual) programarReconexion() },
      },
    })

    registerer = new Registerer(userAgent, { expires: REGISTER_EXPIRES_S })
    registerer.stateChange.addListener((estado) => {
      if (estado === RegistererState.Registered) {
        intentosReconexion = 0
        guardarRechazo(null)
        store().setRegistro('registrado')
      } else if (estado === RegistererState.Unregistered && !desconexionManual && store().registro === 'registrado') {
        store().setRegistro('reconectando')
      }
    })

    await userAgent.start()
    await registrar()
  } catch (e) {
    store().setRegistro('error', e instanceof Error ? e.message : 'No se pudo conectar con el PBX')
    await limpiarUserAgent()
  }
}

async function registrar(): Promise<void> {
  if (!registerer) return
  await registerer.register({
    requestDelegate: {
      onReject: (resp) => {
        const code = resp.message.statusCode
        const auth = code === 401 || code === 403 || code === 407
        if (auth && huellaActual) guardarRechazo(huellaActual)
        store().setRegistro('error', auth ? MSG_RECHAZO : `El PBX rechazó el registro (${code})`)
        // Cortar el socket ya: nada de des-registros ni reconexiones con
        // credenciales que el PBX no acepta.
        desconexionManual = true
        if (timerReconexion) { clearTimeout(timerReconexion); timerReconexion = null }
        void limpiarUserAgent()
      },
    },
  })
}

// Backoff exponencial (2s, 4s, 8s… tope 30s) al perder el WebSocket —
// típico al cambiar de red o suspender la laptop.
function programarReconexion() {
  if (timerReconexion || !userAgent) return
  store().setRegistro('reconectando')
  const espera = Math.min(2000 * 2 ** intentosReconexion, RECONEXION_MAX_MS)
  intentosReconexion++
  timerReconexion = setTimeout(async () => {
    timerReconexion = null
    if (!userAgent || desconexionManual) return
    try {
      await userAgent.reconnect()
      await registrar()
    } catch {
      programarReconexion()
    }
  }, espera)
}

if (typeof window !== 'undefined') {
  // Al cerrar/recargar la pestaña, avisar al PBX (best-effort) para que no
  // siga mandando llamadas a un navegador que ya no existe hasta que expire.
  window.addEventListener('pagehide', () => {
    desconexionManual = true
    if (registerer?.state === RegistererState.Registered) registerer.unregister().catch(() => {})
  })
  window.addEventListener('online', () => {
    if (userAgent && store().registro === 'reconectando') {
      if (timerReconexion) { clearTimeout(timerReconexion); timerReconexion = null }
      intentosReconexion = 0
      programarReconexion()
    }
  })
}

export async function desconectar(): Promise<void> {
  desconexionManual = true
  if (timerReconexion) { clearTimeout(timerReconexion); timerReconexion = null }
  if (sesion) await colgar().catch(() => {})
  // Solo des-registrar si de verdad está registrado: un des-registro sin
  // registro previo es otro intento de autenticación que el PBX cuenta.
  if (registerer?.state === RegistererState.Registered) {
    try { await registerer.unregister() } catch { /* el socket puede estar caído */ }
  }
  await limpiarUserAgent()
  store().setRegistro('desconectado')
  store().setExtension(null)
  store().setVistaId(null)
}

async function limpiarUserAgent() {
  try { await userAgent?.stop() } catch { /* nada que hacer */ }
  userAgent = null
  registerer = null
  config = null
}

// ── Llamadas ─────────────────────────────────────────────────────────────

export async function llamar(numero: string): Promise<void> {
  if (!userAgent || !config || store().registro !== 'registrado') throw new Error('El teléfono no está conectado')
  if (sesion) throw new Error('Ya hay una llamada en curso')

  const destino = limpiarNumero(numero)
  if (!destino) throw new Error('Número inválido')
  const target = UserAgent.makeURI(`sip:${destino}@${config.sipDomain}`)
  if (!target) throw new Error('Número inválido')
  await exigirMicrofono()

  const inviter = new Inviter(userAgent, target, {
    earlyMedia: true, // tono de llamada/mensajes del operador que manda el PBX
    sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS },
  })
  iniciarSesion(inviter, { direccion: 'saliente', numero: destino, nombre: null, estado: 'marcando' })

  await inviter.invite({
    requestDelegate: {
      onProgress: () => conectarAudioRemoto(inviter),
      onReject: (resp) => { store().patchLlamada({ motivoFin: motivoRechazo(resp.message.statusCode ?? 0) }) },
    },
  })
}

export const probarEco = () => llamar(ECHO_TEST)

function recibirLlamada(invitation: Invitation) {
  // Una llamada a la vez: si ya está ocupado, el PBX la manda a su siguiente
  // regla (cola, buzón) en vez de interrumpir al agente.
  if (sesion) {
    invitation.reject({ statusCode: 486 }).catch(() => {})
    return
  }
  const id = invitation.remoteIdentity
  iniciarSesion(invitation, {
    direccion: 'entrante',
    numero: id.uri.user ?? '',
    nombre: id.displayName || null,
    estado: 'timbrando',
  })
}

export async function contestar(): Promise<void> {
  if (!(sesion instanceof Invitation) || sesion.state !== SessionState.Initial) return
  await exigirMicrofono() // sigue timbrando: el agente puede conectar la diadema y volver a contestar
  await sesion.accept({ sessionDescriptionHandlerOptions: { constraints: AUDIO_CONSTRAINTS } })
}

export async function colgar(): Promise<void> {
  const s = sesion
  if (!s) return
  switch (s.state) {
    case SessionState.Initial:
    case SessionState.Establishing:
      if (s instanceof Inviter) await s.cancel()
      else await (s as Invitation).reject()
      break
    case SessionState.Established:
      await s.bye()
      break
  }
}

export function silenciar(silenciada: boolean): void {
  const pc = sdh()?.peerConnection
  if (!pc) return
  pc.getSenders().forEach((sender) => { if (sender.track) sender.track.enabled = !silenciada })
  store().patchLlamada({ silenciada })
}

export async function espera(enEspera: boolean): Promise<void> {
  if (!sesion || sesion.state !== SessionState.Established) return
  const opts = (sesion.sessionDescriptionHandlerOptionsReInvite ?? {}) as Web.SessionDescriptionHandlerOptions
  opts.hold = enEspera
  sesion.sessionDescriptionHandlerOptionsReInvite = opts
  await sesion.invite({
    requestDelegate: {
      onAccept: () => {
        store().patchLlamada({ enEspera })
        // El re-INVITE vuelve a habilitar las pistas locales: respetar el mute.
        if (!enEspera && store().llamada?.silenciada) silenciar(true)
      },
    },
  })
}

// Tonos DTMF para IVRs del otro lado — RTP (RFC 4733) y, si el SDH no puede,
// SIP INFO como respaldo.
export function enviarDtmf(tono: string): void {
  if (!sesion || sesion.state !== SessionState.Established || !/^[0-9*#A-D]$/.test(tono)) return
  if (sdh()?.sendDtmf(tono)) return
  sesion.info({
    requestOptions: {
      body: { contentDisposition: 'render', contentType: 'application/dtmf-relay', content: `Signal=${tono}\r\nDuration=100` },
    },
  }).catch(() => {})
}

// ── Internos ─────────────────────────────────────────────────────────────

function sdh(): Web.SessionDescriptionHandler | null {
  return (sesion?.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined) ?? null
}

function iniciarSesion(
  s: Session,
  datos: { direccion: 'saliente' | 'entrante'; numero: string; nombre: string | null; estado: 'marcando' | 'timbrando' },
) {
  if (timerFin) { clearTimeout(timerFin); timerFin = null }
  sesion = s
  store().setLlamada({ ...datos, inicio: null, silenciada: false, enEspera: false, motivoFin: null })

  s.stateChange.addListener((estado) => {
    if (estado === SessionState.Established) {
      conectarAudioRemoto(s)
      store().patchLlamada({ estado: 'en-llamada', inicio: Date.now() })
    } else if (estado === SessionState.Terminated) {
      if (sesion === s) sesion = null
      const ll = store().llamada
      store().patchLlamada({
        estado: 'finalizada',
        motivoFin: ll?.motivoFin
          ?? (ll?.inicio ? 'Llamada finalizada' : ll?.direccion === 'entrante' ? 'Llamada perdida' : 'No contestó'),
      })
      timerFin = setTimeout(() => { timerFin = null; if (!sesion) store().setLlamada(null) }, FIN_VISIBLE_MS)
    }
  })
}

// Un solo <audio> oculto para toda la app; el remoteMediaStream del SDH va
// recibiendo las pistas conforme llegan (early media incluido).
function conectarAudioRemoto(s: Session) {
  const handler = s.sessionDescriptionHandler as Web.SessionDescriptionHandler | undefined
  if (!handler) return
  let audio = document.getElementById('softphone-audio-remoto') as HTMLAudioElement | null
  if (!audio) {
    audio = document.createElement('audio')
    audio.id = 'softphone-audio-remoto'
    audio.autoplay = true
    document.body.appendChild(audio)
  }
  if (audio.srcObject !== handler.remoteMediaStream) audio.srcObject = handler.remoteMediaStream
  audio.play().catch(() => {})
}

// Antes de marcar/contestar: sin micrófono WebRTC no puede armar la llamada y
// sip.js solo tira "Requested device not found". Mejor frenar aquí, sin
// mandar nada al PBX, con el motivo en palabras del agente.
async function exigirMicrofono(): Promise<void> {
  const error = await probarMicrofono()
  store().setAvisoMic(error)
  if (error) throw new Error(error)
}

// Al conectar/desconectar una diadema, revalidar el aviso sin recargar.
if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
  navigator.mediaDevices.addEventListener('devicechange', async () => {
    if (store().registro === 'desconectado' || store().llamada) return
    store().setAvisoMic(await probarMicrofono())
  })
}

// null = micrófono OK; si no, el mensaje para el agente según la causa real
// (no es lo mismo un permiso negado que no tener micrófono o tenerlo ocupado).
async function probarMicrofono(): Promise<string | null> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'El navegador solo permite el micrófono en https o localhost. Abre AGYDA desde su dirección segura.'
  }
  try {
    const mic = await navigator.mediaDevices.getUserMedia({ audio: true })
    mic.getTracks().forEach((t) => t.stop())
    return null
  } catch (e) {
    const nombre = e instanceof DOMException ? e.name : ''
    console.warn('[softphone] getUserMedia falló:', e)
    if (nombre === 'NotAllowedError' || nombre === 'SecurityError') {
      return 'Micrófono bloqueado para este sitio: candado de la barra de direcciones → Micrófono → Permitir.'
    }
    if (nombre === 'NotFoundError' || nombre === 'OverconstrainedError') {
      return 'No se detectó ningún micrófono: conecta tu diadema.'
    }
    if (nombre === 'NotReadableError' || nombre === 'AbortError') {
      return 'El micrófono está ocupado por otra aplicación (Zoom, Teams, otro softphone): ciérrala.'
    }
    return `No se pudo usar el micrófono (${nombre || 'error desconocido'}).`
  }
}

function motivoRechazo(code: number): string {
  if (code === 486 || code === 600) return 'Ocupado'
  if (code === 404 || code === 484) return 'Número inexistente'
  if (code === 480 || code === 408) return 'No disponible'
  if (code === 403) return 'Llamada no permitida'
  if (code === 487) return 'Cancelada'
  return `No se pudo completar (${code})`
}
