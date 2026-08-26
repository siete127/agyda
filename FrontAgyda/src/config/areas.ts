// Enum compartido de áreas de negocio (organigrama completo).
// Debe mantenerse en espejo con BackIntranet/constants/areas.js
export const AREA_KEYS = [
  'direccion-general',
  'rh',
  'finanzas',
  'ventas',
  'operaciones',
  'calidad',
  'marketing',
  'ti',
  'atencion-cliente',
  'legal',
] as const

export type AreaKey = (typeof AREA_KEYS)[number]

export const AREA_LABELS: Record<AreaKey, string> = {
  'direccion-general': 'Dirección General',
  rh: 'Recursos Humanos',
  finanzas: 'Finanzas y Administración',
  ventas: 'Ventas',
  operaciones: 'Contact Center',
  calidad: 'Calidad',
  marketing: 'Marketing',
  ti: 'Tecnología / TI',
  'atencion-cliente': 'Atención al Cliente',
  legal: 'Legal y Cumplimiento',
}
