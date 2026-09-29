import { useTemaGrafica } from './rbVisual'
import type { RbTipoVisual } from '@/types/reporteDiario.types'

/**
 * Boceto de cómo se ve un reporte (sin datos): la forma de gráfica que tendrá,
 * con la paleta real. Sirve para comparar plantillas de un vistazo.
 */
export function RbMiniatura({ tipo, series = 1, className }: { tipo: RbTipoVisual; series?: number; className?: string }) {
  const { series: col, c, rampa } = useTemaGrafica()
  const n = Math.max(1, Math.min(3, series))
  const W = 120
  const H = 64
  const base = H - 8

  const contenido = (() => {
    switch (tipo) {
      case 'kpi':
        return [0, 1, 2].map((i) => (
          <g key={i} transform={`translate(${6 + i * 38}, 14)`}>
            <rect width="34" height="36" rx="4" fill={c.superficie} stroke={c.rejilla} />
            <rect x="5" y="7" width="16" height="3" rx="1.5" fill={c.eje} />
            <rect x="5" y="16" width="22" height="8" rx="2" fill={c.tinta2} />
            <rect x="5" y="28" width="12" height="3" rx="1.5" fill={col[0]} />
          </g>
        ))
      case 'barras': {
        const alt = [22, 34, 28, 42, 30, 38]
        return alt.map((h, i) => Array.from({ length: n }, (_, s) => {
          const w = 14 / n
          return <rect key={`${i}-${s}`} x={10 + i * 17 + s * (w + 1)} y={base - h * (1 - s * 0.2)} width={w} height={h * (1 - s * 0.2)} rx="2" fill={col[s]} />
        }))
      }
      case 'barras_h': {
        const lar = [88, 70, 56, 40, 26]
        return lar.map((l, i) => (
          <g key={i}>
            <rect x="8" y={8 + i * 10} width="14" height="4" rx="2" fill={c.eje} opacity="0.6" />
            <rect x="26" y={7 + i * 10} width={l * 0.95} height="6" rx="2" fill={col[0]} />
          </g>
        ))
      }
      case 'apiladas': {
        const alt = [[14, 10, 6], [18, 12, 8], [12, 14, 6], [22, 12, 10], [16, 10, 8], [20, 14, 6]]
        return alt.map((seg, i) => {
          let y = base
          return seg.map((h, s) => {
            y -= h
            return <rect key={`${i}-${s}`} x={10 + i * 17} y={y} width="13" height={h - 1} rx={s === seg.length - 1 ? 2 : 0} fill={col[s]} />
          })
        })
      }
      case 'lineas':
      case 'area': {
        const lineas = [
          [40, 34, 38, 26, 30, 18, 22, 12],
          [48, 46, 42, 44, 36, 38, 32, 30],
          [52, 50, 51, 47, 48, 45, 46, 43],
        ].slice(0, n)
        return lineas.map((ys, s) => {
          const pts = ys.map((y, i) => `${8 + i * 15},${y}`).join(' ')
          return (
            <g key={s}>
              {tipo === 'area' && <polygon points={`8,${base} ${pts} ${8 + 7 * 15},${base}`} fill={col[s]} opacity="0.18" />}
              <polyline points={pts} fill="none" stroke={col[s]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            </g>
          )
        })
      }
      case 'pastel': {
        const partes = [0.4, 0.25, 0.2, 0.15]
        let ang = -Math.PI / 2
        const cx = W / 2
        const cy = H / 2
        const r = 24
        return partes.map((p, i) => {
          const a2 = ang + p * Math.PI * 2
          const d = `M ${cx + r * Math.cos(ang)} ${cy + r * Math.sin(ang)} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${cx + r * Math.cos(a2)} ${cy + r * Math.sin(a2)}`
          ang = a2
          return <path key={i} d={d} fill="none" stroke={col[i]} strokeWidth="10" />
        })
      }
      case 'calor': {
        const celdas = []
        for (let y = 0; y < 5; y++) {
          for (let x = 0; x < 12; x++) {
            const v = Math.max(0, Math.sin((x - 2) / 3) * 0.8 + 0.2 - y * 0.08)
            celdas.push(<rect key={`${x}-${y}`} x={8 + x * 9} y={8 + y * 10} width="8" height="9" rx="1.5" fill={rampa[Math.min(rampa.length - 1, Math.floor(v * (rampa.length - 1)))]} />)
          }
        }
        return celdas
      }
      default:
        return [0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x="8" y={8 + i * 10} width="40" height="4" rx="2" fill={i === 0 ? c.tinta2 : c.eje} opacity={i === 0 ? 1 : 0.6} />
            <rect x="60" y={8 + i * 10} width="22" height="4" rx="2" fill={c.eje} opacity="0.6" />
            <rect x="90" y={8 + i * 10} width="22" height="4" rx="2" fill={c.eje} opacity="0.6" />
          </g>
        ))
    }
  })()

  const cartesiana = ['barras', 'apiladas', 'lineas', 'area'].includes(tipo)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Boceto: ${tipo}`}>
      <rect width={W} height={H} rx="6" fill={c.superficie} />
      {cartesiana && [18, 32, 46].map((y) => <line key={y} x1="6" x2={W - 6} y1={y} y2={y} stroke={c.rejilla} strokeWidth="0.75" />)}
      {cartesiana && <line x1="6" x2={W - 6} y1={base} y2={base} stroke={c.base} strokeWidth="1" />}
      {contenido}
    </svg>
  )
}
