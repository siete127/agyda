// Espejo de BackAgyda/utils/tipificacionesLlamada.js — mantener ambos en sync.
export const TIPIFICACIONES_LLAMADA = [
  { codigo: 'APPT', etiqueta: 'Cita Agendada' },
  { codigo: 'CONF', etiqueta: 'Cita Confirmada' },
  { codigo: 'CONTACT', etiqueta: 'Contactado' },
  { codigo: 'INFO', etiqueta: 'Información Proporcionada' },
  { codigo: 'INTERE', etiqueta: 'Interesado' },
  { codigo: 'LOC', etiqueta: 'No Interesado por Ubicación' },
  { codigo: 'NOINT', etiqueta: 'No Interesado' },
  { codigo: 'NOSHOW', etiqueta: 'No asistió' },
  { codigo: 'RESCH', etiqueta: 'Reagendar Cita' },
  { codigo: 'SCHED', etiqueta: 'No Interesado por Horario' },
] as const

export const TIPIFICACIONES_LLAMADA_LABEL: Record<string, string> = Object.fromEntries(
  TIPIFICACIONES_LLAMADA.map((t) => [t.codigo, t.etiqueta]),
)
