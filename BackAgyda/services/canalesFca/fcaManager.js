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
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const ccRouting = require('../ccRoutingService');
const ccIngest = require('../ccIngestService');

// sesiones[canalId] = { api, tenantKey, estado, usuario }
const sesiones = {};

async function setEstado(canalId, tenantKey, estado, extra = {}) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request()
      .input('id', sql.Int, canalId)
      .input('estado', sql.NVarChar(20), estado)
      .input('usuario', sql.NVarChar(120), extra.usuario ?? null)
      .query(`UPDATE dbo.CCO_CANALES SET CN_FCA_ESTADO = @estado
              ${extra.usuario !== undefined ? ', CN_FCA_USUARIO = @usuario' : ''}
              WHERE CN_ID = @id`);
  } catch (e) {
    logger.warn('[fca] no se pudo actualizar CN_FCA_ESTADO:', e?.message || e);
  }
  if (sesiones[canalId]) sesiones[canalId].estado = estado;
}

function emitirEstado(canalId, mensaje) {
  const s = sesiones[canalId];
  if (!s) return;
  ccRouting.emitir(s.tenantKey, `cc:fca:${canalId}`, 'cc:fca_estado', {
    canalId: Number(canalId),
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

async function iniciarSesion(canalId, tenantKey, appStateRaw) {
  if (sesiones[canalId]?.api) return sesiones[canalId];

  const { login } = require('ws3-fca');

  let appState;
  try {
    appState = typeof appStateRaw === 'string' ? JSON.parse(appStateRaw) : appStateRaw;
    if (!Array.isArray(appState) || appState.length === 0) throw new Error('vacío');
  } catch (_) {
    throw new Error('El appstate.json no es un JSON válido (debe ser un arreglo de cookies)');
  }

  sesiones[canalId] = { api: null, tenantKey, estado: 'desconectado', usuario: null };

  return new Promise((resolve, reject) => {
    login({ appState }, { online: true, updatePresence: false, selfListen: false }, async (err, api) => {
      if (err) {
        await setEstado(canalId, tenantKey, 'error');
        emitirEstado(canalId, err.error || err.message || 'No se pudo iniciar sesión');
        return reject(new Error(err.error || err.message || 'Login de Messenger (FCA) falló — el appstate probablemente expiró'));
      }

      const usuario = api.getCurrentUserID();
      sesiones[canalId] = { api, tenantKey, estado: 'conectado', usuario };
      await setEstado(canalId, tenantKey, 'conectado', { usuario });
      emitirEstado(canalId);
      logger.info(`✅ Messenger (FCA) conectado — canal ${canalId}, usuario ${usuario}`);

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

      resolve(sesiones[canalId]);
    });
  });
}

async function enviarTexto(canalId, destinatarioExtId, texto) {
  const s = sesiones[canalId];
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
async function enviarMedia(canalId, destinatarioExtId, mediaUrl) {
  const s = sesiones[canalId];
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

function getEstado(canalId) {
  const s = sesiones[canalId];
  if (!s) return { estado: 'desconectado', usuario: null };
  return { estado: s.estado, usuario: s.usuario || null };
}

async function cerrarSesion(canalId, tenantKey) {
  const s = sesiones[canalId];
  if (s?.api) {
    try { s.api.logout(() => {}); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[canalId];
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request().input('id', sql.Int, canalId)
      .query(`UPDATE dbo.CCO_CANALES SET CN_FCA_ESTADO = 'desconectado', CN_FCA_USUARIO = NULL, CN_FCA_APPSTATE = NULL WHERE CN_ID = @id`);
  } catch (e) {
    logger.warn('[fca] no se pudo limpiar canal al cerrar sesión:', e?.message || e);
  }
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion };
