const MATRIZ = {
  ALTO: { ALTA: 'P1', MEDIA: 'P2', BAJA: 'P3' },
  MEDIO: { ALTA: 'P2', MEDIA: 'P3', BAJA: 'P4' },
  BAJO: { ALTA: 'P3', MEDIA: 'P4', BAJA: 'P4' },
};

function calcularPrioridad(impacto, urgencia) {
  const i = (impacto || '').toString().toUpperCase();
  const u = (urgencia || '').toString().toUpperCase();
  return MATRIZ[i]?.[u] || 'P3';
}

module.exports = {
  MATRIZ,
  calcularPrioridad,
  IMPACTOS: ['BAJO', 'MEDIO', 'ALTO'],
  URGENCIAS: ['BAJA', 'MEDIA', 'ALTA'],
  PRIORIDADES: ['P1', 'P2', 'P3', 'P4'],
  CLASIFICACIONES: ['incidente', 'solicitud', 'acceso', 'problema', 'cambio', 'consulta', 'alerta_automatica'],
};
