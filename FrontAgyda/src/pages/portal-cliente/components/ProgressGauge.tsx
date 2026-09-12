import { useState } from 'react'
import { useCountUp } from '@/pages/portal-cliente/hooks/useCountUp'

interface ProgressGaugeProps {
  value: number
  size?: number
  strokeWidth?: number
  trackColor?: string
  progressColor?: string
  label?: string
  tooltip?: string
  segments?: number
  textColor?: string
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '')
  const bigint = parseInt(clean, 16)
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 }
}

function mixColor(from: string, to: string, t: number) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  const r = Math.round(a.r + (b.r - a.r) * t)
  const g = Math.round(a.g + (b.g - a.g) * t)
  const bl = Math.round(a.b + (b.b - a.b) * t)
  return `rgb(${r}, ${g}, ${bl})`
}

/**
 * Medio anillo de progreso hecho de barras discretas (estilo "Customers
 * Volume" de Ultraleads) en vez de un trazo continuo — muchas barras
 * delgadas tipo peine, cada una con su propio color interpolado a lo largo
 * del degradado turquesa→azul según su posición angular. Solo se "encienden"
 * las barras que corresponden al porcentaje actual.
 */
export function ProgressGauge({
  value,
  size = 96,
  strokeWidth = 8,
  trackColor = 'rgb(var(--surface-border))',
  progressColor = '#19b6bc',
  label,
  tooltip,
  segments = 24,
  textColor = 'white',
}: ProgressGaugeProps) {
  const [hover, setHover] = useState(false)
  const animated = useCountUp(value)

  const radius = (size - strokeWidth) / 2
  const cx = size / 2
  const cy = size / 2
  const gapDeg = 180 / segments / 3
  const step = 180 / segments
  const barLength = step - gapDeg
  const litCount = Math.round((animated / 100) * segments)

  function arcPath(startDeg: number, endDeg: number) {
    const toRad = (d: number) => ((180 - d) * Math.PI) / 180
    const x1 = cx + radius * Math.cos(toRad(startDeg))
    const y1 = cy - radius * Math.sin(toRad(startDeg))
    const x2 = cx + radius * Math.cos(toRad(endDeg))
    const y2 = cy - radius * Math.sin(toRad(endDeg))
    return `M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`
  }

  return (
    <div
      className="relative inline-flex flex-col items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
        {Array.from({ length: segments }).map((_, i) => {
          const start = i * step
          const end = start + barLength
          const isLit = i < litCount
          const color = isLit ? mixColor('#5eead4', progressColor, i / Math.max(segments - 1, 1)) : trackColor
          return (
            <path
              key={i}
              d={arcPath(start, end)}
              fill="none"
              stroke={color}
              strokeWidth={strokeWidth}
              strokeLinecap="butt"
              style={{ transition: 'stroke 0.3s ease-out' }}
            />
          )
        })}
      </svg>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1 flex-col items-center">
        <span className="text-3xl font-extrabold" style={{ color: textColor }}>{animated}%</span>
        {label && <span className="text-[10px] font-semibold text-ink-tertiary">{label}</span>}
      </div>

      {tooltip && hover && (
        <div className="absolute -top-9 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-[#0a2f71] px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-lg">
          {tooltip}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#0a2f71]" />
        </div>
      )}
    </div>
  )
}
