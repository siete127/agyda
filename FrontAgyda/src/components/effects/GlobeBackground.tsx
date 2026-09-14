// Nodos y arcos: puntos interiores de continente + snap al punto real de tierra más cercano.
// Se usan varias rutas y varios pulsos por ruta para que la red se vea activa y fluida.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

const RADIUS = 1.62
const PLANISPHERE_MASK_DATA_URI =
  'data:image/png;base64,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'

type LatLng = { lat: number; lng: number }
type ArcDef = { start: LatLng; end: LatLng; delay: number; speed: number }
type LandData = { all: Float32Array; interior: Float32Array }

const CITIES: Record<string, LatLng> = {
  // Norteamérica — repartidas, no amontonadas en un solo país
  cdmx: { lat: 19.4326, lng: -99.1332 },
  guadalajara: { lat: 20.6597, lng: -103.3496 },
  puebla: { lat: 19.0414, lng: -98.2063 },
  chihuahua: { lat: 28.6329, lng: -106.0691 },
  dallas: { lat: 32.7767, lng: -96.7970 },
  denver: { lat: 39.7392, lng: -104.9903 },
  winnipeg: { lat: 49.8951, lng: -97.1384 },

  // Sudamérica
  brasilia: { lat: -15.7939, lng: -47.8828 },
  santaCruz: { lat: -17.7833, lng: -63.1821 },
  cordoba: { lat: -31.4201, lng: -64.1888 },
  manaus: { lat: -3.1190, lng: -60.0217 },

  // Europa
  madrid: { lat: 40.4168, lng: -3.7038 },
  paris: { lat: 48.8566, lng: 2.3522 },
  budapest: { lat: 47.4979, lng: 19.0402 },
  moscow: { lat: 55.7558, lng: 37.6173 },

  // África
  cairo: { lat: 29.7604, lng: 31.2400 },
  khartoum: { lat: 15.5007, lng: 32.5599 },
  addis: { lat: 8.9806, lng: 38.7578 },
  lusaka: { lat: -15.3875, lng: 28.3228 },
  johannesburg: { lat: -26.2041, lng: 28.0473 },
  kinshasa: { lat: -4.4419, lng: 15.2663 },
  bamako: { lat: 12.6392, lng: -8.0029 },

  // Asia
  riyadh: { lat: 24.7136, lng: 46.6753 },
  delhi: { lat: 28.6139, lng: 77.2090 },
  nagpur: { lat: 21.1458, lng: 79.0882 },
  chengdu: { lat: 30.5728, lng: 104.0668 },
  beijing: { lat: 39.9042, lng: 116.4074 },
  ulanBator: { lat: 47.8864, lng: 106.9057 },
  novosibirsk: { lat: 55.0084, lng: 82.9357 },
  bangkok: { lat: 13.7563, lng: 100.5018 },
  yakutsk: { lat: 62.0355, lng: 129.6755 },

  // Oceanía
  aliceSprings: { lat: -23.6980, lng: 133.8807 },
  brisbane: { lat: -27.4698, lng: 153.0251 },
}

