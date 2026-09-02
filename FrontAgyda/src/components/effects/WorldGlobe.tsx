import { useId } from 'react'

interface WorldGlobeProps {
  /** Tamaño del contenedor cuadrado en px. Por defecto 520. */
  size?: number
  /** Color principal de la malla y los arcos. */
  color?: string
  /** Color de los marcadores/puntos de brillo. */
  accentColor?: string
  /** Clases adicionales para el contenedor. */
  className?: string
}

/* Puntos fijos sobre la esfera (coordenadas normalizadas -1..1 respecto al
   centro, luego se escalan). Elegidos a mano para que se vean repartidos. */
const MARKERS = [
  { x: -0.55, y: -0.35 },
  { x: 0.35, y: -0.55 },
  { x: 0.6, y: 0.15 },
  { x: -0.2, y: 0.5 },
  { x: 0.05, y: -0.1 },
  { x: -0.65, y: 0.2 },
]

/* Pares de índices de MARKERS que se conectan con un arco animado. */
const ARCS: [number, number][] = [
  [0, 4],
  [4, 2],
  [1, 4],
  [4, 3],
  [5, 0],
]

export function WorldGlobe({ size = 520, color = '#3B82F6', accentColor = '#22D3EE', className = '' }: WorldGlobeProps) {
  const uid = useId().replace(/[:]/g, '')
  const r = 200 // radio base del globo en el viewBox
  const cx = 250
  const cy = 250

  const toAbs = (nx: number, ny: number) => ({ x: cx + nx * r, y: cy + ny * r })

  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      style={{ width: size, height: size }}
    >
      <style>{`
        @keyframes wg-spin-${uid} {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes wg-pulse-${uid} {
          0%, 100% { opacity: 0.35; r: 3; }
          50%      { opacity: 1;    r: 5.5; }
        }
        @keyframes wg-travel-${uid} {
          0%   { offset-distance: 0%;   opacity: 0; }
          8%   { opacity: 1; }
          92%  { opacity: 1; }
          100% { offset-distance: 100%; opacity: 0; }
        }
        .wg-mesh-${uid} {
          animation: wg-spin-${uid} 90s linear infinite;
          transform-origin: ${cx}px ${cy}px;
        }
        .wg-marker-${uid} {
          animation: wg-pulse-${uid} 2.6s ease-in-out infinite;
        }
        .wg-traveler-${uid} {
          offset-rotate: 0deg;
          animation: wg-travel-${uid} 4s linear infinite;
        }
      `}</style>

      <svg viewBox="0 0 500 500" className="h-full w-full overflow-visible">
        <defs>
          <radialGradient id={`wg-glow-${uid}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={accentColor} stopOpacity="0.9" />
            <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
          </radialGradient>
          <filter id={`wg-blur-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" />
          </filter>
        </defs>

        {/* Halo suave detrás de todo el globo */}
        <circle cx={cx} cy={cy} r={r + 30} fill={`url(#wg-glow-${uid})`} opacity={0.15} />

        {/* Contorno exterior de la esfera */}
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={color} strokeOpacity={0.35} strokeWidth={1.5} />

        {/* Malla giratoria: líneas de longitud (verticales, elipses) y latitud (horizontales) */}
        <g className={`wg-mesh-${uid}`}>
          {[0.85, 0.55, 0.2, -0.2, -0.55, -0.85].map((t, i) => (
            <ellipse
              key={`lon-${i}`}
              cx={cx}
              cy={cy}
              rx={Math.abs(r * Math.cos((t * Math.PI) / 2))}
              ry={r}
              fill="none"
              stroke={color}
              strokeOpacity={0.22}
              strokeWidth={1}
            />
          ))}
          {[0.6, 0.3, 0, -0.3, -0.6].map((t, i) => (
            <ellipse
              key={`lat-${i}`}
              cx={cx}
              cy={cy + t * r}
              rx={r * Math.cos((t * Math.PI) / 2)}
              ry={r * 0.22 * Math.cos((t * Math.PI) / 2) + 6}
              fill="none"
              stroke={color}
              strokeOpacity={0.22}
              strokeWidth={1}
            />
          ))}
        </g>

        {/* Arcos animados entre marcadores, con un punto de luz recorriendo cada uno */}
        {ARCS.map(([a, b], i) => {
          const p1 = toAbs(MARKERS[a].x, MARKERS[a].y)
          const p2 = toAbs(MARKERS[b].x, MARKERS[b].y)
          const mx = (p1.x + p2.x) / 2
          const my = (p1.y + p2.y) / 2 - 60 // curva el arco hacia arriba
          const pathId = `wg-arc-${uid}-${i}`
          const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`
          return (
            <g key={pathId}>
              <path id={pathId} d={d} fill="none" stroke={accentColor} strokeOpacity={0.25} strokeWidth={1} />
              <circle
                r={3}
                fill={accentColor}
                filter={`url(#wg-blur-${uid})`}
                className={`wg-traveler-${uid}`}
                style={{ offsetPath: `path('${d}')`, animationDelay: `${i * 0.7}s` }}
              />
            </g>
          )
        })}

        {/* Marcadores de ubicación con pulso */}
        {MARKERS.map((m, i) => {
          const p = toAbs(m.x, m.y)
          return (
            <g key={`marker-${i}`}>
              <circle cx={p.x} cy={p.y} r={9} fill={accentColor} opacity={0.15} />
              <circle
                cx={p.x}
                cy={p.y}
                r={3}
                fill={accentColor}
                className={`wg-marker-${uid}`}
                style={{ animationDelay: `${i * 0.35}s` }}
              />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
