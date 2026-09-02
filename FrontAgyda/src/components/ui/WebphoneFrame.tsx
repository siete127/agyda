import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Phone, Minus, X } from 'lucide-react'
import { api } from '@/lib/axios'
import { useWebphoneStore } from '@/stores/webphone.store'
import { useUIStore } from '@/stores/ui.store'
import { configuracionService } from '@/services/configuracion.service'

// Ancho del Sidebar de AppLayout (ver Sidebar.tsx: w-[240px] / w-[76px]
// colapsado) — se descuenta al centrar la ventana flotante para que quede
// centrada en el área de contenido visible, no en el ancho total del
// navegador. VentasLayout no tiene sidebar, así que ahí no se descuenta nada.
const SIDEBAR_WIDTH_EXPANDED = 240
const SIDEBAR_WIDTH_COLLAPSED = 76

interface VistaWebphone {
  id: number
  label: string
  url: string
  requiereVpn: boolean
}

function parseVista(r: Record<string, unknown>): VistaWebphone {
  return {
    id: Number(r['id'] ?? 0),
    label: String(r['label'] ?? ''),
    url: String(r['url'] ?? ''),
    requiereVpn: Boolean(r['requiereVpn']),
  }
}

const LOAD_TIMEOUT_MS = 25_000
// Tamaño por defecto de la ventana flotante: 65% del viewport, no un px fijo
// — así se ve proporcional sin importar la resolución de pantalla. El alto
// usa un ratio mayor que el ancho porque el contenido de AzulDial/VICIdial
// es más vertical (login + botones apilados) y con el mismo ratio quedaba
// cortado, mostrando scroll.
const FLOAT_WIDTH_RATIO = 0.65
const FLOAT_HEIGHT_RATIO = 0.92
const FLOAT_MARGIN = 16
const FLOAT_HEADER_HEIGHT = 32
const BUBBLE_SIZE = 52
const defaultFloatSize = () => ({
  width: window.innerWidth * FLOAT_WIDTH_RATIO,
  height: window.innerHeight * FLOAT_HEIGHT_RATIO,
})

// PiP real: tamaño de referencia "natural" del contenido de AzulDial/VICIdial
// — a 65%×92% del viewport (el mismo ratio que ya usa el modo flotante
// normal) el contenido entra completo con zoom 1x. Como la ventana PiP se
// puede redimensionar libremente desde el sistema operativo, el zoom del
// iframe se recalcula en cada resize para que el contenido siga cabiendo
// completo sin scroll, sin importar el tamaño final de la ventana.
const PIP_REAL_MIN_ZOOM = 0.35
const pipRealNaturalSize = () => ({
  width: window.innerWidth * FLOAT_WIDTH_RATIO,
  height: window.innerHeight * FLOAT_HEIGHT_RATIO,
})

/**
 * El iframe del Webphone vive fuera del <Outlet> y nunca se desmonta al navegar
 * entre módulos — solo se mueve/oculta con CSS. VICIdial pierde la sesión si el
 * iframe se recrea (cookies particionadas en iframes cross-origin), así que
 * mantenerlo montado es la única forma de conservar el login entre navegaciones.
 *
 * Se posiciona en `fixed` siguiendo las coordenadas reales de un <div> "hueco"
 * que WebphonePage renderiza en su lugar (ver WebphonePage.tsx) — así el iframe
 * calza con el layout aunque cambie el ancho del sidebar u otros elementos.
 *
 * "Modo flotante": NO usa la Document Picture-in-Picture API real. Se probó y
 * mover el <iframe> a otro documento (aunque sea el mismo nodo DOM, sin clonar)
 * hace que VICIdial trate esa transición como una recarga de página desde la
 * perspectiva del contenido embebido: su softphone (sip.js) reacciona cerrando
 * la sesión SIP activamente (REGISTER expires=0 + BYE de la llamada en curso),
 * cortando el audio de una llamada activa. Por eso el modo flotante es un
 * overlay CSS `position: fixed` dentro de la MISMA pestaña — el iframe nunca
 * cambia de documento, así que la sesión y el audio nunca se cortan. La
 * contrapartida es que ya no puede flotar fuera de la ventana del navegador.
 */
