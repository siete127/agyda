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
}

/**
 * Medio anillo de progreso (gauge), estilo "Customers Volume" de dashboards
 * tipo Ultraleads — SVG puro (sin librería de gráficos), con el número
 * animado con useCountUp y un tooltip opcional al pasar el mouse.
 */
export function ProgressGauge({
  value,
  size = 96,
  strokeWidth = 10,
  trackColor = 'rgb(var(--surface-border))',
  progressColor = '#19b6bc',
  label,
  tooltip,
}: ProgressGaugeProps) {
  const [hover, setHover] = useState(false)
  const animated = useCountUp(value)

  const radius = (size - strokeWidth) / 2
  const circumference = Math.PI * radius // medio círculo
  const offset = circumference - (animated / 100) * circumference

  return (
    <div
      className="relative inline-flex flex-col items-center"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width={size} height={size / 2 + strokeWidth / 2} viewBox={`0 0 ${size} ${size / 2 + strokeWidth / 2}`}>
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        <path
          d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
          fill="none"
          stroke={progressColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
        />
      </svg>
      <div className="absolute inset-x-0 top-1/2 flex -translate-y-1 flex-col items-center">
        <span className="text-lg font-extrabold text-ink">{animated}%</span>
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
