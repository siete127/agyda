// Presets de color de marca. Elegir uno solo hace updateBranding({ colorBrand });
// PersonalizacionProvider deriva dark/light/muted y aplica en vivo.
export interface Palette {
  key: string
  nombre: string
  color: string // hex #RRGGBB
}

export const PALETTES: Palette[] = [
  { key: 'azul',      nombre: 'Azul AGYDA', color: '#2F6FED' },
  { key: 'esmeralda', nombre: 'Esmeralda',  color: '#10B981' },
  { key: 'purpura',   nombre: 'Púrpura',    color: '#8B5CF6' },
  { key: 'ambar',     nombre: 'Ámbar',      color: '#F59E0B' },
  { key: 'rojo',      nombre: 'Rojo',       color: '#EF4444' },
  { key: 'slate',     nombre: 'Slate',      color: '#64748B' },
]

export function paletteFromColor(color: string): Palette | null {
  const c = (color || '').toLowerCase()
  return PALETTES.find((p) => p.color.toLowerCase() === c) ?? null
}
