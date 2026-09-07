// Gestión de sesiones de Messenger vía ws3-fca (Facebook Chat API no oficial —
// scraping/MQTT sobre la cuenta PERSONAL de Facebook del agente, NO la API
// oficial de Meta ni una Página de negocio).
//
// IMPORTANTE — como con Baileys para WhatsApp (ver canalesBaileys/), esto va
// por fuera de los Términos de Servicio de Facebook y arriesga la cuenta
// personal usada: baneo o checkpoint de seguridad son posibles en cualquier
// momento, y las cookies de sesión (appstate) expiran sin aviso — hay que
// volver a extraerlas manualmente cuando eso pase. El canal 'messenger'
// oficial (Graph API, ver canalesMeta/) sigue siendo la vía recomendada
// cuando se cuenta con una Página y sus tokens.
//
// A diferencia de Baileys, aquí NO hay QR: la vinculación es pegar un
// appstate.json (cookies de sesión, extraídas fuera de este sistema con una
// extensión de navegador tipo "C3C FbState") en el panel de Configuración.
//
// Modo de sesión (CCO_CANALES.CN_MODO_SESION) — igual que baileysManager:
// 'compartido' (default) = un solo appstate para todo el canal, estado en
// CCO_CANALES; 'individual' = un appstate por agente (cada quien pega el
// suyo), estado en CCO_CANAL_AGENTE_SESION, y sus mensajes entrantes se
// asignan directo a él sin pasar por el ACD/cola general.
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const ccRouting = require('../ccRoutingService');
const ccIngest = require('../ccIngestService');

// sesiones[sessionKey] = { api, tenantKey, canalId, usuarioId, estado, usuario }
const sesiones = {};

function sessionKeyDe(canalId, usuarioId) {
  return usuarioId ? `${canalId}:${usuarioId}` : String(canalId);
}

async function ensureAgenteSesionRow(pool, canalId, usuarioId) {
  await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_CANAL_AGENTE_SESION WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u)
            INSERT INTO dbo.CCO_CANAL_AGENTE_SESION (CAS_CANAL_ID, CAS_USUARIO_ID) VALUES (@c, @u)`);
}

async function setEstado(canalId, tenantKey, estado, usuarioId, extra = {}) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  try {
    const pool = await databaseService.getPool(tenantKey);
    if (usuarioId) {
      await ensureAgenteSesionRow(pool, canalId, usuarioId);
      await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId)
        .input('estado', sql.NVarChar(20), estado).input('usuario', sql.NVarChar(120), extra.usuario ?? null)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_FCA_ESTADO = @estado
                ${extra.usuario !== undefined ? ', CAS_FCA_USUARIO = @usuario' : ''}, CAS_FECHA_ACTUALIZACION = GETDATE()
                WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, canalId).input('estado', sql.NVarChar(20), estado)
        .input('usuario', sql.NVarChar(120), extra.usuario ?? null)
        .query(`UPDATE dbo.CCO_CANALES SET CN_FCA_ESTADO = @estado
                ${extra.usuario !== undefined ? ', CN_FCA_USUARIO = @usuario' : ''}
                WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[fca] no se pudo actualizar estado:', e?.message || e);
  }
  if (sesiones[sessionKey]) sesiones[sessionKey].estado = estado;
}

function emitirEstado(canalId, usuarioId, mensaje) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s) return;
  const room = usuarioId ? `cc:fca:${canalId}:${usuarioId}` : `cc:fca:${canalId}`;
  ccRouting.emitir(s.tenantKey, room, 'cc:fca_estado', {
    canalId: Number(canalId),
    usuarioId: usuarioId ? Number(usuarioId) : null,
    estado: s.estado,
    usuario: s.usuario || null,
    mensaje: mensaje || null,
  });
}

// Traduce un evento de listenMqtt al mismo contrato que ya espera
// ccIngestService.ingestarMensajeCliente (igual que hacen el webhook de Meta
// y baileysManager) — así el resto del pipeline (cola, ruteo, bandeja) no
// distingue de qué canal vino el mensaje.
function parseAttachment(att) {
  if (!att) return null;
  const tipo = att.type === 'photo' ? 'image'
    : att.type === 'animated_image' ? 'image'
    : att.type === 'video' ? 'video'
    : att.type === 'audio' ? 'audio'
    : att.type === 'sticker' ? 'image'
    : 'document';
  return { tipo, url: att.url || null, mime: null, nombreOriginal: att.filename || null };
}

