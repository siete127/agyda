// Gestión de sesiones de Instagram DM vía instagram-private-api + instagram_mqtt
// (API privada no oficial — automatiza la app móvil de Instagram, NO la API
// oficial de Meta ni requiere una cuenta Business/Creator conectada a una
// Página). El propio README de instagram_mqtt dice explícitamente: "This
// library isn't actively maintained anymore. Only bug fixes are accepted." —
// de las tres vías no oficiales de este proyecto (Baileys, FCA, esta), es la
// más frágil: Instagram endurece su detección de bots con frecuencia y esta
// librería lleva ~1.5 años sin poder seguirle el paso a esos cambios.
//
// IMPORTANTE — usa la cuenta PERSONAL de Instagram del agente (no hay
// concepto de "Página" como en Facebook): riesgo real de checkpoint/baneo de
// esa cuenta. El canal 'instagram' oficial (Graph API, ver canalesMeta/)
// sigue siendo la vía recomendada cuando se cuenta con una cuenta
// Business/Creator vinculada.
//
// Vinculación: usuario + password de Instagram (no hay QR ni appstate como en
// Messenger) — el estado de sesión (cookies) se serializa con ig.state y se
// guarda para no tener que loguear con password en cada reconexión.
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const ccRouting = require('../ccRoutingService');
const ccIngest = require('../ccIngestService');

// sesiones[canalId] = { ig, tenantKey, estado, usuario }
const sesiones = {};

async function setEstado(canalId, tenantKey, estado, extra = {}) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request()
      .input('id', sql.Int, canalId)
      .input('estado', sql.NVarChar(20), estado)
      .input('usuario', sql.NVarChar(120), extra.usuario ?? null)
      .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_ESTADO = @estado
              ${extra.usuario !== undefined ? ', CN_IGP_USUARIO = @usuario' : ''}
              WHERE CN_ID = @id`);
  } catch (e) {
    logger.warn('[igPrivate] no se pudo actualizar CN_IGP_ESTADO:', e?.message || e);
  }
  if (sesiones[canalId]) sesiones[canalId].estado = estado;
}

function emitirEstado(canalId, mensaje) {
  const s = sesiones[canalId];
  if (!s) return;
  ccRouting.emitir(s.tenantKey, `cc:igp:${canalId}`, 'cc:igp_estado', {
    canalId: Number(canalId),
    estado: s.estado,
    usuario: s.usuario || null,
    mensaje: mensaje || null,
  });
}

// item_type de MessageSyncMessage -> shape canónico { tipo, url } que ya
// espera ccIngestService (mismo contrato que Meta/Baileys/FCA).
function parseMediaDeItem(item) {
  if (item.item_type === 'media' && item.media) {
    const video = (item.media.video_versions || [])[0]?.url;
    const foto = item.media.image_versions2?.candidates?.[0]?.url;
    return video ? { tipo: 'video', url: video } : foto ? { tipo: 'image', url: foto } : null;
  }
  if (item.item_type === 'voice_media' && item.voice_media?.media?.audio?.audio_src) {
    return { tipo: 'audio', url: item.voice_media.media.audio.audio_src };
  }
  if (item.item_type === 'animated_media' && item.animated_media?.images?.fixed_height?.url) {
    return { tipo: 'image', url: item.animated_media.images.fixed_height.url };
  }
  return null;
}

async function iniciarSesionConCredenciales(canalId, tenantKey, { usuario, password }) {
  const { IgApiClient } = require('instagram-private-api');
  const { withRealtime } = require('instagram_mqtt');

  const igBase = new IgApiClient();
  igBase.state.generateDevice(usuario);
  const ig = withRealtime(igBase);

  await ig.simulate.preLoginFlow();
  const loggedInUser = await ig.account.login(usuario, password);
  process.nextTick(async () => { try { await ig.simulate.postLoginFlow(); } catch (_) { /* no crítico */ } });

  return { ig, usuario: loggedInUser.username || usuario, estadoSerializado: await ig.state.serialize() };
}

async function iniciarSesionConEstado(canalId, tenantKey, estadoSerializado) {
  const { IgApiClient } = require('instagram-private-api');
  const { withRealtime } = require('instagram_mqtt');

  const igBase = new IgApiClient();
  const ig = withRealtime(igBase);
  await ig.state.deserialize(estadoSerializado);
  return { ig, usuario: null };
}

function suscribirEscucha(canalId, tenantKey, ig, usuarioId) {
  ig.realtime.on('message', async (wrapper) => {
    try {
      const m = wrapper?.message;
      if (!m || !m.text && !parseMediaDeItem(m)) return;
      // op 'add' es un mensaje nuevo; 'replace' suele ser un cambio de estado
      // (visto, reacción) sobre un item existente — no una llegada real.
      if (m.op !== 'add') return;
      if (usuarioId && String(m.user_id) === String(usuarioId)) return; // eco de lo que el propio canal envió

      const pool = await databaseService.getPool(tenantKey);
      const canalR = await pool.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
      const canal = canalR.recordset[0];
      if (!canal || !canal.CN_HABILITADO) return;

      const media = parseMediaDeItem(m);
      await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
        clienteExtId: String(m.user_id),
        clienteNombre: null,
        clienteTelefono: null,
        metaMsgId: m.item_id ? `igp_${m.item_id}` : null,
        texto: m.text || null,
        media,
      }, {
        descargarMediaFn: media?.url ? async () => {
          const res = await fetch(media.url);
          const buffer = Buffer.from(await res.arrayBuffer());
          return { buffer, mime: res.headers.get('content-type') || 'application/octet-stream' };
        } : undefined,
      });
    } catch (e) {
      logger.error('[igPrivate] error ingiriendo mensaje:', e?.message || e);
    }
  });
}

// credenciales = { usuario, password } (primera vez) o null si ya hay un
// CN_IGP_ESTADO guardado para reconectar sin volver a pedir password.
async function iniciarSesion(canalId, tenantKey, credenciales) {
  if (sesiones[canalId]?.ig) return sesiones[canalId];

  let ig, usuario, estadoSerializado;
  try {
    if (credenciales?.usuario && credenciales?.password) {
      ({ ig, usuario, estadoSerializado } = await iniciarSesionConCredenciales(canalId, tenantKey, credenciales));
    } else if (credenciales?.estadoSerializado) {
      ({ ig, usuario } = await iniciarSesionConEstado(canalId, tenantKey, credenciales.estadoSerializado));
      estadoSerializado = credenciales.estadoSerializado;
    } else {
      throw new Error('Se requiere usuario+password (primera vez) o un estado de sesión guardado');
    }

    await ig.realtime.connect({ irisData: { seq_id: 0, snapshot_at_ms: 0 } });
    const usuarioId = ig.state.cookieUserId;
    suscribirEscucha(canalId, tenantKey, ig, usuarioId);

    sesiones[canalId] = { ig, tenantKey, estado: 'conectado', usuario };

    // Persistimos el estado serializado para reconectar sin password la
    // próxima vez (mismo espíritu que las credenciales de sesión de Baileys
    // en disco, o el appstate de FCA en BD).
    try {
      const pool = await databaseService.getPool(tenantKey);
      await pool.request().input('id', sql.Int, canalId).input('estado', sql.NVarChar(sql.MAX), JSON.stringify(estadoSerializado))
        .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_SESION = @estado WHERE CN_ID = @id`);
    } catch (e) {
      logger.warn('[igPrivate] no se pudo persistir el estado de sesión:', e?.message || e);
    }

    await setEstado(canalId, tenantKey, 'conectado', { usuario });
    emitirEstado(canalId);
    logger.info(`✅ Instagram (API privada) conectado — canal ${canalId}, usuario ${usuario || usuarioId}`);
    return sesiones[canalId];
  } catch (e) {
    await setEstado(canalId, tenantKey, 'error');
    emitirEstado(canalId, e.message);
    throw new Error(e.message || 'No se pudo iniciar sesión en Instagram — usuario/password inválidos, checkpoint de seguridad, o la librería quedó desactualizada frente a un cambio reciente de Instagram');
  }
}