export function WebphoneFrame() {
  const location = useLocation()
  const activo = location.pathname === '/webphone'
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  // VentasLayout (/ventas) no tiene Sidebar — ahí el área de contenido ocupa
  // todo el ancho del navegador, así que no se descuenta nada.
  const sidebarOffset = location.pathname === '/ventas'
    ? 0
    : (sidebarCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_EXPANDED)

  // Solo empezamos a cargar el iframe (y su query de vistas) la primera vez que
  // el usuario visita /webphone — no queremos que VICIdial cargue en segundo
  // plano desde el login si nunca abre ese módulo. Una vez visitado, se queda
  // montado para siempre (ver comentario del componente) para no perder sesión.
  const [everVisited, setEverVisited] = useState(false)
  useEffect(() => { if (activo) setEverVisited(true) }, [activo])

  const vistaId = useWebphoneStore((s) => s.vistaId)
  const zoom = useWebphoneStore((s) => s.zoom)
  const reloadKey = useWebphoneStore((s) => s.reloadKey)
  const loading = useWebphoneStore((s) => s.loading)
  const loadError = useWebphoneStore((s) => s.loadError)
  const setVistaId = useWebphoneStore((s) => s.setVistaId)
  const setLoading = useWebphoneStore((s) => s.setLoading)
  const setLoadError = useWebphoneStore((s) => s.setLoadError)
  const setPipSupported = useWebphoneStore((s) => s.setPipSupported)
  const setPipActive = useWebphoneStore((s) => s.setPipActive)
  const setRequestPip = useWebphoneStore((s) => s.setRequestPip)
  const setOnNavigateAway = useWebphoneStore((s) => s.setOnNavigateAway)
  const realPipActive = useWebphoneStore((s) => s.realPipActive)
  const setRealPipSupported = useWebphoneStore((s) => s.setRealPipSupported)
  const setRealPipActive = useWebphoneStore((s) => s.setRealPipActive)
  const setRequestRealPip = useWebphoneStore((s) => s.setRequestRealPip)

  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── PiP real (Document Picture-in-Picture) ──────────────────────────────
  // anchorRef envuelve TODO el contenido (header + iframe) y es el nodo que se
  // mueve de verdad a la ventana del sistema operativo. homeRef marca dónde
  // debe volver cuando se cierra. Independiente del modo flotante CSS de
  // arriba — los dos nunca están activos a la vez (ver JSX más abajo).
  const anchorRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  const pipWindowRef = useRef<Window | null>(null)
  // Zoom automático del iframe dentro del PiP real — se recalcula cada vez
  // que el usuario redimensiona la ventana (ver abrirPipReal), para que el
  // contenido de AzulDial siempre quepa completo sin scroll.
  const [pipRealZoom, setPipRealZoom] = useState(1)

  // "Modo flotante": el mismo contenedor (con el iframe adentro) simplemente
  // cambia de posición/tamaño vía CSS, sin moverse de documento — ver comentario
  // del componente. inPip se mantiene como nombre por compatibilidad con el
  // resto del store (pipSupported/pipActive/requestPip).
  const [inPip, setInPip] = useState(false)

  // Posición (esquina superior-izquierda, en px) y tamaño de la ventana
  // flotante — null = todavía no se tocó, usa los valores por defecto (esquina
  // inferior derecha, 65% del viewport — ver defaultFloatSize). Se arrastra
  // desde el header (mover) o desde las esquinas (redimensionar).
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null)
  const [floatSize, setFloatSize] = useState<{ width: number; height: number } | null>(null)
  // Minimizado: el iframe sigue vivo y montado (misma sesión, mismo audio),
  // solo se oculta visualmente detrás de una burbuja circular chica.
  const [minimized, setMinimized] = useState(false)
  const draggingRef = useRef<{ dx: number; dy: number } | null>(null)
  const resizingRef = useRef<{ corner: 'nw' | 'ne' | 'sw' | 'se'; startX: number; startY: number; startPos: { x: number; y: number }; startSize: { width: number; height: number } } | null>(null)
  // Desactiva la transición CSS de posición/tamaño mientras se arrastra o
  // redimensiona con el mouse — si no, el widget "persigue" al cursor con
  // retraso en vez de seguirlo 1:1, y se siente elástico/lento.
  const [interacting, setInteracting] = useState(false)

  const currentFloatSize = () => floatSize ?? defaultFloatSize()
  // Posición por defecto: centrada en el área de contenido visible (descuenta
  // el Sidebar cuando aplica) — más prolija que anclar a una esquina, sobre
  // todo con el tamaño grande (65% del viewport).
  const currentFloatPos = () => {
    if (floatPos) return floatPos
    const { width, height } = currentFloatSize()
    return { x: sidebarOffset + (window.innerWidth - sidebarOffset - width) / 2, y: (window.innerHeight - height) / 2 }
  }

  const clampFloatPos = (x: number, y: number, w: number, h: number) => {
    const maxX = window.innerWidth - w - FLOAT_MARGIN
    const maxY = window.innerHeight - h - FLOAT_MARGIN
    return { x: Math.min(Math.max(x, FLOAT_MARGIN), Math.max(maxX, FLOAT_MARGIN)), y: Math.min(Math.max(y, FLOAT_MARGIN), Math.max(maxY, FLOAT_MARGIN)) }
  }

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault()
    const container = e.currentTarget.parentElement as HTMLElement
    const r = container.getBoundingClientRect()
    draggingRef.current = { dx: e.clientX - r.left, dy: e.clientY - r.top }
    setInteracting(true)
    const { width, height } = currentFloatSize()
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return
      setFloatPos(clampFloatPos(ev.clientX - draggingRef.current.dx, ev.clientY - draggingRef.current.dy, width, height))
    }
    const onUp = () => {
      draggingRef.current = null
      setInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // Arrastre de la burbuja minimizada: a diferencia del header (que mueve a su
  // padre), acá el propio elemento clickeado es el que se mueve. Se distingue
  // un clic simple (restaurar) de un arrastre por la distancia recorrida.
  const onBubbleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault()
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    const dx = e.clientX - r.left
    const dy = e.clientY - r.top
    const startX = e.clientX
    const startY = e.clientY
    let moved = false
    const onMove = (ev: MouseEvent) => {
      if (Math.abs(ev.clientX - startX) > 3 || Math.abs(ev.clientY - startY) > 3) { moved = true; setInteracting(true) }
      setFloatPos(clampFloatPos(ev.clientX - dx, ev.clientY - dy, BUBBLE_SIZE, BUBBLE_SIZE))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setInteracting(false)
      if (!moved) setMinimized(false)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const FLOAT_MIN_WIDTH = 280
  const FLOAT_MIN_HEIGHT = 320

  const onResizeStart = (corner: 'nw' | 'ne' | 'sw' | 'se') => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    resizingRef.current = { corner, startX: e.clientX, startY: e.clientY, startPos: currentFloatPos(), startSize: currentFloatSize() }
    setInteracting(true)
    const onMove = (ev: MouseEvent) => {
      const state = resizingRef.current
      if (!state) return
      const deltaX = ev.clientX - state.startX
      const deltaY = ev.clientY - state.startY
      let { x, y } = state.startPos
      let width = state.startSize.width
      let height = state.startSize.height

      if (state.corner === 'se') { width += deltaX; height += deltaY }
      else if (state.corner === 'sw') { width -= deltaX; height += deltaY; x += deltaX }
      else if (state.corner === 'ne') { width += deltaX; height -= deltaY; y += deltaY }
      else { width -= deltaX; height -= deltaY; x += deltaX; y += deltaY }

      const maxWidth = window.innerWidth - FLOAT_MARGIN * 2
      const maxHeight = window.innerHeight - FLOAT_MARGIN * 2
      width = Math.min(Math.max(width, FLOAT_MIN_WIDTH), maxWidth)
      height = Math.min(Math.max(height, FLOAT_MIN_HEIGHT), maxHeight)
      // Si el ancla es izquierda/arriba, recalcular x/y para que el borde
      // opuesto (derecho/abajo) quede fijo tras aplicar los límites de tamaño.
      if (state.corner === 'sw' || state.corner === 'nw') x = state.startPos.x + state.startSize.width - width
      if (state.corner === 'ne' || state.corner === 'nw') y = state.startPos.y + state.startSize.height - height

      setFloatSize({ width, height })
      setFloatPos(clampFloatPos(x, y, width, height))
    }
    const onUp = () => {
      resizingRef.current = null
      setInteracting(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const { data: vistas = [] } = useQuery({
    queryKey: ['webphone-vistas'],
    queryFn: async () => {
      const { data } = await api.get('/webphone/vistas')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseVista)
    },
    enabled: everVisited,
  })

  // Vista fija asignada al agente (Configuración > Telefonía > Asignación de
  // Vistas) — si existe, gana siempre sobre la predeterminada global o
  // cualquier vista elegida antes en el store (ver WebphonePage.tsx, misma regla).
  const { data: vistaAsignadaId = null } = useQuery({
    queryKey: ['webphone-mi-asignacion'],
    queryFn: () => configuracionService.getMiAsignacionVista(),
    enabled: everVisited,
    staleTime: 30_000,
  })

  const vista = vistaAsignadaId != null
    ? (vistas.find((v) => v.id === vistaAsignadaId) ?? vistas.find((v) => v.id === vistaId) ?? vistas[0] ?? null)
    : (vistas.find((v) => v.id === vistaId) ?? vistas[0] ?? null)

  const iframeSrc = vista?.url || ''

  useEffect(() => {
    if (vistaAsignadaId != null) {
      if (vistaId !== vistaAsignadaId) setVistaId(vistaAsignadaId)
      return
    }
    if (!vistaId && vistas.length > 0) setVistaId(vistas[0].id)
  }, [vistas, vistaId, setVistaId, vistaAsignadaId])

  useEffect(() => {
    if (!vista) return
    setLoading(true)
    setLoadError(false)
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setLoading(false)
      setLoadError(true)
    }, LOAD_TIMEOUT_MS)
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey, vista?.id])

  // Sincroniza posición/tamaño con el placeholder que WebphonePage renderiza
  useEffect(() => {
    if (!activo) return
    const update = () => {
      const el = document.querySelector('[data-webphone-slot]')
      if (!el) return
      const r = el.getBoundingClientRect()
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
    }
    update()
    const el = document.querySelector('[data-webphone-slot]')
    const ro = new ResizeObserver(update)
    if (el) ro.observe(el)
    window.addEventListener('resize', update)
    const interval = setInterval(update, 300) // cubre transiciones de sidebar/layout
    return () => { ro.disconnect(); window.removeEventListener('resize', update); clearInterval(interval) }
  }, [activo])

  // ── Modo flotante (overlay CSS, misma pestaña) ──────────────────────────
  const cerrarPip = () => {
    setInPip(false)
    setPipActive(false)
    setMinimized(false)
  }

  const abrirPip = () => {
    setFloatPos(null)
    setFloatSize(null)
    setMinimized(false)
    setInPip(true)
    setPipActive(true)
  }

  // Si el usuario vuelve a entrar a /webphone, el widget vuelve a su lugar
  // normal en la página en vez de quedar duplicado (flotante + en su slot).
  useEffect(() => {
    if (activo) {
      cerrarPip()
      cerrarPipReal()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo])

  // Registrar soporte y la función de apertura en el store:
  // - requestPip: para el botón "Modo flotante"
  // - onNavigateAway: para el Sidebar, que lo activa en el mismo click que
  //   navega a otro módulo, para que el widget siga visible al salir de /webphone
  useEffect(() => {
    setPipSupported(true)
  }, [setPipSupported])

  useEffect(() => {
    if (!vista) { setRequestPip(null); setOnNavigateAway(null); return }
    setRequestPip(() => abrirPip())
    // Solo se activa el flotante automático al salir de /webphone — si el
    // usuario ya está en otro módulo y sigue navegando, no se debe volver a
    // disparar (registrar esto sin condicionar a "activo" hacía que cualquier
    // navegación entre otros módulos también intentara abrir el flotante).
    setOnNavigateAway(activo ? () => { if (!inPip) abrirPip() } : null)
    return () => { setRequestPip(null); setOnNavigateAway(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista?.id, inPip, activo])

  // ── PiP real (Document Picture-in-Picture) ──────────────────────────────
  // ADVERTENCIA (ver comentario del componente): mover el iframe a otro
  // documento hace que VICIdial/AzulDial cierre la sesión SIP activa —
  // corta el audio de una llamada en curso. Se ofrece como opción explícita
  // separada del modo flotante seguro de arriba, con aviso al usuario antes
  // de abrir (ver botón en WebphonePage.tsx).
  const cerrarPipReal = () => {
    // Orden importa: primero se recupera el nodo (mientras el documento de la
    // ventana PiP sigue vivo), recién después se cierra esa ventana. Al revés
    // (cerrar primero) el documento se destruye con el nodo todavía adentro y
    // el append() de vuelta fallaba silenciosamente — el botón "Cerrar PiP"
    // no hacía nada visible.
    if (anchorRef.current && homeRef.current && anchorRef.current.parentElement !== homeRef.current) {
      homeRef.current.append(anchorRef.current)
    }
    const win = pipWindowRef.current
    pipWindowRef.current = null
    if (win && !win.closed) win.close()
    setRealPipActive(false)
    setPipRealZoom(1)
  }

  // Recalcula el zoom del iframe según el tamaño real de la ventana PiP en
  // ese momento, comparado contra el tamaño "natural" donde el contenido
  // entra completo a zoom 1x (ver pipRealNaturalSize). min() entre ancho y
  // alto para no desbordar en ninguna de las dos dimensiones.
  const recalcularPipRealZoom = (pipWindow: Window) => {
    const natural = pipRealNaturalSize()
    const availW = pipWindow.innerWidth
    const availH = pipWindow.innerHeight - FLOAT_HEADER_HEIGHT
    const scale = Math.min(availW / natural.width, availH / natural.height, 1)
    setPipRealZoom(Math.max(scale, PIP_REAL_MIN_ZOOM))
  }

  const abrirPipReal = async () => {
    if (pipWindowRef.current || !anchorRef.current || !window.documentPictureInPicture) return
    // Nunca los dos modos a la vez — si el overlay CSS estaba activo, se cierra.
    if (inPip) cerrarPip()
    // Mismo tamaño por defecto que el modo flotante (65%×65%) — el usuario
    // puede redimensionar libremente desde el sistema operativo después; el
    // zoom del contenido se ajusta solo (ver recalcularPipRealZoom).
    const width = Math.round(window.innerWidth * FLOAT_WIDTH_RATIO)
    const height = Math.round(window.innerHeight * FLOAT_WIDTH_RATIO)
    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({ width, height })
      pipWindowRef.current = pipWindow
      const style = pipWindow.document.createElement('style')
      // height: 100vh (no 100%) en html/body — con % puro esta cadena se
      // rompe seguido en ventanas nuevas del sistema operativo: el navegador
      // no siempre resuelve el porcentaje contra el viewport real de la
      // ventana PiP, y el div movido (h-full en cascada) colapsaba a 0 de
      // alto, dejando el iframe comprimido en una franja arriba.
      style.textContent = `html, body { margin: 0; padding: 0; overflow: hidden; background: #0B1730; } iframe { border: 0; display: block; }`
      pipWindow.document.head.append(style)
      pipWindow.document.body.append(anchorRef.current)
      pipWindow.addEventListener('pagehide', () => cerrarPipReal(), { once: true })
      pipWindow.addEventListener('resize', () => recalcularPipRealZoom(pipWindow))
      recalcularPipRealZoom(pipWindow)
      setRealPipActive(true)
    } catch (err) {
      console.warn('[Webphone] No se pudo abrir el PiP real:', err)
    }
  }

  useEffect(() => {
    setRealPipSupported(Boolean(window.documentPictureInPicture))
  }, [setRealPipSupported])

  useEffect(() => {
    if (!vista) { setRequestRealPip(null); return }
    setRequestRealPip(() => abrirPipReal())
    return () => { setRequestRealPip(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vista?.id])

  if (!vista) return null

  const visible = inPip || activo
  const floatW = floatSize?.width ?? defaultFloatSize().width
  const floatH = floatSize?.height ?? defaultFloatSize().height
  const posicion = inPip
    ? (() => {
        // Siempre se calcula con top/left (nunca bottom/right): así se puede
        // clampear contra el viewport real de este monitor sin importar su
        // resolución o el zoom del navegador — bottom/right con un ancho
        // grande (65% del viewport) podía salirse de pantalla en monitores
        // más chicos o con zoom distinto.
        // floatPos puede venir de arrastrar la burbuja (52px) — se reclampea
        // con el tamaño real del widget grande para que no quede fuera de pantalla.
        const base = floatPos ?? { x: sidebarOffset + (window.innerWidth - sidebarOffset - floatW) / 2, y: (window.innerHeight - floatH) / 2 }
        const p = clampFloatPos(base.x, base.y, floatW, floatH)
        return { top: p.y, left: p.x, width: floatW, height: floatH }
      })()
    : (rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height } : null)
  // La burbuja (52px) es mucho más chica que el widget (hasta 380x640): la
  // misma coordenada top-left no es válida para ambas, así que su posición se
  // clampea de nuevo con las dimensiones de la propia burbuja.
  const bubblePos = floatPos
    ? clampFloatPos(floatPos.x, floatPos.y, BUBBLE_SIZE, BUBBLE_SIZE)
    : { x: window.innerWidth - BUBBLE_SIZE - FLOAT_MARGIN, y: window.innerHeight - BUBBLE_SIZE - FLOAT_MARGIN }

  return (
    <>
      {/* Burbuja: visible solo cuando está minimizado — el contenedor grande
          (con el iframe adentro) sigue montado más abajo, solo oculto. */}
      {inPip && minimized && (
        <button
          type="button"
          onMouseDown={onBubbleMouseDown}
          title={`${vista.label} — conectado · arrastrar o clic para restaurar`}
          className={
            'fixed z-40 flex cursor-grab items-center justify-center rounded-full select-none' +
            ' bg-gradient-to-br from-brand via-brand to-brand-dark' +
            ' shadow-[0_8px_24px_-4px_rgba(47,111,237,0.55),0_2px_8px_rgba(0,0,0,0.15)]' +
            ' ring-[3px] ring-white/90 hover:ring-white' +
            ' hover:scale-110 active:cursor-grabbing active:scale-95' +
            (interacting ? '' : ' transition-all duration-200 ease-out')
          }
          style={{ top: bubblePos.y, left: bubblePos.x, width: BUBBLE_SIZE, height: BUBBLE_SIZE }}
        >
          <span className="pointer-events-none absolute inset-0 rounded-full bg-white/10 opacity-0 hover:opacity-100 transition-opacity" />
          <Phone className="h-5 w-5 fill-white text-white drop-shadow-sm" strokeWidth={2.5} />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center">
            <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative h-3 w-3 rounded-full border-2 border-white bg-emerald-400 shadow-sm" />
          </span>
        </button>
      )}
      {/* homeRef: "casa" del anchor en el árbol de React. Cuando el PiP real
          está activo, anchorRef vive físicamente en la otra ventana (movido
          con appendChild) y este div queda vacío — React sigue reconciliando
          normalmente porque la referencia del nodo no cambia, solo su padre. */}
      <div ref={homeRef} style={{ display: 'contents' }}>
      <div
        ref={anchorRef}
        className={
          realPipActive
            ? 'flex flex-col overflow-hidden bg-card'
            : (inPip
                ? 'fixed z-40 flex flex-col overflow-hidden rounded-2xl border border-black/10 bg-card shadow-[0_20px_50px_-12px_rgba(0,0,0,0.35),0_4px_16px_rgba(0,0,0,0.12)] ring-1 ring-black/5'
                : 'fixed z-40 overflow-hidden rounded-2xl border border-gray-200/60 bg-card shadow-xl') +
              (interacting ? '' : ' transition-all duration-200 ease-out')
        }
        style={realPipActive
          // Estilos explícitos en px/vw/vh, no % — la cadena de % en cascada
          // hasta html/body de la ventana PiP no siempre resuelve bien en la
          // primera pintura (ver comentario en abrirPipReal).
          ? { width: '100vw', height: '100vh' }
          : (visible && posicion && !(inPip && minimized)
              ? { ...posicion, opacity: 1, pointerEvents: 'auto' }
              : { top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' })
        }
      >
        {/* En PiP real NO se muestra este header: la propia ventana del
            sistema operativo ya trae su barra de título con el botón de
            cerrar nativo (arriba, junto a la URL) — duplicarlo acá quedaba
            encimado, perdía contraste y era redundante. */}
        {inPip && (
          <div
            onMouseDown={onDragStart}
            className="flex flex-shrink-0 cursor-grab items-center justify-between gap-1.5 bg-gradient-to-r from-[#0B1730] via-[#0F1F42] to-[#0B1730] pl-2.5 pr-1 text-white select-none active:cursor-grabbing"
            style={{ height: FLOAT_HEADER_HEIGHT }}
          >
            <div className="flex min-w-0 items-center gap-1.5">
              <Phone className="h-3 w-3 flex-shrink-0 text-brand-muted" strokeWidth={2.5} />
              <span className="truncate text-xs font-semibold tracking-wide text-white/95">{vista.label}</span>
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-0.5">
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setMinimized(true)}
                title="Minimizar"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/75 transition-all hover:scale-105 hover:bg-white/15 hover:text-white active:scale-95"
              >
                <Minus className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={cerrarPip}
                title="Cerrar modo flotante"
                className="flex h-6 w-6 items-center justify-center rounded-full text-white/75 transition-all hover:scale-105 hover:bg-red-500/80 hover:text-white active:scale-95"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2.5} />
              </button>
            </div>
          </div>
        )}
      {loading && !loadError && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-card" style={inPip ? { top: FLOAT_HEADER_HEIGHT } : undefined}>
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
        </div>
      )}
      {loadError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-card px-6 text-center" style={inPip ? { top: FLOAT_HEADER_HEIGHT } : undefined}>
          <p className="text-sm font-semibold text-gray-700">No se pudo cargar {vista.label}</p>
          <p className="text-xs text-gray-400 max-w-sm">
            La página no respondió en {LOAD_TIMEOUT_MS / 1000}s. Puede que el sitio bloquee ser mostrado dentro de otras
            páginas (X-Frame-Options/CSP), que esté caído, o que requiera VPN y no estés conectado.
          </p>
        </div>
      )}
      <div style={{ height: inPip ? `calc(100% - ${FLOAT_HEADER_HEIGHT}px)` : '100%', width: '100%', overflow: 'hidden' }}>
        <iframe
          key={reloadKey}
          src={iframeSrc}
          title={`Webphone — ${vista.label}`}
          className="border-0"
          style={realPipActive
            // En PiP real el zoom es automático (pipRealZoom, recalculado en
            // cada resize de la ventana) — ignora el zoom manual del usuario.
            ? { width: `${100 / pipRealZoom}%`, height: `${100 / pipRealZoom}%`, transform: `scale(${pipRealZoom})`, transformOrigin: 'top left' }
            : { width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})`, transformOrigin: 'top left' }
          }
          allow="microphone; autoplay"
          onLoad={() => {
            if (timeoutRef.current) clearTimeout(timeoutRef.current)
            setLoading(false)
            setLoadError(false)
          }}
        />
      </div>
      {inPip && !minimized && (
        <>
          <div onMouseDown={onResizeStart('nw')} title="Redimensionar" className="absolute left-0 top-0 z-30 h-3 w-3 cursor-nwse-resize" />
          <div onMouseDown={onResizeStart('ne')} title="Redimensionar" className="absolute right-0 top-0 z-30 h-3 w-3 cursor-nesw-resize" />
          <div onMouseDown={onResizeStart('sw')} title="Redimensionar" className="absolute bottom-0 left-0 z-30 h-3 w-3 cursor-nesw-resize" />
          <div
            onMouseDown={onResizeStart('se')}
            title="Redimensionar"
            className="absolute bottom-0 right-0 z-30 flex h-4 w-4 cursor-nwse-resize items-end justify-end p-0.5 opacity-40 transition-opacity hover:opacity-90"
          >
            <svg width="9" height="9" viewBox="0 0 9 9" className="text-gray-400">
              <circle cx="7.5" cy="1.5" r="1" fill="currentColor" />
              <circle cx="7.5" cy="4.5" r="1" fill="currentColor" />
              <circle cx="7.5" cy="7.5" r="1" fill="currentColor" />
              <circle cx="4.5" cy="4.5" r="1" fill="currentColor" />
              <circle cx="4.5" cy="7.5" r="1" fill="currentColor" />
              <circle cx="1.5" cy="7.5" r="1" fill="currentColor" />
            </svg>
          </div>
        </>
      )}
      </div>
      </div>
    </>
  )
}

export { type VistaWebphone, parseVista, LOAD_TIMEOUT_MS }
