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

// Normaliza a los últimos 10 dígitos (mismo criterio que CRMPublicPage /
// ventasController.getCRMCliente: quita prefijo de país 52/521 y cualquier
// caracter no numérico) para poder comparar teléfonos capturados con distinto
// formato (con/sin lada, con/sin +52).
function _normalizarTelefono10(v) {
  if (v === null || v === undefined) return null;
  const digits = String(v).replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
}

// Busca al postulante de "Postulación Totis" (CCO_CAMPANIA_POSTULANTES) cuyo
// teléfono coincide con el de la llamada entrante, para el screen-pop del
// agente. Compara por los últimos 10 dígitos vía RIGHT(..., 10) en SQL, ya que
// el teléfono se guarda tal cual lo capturó el formulario (puede o no traer
// lada/país). Devuelve null si no hay match o si no se pudo consultar.
async function _buscarPostulanteTotisPorTelefono(pool, telefono10) {
  if (!telefono10) return null;
  try {
    const rs = await pool
      .request()
      .input('t', sql.NVarChar(10), telefono10)
      .query(`
        SELECT TOP 1
          cp.CP_ID id, cp.CP_NOMBRE nombre, cp.CP_TELEFONO telefono,
          cp.CP_CORREO correo, cp.CP_FECHA_REGISTRO fechaRegistro,
          c.CM2_NOMBRE campania
        FROM dbo.CCO_CAMPANIA_POSTULANTES cp
        LEFT JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = cp.CP_CAMPANIA_ID
        WHERE RIGHT(REPLACE(REPLACE(REPLACE(cp.CP_TELEFONO, ' ', ''), '-', ''), '+', ''), 10) = @t
        ORDER BY cp.CP_FECHA_REGISTRO DESC
      `);
    return rs?.recordset?.[0] || null;
  } catch (e) {
    logger.warn(
      '[webphoneController._buscarPostulanteTotisPorTelefono] error:',
      e?.message || e,
    );
    return null;
  }
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
    // 'phone_login' y 'agent' son las variables de VICIdial (%phone_login%,
    // %agent%) que su "Web Form Integration URL" puede sustituir con la
    // extensión SIP del agente en la llamada — se agregan como alias porque
    // el resto del sistema ya vive con nombres propios (extension/ext).
    const extensionRaw = _toExtension(
      body.extension ?? body.ext ?? body.anexo ?? body.sipExtension ?? body.phone_login ?? body.agent,
    );
    const extension = extensionRaw ? _padExtension(extensionRaw) : null;
    // 'agent_user' y 'user' cubren %agent_user% de VICIdial (usuario de login
    // del agente, no su extensión SIP) — mismo caso de uso que neusUsuario.
    let neusUsuario = _toUsuarioKey(
      body.neusUsuario ?? body.NEUS_USUARIO ?? body.neus_usuario ?? body.agent_user ?? body.user,
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

    // 'dnis' es el nombre real de VICIdial (%dnis% en su Web Form Integration
    // URL) para el número marcado/entrante — la integración actual solo manda
    // esta variable, sin dato del agente (ver comentario arriba).
    const phone = body.phone ?? body.telefono ?? body.dnis ?? null;
    const telefono10 = _normalizarTelefono10(phone);

    // Screen-pop: si el número que llama coincide con un postulante de
    // "Postulación Totis" (formulario público de campaña), adjuntamos sus
    // datos (nombre, teléfono, campaña) para que el frontend muestre la
    // ventana emergente sin que el agente tenga que buscar nada.
    let postulanteTotis = null;
    if (telefono10) {
      try {
        const pool = await databaseService.getPool(req.user?.empresa);
        postulanteTotis = await _buscarPostulanteTotisPorTelefono(pool, telefono10);
      } catch (e) {
        logger.warn('[webphoneController.incomingCall] lookup postulante Totis falló:',
          e?.message || e);
      }
    }

    const payload = {
      userId,
      extension,
      neusUsuario,
      leadId: body.leadId ?? body.lead_id ?? null,
      phone,
      postulanteTotis,
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

function _escapeHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Catálogo fijo de disposiciones de llamada, pedido tal cual para esta
// pantalla — código corto (lo que se guarda) + etiqueta larga (lo que ve
// el agente en el select).
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

function _paginaLlamada({ error, phone, postulante, secret, extension }) {
  const style = `
    body{margin:0;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;padding:14px;box-sizing:border-box}
    .card{border-radius:12px;padding:14px 16px;margin-bottom:10px}
    .ok{background:#052e21;border:1px solid #10b981}
    .warn{background:#3f2d0a;border:1px solid #f59e0b}
    .err{background:#3f0a0a;border:1px solid #ef4444}
    h1{font-size:15px;margin:0 0 8px;font-weight:700}
    p{margin:3px 0;font-size:13px;line-height:1.4}
    .lbl{color:#94a3b8;font-size:11px;text-transform:uppercase;letter-spacing:.04em}
    .form{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:14px 16px}
    select,textarea{width:100%;box-sizing:border-box;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:8px;padding:8px 10px;font-size:13px;font-family:inherit}
    textarea{resize:vertical;min-height:60px;margin-top:8px}
    .contador{color:#64748b;font-size:11px;text-align:right;margin-top:2px}
    button{margin-top:10px;width:100%;background:#6d28d9;color:#fff;border:none;border-radius:8px;padding:9px;font-size:13px;font-weight:700;cursor:pointer}
    button:disabled{opacity:.5;cursor:default}
    .msg{margin-top:8px;font-size:12px;text-align:center}
    .msg.ok2{color:#34d399}
    .msg.err2{color:#f87171}
  `;
  let body;
  if (error) {
    body = `<div class="card err"><h1>⚠️ ${_escapeHtml(error)}</h1></div>`;
  } else {
    if (postulante) {
      body = `
      <div class="card ok">
        <h1>📋 ${_escapeHtml(postulante.nombre)}</h1>
        <p><span class="lbl">Teléfono:</span> ${_escapeHtml(postulante.telefono)}</p>
        ${postulante.correo ? `<p><span class="lbl">Correo:</span> ${_escapeHtml(postulante.correo)}</p>` : ''}
        ${postulante.campania ? `<p><span class="lbl">Postulación:</span> ${_escapeHtml(postulante.campania)}</p>` : ''}
        ${postulante.fechaRegistro ? `<p><span class="lbl">Registrado:</span> ${_escapeHtml(new Date(postulante.fechaRegistro).toLocaleDateString('es-MX'))}</p>` : ''}
      </div>`;
    } else {
      body = `<div class="card warn"><h1>Sin coincidencia</h1><p>El número ${_escapeHtml(phone || 'desconocido')} no está registrado como postulante.</p></div>`;
    }
    body += `
      <div class="form">
        <label class="lbl">Tipificación de la llamada</label>
        <select id="tip">
          <option value="">Selecciona…</option>
          ${TIPIFICACIONES_LLAMADA.map((t) => `<option value="${t.codigo}">${_escapeHtml(t.etiqueta)}</option>`).join('')}
        </select>
        <textarea id="obs" maxlength="500" placeholder="Observaciones (opcional)"></textarea>
        <div class="contador"><span id="obsLen">0</span>/500</div>
        <button id="btnGuardar" type="button">Guardar tipificación</button>
        <div id="msg" class="msg"></div>
      </div>
      <script>
        var obs = document.getElementById('obs');
        var obsLen = document.getElementById('obsLen');
        obs.addEventListener('input', function () { obsLen.textContent = obs.value.length; });
        document.getElementById('btnGuardar').addEventListener('click', function () {
          var btn = this;
          var msg = document.getElementById('msg');
          var tip = document.getElementById('tip').value;
          if (!tip) { msg.textContent = 'Elige una tipificación.'; msg.className = 'msg err2'; return; }
          btn.disabled = true;
          msg.textContent = 'Guardando…'; msg.className = 'msg';
          fetch('/api/webphone/pantalla-llamada/tipificar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              secret: ${JSON.stringify(secret || '')},
              phone: ${JSON.stringify(phone || '')},
              extension: ${JSON.stringify(extension || '')},
              tipificacion: tip,
              observaciones: obs.value,
            }),
          })
            .then(function (r) { return r.json(); })
            .then(function (data) {
              btn.disabled = false;
              if (data.success) { msg.textContent = 'Tipificación guardada.'; msg.className = 'msg ok2'; }
              else { msg.textContent = data.message || 'No se pudo guardar.'; msg.className = 'msg err2'; }
            })
            .catch(function () {
              btn.disabled = false;
              msg.textContent = 'Error de conexión al guardar.'; msg.className = 'msg err2';
            });
        });
      </script>`;
  }
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>Llamada entrante</title><style>${style}</style></head><body>${body}</body></html>`;
}

// Pantalla pública (sin sesión de AGYDA) pensada para el "Web Form Address"
// de VICIdial: la campaña lo abre como iframe/ventana en el navegador del
// AGENTE cuando le cae la llamada (VICIdial nunca hace la petición desde su
// propio servidor) — por eso no puede depender del socket/popup de AGYDA
// (requeriría que el agente tenga esa pestaña abierta). Esta página consulta
// el mismo match por teléfono que incomingCall y devuelve el resultado ya
// pintado en HTML, autosuficiente dentro del iframe.
async function pantallaLlamada(req, res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  try {
    if (!_isAuthorized(req)) {
      return res.status(401).send(_paginaLlamada({ error: 'Configura WEBPHONE_EVENT_SECRET y agrega ?secret= a la URL del Web Form.' }));
    }
    const body = { ...(req.query || {}), ...(req.body || {}) };
    const phone = body.phone ?? body.telefono ?? body.dnis ?? null;
    const secret = body.secret ?? '';
    const extension = _toExtension(body.extension ?? body.ext ?? body.phone_login ?? body.agent) || '';
    const telefono10 = _normalizarTelefono10(phone);
    if (!telefono10) {
      return res.send(_paginaLlamada({ error: 'VICIdial no mandó el número (dnis) en esta llamada.' }));
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const postulante = await _buscarPostulanteTotisPorTelefono(pool, telefono10);
    return res.send(_paginaLlamada({ phone, postulante, secret, extension }));
  } catch (err) {
    logger.warn('[webphoneController.pantallaLlamada] error:', err?.message || err);
    return res.status(500).send(_paginaLlamada({ error: 'Error consultando la información del postulante.' }));
  }
}

// Guarda la disposición que el agente eligió en pantallaLlamada. Se llama
// por fetch() desde el propio HTML (no navegación), así que responde JSON
// aunque el resto del flujo de esta pantalla sea HTML — mismo secreto que
// protege incoming-call/pantalla-llamada, mandado en el body en vez de un
// header porque el fetch corre dentro del iframe sin control sobre eso.
async function guardarTipificacion(req, res) {
  try {
    if (!_isAuthorized(req)) {
      return res.status(401).json({ success: false, message: 'No autorizado.' });
    }
    const { phone, tipificacion, observaciones, extension } = req.body || {};
    const telefono10 = _normalizarTelefono10(phone);
    if (!telefono10) {
      return res.status(400).json({ success: false, message: 'Falta el teléfono.' });
    }
    const codigos = TIPIFICACIONES_LLAMADA.map((t) => t.codigo);
    if (!codigos.includes(tipificacion)) {
      return res.status(400).json({ success: false, message: 'Tipificación inválida.' });
    }
    const obs = String(observaciones ?? '').slice(0, 500);

    const pool = await databaseService.getPool(req.user?.empresa);
    const postulante = await _buscarPostulanteTotisPorTelefono(pool, telefono10);

    await pool.request()
      .input('tel', sql.NVarChar(20), telefono10)
      .input('tip', sql.NVarChar(20), tipificacion)
      .input('obs', sql.NVarChar(500), obs || null)
      .input('pid', sql.Int, postulante?.id ?? null)
      .input('ext', sql.NVarChar(20), _toExtension(extension) || null)
      .query(`INSERT INTO dbo.WEBPHONE_LLAMADAS_TIPIFICADAS
                (WLT_TELEFONO, WLT_TIPIFICACION, WLT_OBSERVACIONES, WLT_POSTULANTE_ID, WLT_EXTENSION)
              VALUES (@tel, @tip, @obs, @pid, @ext)`);

    return res.json({ success: true });
  } catch (err) {
    logger.warn('[webphoneController.guardarTipificacion] error:', err?.message || err);
    return res.status(500).json({ success: false, message: 'Error al guardar la tipificación.' });
  }
}

module.exports = {
  incomingCall,
  guardarTipificacion,
  pantallaLlamada,
};
