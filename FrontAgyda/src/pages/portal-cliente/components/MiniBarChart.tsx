interface BarDatum {
  label: string
  value: number
}

interface MiniBarChartProps {
  data: BarDatum[]
  highlightIndex?: number
  color?: string
  highlightColor?: string
  height?: number
}

/**
 * Gráfica de barras verticales (estilo "Statistics" con barras Mon-Sun) —
 * SVG puro, sin librería de gráficos. Una barra puede destacarse con un
 * color distinto (ej. el mes actual), igual que en la referencia.
 */
export function MiniBarChart({
  data,
  highlightIndex,
  color = '#19b6bc',
  highlightColor = '#0a2f71',
  height = 90,
}: MiniBarChartProps) {
  const max = Math.max(...data.map((d) => d.value))

  return (
    <div className="flex items-end justify-between gap-2" style={{ height }}>
      {data.map((d, i) => {
        const barHeight = Math.max((d.value / max) * (height - 22), 4)
        const isHighlight = i === highlightIndex
        return (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end justify-center">
              <div
                className="w-full max-w-[18px] rounded-full transition-all duration-500 ease-out"
                style={{
                  height: barHeight,
                  backgroundColor: isHighlight ? highlightColor : color,
                  opacity: isHighlight ? 1 : 0.35,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-ink-tertiary">{d.label}</span>
          </div>
        )
      })}
    </div>
  )
}