const ARCS: ArcDef[] = [
  // Norteamérica / centro de México
  { start: CITIES.cdmx, end: CITIES.guadalajara, delay: 0.00, speed: 0.35 },
  { start: CITIES.cdmx, end: CITIES.puebla, delay: 0.03, speed: 0.36 },
  { start: CITIES.guadalajara, end: CITIES.chihuahua, delay: 0.06, speed: 0.29 },
  { start: CITIES.chihuahua, end: CITIES.denver, delay: 0.09, speed: 0.29 },
  { start: CITIES.dallas, end: CITIES.denver, delay: 0.12, speed: 0.33 },
  { start: CITIES.denver, end: CITIES.winnipeg, delay: 0.18, speed: 0.28 },
  { start: CITIES.cdmx, end: CITIES.dallas, delay: 0.24, speed: 0.31 },

  // América hacia Sudamérica
  { start: CITIES.cdmx, end: CITIES.santaCruz, delay: 0.30, speed: 0.27 },
  { start: CITIES.santaCruz, end: CITIES.brasilia, delay: 0.36, speed: 0.34 },
  { start: CITIES.brasilia, end: CITIES.manaus, delay: 0.42, speed: 0.32 },
  { start: CITIES.santaCruz, end: CITIES.cordoba, delay: 0.48, speed: 0.29 },

  // América ↔ Europa / África
  { start: CITIES.dallas, end: CITIES.madrid, delay: 0.05, speed: 0.23 },
  { start: CITIES.brasilia, end: CITIES.madrid, delay: 0.53, speed: 0.24 },
  { start: CITIES.manaus, end: CITIES.bamako, delay: 0.60, speed: 0.25 },

  // Europa
  { start: CITIES.madrid, end: CITIES.paris, delay: 0.09, speed: 0.35 },
  { start: CITIES.paris, end: CITIES.budapest, delay: 0.22, speed: 0.34 },
  { start: CITIES.budapest, end: CITIES.moscow, delay: 0.34, speed: 0.30 },

  // África
  { start: CITIES.bamako, end: CITIES.kinshasa, delay: 0.11, speed: 0.28 },
  { start: CITIES.cairo, end: CITIES.khartoum, delay: 0.17, speed: 0.33 },
  { start: CITIES.khartoum, end: CITIES.addis, delay: 0.28, speed: 0.36 },
  { start: CITIES.addis, end: CITIES.lusaka, delay: 0.41, speed: 0.29 },
  { start: CITIES.lusaka, end: CITIES.johannesburg, delay: 0.55, speed: 0.34 },
  { start: CITIES.kinshasa, end: CITIES.lusaka, delay: 0.63, speed: 0.31 },

  // Europa / África ↔ Asia
  { start: CITIES.moscow, end: CITIES.novosibirsk, delay: 0.15, speed: 0.30 },
  { start: CITIES.novosibirsk, end: CITIES.yakutsk, delay: 0.26, speed: 0.27 },
  { start: CITIES.budapest, end: CITIES.riyadh, delay: 0.31, speed: 0.27 },
  { start: CITIES.cairo, end: CITIES.riyadh, delay: 0.44, speed: 0.32 },
  { start: CITIES.riyadh, end: CITIES.delhi, delay: 0.57, speed: 0.29 },
  { start: CITIES.delhi, end: CITIES.nagpur, delay: 0.69, speed: 0.38 },
  { start: CITIES.delhi, end: CITIES.chengdu, delay: 0.20, speed: 0.26 },
  { start: CITIES.chengdu, end: CITIES.beijing, delay: 0.38, speed: 0.34 },
  { start: CITIES.beijing, end: CITIES.ulanBator, delay: 0.50, speed: 0.36 },
  { start: CITIES.ulanBator, end: CITIES.novosibirsk, delay: 0.62, speed: 0.28 },
  { start: CITIES.chengdu, end: CITIES.bangkok, delay: 0.08, speed: 0.30 },

  // Asia ↔ Oceanía
  { start: CITIES.bangkok, end: CITIES.aliceSprings, delay: 0.46, speed: 0.23 },
  { start: CITIES.aliceSprings, end: CITIES.brisbane, delay: 0.58, speed: 0.32 },
  { start: CITIES.beijing, end: CITIES.aliceSprings, delay: 0.72, speed: 0.21 },
]

