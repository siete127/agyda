import {
  BarChart3, BarChartHorizontal, LineChart as LineIcon, AreaChart as AreaIcon, PieChart as PieIcon,
  Grid3x3, Table2, Gauge, Layers,
} from 'lucide-react'
import { useThemeStore, resolveTheme } from '@/stores/theme.store'
import { esSumable } from './rbFormat'
import type { RbColumna, RbTipoVisual, RbDefinicion, RbOrigen, RbPresetFecha } from '@/types/reporteDiario.types'

/* ── Paleta (orden fijo: la identidad de cada serie nunca se recicla) ── */

const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'],
}
const CROMO = {
  light: { superficie: '#fcfcfb', tinta: '#0b0b0b', tinta2: '#52514e', eje: '#898781', rejilla: '#e1e0d9', base: '#c3c2b7', otros: '#b5b3ac', borde: 'rgba(11,11,11,0.10)' },
  dark: { superficie: '#1a1a19', tinta: '#ffffff', tinta2: '#c3c2b7', eje: '#898781', rejilla: '#2c2c2a', base: '#383835', otros: '#5f5e5a', borde: 'rgba(255,255,255,0.10)' },
}
export type CromoGrafica = typeof CROMO.light
// Rampa secuencial azul (claro → oscuro). En modo oscuro se invierte para que
// "casi cero" se funda con la superficie oscura.
const RAMPA = ['#cde2fb', '#b7d3f6', '#9ec5f4', '#86b6ef', '#6da7ec', '#5598e7', '#3987e5', '#2a78d6', '#256abf', '#1c5cab', '#184f95', '#104281', '#0d366b']

export function useTemaGrafica() {
  const theme = useThemeStore((s) => s.theme)
  const modo = resolveTheme(theme)
  return { modo, series: SERIES[modo], c: CROMO[modo], rampa: modo === 'dark' ? [...RAMPA].reverse() : RAMPA }
}

export const PRESETS_FECHA: { id: RbPresetFecha; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'ayer', label: 'Ayer' },
  { id: 'ult7', label: 'Últimos 7 días' },
  { id: 'ult30', label: 'Últimos 30 días' },
  { id: 'ult90', label: 'Últimos 90 días' },
  { id: 'semana_actual', label: 'Esta semana' },
  { id: 'semana_pasada', label: 'Semana pasada' },
  { id: 'mes_actual', label: 'Este mes' },
  { id: 'mes_pasado', label: 'Mes pasado' },
  { id: 'anio_actual', label: 'Este año' },
]

/** Describe una definición en palabras: desgloses, métricas, periodo y filtros. */
export function describirDefinicion(def: RbDefinicion, origen: RbOrigen | undefined) {
  if (!origen) return { desgloses: [], metricas: [], periodo: '', filtros: [] as string[], extras: [] as string[] }
  const lbl = <T extends { id: string; label: string }>(lista: T[], id: string) => lista.find((x) => x.id === id)?.label ?? id
  const fecha = def.filtros.find((f) => origen.filtros.find((x) => x.id === f.id)?.tipo === 'fecha_rango')
  const periodo = !fecha
    ? 'Últimos 30 días'
    : fecha.preset ? PRESETS_FECHA.find((p) => p.id === fecha.preset)?.label ?? fecha.preset
    : `${fecha.desde ?? '…'} a ${fecha.hasta ?? '…'}`
  const filtros = def.filtros
    .filter((f) => f !== fecha)
    .map((f) => {
      const fd = origen.filtros.find((x) => x.id === f.id)
      if (!fd) return f.id
      const cuantos = f.valores?.length
      const detalle = fd.tipo === 'hora_rango' ? `${f.desde}:00–${f.hasta}:59`
        : fd.tipo === 'texto' ? `"${f.valor ?? ''}"`
        : cuantos ? (fd.catalogo && fd.tipo !== 'enum' ? `${cuantos} elegido(s)` : (f.valores ?? []).map((v) => {
          const i = fd.valores?.indexOf(String(v)) ?? -1
          return i >= 0 && fd.etiquetas ? fd.etiquetas[i] : String(v)
        }).join(', '))
        : 'sin valores'
      return `${fd.label}${f.excluir ? ' (excluir)' : ''}: ${detalle}`
    })
  const extras: string[] = []
  for (const c of def.condiciones ?? []) extras.push(`Solo filas con ${lbl(origen.metricas, c.metrica).toLowerCase()} ${c.op} ${c.valor}`)
  if (def.comparar === 'periodo_anterior') extras.push('Compara con el periodo anterior')
  if (def.comparar === 'anio_anterior') extras.push('Compara con el mismo periodo del año pasado')
  return {
    desgloses: def.dimensiones.map((d) => lbl(origen.dimensiones, d)),
    metricas: def.metricas.map((m) => lbl(origen.metricas, m)),
    periodo,
    filtros,
    extras,
  }
}

