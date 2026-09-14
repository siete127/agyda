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

function Pieza({ pieza, className }: { pieza: PiezaSpec; className?: string }) {
  return (
    <img
      src={pieza.src}
      alt=""
      draggable={false}
      className={`ardabito-pieza ${className ?? ''}`}
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

interface ArdabitoProps {
  className?: string
}

export function Ardabito({ className }: ArdabitoProps) {
  return (
    <div className={`ardabito-root ${className ?? ''}`}>
      <Pieza pieza={PIEZAS.cola} />
      <Pieza pieza={PIEZAS.pataSaludo} className="ardabito-pata" />
      <Pieza pieza={PIEZAS.cuerpo} />
      <Pieza pieza={PIEZAS.cabeza} className="ardabito-cabeza" />
    </div>
  )
}
