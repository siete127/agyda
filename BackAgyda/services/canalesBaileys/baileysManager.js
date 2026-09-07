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

// usuarioId: presente solo si el canal está en modo 'individual' — se guarda
// en la sesión para que todo lo demás (estado, número, ingesta de mensajes)
// sepa a quién pertenece sin tener que volver a consultarlo.
async function iniciarSesion(canalId, tenantKey, usuarioId) {
  const sessionKey = sessionKeyDe(canalId, usuarioId);
  if (sesiones[sessionKey]?.sock) return sesiones[sessionKey];

  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
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
      // fromMe: mensajes que el propio número envió (desde el celular directo,
      // no desde el panel de AGYDA) — no se ingestan como "cliente".
      if (!msg.message || msg.key.fromMe) continue;
      try {
        const pool = await databaseService.getPool(tenantKey);
        const canalR = await pool.request().input('id', sql.Int, canalId).query('SELECT * FROM dbo.CCO_CANALES WHERE CN_ID = @id');
        const canal = canalR.recordset[0];
        if (!canal || !canal.CN_HABILITADO) continue;

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

        await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
          clienteExtId,
          clienteNombre: msg.pushName || null,
          clienteTelefono: esNumeroReal && /^\d{8,15}$/.test(numeroPuro) ? numeroPuro : null,
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

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion, getSesionesDeCanal };
