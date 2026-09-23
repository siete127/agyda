/**
 * Datos ligeros para GlobeBackground — sin depender de un GeoJSON externo
 * pesado. `LAND_BOUNDS` aproxima continentes como una lista de rectángulos
 * lat/lng (suficiente para que los puntos cyan "dibujen" las masas de tierra
 * reconociblemente a la distancia/escala de un fondo decorativo). `ARCS` son
 * unas pocas rutas punto-a-punto entre ciudades para los arcos luminosos, y
 * `MARKERS` un subconjunto de esas ciudades para los location markers.
 */

interface LatLng {
  lat: number
  lng: number
}

const LAND_BOUNDS: { latMin: number; latMax: number; lngMin: number; lngMax: number }[] = [
  { latMin: 15, latMax: 72, lngMin: -170, lngMax: -50 }, // Norteamérica
  { latMin: -56, latMax: 13, lngMin: -82, lngMax: -34 }, // Sudamérica
  { latMin: -35, latMax: 37, lngMin: -18, lngMax: 52 }, // África
  { latMin: 36, latMax: 71, lngMin: -10, lngMax: 40 }, // Europa
  { latMin: 5, latMax: 55, lngMin: 40, lngMax: 145 }, // Asia
  { latMin: -45, latMax: -10, lngMin: 112, lngMax: 154 }, // Oceanía
]

/** Genera puntos lat/lng distribuidos uniformemente sobre la esfera (Fibonacci
   sphere) y descarta los que no caen dentro de algún rectángulo de tierra —
   evita el "amontonamiento" en los polos que da una malla lat/lng ingenua. */
export function generateLandPoints(count: number): LatLng[] {
  const points: LatLng[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))

  for (let i = 0; i < count * 6; i++) {
    const y = 1 - (i / (count * 6 - 1)) * 2
    const radius = Math.sqrt(1 - y * y)
    const theta = golden * i
    const x = Math.cos(theta) * radius
    const z = Math.sin(theta) * radius

    const lat = (Math.asin(y) * 180) / Math.PI
    const lng = (Math.atan2(z, x) * 180) / Math.PI

    const onLand = LAND_BOUNDS.some(
      (b) => lat >= b.latMin && lat <= b.latMax && lng >= b.lngMin && lng <= b.lngMax
    )
    if (onLand) points.push({ lat, lng })
    if (points.length >= count) break
  }

  return points
}

const CIUDADES: Record<string, LatLng> = {
  cdmx: { lat: 19.43, lng: -99.13 },
  nyc: { lat: 40.71, lng: -74.0 },
  saoPaulo: { lat: -23.55, lng: -46.63 },
  londres: { lat: 51.51, lng: -0.13 },
  madrid: { lat: 40.42, lng: -3.7 },
  lagos: { lat: 6.52, lng: 3.38 },
  dubai: { lat: 25.2, lng: 55.27 },
  tokio: { lat: 35.68, lng: 139.69 },
  singapur: { lat: 1.35, lng: 103.82 },
  sidney: { lat: -33.87, lng: 151.21 },
}

export const MARKERS: LatLng[] = Object.values(CIUDADES)

export const ARCS: { start: LatLng; end: LatLng }[] = [
  { start: CIUDADES.cdmx, end: CIUDADES.nyc },
  { start: CIUDADES.cdmx, end: CIUDADES.madrid },
  { start: CIUDADES.nyc, end: CIUDADES.londres },
  { start: CIUDADES.londres, end: CIUDADES.dubai },
  { start: CIUDADES.dubai, end: CIUDADES.singapur },
  { start: CIUDADES.singapur, end: CIUDADES.tokio },
  { start: CIUDADES.saoPaulo, end: CIUDADES.lagos },
  { start: CIUDADES.tokio, end: CIUDADES.sidney },
]

/** Convierte lat/lng a un punto 3D sobre una esfera de radio `r`. */
export function latLngToVector3(lat: number, lng: number, r: number): [number, number, number] {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  const x = -r * Math.sin(phi) * Math.cos(theta)
  const y = r * Math.cos(phi)
  const z = r * Math.sin(phi) * Math.sin(theta)
  return [x, y, z]
}
