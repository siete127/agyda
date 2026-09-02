import { useEffect, useRef, useState } from 'react'
import createGlobe, { type COBEOptions } from 'cobe'

/**
 * CobeGlobe — Globo 3D con continentes hechos de puntos, arcos de conexión
 * y marcadores, usando la librería gratuita "cobe" (MIT, ~5KB, WebGL).
 *
 * A diferencia de intentar dibujar esto a mano con SVG, cobe ya trae el
 * mapa mundial real muestreado como puntos, con proyección esférica
 * correcta y rotación suave — es la forma correcta de lograr el efecto
 * de la referencia (continentes punteados + arcos curvos) sin pagar
 * ninguna licencia.
 *
 * Instalación: npm install cobe
 */

interface Marker {
  location: [number, number] // [latitud, longitud]
  size: number
}

interface Arc {
  from: [number, number]
  to: [number, number]
}

interface CobeGlobeProps {
  /** Tamaño del lienzo en px (cuadrado). */
  size?: number
  /** Color base de los continentes (r,g,b de 0 a 1). */
  baseColor?: [number, number, number]
  /** Color de los marcadores (r,g,b de 0 a 1). */
  markerColor?: [number, number, number]
  /** Color del brillo/halo (r,g,b de 0 a 1). */
  glowColor?: [number, number, number]
  /** Color de los arcos (r,g,b de 0 a 1). */
  arcColor?: [number, number, number]
  markers?: Marker[]
  arcs?: Arc[]
  /** Velocidad de rotación automática. 0 = quieto. */
  rotationSpeed?: number
  className?: string
}

const DEFAULT_MARKERS: Marker[] = [
  { location: [19.4326, -99.1332], size: 0.08 }, // CDMX
  { location: [40.7128, -74.006], size: 0.05 },  // Nueva York
  { location: [51.5074, -0.1278], size: 0.05 },  // Londres
  { location: [35.6762, 139.6503], size: 0.05 }, // Tokio
  { location: [-23.5505, -46.6333], size: 0.05 },// São Paulo
]

const DEFAULT_ARCS: Arc[] = [
  { from: [19.4326, -99.1332], to: [40.7128, -74.006] },
  { from: [19.4326, -99.1332], to: [51.5074, -0.1278] },
  { from: [51.5074, -0.1278], to: [35.6762, 139.6503] },
  { from: [19.4326, -99.1332], to: [-23.5505, -46.6333] },
]

export function CobeGlobe({
  size = 500,
  baseColor = [0.35, 0.45, 0.85],
  markerColor = [0.13, 0.83, 0.93],
  glowColor = [0.4, 0.6, 1],
  arcColor = [0.13, 0.83, 0.93],
  markers = DEFAULT_MARKERS,
  arcs = DEFAULT_ARCS,
  rotationSpeed = 0.0035,
  className = '',
}: CobeGlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phiRef = useRef(0)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    const globe = createGlobe(canvas, {
      devicePixelRatio: dpr,
      width: size * dpr,
      height: size * dpr,
      phi: 0,
      theta: 0.3,
      dark: 0,
      diffuse: 1.2,
      scale: 1,
      mapSamples: 14000,
      mapBrightness: 6,
      baseColor,
      markerColor,
      glowColor,
      arcColor,
      arcWidth: 2,
      arcHeight: 0.35,
      markers,
      arcs,
      onRender: (state: Record<string, any>) => {
        state.phi = phiRef.current
        phiRef.current += rotationSpeed
      },
    } satisfies COBEOptions)

    // Pequeño fade-in cuando el primer frame ya se dibujó, para que no
    // aparezca de golpe al cargar la página.
    requestAnimationFrame(() => setVisible(true))

    return () => globe.destroy()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size])

  return (
    <canvas
      ref={canvasRef}
      className={`transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'} ${className}`}
      style={{ width: size, height: size, maxWidth: '100%', aspectRatio: 1 }}
    />
  )
}
