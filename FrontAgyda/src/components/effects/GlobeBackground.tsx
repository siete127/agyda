import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { generateLandPoints, latLngToVector3, ARCS, MARKERS } from './globeData'

const RADIUS = 1.5

interface GlobeSceneProps {
  rotationSpeed: number
  reducedMotion: boolean
}

function LandPoints() {
  const points = useMemo(() => generateLandPoints(900), [])

  const geometry = useMemo(() => {
    const positions = new Float32Array(points.length * 3)
    points.forEach((p, i) => {
      const [x, y, z] = latLngToVector3(p.lat, p.lng, RADIUS)
      positions[i * 3] = x
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z
    })
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    return geo
  }, [points])

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#22d3ee" size={0.018} sizeAttenuation transparent opacity={0.85} />
    </points>
  )
}

function GlowSphere() {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 1.035, 48, 48]} />
      <meshBasicMaterial color="#0a4a6e" transparent opacity={0.18} side={THREE.BackSide} />
    </mesh>
  )
}

function CoreSphere() {
  return (
    <mesh>
      <sphereGeometry args={[RADIUS * 0.995, 48, 48]} />
      <meshBasicMaterial color="#04101f" transparent opacity={0.92} />
    </mesh>
  )
}

function GraticuleLines() {
  const geometry = useMemo(() => {
    // lineSegments trata cada PAR consecutivo de vértices como un segmento
    // independiente — para "cortar" entre meridianos basta con duplicar el
    // punto de unión en vez de conectarlos, sin necesitar un separador NaN
    // (que rompe computeBoundingSphere).
    const points: THREE.Vector3[] = []
    const segments = 64
    for (let lng = -180; lng < 180; lng += 30) {
      for (let i = 0; i < segments; i++) {
        const latA = -90 + (180 * i) / segments
        const latB = -90 + (180 * (i + 1)) / segments
        points.push(new THREE.Vector3(...latLngToVector3(latA, lng, RADIUS * 1.001)))
        points.push(new THREE.Vector3(...latLngToVector3(latB, lng, RADIUS * 1.001)))
      }
    }
    return new THREE.BufferGeometry().setFromPoints(points)
  }, [])

  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color="#155e75" transparent opacity={0.15} />
    </lineSegments>
  )
}

function Arc({ start, end }: { start: [number, number, number]; end: [number, number, number] }) {
  // Se construye el THREE.Line completo (geometría + material) a mano y se
  // monta vía <primitive> — el elemento JSX intrínseco <line> de R3F choca
  // con el <line> SVG del namespace global de React/TypeScript.
  const line = useMemo(() => {
    const startV = new THREE.Vector3(...start)
    const endV = new THREE.Vector3(...end)
    const mid = startV.clone().add(endV).multiplyScalar(0.5)
    const midLength = mid.length()
    mid.normalize().multiplyScalar(Math.max(midLength * 1.35, RADIUS * 1.15))

    const curve = new THREE.QuadraticBezierCurve3(startV, mid, endV)
    const pts = curve.getPoints(28)
    const geometry = new THREE.BufferGeometry().setFromPoints(pts)
    const material = new THREE.LineBasicMaterial({ color: '#67e8f9', transparent: true, opacity: 0.55 })
    return new THREE.Line(geometry, material)
  }, [start, end])

  return <primitive object={line} />
}

function Arcs() {
  const positioned = useMemo(
    () =>
      ARCS.map((a) => ({
        start: latLngToVector3(a.start.lat, a.start.lng, RADIUS * 1.01),
        end: latLngToVector3(a.end.lat, a.end.lng, RADIUS * 1.01),
      })),
    []
  )
  return (
    <>
      {positioned.map((a, i) => (
        <Arc key={i} start={a.start} end={a.end} />
      ))}
    </>
  )
}

function Markers() {
  const positioned = useMemo(
    () => MARKERS.map((m) => latLngToVector3(m.lat, m.lng, RADIUS * 1.015)),
    []
  )
  return (
    <>
      {positioned.map((pos, i) => (
        <mesh key={i} position={pos}>
          <sphereGeometry args={[0.02, 8, 8]} />
          <meshBasicMaterial color="#a5f3fc" />
        </mesh>
      ))}
    </>
  )
}

function GlobeScene({ rotationSpeed, reducedMotion }: GlobeSceneProps) {
  const groupRef = useRef<THREE.Group>(null)
  const { gl } = useThree()

  useEffect(() => {
    gl.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
  }, [gl])

  useFrame((_, delta) => {
    if (reducedMotion) return
    if (groupRef.current) {
      groupRef.current.rotation.y += delta * rotationSpeed
    }
  })

  return (
    <group ref={groupRef} rotation={[0.15, 0, 0]}>
      <CoreSphere />
      <GraticuleLines />
      <LandPoints />
      <Arcs />
      <Markers />
      <GlowSphere />
    </group>
  )
}

interface GlobeBackgroundProps {
  className?: string
  /** Radianes por segundo de la rotación automática. */
  rotationSpeed?: number
  /** Distancia de la cámara al globo — más alto = globo más chico/lejano. */
  cameraDistance?: number
}

/**
 * Globo 3D decorativo (Three.js / React Three Fiber, implementación propia —
 * sin React Bits Pro): esfera azul oscura con puntos cyan tipo continentes,
 * arcos luminosos entre ciudades, location markers, rotación lenta y glow
 * sutil, fondo transparente. Pensado para ir detrás de <Ardabito/> en el login.
 *
 * Optimizaciones: DPR limitado a 1.5, geometría de baja resolución, pocos
 * arcos (8), pausa la rotación cuando la pestaña está oculta
 * (document.hidden), respeta prefers-reduced-motion, y limpia el contexto
 * WebGL al desmontar (R3F lo hace automáticamente via <Canvas>, ver dispose
 * en el propio Canvas).
 */
export function GlobeBackground({ className, rotationSpeed = 0.08, cameraDistance = 6.5 }: GlobeBackgroundProps) {
  const [hidden, setHidden] = useState(document.hidden)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )

  useEffect(() => {
    const onVisibility = () => setHidden(document.hidden)
    document.addEventListener('visibilitychange', onVisibility)

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onMotionChange = () => setReducedMotion(mq.matches)
    mq.addEventListener('change', onMotionChange)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      mq.removeEventListener('change', onMotionChange)
    }
  }, [])

  return (
    <div className={className} aria-hidden="true">
      <Canvas
        gl={{ alpha: true, antialias: true }}
        camera={{ position: [0, 0, cameraDistance], fov: 40 }}
        dpr={[1, 1.5]}
        frameloop={hidden ? 'never' : 'always'}
        style={{ background: 'transparent' }}
      >
        <ambientLight intensity={1.2} />
        <GlobeScene rotationSpeed={rotationSpeed} reducedMotion={reducedMotion} />
      </Canvas>
    </div>
  )
}
