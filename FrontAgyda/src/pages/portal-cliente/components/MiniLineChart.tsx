interface MiniLineChartProps {
  data: number[]
  width?: number
  height?: number
  color?: string
}

/**
 * Gráfica de línea con área sombreada (estilo "Health Trend Chart") — SVG
 * puro, sin librería de gráficos, pensada para tendencias cortas dentro de
 * una card (ej. interacciones de una campaña por día de la semana).
 */
export function MiniLineChart({ data, width = 200, height = 60, color = '#19b6bc' }: MiniLineChartProps) {
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)
  const gradientId = 'mini-line-gradient'

  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 6) - 3
    return { x, y }
  })

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')
  const areaPath = `${linePath} L ${width} ${height} L 0 ${height} Z`

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={i === points.length - 1 ? 3 : 0} fill={color} />
      ))}
    </svg>
  )
}
