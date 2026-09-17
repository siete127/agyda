import { useEffect, useState } from 'react'
import './Ardabito.css'

/**
 * Ardabito — mascota de ArdaBytec ensamblada a partir de 4 PNG transparentes
 * (cabeza/cuerpo/pata-saludo/cola), reproduciendo la composición original de
 * Rive (Artboard de 800×800) sin usar Rive Runtime, video ni canvas.
 *
 * Sistema de coordenadas: el Artboard de Rive medía 800×800px. Cada pieza en
 * Rive tenía Position (x,y en coords del Artboard), Scale, y Origin (punto de
 * anclaje como fracción del propio bounding box de la pieza). Como cada PNG
 * ya viene recortado a su contenido real, tratamos su tamaño natural × Scale
 * como el bounding box de Rive, y convertimos:
 *   left% = x / 800 * 100
 *   top%  = y / 800 * 100
 *   ancho% (relativo al artboard) = (naturalWidth * scale) / 800 * 100
 * El contenedor raíz fuerza aspect-ratio 1/1 (el artboard era cuadrado) para
 * que estos porcentajes sean válidos sin importar el tamaño final renderizado
 * — así todo el personaje escala como un único grupo responsive.
 *
 * Orden visual de adelante hacia atrás (mayor z-index = más adelante):
 * cabeza > cuerpo > pata-saludo > cola.
 */

interface PiezaSpec {
  src: string
  leftPct: number
  topPct: number
  widthPct: number
  /** Origen como fracción 0-1 (ej. 0.6 0.6, no '60% 60%') — se usa tanto para
     transform-origin como para el translate base que centra la pieza en su
     punto de anclaje real, en vez de asumir siempre -50%/-50%. */
  originX: number
  originY: number
  z: number
}

const PIEZAS: Record<'cola' | 'pataSaludo' | 'cuerpo' | 'cabeza', PiezaSpec> = {
  cola: {
    src: '/ardabito/cola-ardabito.png',
    leftPct: 29.688,
    topPct: 66.25,
    widthPct: 40.813,
    originX: 0.5,
    originY: 0.5,
    z: 1,
  },
  pataSaludo: {
    src: '/ardabito/pata-saludo-ardabito.png',
    leftPct: 70.625,
    topPct: 53.75,
    widthPct: 31.7,
    originX: 0.25,
    originY: 0.75,
    z: 2,
  },
  cuerpo: {
    src: '/ardabito/cuerpo-ardabito.png',
    leftPct: 51.25,
    topPct: 65.563,
    widthPct: 53.331,
    originX: 0.5,
    originY: 0.5,
    z: 3,
  },
  cabeza: {
    src: '/ardabito/cabeza-ardabito.png',
    leftPct: 55.375,
    topPct: 48.313,
    widthPct: 58.406,
    originX: 0.6,
    originY: 1.0,
    z: 4,
  },
}

const CABEZA_OJOS_ABIERTOS = '/ardabito/cabeza-ardabito.png'
const CABEZA_OJOS_CERRADOS = '/ardabito/cabeza-ardabito-ojos-cerrados.png'

function Pieza({
  pieza,
  className,
  src,
  onAnimationEnd,
}: {
  pieza: PiezaSpec
  className?: string
  src?: string
  onAnimationEnd?: () => void
}) {
  return (
    <img
      src={src ?? pieza.src}
      alt=""
      draggable={false}
      className={`ardabito-pieza ${className ?? ''}`}
      onAnimationEnd={onAnimationEnd}
      style={
        {
          left: `${pieza.leftPct}%`,
          top: `${pieza.topPct}%`,
          width: `${pieza.widthPct}%`,
          transformOrigin: `${pieza.originX * 100}% ${pieza.originY * 100}%`,
          zIndex: pieza.z,
          '--tx': `${-pieza.originX * 100}%`,
          '--ty': `${-pieza.originY * 100}%`,
        } as React.CSSProperties
      }
    />
  )
}

/**
 * Cabeza con parpadeo suave: dos <img> superpuestas (ojos abiertos/cerrados)
 * con cross-fade de opacidad — cambiar el src directo reemplaza la imagen de
 * golpe (0ms), lo que se veía como un parpadeo brusco tipo flash en vez de
 * un cierre de ojos natural.
 */
function CabezaConParpadeo({
  ojosCerrados,
  transitionMs,
  easing,
}: {
  ojosCerrados: boolean
  transitionMs: number
  easing: string
}) {
  const pieza = PIEZAS.cabeza
  const sharedStyle = {
    left: `${pieza.leftPct}%`,
    top: `${pieza.topPct}%`,
    width: `${pieza.widthPct}%`,
    transformOrigin: `${pieza.originX * 100}% ${pieza.originY * 100}%`,
    '--tx': `${-pieza.originX * 100}%`,
    '--ty': `${-pieza.originY * 100}%`,
    transitionDuration: `${transitionMs}ms`,
    transitionTimingFunction: easing,
  } as React.CSSProperties

  return (
    <>
      <img
        src={CABEZA_OJOS_ABIERTOS}
        alt=""
        draggable={false}
        className="ardabito-pieza ardabito-cabeza ardabito-parpadeo"
        style={{ ...sharedStyle, zIndex: pieza.z, opacity: ojosCerrados ? 0 : 1 }}
      />
      <img
        src={CABEZA_OJOS_CERRADOS}
        alt=""
        draggable={false}
        className="ardabito-pieza ardabito-cabeza ardabito-parpadeo"
        style={{ ...sharedStyle, zIndex: pieza.z + 1, opacity: ojosCerrados ? 1 : 0 }}
      />
    </>
  )
}

