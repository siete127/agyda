const USER_ROLES = {
  ADMIN: 'admin',
  TI: 'TI',
  ST: 'ST',
  USER: 'user',
  CC: 'CC',
  AD: 'AD'
};

const TICKET_STATUS = {
  ABIERTO: 'abierto',
  ASIGNADO: 'asignado',
  EN_PROCESO: 'en_proceso',
  RESUELTO: 'resuelto',
  CERRADO: 'cerrado'
};

const TICKET_PRIORITY = {
  BAJA: 'BAJA',
  NORMAL: 'NORMAL',
  ALTA: 'ALTA'
};

const PERMISO_STATUS = {
  PENDIENTE: 'pendiente',
  ACEPTADO: 'aceptado',
  RECHAZADO: 'rechazado'
};

const NOTICIA_STATUS = {
  ACTIVA: 1,
  INACTIVA: 0
};

const ENCUESTA_STATUS = {
  BORRADOR: 'borrador',
  ACTIVA: 'activa',
  FINALIZADA: 'finalizada'
};

const ALLOWED_IMAGE_TYPES = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_PORTADA_SIZE = 10 * 1024 * 1024; // 10MB

module.exports = {
  USER_ROLES,
  TICKET_STATUS,
  TICKET_PRIORITY,
  PERMISO_STATUS,
  NOTICIA_STATUS,
  ENCUESTA_STATUS,
  ALLOWED_IMAGE_TYPES,
  MAX_FILE_SIZE,
  MAX_PORTADA_SIZE
};