const jwt = require('jsonwebtoken');
const logger = global.logger || require('../utils/logger');

// Lista de tokens revocados (logout explícito). Un JWT es válido por firma y
// fecha hasta que expira; sin esto, "Cerrar sesión" en la página pública no
// podría cortar una pestaña de AGYDA que siguiera abierta con el mismo token.
//
// Se guarda en memoria del proceso: si el backend se reinicia, los tokens
// revocados vuelven a aceptarse hasta que caduquen por su cuenta (JWT de 12h).
// Es un compromiso deliberado — evita crear una tabla/servicio de sesiones para
// un caso de borde poco frecuente. Si en el futuro hay varias instancias del
// backend detrás de un balanceador, esto debe pasar a un store compartido
// (Redis o tabla en BD).
const revoked = new Map(); // token -> exp (epoch en segundos)

function revokeToken(token) {
  if (!token) return;
  let exp = Math.floor(Date.now() / 1000) + 12 * 3600; // fallback: 12h
  try {
    const decoded = jwt.decode(token);
    if (decoded && decoded.exp) exp = decoded.exp;
  } catch (e) {
    // token no decodificable: lo revocamos igual con el fallback
  }
  revoked.set(token, exp);
  logger.debug('[denylist] token revocado (total en lista: %d)', revoked.size);
}

function isRevoked(token) {
  if (!token) return false;
  const exp = revoked.get(token);
  if (!exp) return false;
  // Ya expiró por su cuenta: lo quitamos y dejamos que jwt.verify lo rechace.
  if (Date.now() / 1000 >= exp) {
    revoked.delete(token);
    return false;
  }
  return true;
}

// Limpieza periódica de tokens ya expirados para que el Map no crezca sin fin.
const sweep = setInterval(() => {
  const now = Date.now() / 1000;
  for (const [token, exp] of revoked) {
    if (now >= exp) revoked.delete(token);
  }
}, 60 * 60 * 1000); // cada hora
sweep.unref?.();

module.exports = { revokeToken, isRevoked };
