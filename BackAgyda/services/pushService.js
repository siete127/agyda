const sql = require('mssql');
const webpush = require('web-push');
const databaseService = require('./databaseService');
const logger = global.logger || require('../utils/logger');

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || null;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || null;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:soporte@ardabytec.com';

const habilitado = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
if (habilitado) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
} else {
  logger.warn('⚠️ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no configuradas — notificaciones push deshabilitadas');
}

const pushService = {
  habilitado,
  publicKey: VAPID_PUBLIC_KEY,

  async guardarSuscripcion(pool, { usuarioId, endpoint, p256dh, auth, userAgent }) {
    await pool.request()
      .input('userId', sql.Int, usuarioId)
      .input('endpoint', sql.NVarChar, endpoint)
      .input('p256dh', sql.NVarChar, p256dh)
      .input('auth', sql.NVarChar, auth)
      .input('userAgent', sql.NVarChar, userAgent || null)
      .query(`
        MERGE dbo.PUSH_SUSCRIPCIONES AS target
        USING (SELECT @endpoint AS endpoint) AS src
        ON target.PUSH_ENDPOINT = src.endpoint
        WHEN MATCHED THEN UPDATE SET PUSH_USER_ID=@userId, PUSH_P256DH=@p256dh, PUSH_AUTH=@auth, PUSH_USER_AGENT=@userAgent
        WHEN NOT MATCHED THEN INSERT (PUSH_USER_ID, PUSH_ENDPOINT, PUSH_P256DH, PUSH_AUTH, PUSH_USER_AGENT)
          VALUES (@userId, @endpoint, @p256dh, @auth, @userAgent);
      `);
  },

  async eliminarSuscripcion(pool, endpoint) {
    await pool.request().input('endpoint', sql.NVarChar, endpoint)
      .query(`DELETE FROM dbo.PUSH_SUSCRIPCIONES WHERE PUSH_ENDPOINT=@endpoint`);
  },

  // Envía un push a todas las suscripciones (navegadores/dispositivos) de un
  // usuario. Si el navegador ya no existe (endpoint caducado, error 404/410 de
  // la operadora push), borra esa suscripción en silencio — es el mecanismo
  // normal de limpieza de Web Push, no un error real del sistema.
  async enviarATodasLasSuscripciones(pool, usuarioId, { titulo, cuerpo, url, tag }) {
    if (!habilitado) return;
    try {
      const rs = await pool.request().input('userId', sql.Int, usuarioId)
        .query(`SELECT PUSH_ID as id, PUSH_ENDPOINT as endpoint, PUSH_P256DH as p256dh, PUSH_AUTH as auth FROM dbo.PUSH_SUSCRIPCIONES WHERE PUSH_USER_ID=@userId`);

      const payload = JSON.stringify({ titulo, cuerpo, url: url || '/', tag: tag || 'agyda-notificacion' });

      for (const sub of rs.recordset) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          );
          await pool.request().input('id', sql.Int, sub.id).query(`UPDATE dbo.PUSH_SUSCRIPCIONES SET PUSH_ULTIMO_USO=GETDATE() WHERE PUSH_ID=@id`);
        } catch (e) {
          if (e.statusCode === 404 || e.statusCode === 410) {
            await pool.request().input('id', sql.Int, sub.id).query(`DELETE FROM dbo.PUSH_SUSCRIPCIONES WHERE PUSH_ID=@id`);
          } else {
            logger.warn('⚠️ Error enviando push:', e?.message || e);
          }
        }
      }
    } catch (e) {
      logger.warn('⚠️ Error consultando suscripciones push:', e?.message || e);
    }
  },
};

module.exports = pushService;
