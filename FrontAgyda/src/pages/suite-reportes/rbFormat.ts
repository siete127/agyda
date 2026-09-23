import type { RbFormato } from '@/types/reporteDiario.types'

// Formatea un valor de celda según el formato declarado de la columna.
export function formatValor(valor: unknown, formato?: RbFormato, tipo?: string): string {
  if (valor == null || valor === '') return '—'

  if (tipo === 'date') {
    const d = new Date(valor as string)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('es-MX')
  }

  switch (formato) {
    case 'entero':
      return Number(valor).toLocaleString('es-MX', { maximumFractionDigits: 0 })
    case 'decimal':
      return Number(valor).toLocaleString('es-MX', { minimumFractionDigits: 1, maximumFractionDigits: 2 })
    case 'minutos': {
      const min = Math.round(Number(valor))
      if (min < 60) return `${min} min`
      const h = Math.floor(min / 60)
      return `${h}h ${min % 60}min`
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

// Exporta las filas a CSV y dispara la descarga en el navegador (sin backend).
export function descargarCsv(nombre: string, columnas: { id: string; label: string }[], filas: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v)
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const head = columnas.map((c) => esc(c.label)).join(';')
  const body = filas.map((f) => columnas.map((c) => esc(f[c.id])).join(';')).join('\n')
  const csv = '﻿' + head + '\n' + body // BOM para que Excel abra UTF-8 bien
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
