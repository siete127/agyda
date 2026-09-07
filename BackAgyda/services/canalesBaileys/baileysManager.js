// Gestión de sesiones de WhatsApp vía Baileys (WhatsApp Web multi-device, NO
// oficial — no usa Meta Graph API ni requiere aprobación de WhatsApp Business).
//
// IMPORTANTE — esto no es la API oficial de WhatsApp: automatiza WhatsApp Web
// por fuera de sus Términos de Servicio, con riesgo real de que Meta banee el
// número usado. Es una alternativa deliberada para no depender de una cuenta
// de WhatsApp Business API aprobada; el canal 'whatsapp' (Cloud API oficial,
// ver canalesMeta/) sigue siendo la vía recomendada cuando se cuenta con ella.
//
// Un socket Baileys por canal (CN_TIPO='whatsapp_baileys'), guardado en este
// Map mientras el proceso vive — no persiste entre reinicios del backend, solo
// las credenciales de sesión en disco (SESSIONS_DIR/{canalId}/), que sí
// permiten reconectar sin volver a escanear el QR.
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

// sesiones[canalId] = { sock, tenantKey, estado, qrDataUrl, reintentos }
const sesiones = {};

function sessionDir(canalId) {
  const dir = path.join(SESSIONS_DIR, String(canalId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function setEstado(canalId, estado) {
  try {
    const pool = await databaseService.getPool(sesiones[canalId]?.tenantKey);
    await pool.request()
      .input('id', sql.Int, canalId)
      .input('estado', sql.NVarChar(20), estado)
      .query(`UPDATE dbo.CCO_CANALES SET CN_BAILEYS_ESTADO = @estado WHERE CN_ID = @id`);
  } catch (e) {
    logger.warn('[baileys] no se pudo actualizar CN_BAILEYS_ESTADO:', e?.message || e);
  }
  if (sesiones[canalId]) sesiones[canalId].estado = estado;
}

function emitirEstado(canalId) {
  const s = sesiones[canalId];
  if (!s) return;
  ccRouting.emitir(s.tenantKey, `cc:baileys:${canalId}`, 'cc:baileys_estado', {
    canalId: Number(canalId),
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
  const jid = msg.key.remoteJid || '';
  const clienteExtId = jid.split('@')[0] || jid;
  const clienteNombre = msg.pushName || null;

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

async function iniciarSesion(canalId, tenantKey) {
  if (sesiones[canalId]?.sock) return sesiones[canalId];

  const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason } =
    require('@whiskeysockets/baileys');

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir(canalId));
  const { version } = await fetchLatestBaileysVersion();

  sesiones[canalId] = { sock: null, tenantKey, estado: 'esperando_qr', qrDataUrl: null, numero: null };
  await setEstado(canalId, 'esperando_qr');

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    syncFullHistory: false,
  });
  sesiones[canalId].sock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      try {
        sesiones[canalId].qrDataUrl = await QRCode.toDataURL(qr);
      } catch (e) {
        logger.warn('[baileys] no se pudo generar QR:', e?.message || e);
      }
      await setEstado(canalId, 'esperando_qr');
      emitirEstado(canalId);
    }

    if (connection === 'open') {
      sesiones[canalId].numero = sock.user?.id?.split(':')[0] || null;
      sesiones[canalId].qrDataUrl = null;
      await setEstado(canalId, 'conectado');
      emitirEstado(canalId);
      logger.info(`✅ Baileys conectado — canal ${canalId}, número ${sesiones[canalId].numero}`);
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const debeReconectar = statusCode !== DisconnectReason.loggedOut;
      await setEstado(canalId, 'desconectado');
      emitirEstado(canalId);
      logger.warn(`⚠️ Baileys desconectado — canal ${canalId} (statusCode=${statusCode}, reconectar=${debeReconectar})`);
      sesiones[canalId].sock = null;
      if (debeReconectar) {
        setTimeout(() => iniciarSesion(canalId, tenantKey).catch((e) => logger.error('[baileys] reconexión falló:', e?.message || e)), 3000);
      } else {
        // Sesión cerrada desde el teléfono: hay que volver a escanear QR desde cero.
        fs.rmSync(sessionDir(canalId), { recursive: true, force: true });
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
        const jid = msg.key.remoteJid || '';
        const clienteExtId = jid.split('@')[0] || jid;

        await ccIngest.ingestarMensajeCliente(pool, tenantKey, canal, {
          clienteExtId,
          clienteNombre: msg.pushName || null,
          clienteTelefono: /^\d{8,15}$/.test(clienteExtId) ? clienteExtId : null,
          metaMsgId: msg.key.id ? `baileys_${msg.key.id}` : null,
          texto,
          media: media ? { ...media, tipo: media.tipo, url: null } : null,
        }, {
          descargarMediaFn: media ? (c, id, url) => descargarMediaFn(c, id, url, media) : undefined,
        });
      } catch (e) {
        logger.error('[baileys] error ingiriendo mensaje:', e?.message || e);
      }
    }
  });

  return sesiones[canalId];
}

async function enviarTexto(canalId, destinatarioExtId, texto) {
  const s = sesiones[canalId];
  if (!s?.sock || s.estado !== 'conectado') throw new Error('El canal de WhatsApp (Baileys) no está conectado');
  const jid = destinatarioExtId.includes('@') ? destinatarioExtId : `${destinatarioExtId}@s.whatsapp.net`;
  const r = await s.sock.sendMessage(jid, { text: texto });
  return { messages: [{ id: r.key.id }] };
}

async function enviarMedia(canalId, destinatarioExtId, mediaUrl, tipoMedia) {
  const s = sesiones[canalId];
  if (!s?.sock || s.estado !== 'conectado') throw new Error('El canal de WhatsApp (Baileys) no está conectado');
  const jid = destinatarioExtId.includes('@') ? destinatarioExtId : `${destinatarioExtId}@s.whatsapp.net`;
  const kind = tipoMedia === 'audio' ? 'audio' : tipoMedia === 'video' ? 'video' : tipoMedia === 'document' ? 'document' : 'image';
  const r = await s.sock.sendMessage(jid, { [kind]: { url: mediaUrl } });
  return { messages: [{ id: r.key.id }] };
}

function getEstado(canalId) {
  const s = sesiones[canalId];
  if (!s) return { estado: 'desconectado', qrDataUrl: null, numero: null };
  return { estado: s.estado, qrDataUrl: s.estado === 'esperando_qr' ? s.qrDataUrl : null, numero: s.numero || null };
}

async function cerrarSesion(canalId) {
  const s = sesiones[canalId];
  if (s?.sock) {
    try { await s.sock.logout(); } catch (_) { /* ya pudo estar cerrada */ }
  }
  delete sesiones[canalId];
  fs.rmSync(sessionDir(canalId), { recursive: true, force: true });
  await setEstado(canalId, 'desconectado');
}

module.exports = { iniciarSesion, enviarTexto, enviarMedia, getEstado, cerrarSesion };