function latLngToVector3(lat: number, lng: number, r = RADIUS) {
  const phi = ((90 - lat) * Math.PI) / 180
  const theta = ((lng + 180) * Math.PI) / 180
  return new THREE.Vector3(
    -r * Math.sin(phi) * Math.cos(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.sin(theta)
  )
}

function makeArcCurve(start: LatLng, end: LatLng) {
  const a = latLngToVector3(start.lat, start.lng, RADIUS * 1.008)
  const b = latLngToVector3(end.lat, end.lng, RADIUS * 1.008)
  const angle = a.angleTo(b)
  const altitude = THREE.MathUtils.lerp(0.16, 0.66, THREE.MathUtils.clamp(angle / Math.PI, 0, 1))
  const mid = a.clone().add(b).normalize().multiplyScalar(RADIUS + altitude)
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

function CoreSphere() {
  // depthWrite=false: esta esfera es semitransparente y va DETRÁS de los
  // puntos de tierra (radio ligeramente menor). Con depthWrite en true
  // (el bug real) escribía profundidad en todo el hemisferio frontal y
  // tapaba los puntos que deberían verse ahí, dejando solo visible el
  // contorno/silueta — el efecto de "anillo vacío por el centro".
  return (
    <mesh renderOrder={0}>
      <sphereGeometry args={[RADIUS, 48, 48]} />
      <meshBasicMaterial color="#06152d" transparent opacity={0.62} depthWrite={false} />
    </mesh>
  )
}

function LandDots({ onReady }: { onReady?: (data: LandData) => void }) {
  const [positions, setPositions] = useState<Float32Array | null>(null)
  const { gl } = useThree()

  useEffect(() => {
    let cancelled = false
    const image = new Image()

    image.onload = () => {
      if (cancelled) return

      // La máscara es un planisferio equirectangular 2:1 limpio:
      // blanco = tierra, negro = océano.
      // Generamos una retícula hexagonal MUY densa de puntos y luego la
      // envolvemos sobre la esfera. Así cada punto cae únicamente sobre tierra,
      // pero los continentes se ven continuos y completos al rotar el globo.
      const w = image.naturalWidth || 2048
      const h = image.naturalHeight || 1024
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h

      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        setPositions(new Float32Array())
        return
      }

      ctx.clearRect(0, 0, w, h)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(image, 0, 0, w, h)

      const pixels = ctx.getImageData(0, 0, w, h).data
      const land = new Uint8Array(w * h)

      // Umbral generoso para conservar costas, penínsulas e islas pequeñas.
      for (let i = 0, p = 0; i < land.length; i++, p += 4) {
        const lum = pixels[p] * 0.2126 + pixels[p + 1] * 0.7152 + pixels[p + 2] * 0.0722
        land[i] = lum > 118 ? 1 : 0
      }

      // Dilatación mínima (1 px) para cerrar micro-huecos de la rasterización
      // sin deformar visualmente las costas. Se calcula una sola vez.
      const filled = new Uint8Array(land)
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x
          if (land[idx]) continue
          if (
            land[idx - 1] || land[idx + 1] || land[idx - w] || land[idx + w] ||
            land[idx - w - 1] || land[idx - w + 1] ||
            land[idx + w - 1] || land[idx + w + 1]
          ) {
            filled[idx] = 1
          }
        }
      }

      const pts: number[] = []
      const interiorPts: number[] = []

      // Un punto se considera "interior" solo si también hay tierra alrededor.
      // Esto evita que los nodos/conexiones terminen pegados a la costa.
      const isInteriorUV = (u: number, v: number) => {
        const px = Math.max(0, Math.min(w - 1, Math.round(u * (w - 1))))
        const py = Math.max(0, Math.min(h - 1, Math.round(v * (h - 1))))

        // ~1.0–1.5° de margen según la resolución de la máscara.
        const rx = Math.max(5, Math.round(w / 360 * 1.15))
        const ry = Math.max(3, Math.round(h / 180 * 1.15))

        const samples = [
          [0, 0],
          [ rx, 0], [-rx, 0], [0,  ry], [0, -ry],
          [ rx,  ry], [ rx, -ry], [-rx,  ry], [-rx, -ry],
        ]

        for (const [dx, dy] of samples) {
          const x = px + dx
          const y = py + dy
          if (x < 0 || x >= w || y < 0 || y >= h) return false
          if (filled[y * w + x] !== 1) return false
        }
        return true
      }

      // Distribución uniforme sobre TODA la esfera usando Fibonacci Sphere.
      // Esto elimina las bandas y la compresión visual de la cuadrícula
      // latitud/longitud que se notaba especialmente cerca de los polos.
      //
      // Generamos candidatos uniformemente separados y conservamos únicamente
      // los que caen sobre tierra según la máscara del planisferio.
      const candidateCount = 20000
      const goldenAngle = Math.PI * (3 - Math.sqrt(5))

      const isLandUV = (u: number, v: number) => {
        const px = Math.max(0, Math.min(w - 1, Math.round(u * (w - 1))))
        const py = Math.max(0, Math.min(h - 1, Math.round(v * (h - 1))))
        return filled[py * w + px] === 1
      }

      for (let i = 0; i < candidateCount; i++) {
        // y uniforme en [-1, 1] => densidad uniforme por área de esfera.
        const y = 1 - 2 * ((i + 0.5) / candidateCount)
        const radial = Math.sqrt(Math.max(0, 1 - y * y))
        const angle = i * goldenAngle

        const nx = Math.cos(angle) * radial
        const nz = Math.sin(angle) * radial

        // Convertimos el punto uniforme de esfera a lat/lng para consultar
        // la máscara equirectangular.
        const lat = THREE.MathUtils.radToDeg(Math.asin(y))
        const lng = THREE.MathUtils.radToDeg(Math.atan2(-nz, nx))

        const u = (lng + 180) / 360
        const v = (90 - lat) / 180
        if (!isLandUV(u, v)) continue

        const scale = RADIUS * 1.0105
        pts.push(nx * scale, y * scale, nz * scale)
        if (isInteriorUV(u, v)) {
          interiorPts.push(nx * scale, y * scale, nz * scale)
        }
      }

      if (!cancelled) {
        const all = new Float32Array(pts)
        const interior = new Float32Array(interiorPts)
        setPositions(all)
        onReady?.({ all, interior })
      }
    }

    image.onerror = () => {
      if (!cancelled) {
        console.warn('[GlobeBackground] No se pudo cargar la máscara del planisferio')
        setPositions(new Float32Array())
      }
    }

    image.src = PLANISPHERE_MASK_DATA_URI

    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [onReady])

  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry()
    if (positions) {
      g.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      g.computeBoundingSphere()
    }
    return g
  }, [positions])

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        depthTest: true,
        uniforms: {
          uColor: { value: new THREE.Color('#32d6ff') },
          uSize: { value: 2.35 * Math.min(gl.getPixelRatio(), 1.15) },
        },
        vertexShader: `
          uniform float uSize;
          varying float vVisible;
          void main() {
            // "Back-face culling" manual para puntos: un point no tiene
            // normal real como una cara, así que se usa la posición local
            // (normalizada, ya que están sobre una esfera) como su normal.
            // Si mira en contra de la cámara (dot < 0) es la cara trasera
            // del globo — se oculta en el fragment shader, no aquí, para
            // no romper el pipeline de puntos con gl_PointSize = 0.
            vec3 normal = normalize(position);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            vec3 viewDir = normalize(-mvPosition.xyz);
            vec3 normalView = normalize(mat3(modelViewMatrix) * normal);
            vVisible = dot(normalView, viewDir);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = uSize * (4.45 / max(2.95, -mvPosition.z));
          }
        `,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vVisible;
          void main() {
            if (vVisible < 0.02) discard;
            vec2 p = gl_PointCoord - vec2(0.5);
            float d = length(p);
            if (d > 0.5) discard;
            float edge = 1.0 - smoothstep(0.40, 0.5, d);
            gl_FragColor = vec4(uColor, 0.98 * edge);
          }
        `,
      }),
    [gl]
  )

  useEffect(() => {
    return () => {
      geometry.dispose()
      material.dispose()
    }
  }, [geometry, material])

  if (!positions || positions.length === 0) return null

  return <points geometry={geometry} material={material} renderOrder={3} frustumCulled />
}

// IMPORTANTE: los marcadores usan coordenadas deliberadamente tierra adentro.
// Evitamos ciudades costeras/islas para que, incluso con una máscara estilizada,
// ningún pulso parezca caer sobre el océano.

function Marker({ position, phase }: { position: THREE.Vector3; phase: number }) {
  const group = useRef<THREE.Group>(null)
  const core = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  const pos = useMemo(() => position.clone().setLength(RADIUS * 1.018), [position])
  const normal = useMemo(() => pos.clone().normalize(), [pos])

  useEffect(() => {
    if (!group.current) return
    group.current.position.copy(pos)
    group.current.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal)
  }, [pos, normal])

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 1.35 + phase
    const s = 1 + Math.sin(t) * 0.18
    if (core.current) core.current.scale.setScalar(s)
    if (ring.current) {
      const pulse = (clock.elapsedTime * 0.36 + phase * 0.17) % 1
      ring.current.scale.setScalar(0.7 + pulse * 1.8)
      const mat = ring.current.material as THREE.MeshBasicMaterial
      mat.opacity = (1 - pulse) * 0.42
    }
  })

  return (
    <group ref={group}>
      <mesh ref={core} renderOrder={8}>
        <circleGeometry args={[0.029, 20]} />
        <meshBasicMaterial color="#b9f4ff" transparent opacity={0.95} depthWrite={false} />
      </mesh>
      <mesh ref={ring} position={[0, 0, -0.001]} renderOrder={7}>
        <ringGeometry args={[0.040, 0.054, 28]} />
        <meshBasicMaterial color="#30d6ff" transparent opacity={0.35} depthWrite={false} />
      </mesh>
    </group>
  )
}

function makeArcCurveFromVectors(start: THREE.Vector3, end: THREE.Vector3) {
  const a = start.clone().setLength(RADIUS * 1.008)
  const b = end.clone().setLength(RADIUS * 1.008)
  const angle = a.angleTo(b)
  const altitude = THREE.MathUtils.lerp(0.16, 0.66, THREE.MathUtils.clamp(angle / Math.PI, 0, 1))
  const mid = a.clone().add(b).normalize().multiplyScalar(RADIUS + altitude)
  return new THREE.QuadraticBezierCurve3(a, mid, b)
}

function AnimatedArc({
  start,
  end,
  delay,
  speed,
  index,
  reducedMotion,
}: {
  start: THREE.Vector3
  end: THREE.Vector3
  delay: number
  speed: number
  index: number
  reducedMotion: boolean
}) {
  const curve = useMemo(() => makeArcCurveFromVectors(start, end), [start, end])
  const baseGeometry = useMemo(() => new THREE.TubeGeometry(curve, 24, 0.0038, 4, false), [curve])
  const pulseGeometry = useMemo(() => new THREE.TubeGeometry(curve, 32, 0.0074, 4, false), [curve])
  const pulseMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          uProgress: { value: delay },
          uColor: { value: new THREE.Color('#62ddff') },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform float uProgress;
          uniform vec3 uColor;
          varying vec2 vUv;
          void main() {
            float d = vUv.x - uProgress;
            float head = smoothstep(0.035, 0.0, abs(d));
            float tail = smoothstep(-0.34, 0.0, d) * (1.0 - smoothstep(0.0, 0.04, d));
            float alpha = max(head, tail * 0.88);
            if (alpha < 0.02) discard;
            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      }),
    [delay]
  )

  // Los pulsos se memoizan UNA sola vez (antes se clonaban con .clone() +
  // UniformsUtils.clone() en cada render, y además actualizaban su uniform
  // en un onBeforeRender con performance.now() propio en vez de usar el
  // useFrame ya existente — con ~30 arcos x 5 pulsos eran ~150 shaders
  // recompilándose/objetos animados fuera del loop de R3F en cada frame,
  // la causa real del stall de GPU). Se reduce también de 5 a 3 pulsos.
  const pulseOffsets = useMemo(() => [0, 0.3, 0.6], [])
  const pulseMaterials = useMemo(
    () =>
      pulseOffsets.map((offset) => {
        const m = pulseMaterial.clone()
        m.uniforms = THREE.UniformsUtils.clone(pulseMaterial.uniforms)
        m.uniforms.uProgress.value = delay + offset
        return m
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pulseMaterial, delay, pulseOffsets]
  )

  useFrame(({ clock }) => {
    if (reducedMotion) {
      pulseMaterials.forEach((m, i) => { m.uniforms.uProgress.value = 0.56 + pulseOffsets[i] })
      return
    }
    const t = clock.elapsedTime * speed + delay + index * 0.037
    pulseMaterials.forEach((m, i) => { m.uniforms.uProgress.value = (t + pulseOffsets[i]) % 1.25 })
  })

  useEffect(
    () => () => {
      baseGeometry.dispose()
      pulseGeometry.dispose()
      pulseMaterial.dispose()
      pulseMaterials.forEach((m) => m.dispose())
    },
    [baseGeometry, pulseGeometry, pulseMaterial, pulseMaterials]
  )

  return (
    <group>
      <mesh geometry={baseGeometry} renderOrder={5}>
        <meshBasicMaterial color="#2cccf4" transparent opacity={0.24} depthWrite={false} />
      </mesh>

      {/* Pulsos por conexión para que la red se perciba activa y con flujo continuo. */}
      {pulseMaterials.map((material, pulseIndex) => (
        <mesh key={pulseIndex} geometry={pulseGeometry} renderOrder={6 + pulseIndex}>
          <primitive object={material} attach="material" />
        </mesh>
      ))}
    </group>
  )
}

function GlobeScene({ rotationSpeed, reducedMotion }: { rotationSpeed: number; reducedMotion: boolean }) {
  const globe = useRef<THREE.Group>(null)
  const { gl } = useThree()
  const dragging = useRef(false)
  const lastX = useRef(0)
  const velocity = useRef(0)
  const [landData, setLandData] = useState<LandData | null>(null)

  const snappedCities = useMemo(() => {
    const landPositions =
      landData?.interior && landData.interior.length >= 3
        ? landData.interior
        : landData?.all
    if (!landPositions || landPositions.length < 3) return null

    const result: Record<string, THREE.Vector3> = {}

    for (const [name, city] of Object.entries(CITIES)) {
      const target = latLngToVector3(city.lat, city.lng, RADIUS * 1.0105).normalize()
      let bestIndex = 0
      let bestDot = -Infinity

      // Como todos los puntos están sobre la misma esfera, maximizar el producto
      // punto equivale a encontrar el punto de tierra angularmente más cercano.
      for (let i = 0; i < landPositions.length; i += 3) {
        const x = landPositions[i]
        const y = landPositions[i + 1]
        const z = landPositions[i + 2]
        const invLen = 1 / Math.hypot(x, y, z)
        const dot =
          target.x * x * invLen +
          target.y * y * invLen +
          target.z * z * invLen

        if (dot > bestDot) {
          bestDot = dot
          bestIndex = i
        }
      }

      result[name] = new THREE.Vector3(
        landPositions[bestIndex],
        landPositions[bestIndex + 1],
        landPositions[bestIndex + 2]
      )
    }

    return result
  }, [landData])

  const visiblePulseMarkers = useMemo(() => {
    if (!snappedCities) return []

    // Selecciona marcadores con separación angular mínima para evitar
    // puntos latentes pegados entre sí. Los arcos pueden seguir usando
    // todos los nodos, pero los pulsos visibles se distribuyen mejor.
    const entries = Object.entries(snappedCities)

    const priority = [
      'cdmx', 'guadalajara', 'puebla', 'chihuahua', 'dallas', 'denver', 'winnipeg',
      'brasilia', 'santaCruz', 'manaus',
      'madrid', 'paris', 'moscow',
      'cairo', 'lusaka', 'kinshasa', 'bamako',
      'riyadh', 'delhi', 'chengdu', 'beijing', 'novosibirsk', 'yakutsk',
      'aliceSprings', 'brisbane',
    ]

    const ordered = [
      ...priority
        .map((name) => entries.find(([key]) => key === name))
        .filter(Boolean) as Array<[string, THREE.Vector3]>,
      ...entries.filter(([name]) => !priority.includes(name)),
    ]

    const picked: Array<[string, THREE.Vector3]> = []
    const minAngle = THREE.MathUtils.degToRad(9.5)

    for (const item of ordered) {
      const [, pos] = item
      const normal = pos.clone().normalize()

      const tooClose = picked.some(([, chosen]) => {
        const dot = THREE.MathUtils.clamp(
          normal.dot(chosen.clone().normalize()),
          -1,
          1
        )
        return Math.acos(dot) < minAngle
      })

      if (!tooClose) picked.push(item)
    }

    return picked
  }, [snappedCities])

  const snappedArcs = useMemo(() => {
    if (!snappedCities) return []

    const cityEntries = Object.entries(CITIES)
    const cityNameFor = (point: LatLng) => {
      const found = cityEntries.find(
        ([, c]) => c.lat === point.lat && c.lng === point.lng
      )
      return found?.[0]
    }

    return ARCS.flatMap((def) => {
      const startName = cityNameFor(def.start)
      const endName = cityNameFor(def.end)
      if (!startName || !endName) return []
      return [{
        ...def,
        startPosition: snappedCities[startName],
        endPosition: snappedCities[endName],
      }]
    })
  }, [snappedCities])

  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.15))
    const el = gl.domElement

    const onDown = (e: PointerEvent) => {
      dragging.current = true
      lastX.current = e.clientX
      velocity.current = 0
      el.setPointerCapture?.(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging.current || !globe.current) return
      const dx = e.clientX - lastX.current
      lastX.current = e.clientX
      const delta = dx * 0.0045
      globe.current.rotation.y += delta
      velocity.current = delta
    }
    const onUp = (e: PointerEvent) => {
      dragging.current = false
      el.releasePointerCapture?.(e.pointerId)
    }

    el.addEventListener('pointerdown', onDown)
    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
    return () => {
      el.removeEventListener('pointerdown', onDown)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
    }
  }, [gl])

  useFrame((_, delta) => {
    if (!globe.current || reducedMotion) return
    if (!dragging.current) {
      globe.current.rotation.y += delta * rotationSpeed + velocity.current
      velocity.current *= Math.pow(0.002, delta)
    }
  })

  return (
    <group ref={globe} rotation={[0.08, -0.62, -0.035]}>
      <CoreSphere />
      <LandDots onReady={setLandData} />

      {snappedArcs.map((arc, index) => (
        <AnimatedArc
          key={index}
          start={arc.startPosition}
          end={arc.endPosition}
          delay={arc.delay}
          speed={arc.speed}
          index={index}
          reducedMotion={reducedMotion}
        />
      ))}

      {visiblePulseMarkers.map(([name, position], index) => (
        <Marker
          key={name}
          position={position}
          phase={index * 1.13}
        />
      ))}
    </group>
  )
}

export interface GlobeBackgroundProps {
  className?: string
  rotationSpeed?: number
  cameraDistance?: number
}

/**
 * Globo WebGL inspirado en el lenguaje visual del Globe de React Bits Pro,
 * pero implementado desde cero: continentes de puntos reales,
 * arcos con trazo luminoso viajando, marcadores pulsantes y rotación/drag.
 *
 * Pensado para estar DETRÁS de Ardabito. El contenedor padre controla tamaño,
 * posición y z-index; este componente mantiene fondo transparente.
 */
export function GlobeBackground({
  className,
  rotationSpeed = 0.36,
  cameraDistance = 5.25,
}: GlobeBackgroundProps) {
  const [hidden, setHidden] = useState(() => (typeof document !== 'undefined' ? document.hidden : false))
  const [reducedMotion, setReducedMotion] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)').matches : false
  )

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotion = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onMotion)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      mq.removeEventListener('change', onMotion)
    }
  }, [])

  return (
    <div className={className} aria-hidden="true" style={{ width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, cameraDistance], fov: 39, near: 0.1, far: 100 }}
        dpr={[1, 1.15]}
        gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
        frameloop={hidden ? 'never' : 'always'}
        style={{ width: '100%', height: '100%', background: 'transparent', touchAction: 'pan-y' }}
      >
        <GlobeScene rotationSpeed={rotationSpeed} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
