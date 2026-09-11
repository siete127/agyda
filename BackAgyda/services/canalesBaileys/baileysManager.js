// Gestión de sesiones de WhatsApp vía Baileys (WhatsApp Web multi-device, NO
// oficial — no usa Meta Graph API ni requiere aprobación de WhatsApp Business).
//
// IMPORTANTE — esto no es la API oficial de WhatsApp: automatiza WhatsApp Web
// por fuera de sus Términos de Servicio, con riesgo real de que Meta banee el
// número usado. Es una alternativa deliberada para no depender de una cuenta
// de WhatsApp Business API aprobada; el canal 'whatsapp' (Cloud API oficial,
// ver canalesMeta/) sigue siendo la vía recomendada cuando se cuenta con ella.
//
// Modo de sesión (CCO_CANALES.CN_MODO_SESION):
//  - 'compartido' (default, comportamiento original): una sola sesión para
//    todo el canal — sessionKey = String(canalId), estado en CCO_CANALES.
//  - 'individual': una sesión POR AGENTE dentro del mismo canal — sessionKey
//    = `${canalId}:${usuarioId}`, estado en CCO_CANAL_AGENTE_SESION. Los
//    mensajes entrantes de una sesión individual se asignan directo al
//    agente dueño (ver ingestarEntrante), sin pasar por la cola/ACD general.
//
// Un socket Baileys por sessionKey, guardado en este Map mientras el proceso
// vive — no persiste entre reinicios del backend, solo las credenciales de
// sesión en disco (SESSIONS_DIR/{sessionKey}/), que sí permiten reconectar
// sin volver a escanear el QR.
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const sql = require('mssql');
const logger = global.logger || require('../../utils/logger');
const databaseService = require('../databaseService');
const ccRouting = require('../ccRoutingService');
const ccIngest = require('../ccIngestService');

const SESSIONS_DIR = path.join(__dirname, '..', '..', 'baileys_sessions');
fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// sesiones[sessionKey] = { sock, tenantKey, canalId, usuarioId, estado, qrDataUrl, numero }
const sesiones = {};

function sessionKeyDe(canalId, usuarioId) {
  return usuarioId ? `${canalId}:${usuarioId}` : String(canalId);
}

