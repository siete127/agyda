import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/axios'
import { useWebphoneStore } from '@/stores/webphone.store'

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
const PIP_SCALE_DEFAULT = 0.45
const PIP_SCALE_AUTO_NAV = 0.65

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
 * Picture-in-Picture: con un click en el botón "Modo flotante" de WebphonePage,
 * el <div> que envuelve al iframe se reubica (appendChild real, no un clon)
 * dentro de una ventana flotante del sistema operativo vía la Document
 * Picture-in-Picture API. Como es el mismo nodo DOM moviéndose de padre, el
 * iframe no se recarga ni pierde sesión. Al volver el foco a esta pestaña, se
 * cierra el PiP y el iframe regresa a su contenedor original automáticamente.
 */
export function WebphoneFrame() {
  const location = useLocation()
  const activo = location.pathname === '/webphone'

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

  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Contenedor "ancla" fijo en el árbol de React — el iframe siempre es su hijo.
  // homeRef marca dónde debe vivir ese contenedor cuando NO está en PiP.
  const anchorRef = useRef<HTMLDivElement>(null)
  const homeRef = useRef<HTMLDivElement>(null)
  const pipWindowRef = useRef<Window | null>(null)
  const [inPip, setInPip] = useState(false)
  const [pipScale, setPipScale] = useState(PIP_SCALE_DEFAULT)
  const [pipSize, setPipSize] = useState<{ width: number; height: number } | null>(null)

  const { data: vistas = [] } = useQuery({
    queryKey: ['webphone-vistas'],
    queryFn: async () => {
      const { data } = await api.get('/webphone/vistas')
      const list = Array.isArray(data) ? data : (data?.data ?? [])
      return (list as Record<string, unknown>[]).map(parseVista)
    },
    enabled: everVisited,
  })

  const vista = vistas.find((v) => v.id === vistaId) ?? vistas[0] ?? null

  const iframeSrc = vista?.url || ''

  useEffect(() => {
    if (!vistaId && vistas.length > 0) setVistaId(vistas[0].id)
  }, [vistas, vistaId, setVistaId])

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

  // ── Picture-in-Picture ──────────────────────────────────────────────────
  // Chrome exige que requestWindow() se llame directamente desde un gesto de
  // usuario (click) — no se puede disparar reactivamente al perder el foco de
  // la pestaña (document.visibilitychange llega demasiado tarde para contar
  // como activación válida). Por eso el botón vive en WebphonePage y llama a
  // esta función a través del store; aquí solo se cierra automáticamente al
  // volver el foco, que sí está permitido sin gesto.
  const cerrarPip = () => {
    if (pipWindowRef.current && !pipWindowRef.current.closed) pipWindowRef.current.close()
    pipWindowRef.current = null
    // Regresar el nodo ancla a su lugar original en la página principal
    if (anchorRef.current && homeRef.current && anchorRef.current.parentElement !== homeRef.current) {
      homeRef.current.append(anchorRef.current)
    }
    setInPip(false)
    setPipActive(false)
    setPipSize(null)
  }

  const abrirPip = async (scale: number = PIP_SCALE_DEFAULT) => {
    if (pipWindowRef.current || !anchorRef.current || !window.documentPictureInPicture) return
    setPipScale(scale)
    const width = Math.round(screen.width * scale)
    const height = Math.round(screen.height * scale)
    try {
      const pipWindow = await window.documentPictureInPicture.requestWindow({ width, height })
      pipWindowRef.current = pipWindow

      // Tamaño real y explícito en px de la propia ventana PiP — evita depender
      // de cascada de % que puede quedar en 0 si algún ancestro no resuelve altura.
      const style = pipWindow.document.createElement('style')
      style.textContent = `
        html, body { margin: 0; padding: 0; overflow: hidden; background: #fff; width: ${width}px; height: ${height}px; }
        iframe { border: 0; display: block; }
      `
      pipWindow.document.head.append(style)
      pipWindow.document.body.append(anchorRef.current)

      pipWindow.addEventListener('pagehide', () => cerrarPip(), { once: true })
      pipWindow.addEventListener('resize', () => {
        setPipSize({ width: pipWindow.innerWidth, height: pipWindow.innerHeight })
      })

      setPipSize({ width: pipWindow.innerWidth, height: pipWindow.innerHeight })
      setInPip(true)
      setPipActive(true)
    } catch (err) {
      console.warn('[Webphone] No se pudo abrir la ventana flotante:', err)
    }
  }

  // Registrar soporte y las funciones de apertura en el store:
  // - requestPip: para el botón "Modo flotante" (escala 45% por defecto)
  // - onNavigateAway: para el Sidebar, que la llama en el mismo click que
  //   navega a otro módulo — único punto con gesto de usuario válido para ese caso — a escala 65%
  useEffect(() => {
    setPipSupported(Boolean(window.documentPictureInPicture))
  }, [setPipSupported])

  useEffect(() => {
    if (!activo || !vista) { setRequestPip(null); setOnNavigateAway(null); return }
    setRequestPip((scale) => abrirPip(scale))
    setOnNavigateAway(() => abrirPip(PIP_SCALE_AUTO_NAV))
    return () => { setRequestPip(null); setOnNavigateAway(null) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activo, vista?.id])

  // Vuelve a la vista normal automáticamente si la pestaña del navegador
  // recupera el foco. Este listener vive fuera de cualquier condición de
  // "activo" para no depender de la ruta — el PiP puede seguir abierto
  // legítimamente mientras el usuario navega a otros módulos de AGYDA (ver
  // onNavigateAway), así que NO debe cerrarse solo por salir de /webphone.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (!document.hidden) cerrarPip()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!vista) return null

  return (
    <div
      ref={homeRef}
      className="fixed z-10 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm"
      style={activo && rect && !inPip
        ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
        : { top: 0, left: 0, width: 1, height: 1, opacity: 0, pointerEvents: 'none' }
      }
    >
      {activo && loading && !loadError && !inPip && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-brand/20 border-t-brand" />
        </div>
      )}
      {activo && loadError && !inPip && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
          <p className="text-sm font-semibold text-gray-700">No se pudo cargar {vista.label}</p>
          <p className="text-xs text-gray-400 max-w-sm">
            La página no respondió en {LOAD_TIMEOUT_MS / 1000}s. Puede que el sitio bloquee ser mostrado dentro de otras
            páginas (X-Frame-Options/CSP), que esté caído, o que requiera VPN y no estés conectado.
          </p>
        </div>
      )}
      <div ref={anchorRef} style={inPip ? undefined : { height: '100%', width: '100%', overflow: 'hidden' }}>
        <iframe
          key={reloadKey}
          src={iframeSrc}
          title={`Webphone — ${vista.label}`}
          className="border-0"
          style={inPip && pipSize
            ? {
                width: `${pipSize.width / pipScale}px`,
                height: `${pipSize.height / pipScale}px`,
                transform: `scale(${pipScale})`,
                transformOrigin: 'top left',
              }
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
    </div>
  )
}

export { type VistaWebphone, parseVista, LOAD_TIMEOUT_MS }
