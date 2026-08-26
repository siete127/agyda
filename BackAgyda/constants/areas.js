// Enum compartido de áreas de negocio (organigrama completo).
// Debe mantenerse en espejo con intranet-react/src/config/areas.ts
const AREA_KEYS = [
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
];

const AREA_LABELS = {
  'direccion-general': 'Dirección General',
  rh: 'Recursos Humanos',
  finanzas: 'Finanzas y Administración',
  ventas: 'Ventas',
  operaciones: 'Operaciones / Call Center',
  calidad: 'Calidad',
  marketing: 'Marketing',
  ti: 'Tecnología / TI',
  'atencion-cliente': 'Atención al Cliente',
  legal: 'Legal y Cumplimiento',
};

module.exports = { AREA_KEYS, AREA_LABELS };