function rango(min: number, max: number) {
  return min + Math.random() * (max - min)
}

/**
 * Saludo en ráfagas: la pata anima UNA vuelta completa (rotate 0→0, ver
 * @keyframes ardabito-pata-saludo) y se detiene en reposo — no en loop
 * infinito. Al terminar, la mayoría de las veces descansa unos segundos
 * antes de volver a saludar; a veces saluda una segunda vez seguida.
 * Un loop que nunca para es lo que se leía como mecánico/"trabado" — un
 * personaje real no saluda sin parar.
 */
function useSaludo() {
  const [animKey, setAnimKey] = useState(0)
  const [activa, setActiva] = useState(true)

  function onFin() {
    const saludaOtraVez = Math.random() < 0.3
    if (saludaOtraVez) {
      setAnimKey((k) => k + 1)
      return
    }
    setActiva(false)
    setTimeout(() => {
      setAnimKey((k) => k + 1)
      setActiva(true)
    }, rango(4000, 9000))
  }

  return { animKey, activa, onFin }
}

/** Curva de aceleración del cierre: arranca lento y acelera (como un párpado
 *  cayendo por su propio peso), no una velocidad constante. */
const EASING_CIERRE = 'cubic-bezier(0.55, 0, 1, 0.45)'
/** Curva de la apertura: arranca rápido y frena al final — lo opuesto del
 *  cierre. Usar la misma curva para ambas fases es lo que se sentía mecánico. */
const EASING_APERTURA = 'cubic-bezier(0, 0.55, 0.45, 1)'

/**
 * Parpadeo natural: ojos abiertos la mayor parte del tiempo. Cada parpadeo
 * varía un poco en duración (nunca exactamente igual al anterior) y usa
 * curvas de aceleración distintas para cerrar y abrir. De vez en cuando
 * (~1 de cada 6) ocurre un segundo parpadeo rápido justo después del
 * primero, como pasa de verdad — un patrón perfectamente regular es lo que
 * se lee como "forzado" o de animación en loop.
 */
function useParpadeo() {
  const [ojosCerrados, setOjosCerrados] = useState(false)
  const [transitionMs, setTransitionMs] = useState(90)
  const [easing, setEasing] = useState(EASING_CIERRE)

  useEffect(() => {
    const timeouts: ReturnType<typeof setTimeout>[] = []
    const espera = (fn: () => void, ms: number) => {
      timeouts.push(setTimeout(fn, ms))
    }

    function unParpadeo(alTerminar: () => void) {
      const cierreMs = rango(110, 150)
      const holdMs = rango(90, 150)
      const aperturaMs = rango(190, 250)

      setTransitionMs(cierreMs)
      setEasing(EASING_CIERRE)
      setOjosCerrados(true)

      espera(() => {
        setTransitionMs(aperturaMs)
        setEasing(EASING_APERTURA)
        setOjosCerrados(false)
        espera(alTerminar, aperturaMs)
      }, cierreMs + holdMs)
    }

    function programarSiguienteParpadeo() {
      espera(() => {
        unParpadeo(() => {
          const esDoble = Math.random() < 1 / 6
          if (esDoble) {
            espera(() => unParpadeo(programarSiguienteParpadeo), rango(150, 260))
          } else {
            programarSiguienteParpadeo()
          }
        })
      }, rango(3000, 7000))
    }

    programarSiguienteParpadeo()
    return () => timeouts.forEach(clearTimeout)
  }, [])

  return { ojosCerrados, transitionMs, easing }
}

interface ArdabitoProps {
  className?: string
}

export function Ardabito({ className }: ArdabitoProps) {
  const { ojosCerrados, transitionMs, easing } = useParpadeo()
  const { animKey, activa, onFin } = useSaludo()

  return (
    <div className={`ardabito-root ${className ?? ''}`}>
      <div className="ardabito-sombra" />
      <Pieza pieza={PIEZAS.cola} />
      <Pieza
        key={animKey}
        pieza={PIEZAS.pataSaludo}
        className={activa ? 'ardabito-pata' : ''}
        onAnimationEnd={onFin}
      />
      <Pieza pieza={PIEZAS.cuerpo} />
      <CabezaConParpadeo ojosCerrados={ojosCerrados} transitionMs={transitionMs} easing={easing} />
    </div>
  )
}
