import type { ProductoServicioRecurrencia } from '@/services/productoServicio.service'

// Etiquetas y colores de la recurrencia de un producto/servicio, compartidos
// por la ficha del cliente y el catálogo para asignar.
export const RECURRENCIA_LABEL: Record<ProductoServicioRecurrencia, string> = {
  SEMANAL: 'Semanal', QUINCENAL: 'Quincenal', MENSUAL: 'Mensual', ANUAL: 'Anual', UNICO: 'Pago único',
}
export const RECURRENCIA_CHIP: Record<ProductoServicioRecurrencia, string> = {
  SEMANAL: 'bg-amber-100 text-amber-700',
  QUINCENAL: 'bg-teal-100 text-teal-700',
  MENSUAL: 'bg-blue-100 text-blue-700',
  ANUAL: 'bg-violet-100 text-violet-700',
  UNICO: 'bg-gray-100 text-gray-600',
}
// Sufijo del precio según cómo se cobra.
export const RECURRENCIA_SUFIJO: Record<ProductoServicioRecurrencia, string> = {
  SEMANAL: '/sem', QUINCENAL: '/quinc.', MENSUAL: '/mes', ANUAL: '/año', UNICO: '',
}
export const money = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 })
