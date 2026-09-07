// Catálogo fijo de disposiciones de llamada del Webphone — usado tanto por
// webphoneController (formulario en pantalla-llamada, el iframe del Web
// Form de VICIdial) como por ccConfigController (exportar a Excel), para
// que ambos lados siempre muestren las mismas 10 opciones/etiquetas.
const TIPIFICACIONES_LLAMADA = [
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
];

const TIPIFICACIONES_LLAMADA_LABEL = Object.fromEntries(
  TIPIFICACIONES_LLAMADA.map((t) => [t.codigo, t.etiqueta]),
);

module.exports = { TIPIFICACIONES_LLAMADA, TIPIFICACIONES_LLAMADA_LABEL };