// Crea (o reutiliza) el hilo directo 1-a-1 con ese usuario y envía el texto.
async function enviarTexto(canalId, destinatarioExtId, texto) {
  const s = sesiones[canalId];
  if (!s?.ig || s.estado !== 'conectado') throw new Error('El canal de Instagram (API privada) no está conectado');
  const thread = await s.ig.entity.directThread([String(destinatarioExtId)]);
  const r = await thread.broadcastText(texto);
  return { messages: [{ id: String(r?.payload?.item_id || r?.item_id || '') }] };
}

async function enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia) {
  const s = sesiones[canalId];
  if (!s?.ig || s.estado !== 'conectado') throw new Error('El canal de Instagram (API privada) no está conectado');
  const res = await fetch(mediaUrl);
  if (!res.ok) throw new Error(`No se pudo descargar el archivo a enviar (${res.status})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  const thread = await s.ig.entity.directThread([String(destinatarioExtId)]);
  // La API privada solo soporta fotos como adjunto directo en DM de forma
  // confiable; video/documento/audio no tienen un broadcast* equivalente
  // simple y estable en esta versión de la librería.
  if (tipoMedia !== 'image') {
    throw new Error('Este canal de Instagram (API privada) solo admite el envío de imágenes como adjunto');
  }
  const r = await thread.broadcastPhoto({ file: buffer });
  return { messages: [{ id: String(r?.payload?.item_id || r?.item_id || '') }] };
}

function getEstado(canalId) {
  const s = sesiones[canalId];
  if (!s) return { estado: 'desconectado', usuario: null };
  return { estado: s.estado, usuario: s.usuario || null };
}

async function cerrarSesion(canalId, tenantKey) {
  const s = sesiones[canalId];
  if (s?.ig) {
    try { await s.ig.realtime.disconnect(); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[canalId];
  try {
    const pool = await databaseService.getPool(tenantKey);
    await pool.request().input('id', sql.Int, canalId)
      .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_ESTADO = 'desconectado', CN_IGP_USUARIO = NULL, CN_IGP_SESION = NULL WHERE CN_ID = @id`);
  } catch (e) {
    logger.warn('[igPrivate] no se pudo limpiar canal al cerrar sesión:', e?.message || e);
  }
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion };
