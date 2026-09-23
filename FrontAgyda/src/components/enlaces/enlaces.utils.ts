import type { EnlaceTopbar } from '@/services/personalizacion.service'

// Validación compartida por el editor de enlaces (encabezado de la empresa y
// "Mis enlaces" personales) — mismo criterio que limpiarEnlace del backend.
export const urlValida = (url: string) => /^https?:\/\//i.test(url.trim())

/** true si algún enlace no se puede guardar (sin nombre o URL inválida). */
export function hayEnlacesInvalidos(enlaces: EnlaceTopbar[]): boolean {
  return enlaces.some((e) => !e.label.trim() || !urlValida(e.url))
}
