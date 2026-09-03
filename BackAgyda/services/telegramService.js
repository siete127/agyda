// Notificaciones por Telegram — bot @ArdabytecAgydaBot (Bot API oficial).
// Envío: POST directo a api.telegram.org, sin librerías externas.
// Vinculación: cada usuario genera un código de un solo uso desde Mi Perfil
// y se lo manda al bot por chat; un long-poll (getUpdates) detecta ese
// mensaje, valida el código contra NEUS_USUARIOS y guarda el chat_id — no
// requiere webhook público ni SSL propio, solo que el proceso de Node esté
// corriendo.
const sql = require('mssql');
const databaseService = require('./databaseService');
const { listTenants } = require('../config/tenants');

const logger = global.logger || require('../utils/logger');

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const API_BASE = BOT_TOKEN ? `https://api.telegram.org/bot${BOT_TOKEN}` : '';

let pollingOffset = 0;
let pollingTimer = null;

function isConfigured() {
  return Boolean(BOT_TOKEN);
}

async function sendMessage(chatId, text) {
  if (!isConfigured() || !chatId) return { success: false, message: 'Telegram no configurado o sin chatId' };
  try {
    const res = await fetch(`${API_BASE}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await res.json();
    if (!data.ok) return { success: false, message: data.description || 'Error de Telegram' };
    return { success: true, messageId: data.result?.message_id };
  } catch (e) {
    return { success: false, message: e.message };
  }
}

// Envía el mismo texto a varios chat_id, sin cortar el envío si alguno falla
// (mismo patrón "degrada, no rompe" que emailService).
async function sendToMany(chatIds, text) {
  const results = await Promise.all(chatIds.map((id) => sendMessage(id, text)));
  const fallidos = results.filter((r) => !r.success).length;
  if (fallidos > 0) logger.warn(`⚠️ [telegramService] ${fallidos}/${chatIds.length} envíos de Telegram fallaron`);
  return results;
}

// Genera un código corto (6 dígitos) de un solo uso, válido 15 minutos.
async function generarCodigoVinculo(usuarioId, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  const codigo = String(Math.floor(100000 + Math.random() * 900000));
  await pool.request()
    .input('uid', sql.Int, usuarioId)
    .input('codigo', sql.NVarChar, codigo)
    .query(`
      UPDATE NEUS_USUARIOS
      SET NEUS_TELEGRAM_CODIGO_VINCULO=@codigo, NEUS_TELEGRAM_CODIGO_EXPIRA=DATEADD(MINUTE, 15, GETDATE())
      WHERE NEUS_ID=@uid
    `);
  return codigo;
}

async function desvincular(usuarioId, tenantKey) {
  const pool = await databaseService.getPool(tenantKey);
  await pool.request().input('uid', sql.Int, usuarioId).query(`
    UPDATE NEUS_USUARIOS
    SET NEUS_TELEGRAM_CHAT_ID=NULL, NEUS_TELEGRAM_CODIGO_VINCULO=NULL, NEUS_TELEGRAM_CODIGO_EXPIRA=NULL
    WHERE NEUS_ID=@uid
  `);
}

// Busca en TODOS los tenants configurados un usuario con ese código vigente
// (el mensaje al bot no trae tenant, solo texto) y vincula su chat_id.
async function intentarVincularPorCodigo(codigoTexto, chatId) {
  const codigo = String(codigoTexto || '').trim();
  if (!/^\d{6}$/.test(codigo)) return null;

  const tenants = listTenants();
  for (const { key: tenantKey } of tenants) {
    try {
      const pool = await databaseService.getPool(tenantKey);
      const r = await pool.request()
        .input('codigo', sql.NVarChar, codigo)
        .query(`
          SELECT TOP 1 NEUS_ID as id, NEUS_NOMBRES as nombre
          FROM NEUS_USUARIOS
          WHERE NEUS_TELEGRAM_CODIGO_VINCULO=@codigo AND NEUS_TELEGRAM_CODIGO_EXPIRA > GETDATE()
        `);
      if (r.recordset.length) {
        const usuario = r.recordset[0];
        await pool.request()
          .input('uid', sql.Int, usuario.id)
          .input('chatId', sql.BigInt, chatId)
          .query(`
            UPDATE NEUS_USUARIOS
            SET NEUS_TELEGRAM_CHAT_ID=@chatId, NEUS_TELEGRAM_CODIGO_VINCULO=NULL, NEUS_TELEGRAM_CODIGO_EXPIRA=NULL
            WHERE NEUS_ID=@uid
          `);
        return usuario;
      }
    } catch (e) {
      logger.warn(`⚠️ [telegramService] Error buscando código en tenant ${tenantKey}:`, e.message);
    }
  }
  return null;
}

async function procesarUpdate(update) {
  const msg = update.message;
  if (!msg || !msg.text || !msg.chat) return;
  const chatId = msg.chat.id;
  const texto = msg.text.trim();

  if (texto === '/start') {
    await sendMessage(chatId, '👋 Hola, soy el bot de notificaciones de AGYDA.\n\nPara vincular tu cuenta, ve a tu perfil en AGYDA, genera un código de vinculación, y mándamelo aquí (son 6 dígitos).');
    return;
  }

  const usuario = await intentarVincularPorCodigo(texto, chatId);
  if (usuario) {
    await sendMessage(chatId, `✅ ¡Listo, ${usuario.nombre}! Tu cuenta de AGYDA quedó vinculada. A partir de ahora puedes recibir notificaciones aquí.`);
  } else if (/^\d{6}$/.test(texto)) {
    await sendMessage(chatId, '❌ Ese código no es válido o ya expiró (duran 15 minutos). Genera uno nuevo desde tu perfil en AGYDA.');
  }
}

async function pollOnce() {
  if (!isConfigured()) return;
  try {
    const res = await fetch(`${API_BASE}/getUpdates?offset=${pollingOffset}&timeout=25`);
    const data = await res.json();
    if (!data.ok || !Array.isArray(data.result)) return;
    for (const update of data.result) {
      pollingOffset = update.update_id + 1;
      await procesarUpdate(update);
    }
  } catch (e) {
    logger.warn('⚠️ [telegramService] Error en polling:', e.message);
  }
}

// Long-poll continuo — cada ciclo espera hasta 25s dentro de la propia
// llamada a Telegram (long polling nativo de la Bot API), así que no
// satura con requests aunque no llegue nada.
function iniciarPolling() {
  if (!isConfigured()) {
    logger.warn('⚠️ [telegramService] TELEGRAM_BOT_TOKEN no configurado — notificaciones por Telegram deshabilitadas');
    return;
  }
  if (pollingTimer) return;
  const loop = async () => {
    await pollOnce();
    pollingTimer = setTimeout(loop, 500);
  };
  loop();
  logger.info('✅ Telegram: polling de vinculación iniciado');
}

function detenerPolling() {
  if (pollingTimer) clearTimeout(pollingTimer);
  pollingTimer = null;
}

module.exports = {
  isConfigured,
  sendMessage,
  sendToMany,
  generarCodigoVinculo,
  desvincular,
  iniciarPolling,
  detenerPolling,
};
