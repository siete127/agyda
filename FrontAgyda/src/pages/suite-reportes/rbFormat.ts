import type { RbFormato } from '@/types/reporteDiario.types'

const DIAS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Las fechas llegan como '2026-09-07T00:00:00.000Z' (medianoche UTC). Se toma la
// parte de fecha tal cual: convertirla a hora local la movería al día anterior.
function fechaDe(valor: unknown): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(valor))
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null
}

// Formatea el valor de una dimensión según su tipo (fechas, mes, día, hora…).
export function formatDimension(valor: unknown, tipo?: string, corto = false): string {
  if (valor == null || valor === '') return '—'
  switch (tipo) {
    case 'date': {
      const d = fechaDe(valor)
      if (!d) return String(valor)
      return corto
        ? `${d.getDate()} ${MESES[d.getMonth()]}`
        : d.toLocaleDateString('es-MX')
    }
    case 'mes': {
      const [y, m] = String(valor).split('-').map(Number)
      return m ? `${MESES[m - 1]} ${y}` : String(valor)
    }
    case 'dia_semana':
      return DIAS[Number(valor) - 1] ?? String(valor)
    case 'hora':
      return `${String(valor).padStart(2, '0')}:00`
    default:
      return String(valor)
  }
}

// Formatea un valor de celda según el formato declarado de la columna.
export function formatValor(valor: unknown, formato?: RbFormato, tipo?: string): string {
  if (valor == null || valor === '') return '—'

  if (tipo && tipo !== 'texto' && !formato) return formatDimension(valor, tipo)

  switch (formato) {
    case 'entero':
      return Number(valor).toLocaleString('es-MX', { maximumFractionDigits: 0 })
    case 'decimal':
      return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
    case 'porcentaje':
      return `${Number(valor).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`
    case 'minutos': {
      const min = Math.round(Number(valor))
      if (min < 60) return `${min} min`
      const h = Math.floor(min / 60)
      return `${h.toLocaleString('es-MX')}h ${min % 60}min`
    }
    case 'duracion': {
      // segundos → hh:mm:ss / mm:ss
      const s = Math.round(Number(valor))
      if (Number.isNaN(s)) return String(valor)
      const hh = Math.floor(s / 3600)
      const mm = Math.floor((s % 3600) / 60)
      const ss = s % 60
      const pad = (n: number) => String(n).padStart(2, '0')
      return hh > 0 ? `${hh}:${pad(mm)}:${pad(ss)}` : `${mm}:${pad(ss)}`
    }
    default:
      return String(valor)
  }
}

// Versión compacta para ejes (12.4 mil, 3.1 h…).
export function formatEje(valor: number, formato?: RbFormato): string {
  if (formato === 'porcentaje') return `${Math.round(valor)}%`
  if (formato === 'minutos') return valor >= 120 ? `${Math.round(valor / 60)} h` : `${Math.round(valor)} min`
  if (formato === 'duracion') return valor >= 3600 ? `${(valor / 3600).toFixed(1)} h` : `${Math.round(valor / 60)} min`
  return Intl.NumberFormat('es-MX', { notation: 'compact', maximumFractionDigits: 1 }).format(valor)
}

// Métricas que se pueden sumar entre filas (para % del total, acumulado, pastel).
export const esSumable = (formato?: RbFormato) => formato === 'entero' || formato === 'minutos'

// Exporta las filas a CSV y dispara la descarga en el navegador (sin backend).
export function descargarCsv(nombre: string, columnas: { id: string; label: string }[], filas: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columnas.map((c) => esc(c.label)).join(';')
  const body = filas.map((f) => columnas.map((c) => esc(f[c.id])).join(';')).join('\n')
  const csv = '\uFEFF' + head + '\n' + body // BOM para que Excel abra UTF-8 bien
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre.replace(/[^\w.-]+/g, '_')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