// usuarioId: presente solo si el canal está en modo 'individual'.
async function iniciarSesion(canalId, tenantKey, appStateRaw, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  if (sesiones[sessionKey]?.api) return sesiones[sessionKey];

  const { login } = require('ws3-fca');

  let appState;
  try {
    appState = typeof appStateRaw === 'string' ? JSON.parse(appStateRaw) : appStateRaw;
    if (!Array.isArray(appState) || appState.length === 0) throw new Error('vacío');
  } catch (_) {
    throw new Error('El appstate.json no es un JSON válido (debe ser un arreglo de cookies)');
  }

  sesiones[sessionKey] = { api: null, tenantKey, canalId, usuarioId: usuarioId || null, estado: 'desconectado', usuario: null };

  return new Promise((resolve, reject) => {
    login({ appState }, { online: true, updatePresence: false, selfListen: false }, async (err, api) => {
      if (err) {
        await setEstado(canalId, tenantKey, 'error', usuarioId);
        emitirEstado(canalId, usuarioId, err.error || err.message || 'No se pudo iniciar sesión');
        return reject(new Error(err.error || err.message || 'Login de Messenger (FCA) falló — el appstate probablemente expiró'));
      }

      const usuario = api.getCurrentUserID();
      sesiones[sessionKey] = { api, tenantKey, canalId, usuarioId: usuarioId || null, estado: 'conectado', usuario };
      await setEstado(canalId, tenantKey, 'conectado', usuarioId, { usuario });
      emitirEstado(canalId, usuarioId);
      logger.info(`✅ Messenger (FCA) conectado — sesión ${sessionKey}, usuario ${usuario}`);

      api.listenMqtt(async (errListen, event) => {
        if (errListen) {
          logger.warn('[fca] error en listenMqtt:', errListen?.message || errListen);
          return;
        }
        if (event.type !== 'message' || !event.senderID || event.senderID === usuario) return;
        try {
          const pool = await databaseService.getPool(tenantKey);
          const canalR = await pool.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
          const canal = canalR.recordset[0];
          if (!canal || !canal.CN_HABILITADO) return;

          const primerAdjunto = (event.attachments || [])[0];
          const media = parseAttachment(primerAdjunto);

          await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
            clienteExtId: event.senderID,
            clienteNombre: null,
            clienteTelefono: null,
            metaMsgId: event.messageID ? `fca_${event.messageID}` : null,
            texto: event.body || null,
            media,
            agenteFijoId: usuarioId || null,
          }, {
            descargarMediaFn: media?.url ? async () => {
              const res = await fetch(media.url);
              const buffer = Buffer.from(await res.arrayBuffer());
              return { buffer, mime: res.headers.get('content-type') || 'application/octet-stream' };
            } : undefined,
          });
        } catch (e) {
          logger.error('[fca] error ingiriendo mensaje:', e?.message || e);
        }
      });

      resolve(sesiones[sessionKey]);
    });
  });
}

async function enviarTexto(canalId, destinatarioExtId, texto, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.api || s.estado !== 'conectado') throw new Error('El canal de Messenger (FCA) no está conectado');
  return new Promise((resolve, reject) => {
    s.api.sendMessage(texto, destinatarioExtId, (err, info) => {
      if (err) return reject(new Error(err.error || err.message || 'Error enviando mensaje'));
      resolve({ messages: [{ id: String(info?.messageID || '') }] });
    });
  });
}

// mediaUrl debe ser una URL alcanzable por este servidor — se descarga a un
// stream local porque sendMessage de FCA exige un readable stream, no una URL
// directa (a diferencia de metaClient/Baileys, que sí aceptan URL).
async function enviarMedia(canalId, destinatarioExtId, mediaUrl, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.api || s.estado !== 'conectado') throw new Error('El canal de Messenger (FCA) no está conectado');
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el archivo a enviar (${res.status})`);
  const { Readable } = require('stream');
  const stream = Readable.fromWeb(res.body);
  return new Promise((resolve, reject) => {
    s.api.sendMessage({ body: '', attachment: stream }, destinatarioExtId, (err, info) => {
      if (err) return reject(new Error(err.error || err.message || 'Error enviando adjunto'));
      resolve({ messages: [{ id: String(info?.messageID || '') }] });
    });
  });
}

function getEstado(canalId, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s) return { estado: 'desconectado', usuario: null };
  return { estado: s.estado, usuario: s.usuario || null };
}

async function cerrarSesion(canalId, tenantKey, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (s?.api) {
    try { s.api.logout(() => {}); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[sessionKey];
  try {
    const pool = await databaseService.getPool(tenantKey);
    if (usuarioId) {
      await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_FCA_ESTADO = 'desconectado', CAS_FCA_USUARIO = NULL, CAS_FCA_APPSTATE = NULL WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, canalId)
        .query(`UPDATE dbo.CCO_CANALES SET CN_FCA_ESTADO = 'desconectado', CN_FCA_USUARIO = NULL, CN_FCA_APPSTATE = NULL WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[fca] no se pudo limpiar canal al cerrar sesión:', e?.message || e);
  }
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion };
