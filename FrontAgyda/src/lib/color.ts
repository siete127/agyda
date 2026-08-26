/** Devuelve 'black' o 'white' según el brillo percibido (YIQ) del color de fondo hex dado, para que el texto siempre sea legible. */
export function getContrastTextColor(hexColor: string): 'black' | 'white' {
  const hex = hexColor.replace('#', '')
  const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex
  if (full.length < 6) return 'black'
  const r = parseInt(full.slice(0, 2), 16)
  const g = parseInt(full.slice(2, 4), 16)
  const b = parseInt(full.slice(4, 6), 16)
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 128 ? 'black' : 'white'
}
