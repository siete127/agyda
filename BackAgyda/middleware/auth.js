const jwt = require('jsonwebtoken');
const logger = global.logger || require('../utils/logger');

// Middleware para verificar token (alias: verificarAutenticacion)
const authenticateToken = (req, res, next) => {
  // Buscar token en varios lugares para compatibilidad con el frontend
  // 1) Authorization: Bearer <token>
  // 2) header personalizado 'ventastoken' (parece que Flutter guarda 'VentasToken' en storage)
  // 3) query string ?token=
  const authHeader = req.headers['authorization'];
  // Extraer token de "Authorization" de forma robusta:
  // - Soporta "Bearer <token>" (case-insensitive)
  // - Si envían sólo el token en el header, también lo aceptamos
  let bearerToken = null;
  if (authHeader) {
    const m = authHeader.match(/^\s*Bearer\s+(.+)$/i);
    if (m && m[1]) bearerToken = m[1].trim();
    else bearerToken = authHeader.trim();
  }
  // aceptar varias variantes por si el cliente usa diferente naming
  const customToken = req.headers['ventastoken'] || req.headers['ventas-token'] || req.headers['ventasToken'] || req.headers['x-access-token'] || req.headers['token'];
  const qsToken = req.query && (req.query.token || req.query.access_token);
  const token = bearerToken || customToken || qsToken;

  // DEBUG: log de fuentes de token (temporal, no en producción)
  if (process.env.NODE_ENV !== 'production') {
    try {
      logger.debug('[auth] header keys =>', Object.keys(req.headers));
      logger.debug('[auth] token sources => bearer:', !!bearerToken, 'ventastoken:', !!req.headers['ventastoken'], "ventas-token:", !!req.headers['ventas-token'], 'x-access-token:', !!req.headers['x-access-token'], 'qs:', !!qsToken);
      // Mostrar esquema del authorization sin exponer el token completo
      const rawAuth = req.headers['authorization'];
      if (rawAuth) {
        const scheme = (rawAuth.split(' ')[0] || '').toUpperCase();
        logger.debug('[auth] raw authorization header scheme:', scheme, '| value: [REDACTED]');
      }
    } catch (e) {
      // no fallar por logs
    }
  }

  if (!token) {
    logger.warn('[auth] Token no encontrado en la petición - devolviendo 401');
    return res.status(401).json({ success: false, message: 'Token requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'AKOLATRONIC', (err, user) => {
    if (err) {
      logger.warn('[auth] Error verificando token:', err && err.message);
      // Distinguir token expirado para que el frontend pueda mostrar
      // un mensaje claro de "Reinicia sesión".
      if (err.name === 'TokenExpiredError') {
        return res
          .status(403)
          .json({ success: false, message: 'Token expirado, reinicia sesión' });
      }
      return res.status(403).json({ success: false, message: 'Token inválido' });
    }
    // Mostrar info mínima del usuario para depuración (sin imprimir token)
    try {
      const debugUser = { id: user && (user.id || user.sub || user.userId), username: user && (user.username || user.user), tipoUsuario: user && (user.tipoUsuario || user.role || user.tipousuario) };
      logger.debug('[auth] Token verificado. usuario:', JSON.stringify(debugUser));
    } catch (e) {
      // no bloquear si JSON falla
    }
    req.user = user;
    next();
  });
};

// Middleware opcional: si NO hay token, continúa sin usuario.
// Si HAY token pero es inválido/expirado, responde 403.
const authenticateTokenOptional = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let bearerToken = null;
  if (authHeader) {
    const m = authHeader.match(/^\s*Bearer\s+(.+)$/i);
    if (m && m[1]) bearerToken = m[1].trim();
    else bearerToken = authHeader.trim();
  }
  const customToken = req.headers['ventastoken'] || req.headers['ventas-token'] || req.headers['ventasToken'] || req.headers['x-access-token'] || req.headers['token'];
  const qsToken = req.query && (req.query.token || req.query.access_token);
  const token = bearerToken || customToken || qsToken;

  if (!token) {
    req.user = null;
    return next();
  }

  jwt.verify(token, process.env.JWT_SECRET || 'AKOLATRONIC', (err, user) => {
    if (err) {
      if (err.name === 'TokenExpiredError') {
        return res.status(403).json({ success: false, message: 'Token expirado, reinicia sesión' });
      }
      return res.status(403).json({ success: false, message: 'Token inválido' });
    }
    req.user = user;
    next();
  });
};

// Factory para verificar roles: verificarRol(['Administrador','ADM'])
const verificarRol = (allowedRoles = []) => {
  return (req, res, next) => {
    // Preferir el usuario decodificado en req.user (desde el token)
    const tipoUsuarioFromToken = req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario);
    const tipoUsuarioHeader = req.headers.tipousuario || req.body.tipoUsuario;
    const tipoUsuario = tipoUsuarioFromToken || tipoUsuarioHeader;

    if (!allowedRoles || allowedRoles.length === 0) return next();

    // Normalizar mayúsculas para comparación
    const tipoNorm = (tipoUsuario || '').toString().toLowerCase();
    const allowedNorm = allowedRoles.map(r => r.toString().toLowerCase());

    logger.debug('[verificarRol] Usuario tipo:', tipoUsuario, '| Normalizado:', tipoNorm, '| Permitidos:', allowedRoles);

    if (allowedNorm.includes(tipoNorm)) return next();

    return res.status(403).json({ 
      success: false, 
      message: 'Acceso denegado: rol insuficiente.',
      debug: { 
        tuRol: tipoUsuario, 
        rolesPermitidos: allowedRoles 
      }
    });
  };
};

// Compatibilidad: funciones antiguas
const requireAdmin = (req, res, next) => verificarRol(['admin', 'AD', 'Administrador'])(req, res, next);
const requireTI = (req, res, next) => verificarRol(['TI', 'admin', 'AD'])(req, res, next);

// Middleware: exige que el :id de la URL sea el propio usuario autenticado,
// o que el usuario tenga rol AD/TI (para acciones de administración sobre
// el perfil/cuenta de otro usuario). Debe ir DESPUÉS de authenticateToken.
const requireSelfOrAdmin = (paramName = 'id') => {
  return (req, res, next) => {
    const tipoUsuario = (req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario) || '').toString().toLowerCase();
    if (['ad', 'ti', 'admin', 'administrador'].includes(tipoUsuario)) return next();

    const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
    const targetId = req.params[paramName];
    if (uid && targetId && String(uid) === String(targetId)) return next();

    return res.status(403).json({ success: false, message: 'No autorizado para esta cuenta' });
  };
};

module.exports = {
  // nombres nuevos/compatibles
  authenticateToken,
  authenticateTokenOptional,
  verificarAutenticacion: authenticateToken,
  verificarRol,
  requireSelfOrAdmin,
  // nombres antiguos para compatibilidad con código existente
  requireAdmin,
  requireTI
};