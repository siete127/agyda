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
//
// Modo de sesión (CCO_CANALES.CN_MODO_SESION) — igual que baileysManager y
// fcaManager: 'compartido' (default) = una sola cuenta de Instagram para
// todo el canal, estado en CCO_CANALES; 'individual' = cada agente vincula
// SU cuenta personal, estado en CCO_CANAL_AGENTE_SESION, y sus DMs entrantes
// se asignan directo a él sin pasar por el ACD/cola general.
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const ccRouting = require('../ccRoutingService');
const ccIngest = require('../ccIngestService');

// sesiones[sessionKey] = { ig, tenantKey, canalId, usuarioId, estado, usuario }
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
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_IGP_ESTADO = @estado
                ${extra.usuario !== undefined ? ', CAS_IGP_USUARIO = @usuario' : ''}, CAS_FECHA_ACTUALIZACION = GETDATE()
                WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, canalId).input('estado', sql.NVarChar(20), estado)
        .input('usuario', sql.NVarChar(120), extra.usuario ?? null)
        .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_ESTADO = @estado
                ${extra.usuario !== undefined ? ', CN_IGP_USUARIO = @usuario' : ''}
                WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[igPrivate] no se pudo actualizar estado:', e?.message || e);
  }
  if (sesiones[sessionKey]) sesiones[sessionKey].estado = estado;
}

async function persistirEstadoSesion(canalId, tenantKey, usuarioId, estadoSerializado) {
  try {
    const pool = await databaseService.getPool(tenantKey);
    const json = JSON.stringify(estadoSerializado);
    if (usuarioId) {
      await ensureAgenteSesionRow(pool, canalId, usuarioId);
      await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId).input('s', sql.NVarChar(sql.MAX), json)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_IGP_SESION = @s WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, canalId).input('s', sql.NVarChar(sql.MAX), json)
        .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_SESION = @s WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[igPrivate] no se pudo persistir el estado de sesión:', e?.message || e);
  }
}

function emitirEstado(canalId, usuarioId, mensaje) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s) return;
  const room = usuarioId ? `cc:igp:${canalId}:${usuarioId}` : `cc:igp:${canalId}`;
  ccRouting.emitir(s.tenantKey, room, 'cc:igp_estado', {
    canalId: Number(canalId),
    usuarioId: usuarioId ? Number(usuarioId) : null,
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

async function iniciarSesionConCredenciales(usuario, password) {
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

async function iniciarSesionConEstado(estadoSerializado) {
  const { IgApiClient } = require('instagram-private-api');
  const { withRealtime } = require('instagram_mqtt');

  const igBase = new IgApiClient();
  const ig = withRealtime(igBase);
  await ig.state.deserialize(estadoSerializado);
  return { ig, usuario: null };
}

function suscribirEscucha(canalId, tenantKey, ig, usuarioIgId, agenteFijoId) {
  ig.realtime.on('message', async (wrapper) => {
    try {
      const m = wrapper?.message;
      if (!m || !m.text && !parseMediaDeItem(m)) return;
      // op 'add' es un mensaje nuevo; 'replace' suele ser un cambio de estado
      // (visto, reacción) sobre un item existente — no una llegada real.
      if (m.op !== 'add') return;
      if (usuarioIgId && String(m.user_id) === String(usuarioIgId)) return; // eco de lo que el propio canal envió

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
        agenteFijoId: agenteFijoId || null,
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

// credenciales = { usuario, password } (primera vez) o { estadoSerializado }
// para reconectar sin volver a pedir password. usuarioId: presente solo si
// el canal está en modo 'individual' (identifica al AGENTE de AGYDA, no
// confundir con el ID de usuario de Instagram que devuelve la API).
async function iniciarSesion(canalId, tenantKey, credenciales, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  if (sesiones[sessionKey]?.ig) return sesiones[sessionKey];

  let ig, usuario, estadoSerializado;
  try {
    if (credenciales?.usuario && credenciales?.password) {
      ({ ig, usuario, estadoSerializado } = await iniciarSesionConCredenciales(credenciales.usuario, credenciales.password));
    } else if (credenciales?.estadoSerializado) {
      ({ ig, usuario } = await iniciarSesionConEstado(credenciales.estadoSerializado));
      estadoSerializado = credenciales.estadoSerializado;
    } else {
      throw new Error('Se requiere usuario+password (primera vez) o un estado de sesión guardado');
    }

    await ig.realtime.connect({ irisData: { seq_id: 0, snapshot_at_ms: 0 } });
    const usuarioIgId = ig.state.cookieUserId;
    suscribirEscucha(canalId, tenantKey, ig, usuarioIgId, usuarioId);

    sesiones[sessionKey] = { ig, tenantKey, canalId, usuarioId: usuarioId || null, estado: 'conectado', usuario };

    // Persistimos el estado serializado para reconectar sin password la
    // próxima vez (mismo espíritu que las credenciales de sesión de Baileys
    // en disco, o el appstate de FCA en BD).
    await persistirEstadoSesion(canalId, tenantKey, usuarioId, estadoSerializado);

    await setEstado(canalId, tenantKey, 'conectado', usuarioId, { usuario });
    emitirEstado(canalId, usuarioId);
    logger.info(`✅ Instagram (API privada) conectado — sesión ${sessionKey}, usuario ${usuario || usuarioIgId}`);
    return sesiones[sessionKey];
  } catch (e) {
    await setEstado(canalId, tenantKey, 'error', usuarioId);
    emitirEstado(canalId, usuarioId, e.message);
    throw new Error(e.message || 'No se pudo iniciar sesión en Instagram — usuario/password inválidos, checkpoint de seguridad, o la librería quedó desactualizada frente a un cambio reciente de Instagram');
  }
}

// Crea (o reutiliza) el hilo directo 1-a-1 con ese usuario y envía el texto.
async function enviarTexto(canalId, destinatarioExtId, texto, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.ig || s.estado !== 'conectado') throw new Error('El canal de Instagram (API privada) no está conectado');
  const thread = await s.ig.entity.directThread([String(destinatarioExtId)]);
  const r = await thread.broadcastText(texto);
  return { messages: [{ id: String(r?.payload?.item_id || r?.item_id || '') }] };
}

async function enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
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

function getEstado(canalId, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s) return { estado: 'desconectado', usuario: null };
  return { estado: s.estado, usuario: s.usuario || null };
}

async function cerrarSesion(canalId, tenantKey, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (s?.ig) {
    try { await s.ig.realtime.disconnect(); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[sessionKey];
  try {
    const pool = await databaseService.getPool(tenantKey);
    if (usuarioId) {
      await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_IGP_ESTADO = 'desconectado', CAS_IGP_USUARIO = NULL, CAS_IGP_SESION = NULL WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, canalId)
        .query(`UPDATE dbo.CCO_CANALES SET CN_IGP_ESTADO = 'desconectado', CN_IGP_USUARIO = NULL, CN_IGP_SESION = NULL WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[igPrivate] no se pudo limpiar canal al cerrar sesión:', e?.message || e);
  }
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion };
