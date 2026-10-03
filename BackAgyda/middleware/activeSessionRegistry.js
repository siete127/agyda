const logger = global.logger || require('../utils/logger');

// Sesión única por usuario: guarda el último token emitido por NEUS_ID. Un
// segundo login del mismo usuario detecta la sesión previa y, si se confirma
// (forzarSesion), revoca ese token viejo (ver tokenDenylist.js) y avisa por
// socket a esa pestaña para que cierre sesión de inmediato.
//
// En memoria del proceso, mismo compromiso que tokenDenylist.js: si el backend
// se reinicia, el registro se pierde y el próximo login de cada usuario entra
// sin pedir confirmación (no hay sesión "fantasma" bloqueando nada). Si en el
// futuro hay varias instancias detrás de un balanceador, debe pasar a un store
// compartido junto con tokenDenylist.
const activas = new Map(); // userId (string) -> { token, empresa }

function getSesionActiva(userId) {
  return activas.get(String(userId)) || null;
}

function setSesionActiva(userId, token, empresa) {
  activas.set(String(userId), { token, empresa });
  logger.debug('[sesionActiva] registrada userId=%s (total: %d)', userId, activas.size);
}

// Solo limpia si el token coincide con el registrado — un logout de una
// sesión ya reemplazada no debe borrar el registro de la sesión nueva.
function clearSesionActiva(userId, token) {
  const actual = activas.get(String(userId));
  if (actual && actual.token === token) activas.delete(String(userId));
}

module.exports = { getSesionActiva, setSesionActiva, clearSesionActiva };