// Dimensiones de tiempo que se repiten (no son una línea de tiempo): van en barras o calor.
export const CICLICAS = new Set(['dia_semana', 'hora'])

/* ── Qué formas admite un resultado ── */

export const FORMAS: { id: RbTipoVisual; label: string; icon: typeof BarChart3 }[] = [
  { id: 'kpi', label: 'Indicadores', icon: Gauge },
  { id: 'barras', label: 'Barras', icon: BarChart3 },
  { id: 'barras_h', label: 'Barras horizontales', icon: BarChartHorizontal },
  { id: 'apiladas', label: 'Barras apiladas', icon: Layers },
  { id: 'lineas', label: 'Líneas', icon: LineIcon },
  { id: 'area', label: 'Área', icon: AreaIcon },
  { id: 'pastel', label: 'Pastel', icon: PieIcon },
  { id: 'calor', label: 'Mapa de calor', icon: Grid3x3 },
  { id: 'tabla', label: 'Solo tabla', icon: Table2 },
]

export function formasDisponibles(dims: RbColumna[], mets: RbColumna[]): RbTipoVisual[] {
  const sumables = mets.filter((m) => esSumable(m.formato))
  if (dims.length === 0) return ['kpi', 'tabla']
  if (dims.length === 1) {
    const f: RbTipoVisual[] = ['barras', 'barras_h', 'lineas', 'area']
    if (sumables.length >= 2) f.push('apiladas')
    if (sumables.length >= 1 && !dims[0].tiempo) f.push('pastel')
    return [...f, 'kpi', 'tabla']
  }
  if (dims.length === 2) return ['barras', 'apiladas', 'lineas', 'area', 'calor', 'kpi', 'tabla']
  return ['kpi', 'tabla']
}

/** Forma sugerida: serie de tiempo → líneas; día×hora → calor; muchas categorías → horizontales. */
export function formaAutomatica(dims: RbColumna[], filas: number): RbTipoVisual {
  if (dims.length === 0) return 'kpi'
  if (dims.length === 1) {
    const d = dims[0]
    if (d.tiempo && !CICLICAS.has(d.tipo ?? '')) return filas > 2 ? 'lineas' : 'barras'
    if (d.tiempo) return 'barras'
    return filas > 8 ? 'barras_h' : 'barras'
  }
  if (dims.length === 2) {
    if (dims.every((d) => CICLICAS.has(d.tipo ?? '')) || (dims[0].tiempo && dims[1].tiempo)) return 'calor'
    if (dims[0].tiempo && !CICLICAS.has(dims[0].tipo ?? '')) return 'lineas'
    return 'apiladas'
  }
  return 'tabla'
}

/** Columnas que tendría una definición (sin ejecutarla), para saber su forma o describirla. */
export function columnasDeDefinicion(def: RbDefinicion, origen: RbOrigen | undefined): { dims: RbColumna[]; mets: RbColumna[] } {
  if (!origen) return { dims: [], mets: [] }
  const dims = def.dimensiones
    .map((id) => origen.dimensiones.find((d) => d.id === id))
    .filter((d): d is NonNullable<typeof d> => !!d)
    .map((d) => ({ id: d.id, label: d.label, tipo: d.tipo, tiempo: d.tiempo, esDimension: true }))
  const mets = def.metricas
    .map((id) => origen.metricas.find((m) => m.id === id))
    .filter((m): m is NonNullable<typeof m> => !!m)
    .map((m) => ({ id: m.id, label: m.label, formato: m.formato, esDimension: false }))
  return { dims, mets }
}

/** Forma que se dibuja: la elegida si aplica al resultado; si no, la sugerida. */
export function formaEfectiva(elegida: RbTipoVisual | undefined, dims: RbColumna[], mets: RbColumna[], filas: number): RbTipoVisual {
  return !elegida || elegida === 'auto' || !formasDisponibles(dims, mets).includes(elegida) ? formaAutomatica(dims, filas) : elegida
}