function sessionDir(sessionKey) {
  const dir = path.join(SESSIONS_DIR, String(sessionKey).replace(':', '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function ensureAgenteSesionRow(pool, canalId, usuarioId) {
  await pool.request().input('c', sql.Int, canalId).input('u', sql.Int, usuarioId)
    .query(`IF NOT EXISTS (SELECT 1 FROM dbo.CCO_CANAL_AGENTE_SESION WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u)
            INSERT INTO dbo.CCO_CANAL_AGENTE_SESION (CAS_CANAL_ID, CAS_USUARIO_ID) VALUES (@c, @u)`);
}

async function setEstado(sessionKey, estado) {
  const s = sesiones[sessionKey];
  try {
    const pool = await databaseService.getPool(s?.tenantKey);
    if (s?.usuarioId) {
      await ensureAgenteSesionRow(pool, s.canalId, s.usuarioId);
      await pool.request().input('c', sql.Int, s.canalId).input('u', sql.Int, s.usuarioId).input('estado', sql.NVarChar(20), estado)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_BAILEYS_ESTADO = @estado, CAS_FECHA_ACTUALIZACION = GETDATE() WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, s?.canalId).input('estado', sql.NVarChar(20), estado)
        .query(`UPDATE dbo.CCO_CANALES SET CN_BAILEYS_ESTADO = @estado WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[baileys] no se pudo actualizar estado:', e?.message || e);
  }
  if (s) s.estado = estado;
}

async function setNumero(sessionKey, numero) {
  const s = sesiones[sessionKey];
  if (!s) return;
  s.numero = numero;
  try {
    const pool = await databaseService.getPool(s.tenantKey);
    if (s.usuarioId) {
      await pool.request().input('c', sql.Int, s.canalId).input('u', sql.Int, s.usuarioId).input('n', sql.NVarChar(40), numero)
        .query(`UPDATE dbo.CCO_CANAL_AGENTE_SESION SET CAS_BAILEYS_NUMERO = @n WHERE CAS_CANAL_ID = @c AND CAS_USUARIO_ID = @u`);
    } else {
      await pool.request().input('id', sql.Int, s.canalId).input('n', sql.NVarChar(40), numero)
        .query(`UPDATE dbo.CCO_CANALES SET CN_BAILEYS_NUMERO = @n WHERE CN_ID = @id`);
    }
  } catch (e) {
    logger.warn('[baileys] no se pudo actualizar número:', e?.message || e);
  }
}

function emitirEstado(sessionKey) {
  const s = sesiones[sessionKey];
  if (!s) return;
  // Room por agente cuando aplica, para que solo ese agente (y quien esté
  // viendo su tarjeta en Configuración) reciba el QR/estado — en modo
  // compartido sigue siendo la room genérica del canal, como siempre.
  const room = s.usuarioId ? `cc:baileys:${s.canalId}:${s.usuarioId}` : `cc:baileys:${s.canalId}`;
  ccRouting.emitir(s.tenantKey, room, 'cc:baileys_estado', {
    canalId: Number(s.canalId),
    usuarioId: s.usuarioId ? Number(s.usuarioId) : null,
    estado: s.estado,
    qrDataUrl: s.estado === 'esperando_qr' ? s.qrDataUrl : null,
    numero: s.numero || null,
  });
}

// Extrae el texto/media de un mensaje entrante de Baileys en el shape que ya
// espera ccIngestService.ingestarMensajeCliente (mismo contrato que el
// webhook de Meta, así el resto del pipeline — cola, ruteo, bandeja — no
// necesita saber de qué canal vino el mensaje).
function parseMensajeEntrante(msg) {
  const m = msg.message || {};

  if (m.conversation) return { texto: m.conversation };
  if (m.extendedTextMessage?.text) return { texto: m.extendedTextMessage.text };
  if (m.imageMessage) return { texto: m.imageMessage.caption || null, media: { tipo: 'image', mime: m.imageMessage.mimetype, msgRef: msg } };
  if (m.videoMessage) return { texto: m.videoMessage.caption || null, media: { tipo: 'video', mime: m.videoMessage.mimetype, msgRef: msg } };
  if (m.audioMessage) return { texto: null, media: { tipo: 'audio', mime: m.audioMessage.mimetype, msgRef: msg } };
  if (m.documentMessage) return { texto: m.documentMessage.caption || null, media: { tipo: 'document', mime: m.documentMessage.mimetype, msgRef: msg }, nombreOriginal: m.documentMessage.fileName };
  return { texto: null };
}

// Descarga real, invocada por ccIngestService solo si el evento trae `media`
// (mismo contrato que metaClient.descargarMedia: recibe el "canal" — aquí no
// se usa, el msgRef ya trae todo lo necesario — y devuelve { buffer, mime }).
async function descargarMediaFn(_canal, _metaMediaId, _url, media) {
  const { downloadMediaMessage } = require('@whiskeysockets/baileys');
  const buffer = await downloadMediaMessage(media.msgRef, 'buffer', {});
  return { buffer, mime: media.mime };
}

// Mensaje fromMe: el propio número vinculado lo envió. Dos orígenes posibles,
// indistinguibles para WhatsApp (ambos "yo mismo enviando"):
//  - Eco de un mensaje que YA se guardó al mandarlo desde el panel de AGYDA
//    (ccInteraccionesController.enviarMensaje) — se descarta por
//    MG_META_MSG_ID, que ese flujo guarda con el mismo prefijo "baileys_".
//  - Un mensaje mandado desde el celular directo, por fuera del panel — se
//    registra igual (MG_EMISOR='agente', sin MG_AGENTE_ID porque no hay
//    sesión de ningún usuario del sistema detrás) para no perder la
//    trazabilidad de la conversación. Solo aplica si ya hay una interacción
//    abierta para ese cliente — un fromMe no abre una interacción nueva, no
//    tiene sentido "atender" una conversación que el cliente no inició.
async function ingestarMensajeAgenteDirecto(pool, tenantKey, canal, msg) {
  const metaMsgId = msg.key.id ? `baileys_${msg.key.id}` : null;
  if (metaMsgId) {
    const dup = await pool.request().input('m', sql.NVarChar(120), metaMsgId)
      .query(`SELECT TOP 1 MG_ID FROM dbo.CCO_MENSAJES WHERE MG_META_MSG_ID = @m`);
    if (dup.recordset[0]) return;
  }

  const jid = msg.key.remoteJid || '';
  if (!jid) return;
  const abierta = await pool.request()
    .input('canal', sql.Int, canal.CN_ID).input('ext', sql.NVarChar(80), jid)
    .query(`SELECT TOP 1 CI_ID as id FROM dbo.CCO_INTERACCIONES
            WHERE CI_CANAL_ID = @canal AND CI_CLIENTE_EXT_ID = @ext
              AND CI_ESTADO IN ('en_cola','activa','pendiente_tipificacion')
            ORDER BY CI_ID DESC`);
  const it = abierta.recordset[0];
  if (!it) return; // sin interacción abierta, no hay dónde registrarlo

  const { texto, media } = parseMensajeEntrante(msg);
  let mediaId = null;
  if (media) {
    try {
      const { buffer, mime } = await descargarMediaFn(canal, null, null, media);
      mediaId = await ccIngest.guardarMedia(pool, { interaccionId: it.id, buffer, mime: media.mime || mime, nombreOriginal: media.tipo });
    } catch (e) {
      logger.warn('[baileys] media de mensaje fromMe falló:', e?.message || e);
    }
  }

  await pool.request()
    .input('int', sql.Int, it.id)
    .input('c', sql.NVarChar(sql.MAX), texto || null)
    .input('media', sql.Int, mediaId)
    .input('meta', sql.NVarChar(120), metaMsgId)
    .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_CONTENIDO, MG_MEDIA_ID, MG_META_MSG_ID, MG_ESTADO_ENTREGA)
            VALUES (@int, 'agente', @c, @media, @meta, 'enviado')`);

  ccRouting.emitir(tenantKey, `cc:interaccion:${it.id}`, 'cc:mensaje', { interaccionId: it.id });
}

// usuarioId: presente solo si el canal está en modo 'individual' — se guarda
// en la sesión para que todo lo demás (estado, número, ingesta de mensajes)
// sepa a quién pertenece sin tener que volver a consultarlo.
async function iniciarSesion(canalId, tenantKey, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const existente = sesiones[sessionKey];
  if (existente?.sock) {
    // Ya conectado: nada que hacer, reutilizar tal cual.
    if (existente.estado === 'conectado') return existente;
    // Sigue en 'esperando_qr' (o similar) — el QR en memoria puede llevar
    // minutos y haber caducado del lado de WhatsApp ("vínculo no válido" al
    // escanear). Quitar los listeners ANTES de cerrar (si no, su propio
    // 'connection.update' con close dispararía el auto-reintento de abajo,
    // compitiendo con la sesión nueva que este mismo flujo está por crear) y
    // caer al código de abajo, que arma un socket nuevo con un QR fresco.
    try { existente.sock.ev.removeAllListeners(); } catch (_) { /* no-op */ }
    try { existente.sock.end(undefined); } catch (_) { /* ya pudo estar cerrado */ }
    delete sesiones[sessionKey];
  }

  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, proto } =
    require('@whiskeysockets/baileys');

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(sessionKey));
  const { version } = await fetchLatestBaileysVersion();

  sesiones[sessionKey] = { sock: null, tenantKey, canalId, usuarioId: usuarioId || null, estado: 'esperando_qr', qrDataUrl: null, numero: null };
  await setEstado(sessionKey, 'esperando_qr');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
    // Explícito a propósito (el default de la librería ya cubre esto, pero
    // sin ambigüedad): acepta la sincronización ON_DEMAND que dispara
    // importarHistorial() vía fetchMessageHistory, solo rechaza FULL (que
    // es la que causaba el conflict/replaced al reconectar el socket).
    shouldSyncHistoryMessage: ({ syncType }) => syncType !== proto.HistorySync.HistorySyncType.FULL,
  });
  sesiones[sessionKey].sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sesiones[sessionKey].qrDataUrl = await QRCode.toDataURL(qr);
      } catch (e) {
        logger.warn('[baileys] no se pudo generar QR:', e?.message || e);
      }
      await setEstado(sessionKey, 'esperando_qr');
      emitirEstado(sessionKey);
    }

    if (connection === 'open') {
      const numero = sock.user?.id?.split(':')[0] || null;
      sesiones[sessionKey].qrDataUrl = null;
      await setNumero(sessionKey, numero);
      await setEstado(sessionKey, 'conectado');
      emitirEstado(sessionKey);
      logger.info(`✅ Baileys conectado — sesión ${sessionKey}, número ${numero}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;
      await setEstado(sessionKey, 'desconectado');
      emitirEstado(sessionKey);
      logger.warn(`⚠️ Baileys desconectado — sesión ${sessionKey} (statusCode=${statusCode}, reconectar=${debeReconectar})`);
      sesiones[sessionKey].sock = null;
      if (debeReconectar) {
        setTimeout(() => iniciarSesion(canalId, tenantKey, usuarioId).catch((e) => logger.error('[baileys] reconexión falló:', e?.message || e)), 3000);
      } else {
        // Sesión cerrada desde el teléfono: hay que volver a escanear QR desde cero.
        fs.rmSync(sessionDir(sessionKey), { recursive: true, force: true });
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message) continue;
      try {
        const pool = await databaseService.getPool(tenantKey);
        const canalR = await pool.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
        const canal = canalR.recordset[0];
        if (!canal || !canal.CN_HABILITADO) continue;

        // fromMe: mensaje enviado por el propio número vinculado — puede ser
        // un eco del que el panel de AGYDA acaba de mandar (ya se guardó al
        // enviarlo, ver ccInteraccionesController.enviarMensaje — se
        // descarta aquí por MG_META_MSG_ID) o uno mandado desde el celular
        // directo, por fuera del panel — ese si se registra, para no perder
        // la trazabilidad de la conversación (bug real encontrado
        // 2026-09-10: antes se descartaba todo fromMe sin distinguir).
        if (msg.key.fromMe) {
          await ingestarMensajeAgenteDirecto(pool, tenantKey, canal, msg);
          continue;
        }

        const { texto, media, nombreOriginal } = parseMensajeEntrante(msg);
        // El remitente puede llegar como número real (@s.whatsapp.net) o como
        // LID (@lid) — un identificador interno que WhatsApp usa cuando el
        // contacto tiene oculto su número de teléfono. Ambos son puramente
        // numéricos y de longitud similar, así que NO se pueden distinguir
        // por su forma: hay que preservar el JID completo (con dominio) en
        // clienteExtId para poder responder al remitente correcto — armar
        // siempre "numero@s.whatsapp.net" al enviar rompía la respuesta para
        // cualquier cliente con privacidad de número activada (el mensaje
        // "se enviaba" sin error pero nunca llegaba, al apuntar a un chat
        // que no existe). clienteTelefono solo se llena para el caso normal,
        // ya que un LID no es un teléfono real y no debe usarse para matches
        // (ej. CCO_CAMPANIA_POSTULANTES) ni mostrarse como contacto.
        const jid = msg.key.remoteJid || '';
        const esNumeroReal = jid.endsWith('@s.whatsapp.net');
        const numeroPuro = jid.split('@')[0] || jid;
        const clienteExtId = jid || numeroPuro;

        // Cuando el remitente tiene oculto su número, WhatsApp manda un LID
        // (identificador interno opaco) en vez del teléfono real — Baileys
        // mantiene un mapeo LID↔teléfono local (sock.signalRepository) que
        // SOLO tiene algo si ya vio esa relación antes (contacto guardado,
        // notificación de perfil vinculado, etc.); no hace ninguna consulta
        // nueva a WhatsApp para resolverlo, así que sigue quedando null la
        // mayoría de las veces — es una mejora oportunista, no una garantía.
        let telefonoResuelto = null;
        if (esNumeroReal && /^\d{8,15}$/.test(numeroPuro)) {
          telefonoResuelto = numeroPuro;
        } else if (jid.endsWith('@lid')) {
          try {
            const pnJid = await sock.signalRepository?.lidMapping?.getPNForLID(jid);
            const pnPuro = pnJid ? pnJid.split('@')[0]?.split(':')[0] : null;
            if (pnPuro && /^\d{8,15}$/.test(pnPuro)) telefonoResuelto = pnPuro;
          } catch (e) {
            logger.debug('[baileys] getPNForLID no resolvió:', e?.message || e);
          }
        }

        await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
          clienteExtId,
          clienteNombre: msg.pushName || null,
          clienteTelefono: telefonoResuelto,
          metaMsgId: msg.key.id ? `baileys_${msg.key.id}` : null,
          texto,
          media: media ? { ...media, tipo: media.tipo, url: null } : null,
          // Sesión individual: el chat de este cliente en este canal siempre
          // es del agente dueño de la sesión, sin pasar por el ACD/cola
          // general — ccIngestService.asignarAgenteFijo (ver ese servicio)
          // se encarga de saltarse el ruteo normal cuando llega este dato.
          agenteFijoId: usuarioId || null,
        }, {
          descargarMediaFn: media ? (c, id, url) => descargarMediaFn(c, id, url, media) : undefined,
        });
      } catch (e) {
        logger.error('[baileys] error ingiriendo mensaje:', e?.message || e);
      }
    }
  });

  return sesiones[sessionKey];
}

// Extiende hacia atrás el historial de las conversaciones que YA existen en
// AGYDA para este canal (con al menos 1 mensaje) — apagado por default,
// disparado a mano desde Configuración (botón "Importar historial").
//
// Limitación real de Baileys (investigado 2026-09-10, no es un bug propio):
// NO existe forma de traer "todo el historial completo" de golpe sin
// reconectar el socket con syncFullHistory:true, y reconectar así dispara
// un stream error 'conflict/replaced' del lado de WhatsApp (dos sockets
// reclamando el mismo device_id) — confirmado con logs reales y reportado
// en issues abiertos de la librería (WhiskeySockets/Baileys #963, #2094,
// #2110). El único mecanismo soportado y estable es
// sock.fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp), que
// opera SOBRE EL SOCKET YA CONECTADO (nunca cierra/reabre nada) y pide
// mensajes anteriores a uno que YA se tiene — por eso solo puede alargar
// conversaciones existentes, no descubrir chats de los que nunca llegó un
// mensaje en vivo.
// maxChats/timeoutMs conservadores a propósito: el cliente HTTP del
// frontend corta a los 30s (ver FrontAgyda/src/lib/axios.ts) — bug real
// encontrado 2026-09-10, con muchas interacciones acumuladas el backend
// seguía trabajando en segundo plano mucho después de que el navegador ya
// había mostrado "No se pudo importar el historial" por timeout. Con
// maxChats=3 y timeoutMs=8s el peor caso (~24s) siempre cabe dentro de esos
// 30s — para canales con más de 3 conversaciones hay que darle click al
// botón varias veces (cada corrida toma las siguientes que aún no se
// intentaron exitosamente, vía CCO_MENSAJES ya insertados como ancla nueva).
async function importarHistorial(canalId, tenantKey, usuarioId, { timeoutMs = 8_000, maxChats = 3 } = {}) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.sock || s.estado !== 'conectado') {
    throw new Error('El canal debe estar conectado antes de importar el historial');
  }

  const pool = await databaseService.getPool(tenantKey);
  const canalR = await pool.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
  const canal = canalR.recordset[0];
  if (!canal) throw new Error('Canal no encontrado');

  // Un mensaje ancla por interacción: el más antiguo que ya tenemos, con su
  // MG_META_MSG_ID real (sin el prefijo "baileys_" que se le agrega al
  // guardar — ver ingestarMensajeCliente/enviarMensaje) para reconstruir la
  // WAMessageKey que fetchMessageHistory exige.
  const interacciones = await pool.request().input('canal', sql.Int, canal.CN_ID).query(`
    SELECT TOP (${Number(maxChats) || 3}) i.CI_ID id, i.CI_CLIENTE_EXT_ID jid,
           m.MG_META_MSG_ID metaMsgId, m.MG_EMISOR emisor, m.MG_FECHA fecha
    FROM dbo.CCO_INTERACCIONES i
    CROSS APPLY (
      SELECT TOP 1 MG_META_MSG_ID, MG_EMISOR, MG_FECHA FROM dbo.CCO_MENSAJES
      WHERE MG_INTERACCION_ID = i.CI_ID AND MG_META_MSG_ID LIKE 'baileys_%'
      ORDER BY MG_FECHA ASC
    ) m
    WHERE i.CI_CANAL_ID = @canal AND i.CI_CLIENTE_EXT_ID IS NOT NULL
    ORDER BY i.CI_ID DESC
  `);

  let chatsConsultados = 0;
  let mensajesInsertados = 0;
  const errores = [];

  for (const it of interacciones.recordset) {
    if (!it.metaMsgId || !it.jid) continue;
    const oldestId = it.metaMsgId.replace(/^baileys_/, '');
    const oldestMsgKey = { remoteJid: it.jid, fromMe: it.emisor === 'agente', id: oldestId };
    const oldestMsgTimestamp = Math.floor(new Date(it.fecha).getTime() / 1000);

    try {
      const nuevos = await esperarHistorialDeChat(s.sock, it.jid, () =>
        s.sock.fetchMessageHistory(50, oldestMsgKey, oldestMsgTimestamp), timeoutMs);
      chatsConsultados++;

      for (const msg of nuevos) {
        const metaMsgId = msg.key?.id ? `baileys_${msg.key.id}` : null;
        if (!metaMsgId) continue;
        const dup = await pool.request().input('m', sql.NVarChar(120), metaMsgId)
          .query('SELECT TOP 1 MG_ID FROM dbo.CCO_MENSAJES WHERE MG_META_MSG_ID = @m');
        if (dup.recordset[0]) continue;

        const { texto } = parseMensajeEntrante(msg);
        if (!texto) continue; // historial de media sin descarga masiva por ahora — solo texto
        const emisor = msg.key?.fromMe ? 'agente' : 'cliente';
        const fecha = new Date(Number(msg.messageTimestamp || 0) * 1000);
        await pool.request()
          .input('int', sql.Int, it.id).input('em', sql.NVarChar(15), emisor)
          .input('c', sql.NVarChar(sql.MAX), texto).input('meta', sql.NVarChar(120), metaMsgId)
          .input('f', sql.DateTime, fecha)
          .query(`INSERT INTO dbo.CCO_MENSAJES (MG_INTERACCION_ID, MG_EMISOR, MG_CONTENIDO, MG_META_MSG_ID, MG_FECHA)
                  VALUES (@int, @em, @c, @meta, @f)`);
        mensajesInsertados++;
      }
    } catch (e) {
      logger.warn(`[baileys] fetchMessageHistory falló para ${it.jid}:`, e?.message || e);
      errores.push(it.jid);
    }
  }

  const totalConversaciones = await pool.request().input('canal', sql.Int, canal.CN_ID).query(`
    SELECT COUNT(*) n FROM dbo.CCO_INTERACCIONES i
    WHERE i.CI_CANAL_ID = @canal AND i.CI_CLIENTE_EXT_ID IS NOT NULL
      AND EXISTS (SELECT 1 FROM dbo.CCO_MENSAJES WHERE MG_INTERACCION_ID = i.CI_ID AND MG_META_MSG_ID LIKE 'baileys_%')
  `);
  const totalPosibles = totalConversaciones.recordset[0]?.n || 0;

  return {
    chatsConsultados, mensajesInsertados, chatsConError: errores.length,
    // Ayuda al frontend a avisar si conviene volver a darle click: solo se
    // procesan `maxChats` conversaciones por corrida (ver comentario arriba
    // de la firma de la función).
    quedanMasPorRevisar: totalPosibles > chatsConsultados,
  };
}

// fetchMessageHistory dispara la solicitud pero la respuesta llega async por
// 'messaging-history.set' (con syncType on-demand) — hay que escuchar ese
// evento y filtrar solo lo que corresponde a este jid, con timeout por si el
// teléfono no contesta (issue conocido de Baileys: a veces no hay respuesta).
function esperarHistorialDeChat(sock, jid, disparar, timeoutMs) {
  return new Promise((resolve) => {
    let resuelto = false;
    const onHistory = ({ messages, syncType }) => {
      if (resuelto) return;
      const propios = (messages || []).filter((m) => m.key?.remoteJid === jid);
      if (propios.length) {
        resuelto = true;
        clearTimeout(timer);
        sock.ev.off('messaging-history.set', onHistory);
        resolve(propios);
      }
    };
    const timer = setTimeout(() => {
      if (resuelto) return;
      resuelto = true;
      sock.ev.off('messaging-history.set', onHistory);
      resolve([]); // sin respuesta — se cuenta como chat consultado sin mensajes nuevos
    }, timeoutMs);
    sock.ev.on('messaging-history.set', onHistory);
    disparar().catch(() => { /* el error real ya lo maneja el caller */ });
  });
}

async function enviarTexto(canalId, destinatarioExtId, texto, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.sock || s.estado !== 'conectado') throw new Error('El canal de WhatsApp (Baileys) no está conectado');
  const jid = destinatarioExtId.includes('@') ? destinatarioExtId : `${destinatarioExtId}@s.whatsapp.net`;
  const r = await s.sock.sendMessage(jid, { text: texto });
  return { messages: [{ id: r.key.id }] };
}

async function enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s?.sock || s.estado !== 'conectado') throw new Error('El canal de WhatsApp (Baileys) no está conectado');
  const jid = destinatarioExtId.includes('@') ? destinatarioExtId : `${destinatarioExtId}@s.whatsapp.net`;
  const kind = tipoMedia === 'audio' ? 'audio' : tipoMedia === 'video' ? 'video' : tipoMedia === 'document' ? 'document' : 'image';
  const r = await s.sock.sendMessage(jid, { [kind]: { url: mediaUrl } });
  return { messages: [{ id: r.key.id }] };
}

function getEstado(canalId, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (!s) return { estado: 'desconectado', qrDataUrl: null, numero: null };
  return { estado: s.estado, qrDataUrl: s.estado === 'esperando_qr' ? s.qrDataUrl : null, numero: s.numero || null };
}

async function cerrarSesion(canalId, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  const s = sesiones[sessionKey];
  if (s?.sock) {
    try { await s.sock.logout(); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[sessionKey];
  fs.rmSync(sessionDir(sessionKey), { recursive: true, force: true });
  await setEstado(sessionKey, 'desconectado');
}

// Todas las sesiones individuales activas de un canal — usado para
// reconectar automáticamente al arrancar el backend (ver services/index de
// arranque) y para listar el estado de cada agente en la UI sin tener que
// pedir uno por uno.
function getSesionesDeCanal(canalId) {
  return Object.entries(sesiones)
    .filter(([, s]) => String(s.canalId) === String(canalId) && s.usuarioId)
    .map(([, s]) => ({ usuarioId: s.usuarioId, estado: s.estado, numero: s.numero || null }));
}

// Llamado una vez al arrancar el backend (ver server.js, después de
// databaseService.initialize()). Bug real encontrado 2026-09-10: las
// sesiones de Baileys solo viven en memoria (el Map `sesiones` de arriba) —
// las credenciales sí persisten en disco (useMultiFileAuthState), pero tras
// cualquier reinicio del proceso (deploy, crash) CN_BAILEYS_ESTADO /
// CAS_BAILEYS_ESTADO se quedan en 'conectado' en la BD (última foto antes de
// morir el proceso) mientras que en memoria no hay ningún socket real
// escuchando — los mensajes entrantes de WhatsApp dejan de generar
// interacciones sin ningún error visible, hasta que alguien vuelve a abrir
// Configuración y reconecta manualmente. iniciarSesion reutiliza las
// credenciales de sesionDir(), así que esto reconecta solo (sin pedir QR de
// nuevo) salvo que la sesión haya sido cerrada desde el teléfono.
// Una sesión tiene credenciales reales (login ya completado con WhatsApp) si
// su carpeta trae creds.json — las carpetas que solo llegaron a
// 'esperando_qr' sin que nadie escaneara nunca no tienen ese archivo.
function tieneCredencialesGuardadas(sessionKey) {
  try {
    return fs.existsSync(path.join(sessionDir(sessionKey), 'creds.json'));
  } catch (_) {
    return false;
  }
}

async function reconectarSesionesGuardadas() {
  try {
    const databaseServiceLocal = require('../databaseService');
    const { listTenants } = require('../../config/tenants');
    const tenantKeys = listTenants().map((t) => t.key);

    for (const tenantKey of tenantKeys) {
      let pool;
      try {
        pool = await databaseServiceLocal.getPool(tenantKey);
      } catch (_) {
        continue;
      }

      // Canales compartidos: una sesión por canal, estado en CCO_CANALES.
      // No se filtra por CN_BAILEYS_ESTADO — ese valor puede haber quedado
      // desactualizado (p.ej. 'desconectado' de un reinicio previo) aunque
      // las credenciales en disco sigan siendo válidas; lo que de verdad
      // decide si vale la pena reconectar es si existe creds.json.
      const compartidos = await pool.request().query(`
        SELECT CN_ID id FROM dbo.CCO_CANALES
        WHERE CN_TIPO = 'whatsapp_baileys' AND CN_HABILITADO = 1
          AND ISNULL(CN_MODO_SESION, 'compartido') = 'compartido'
      `);
      let nCompartidos = 0;
      for (const row of compartidos.recordset) {
        if (!tieneCredencialesGuardadas(sessionKeyDe(row.id, null))) continue;
        nCompartidos++;
        iniciarSesion(row.id, tenantKey, null).catch((e) =>
          logger.error(`[baileys] reconexión al arrancar falló (canal ${row.id}):`, e?.message || e));
      }

      // Canales individuales: una sesión por agente, estado en CCO_CANAL_AGENTE_SESION.
      const individuales = await pool.request().query(`
        SELECT s.CAS_CANAL_ID canalId, s.CAS_USUARIO_ID usuarioId
        FROM dbo.CCO_CANAL_AGENTE_SESION s
        JOIN dbo.CCO_CANALES c ON c.CN_ID = s.CAS_CANAL_ID
        WHERE c.CN_TIPO = 'whatsapp_baileys' AND c.CN_HABILITADO = 1
          AND c.CN_MODO_SESION = 'individual'
      `);
      let nIndividuales = 0;
      for (const row of individuales.recordset) {
        if (!tieneCredencialesGuardadas(sessionKeyDe(row.canalId, row.usuarioId))) continue;
        nIndividuales++;
        iniciarSesion(row.canalId, tenantKey, row.usuarioId).catch((e) =>
          logger.error(`[baileys] reconexión al arrancar falló (canal ${row.canalId}, usuario ${row.usuarioId}):`, e?.message || e));
      }

      if (nCompartidos || nIndividuales) {
        logger.info(`✅ Baileys: reconectando ${nCompartidos} sesión(es) compartida(s) y ${nIndividuales} individual(es) tras arranque (tenant ${tenantKey || 'default'})`);
      }
    }
  } catch (e) {
    logger.error('[baileys] reconectarSesionesGuardadas falló:', e?.message || e);
  }
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion, getSesionesDeCanal, reconectarSesionesGuardadas, importarHistorial };
