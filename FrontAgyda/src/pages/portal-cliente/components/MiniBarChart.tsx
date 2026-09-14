import { useEffect, useState } from 'react'

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
  goal?: number
}

/**
 * Gráfica de barras verticales (estilo "Statistics" con barras Mon-Sun) —
 * SVG puro, sin librería de gráficos. Una barra puede destacarse con un
 * color distinto (ej. el mes actual), igual que en la referencia. Cada
 * barra muestra su valor arriba, y opcionalmente se dibuja una línea
 * punteada gris ("Alcance mensual") para comparar el real vs. esa referencia.
 *
 * Al montar, las barras arrancan en altura 0 y "crecen" una tras otra
 * (delay escalonado por índice) para que el gráfico se vea dibujándose al
 * entrar al dashboard, en vez de aparecer ya completo de golpe.
 */
export function MiniBarChart({
  data,
  highlightIndex,
  color = '#19b6bc',
  highlightColor = '#0a2f71',
  height = 90,
  goal,
}: MiniBarChartProps) {
  const [drawn, setDrawn] = useState(false)

  useEffect(() => {
    const id = requestAnimationFrame(() => setDrawn(true))
    return () => cancelAnimationFrame(id)
  }, [])

  const max = Math.max(...data.map((d) => d.value), goal ?? 0)
  const chartHeight = height - 22
  const goalY = goal !== undefined ? chartHeight - (goal / max) * chartHeight : null

  return (
    <div>
      {goal !== undefined && (
        <p className="mb-2 text-[10px] font-semibold text-ink-tertiary">
          Alcance mensual: <span className="text-ink-secondary">{goal.toLocaleString('es-MX')}</span>
        </p>
      )}
      <div className="relative flex items-end justify-between gap-2" style={{ height }}>
        {goalY !== null && (
          <div
            className="pointer-events-none absolute left-0 right-0 border-t border-dashed border-ink-tertiary/40"
            style={{ top: goalY }}
          />
        )}
        {data.map((d, i) => {
          const barHeight = Math.max((d.value / max) * chartHeight, 4)
          const isHighlight = i === highlightIndex
          const base = isHighlight ? highlightColor : color
          return (
            <div key={d.label} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex w-full flex-1 flex-col items-center justify-end">
                <span
                  className="mb-1 text-[10px] font-bold transition-opacity duration-300"
                  style={{
                    color: isHighlight ? highlightColor : 'rgb(var(--ink-tertiary))',
                    opacity: drawn ? 1 : 0,
                    transitionDelay: `${i * 90 + 350}ms`,
                  }}
                >
                  {d.value.toLocaleString('es-MX')}
                </span>
                <div
                  className="w-full max-w-[22px] rounded-md transition-all ease-out"
                  style={{
                    height: drawn ? barHeight : 0,
                    background: `linear-gradient(180deg, ${base} 0%, ${base}66 100%)`,
                    opacity: isHighlight ? 1 : 0.45,
                    transitionDuration: '500ms',
                    transitionDelay: `${i * 90}ms`,
                  }}
                />
              </div>
              <span className="text-[10px] font-semibold text-ink-tertiary">{d.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
