const logger = global.logger || require('../utils/logger');
const socketService = require('../services/socketService');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

function _parseJsonEnv(name) {
  try {
    const raw = (process.env[name] || '').toString().trim();
    if (!raw) return null;
    const decoded = JSON.parse(raw);
    return decoded && typeof decoded === 'object' ? decoded : null;
  } catch (_) {
    return null;
  }
}

function _isAuthorized(req) {
  const expected = (process.env.WEBPHONE_EVENT_SECRET || '').toString().trim();
  if (!expected) return false;

  const got = (
    req.headers['x-webphone-secret'] ||
    req.headers['x_webphone_secret'] ||
    req.query?.secret ||
    req.body?.secret
  )
    ?.toString()
    .trim();

  return !!got && got === expected;
}

function _toInt(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  return i > 0 ? i : null;
}

function _toExtension(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Aceptar solo dígitos para evitar basura (ej. "1001", "045")
  if (!/^\d+$/.test(s)) return null;
  return s;
}

function _padExtension(ext) {
  try {
    const padLenRaw = (process.env.WEBPHONE_EXTENSION_PAD_LENGTH || '')
      .toString()
      .trim();
    const padLen = padLenRaw ? Number(padLenRaw) : 0;
    if (!Number.isFinite(padLen) || padLen <= 0) return ext;
    const padChar = (process.env.WEBPHONE_EXTENSION_PAD_CHAR || '0')
      .toString()
      .slice(0, 1);
    if (!padChar) return ext;
    if (ext.length >= padLen) return ext;
    return ext.padStart(padLen, padChar);
  } catch (_) {
    return ext;
  }
}

function _toUsuarioKey(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Solo permitimos un set seguro de caracteres para evitar entradas raras.
  if (!/^[a-zA-Z0-9_]+$/.test(s)) return null;
  return s;
}

// Endpoint to be called by an external telephony integration (VICIdial/Asterisk/AMI)
// when an incoming call is assigned to an agent.
async function incomingCall(req, res) {
  try {
    if (!_isAuthorized(req)) {
      return res.status(401).json({
        success: false,
        message:
          'No autorizado. Configure WEBPHONE_EVENT_SECRET y envie x-webphone-secret.',
      });
    }

    // Support both POST (body) and GET (query) so Vicidial can trigger via URL.
    const body = {
      ...(req.query || {}),
      ...(req.body || {}),
    };
    let userId = _toInt(body.userId ?? body.usuarioId ?? body.neusId);
    const extensionRaw = _toExtension(
      body.extension ?? body.ext ?? body.anexo ?? body.sipExtension,
    );
    const extension = extensionRaw ? _padExtension(extensionRaw) : null;
    let neusUsuario = _toUsuarioKey(
      body.neusUsuario ?? body.NEUS_USUARIO ?? body.neus_usuario,
    );

    // Si no nos mandan userId, intentar mapear por extension.
    // Se configura asi:
    // WEBPHONE_EXTENSION_USER_MAP='{"1001":123,"1002":456}'
    if (!userId && extension) {
      const map =
        _parseJsonEnv('WEBPHONE_EXTENSION_USER_MAP') ||
        _parseJsonEnv('WEBPHONE_EXTENSION_MAP');
      const mapped = map ? map[extension] : null;
      userId = _toInt(mapped);
    }

    // Si no nos mandan userId (ni mapeo por env), resolver via BD:
    // extension "0202" => NEUS_USUARIO "CC_0202" (por defecto)
    if (!userId && extension) {
      try {
        const prefix = (process.env.WEBPHONE_EXTENSION_USER_PREFIX || 'CC_')
          .toString()
          .trim()
          .toUpperCase();
        if (!neusUsuario) {
          // Normalizamos a mayusculas para consistencia (la consulta es case-insensitive).
          neusUsuario = _toUsuarioKey(`${prefix}${extension}`)?.toUpperCase();
        } else {
          neusUsuario = _toUsuarioKey(neusUsuario)?.toUpperCase();
        }

        if (neusUsuario) {
          const pool = await databaseService.getPool(req.user?.empresa);
          const rs = await pool
            .request()
            .input('u', sql.NVarChar, neusUsuario)
            .query(`
              SELECT TOP 1 NEUS_ID AS id
              FROM dbo.NEUS_USUARIOS
              WHERE UPPER(NEUS_USUARIO) = @u
                AND ISNULL(NEUS_ACTIVO, 1) = 1
            `);
          const id = rs?.recordset?.[0]?.id;
          userId = _toInt(id);
        }
      } catch (e) {
        logger.warn(
          '[webphoneController.incomingCall] extension->NEUS_USUARIO lookup failed:',
          e?.message || e,
        );
      }
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        message:
          'Se requiere userId (int) o extension (string numerica). Opciones: 1) Configura WEBPHONE_EXTENSION_USER_MAP, o 2) Configura WEBPHONE_EXTENSION_USER_PREFIX (default CC_) y asegura que exista NEUS_USUARIO = prefijo+extension.',
      });
    }

    const payload = {
      userId,
      extension,
      neusUsuario,
      leadId: body.leadId ?? body.lead_id ?? null,
      phone: body.phone ?? body.telefono ?? null,
      timestamp: new Date().toISOString(),
    };

    try {
      const io = socketService.getIO(req.user?.empresa);
      // Broadcast so clients can decide if it applies to them.
      io.emit('webphone:incomingCall', payload);
    } catch (e) {
      logger.warn('[webphoneController.incomingCall] socket emit failed:',
        e?.message || e);
    }

    return res.json({ success: true, data: payload });
  } catch (err) {
    logger.warn('[webphoneController.incomingCall] error:', err?.message || err);
    return res.status(500).json({
      success: false,
      message: 'Error procesando evento de llamada entrante',
    });
  }
}

module.exports = {
  incomingCall,
};
