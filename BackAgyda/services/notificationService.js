const databaseService = require('./databaseService');
const http = require('http');
let socketService;
try { socketService = require('./socketService'); } catch (e) { socketService = null; }
const pushService = require('./pushService');
const emailService = require('./emailService');
const logger = global.logger || require('../utils/logger');

// Tipos de notificación que valen la pena empujar como push del navegador
// (fuera de la pestaña activa). El resto de tipos (ej. "noticia") se quedan
// solo como notificación interna — un push por cada noticia sería ruido.
const TIPOS_CON_PUSH = new Set([
  'ticket_sla_riesgo', 'ticket_sla_vencido', 'ticket_reabierto',
  'livechat_espera_escalada', 'ticket_estado',
]);

// Tipos que además ameritan correo electrónico al técnico — solo el
// evento más importante (asignación) y los dos de SLA (riesgo/vencido).
// Deliberadamente NO se incluyen comentarios/transferencias/etc. para no
// saturar la bandeja del técnico; esos ya se ven en la notificación interna
// y el push. Requiere que el usuario tenga NEUS_CORREO registrado — si no
// lo tiene, se omite en silencio (no bloquea nada más).
const TIPOS_CON_CORREO = new Set(['ticket_nuevo', 'ticket_sla_riesgo', 'ticket_sla_vencido']);

// Relay: emitir al back-intra (puerto 8446) que tiene el socket con los clientes reales
function relayEmit(room, event, payload) {
  try {
    const body = JSON.stringify({ room, event, payload });
    const req = http.request({
      hostname: '127.0.0.1', port: 8446, path: '/internal/emit',
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    });
    req.on('error', () => {});
    req.write(body);
    req.end();
  } catch (_) {}
}

const notificationService = {
  async createNotification({ usuarioId, mensaje, tipo, dataExtra, tenantKey }) {
    if (!usuarioId || !mensaje) return null;

    const pool = await databaseService.getPool(tenantKey);
    const sql = require('mssql');

    // Emitir por socket PRIMERO, independiente de si el insert en BD falla
    let newId = null;
    try {
      if (socketService) {
        const io = socketService.getIO(tenantKey);
        const payload = {
          id: Date.now(),
          usuarioId,
          mensaje,
          tipo,
          dataExtra: dataExtra || null,
          leida: 0,
          fecha: new Date().toISOString()
        };
        const roomKey = `user:${usuarioId}`;
        io.to(roomKey).emit('notificacion', payload);
        // Relay al back-intra (puerto 8446) que tiene los sockets de los navegadores
        relayEmit(roomKey, 'notificacion', payload);
        relayEmit(roomKey, 'chat:notify', payload);
        try { io.to(roomKey).emit('chat:notify', payload); } catch (_) {}
      }
    } catch (e) {
      logger.error('⚠️ Error emitiendo notificación por socket:', e?.message || e);
    }

    // Persistir en BD
    try {
      const ticketId = dataExtra && dataExtra.ticketId ? Number(dataExtra.ticketId) : null;
      const dataExtraJson = dataExtra ? JSON.stringify(dataExtra) : null;
      const result = await pool.request()
        .input('usuarioId', sql.Int, usuarioId)
        .input('tipo', sql.NVarChar, tipo || null)
        .input('ticketId', sql.Int, ticketId)
        .input('mensaje', sql.NVarChar, mensaje)
        .input('dataExtra', sql.NVarChar, dataExtraJson)
        .query(`
          INSERT INTO NOTIFICACIONES (USER_ID, TIPO, TICKET_ID, MENSAJE, DATA_EXTRA)
          VALUES (@usuarioId, @tipo, @ticketId, @mensaje, @dataExtra);
          SELECT SCOPE_IDENTITY() as id;
        `);
      newId = result.recordset?.[0]?.id || null;
    } catch (e) {
      console.warn('⚠️ Error persistiendo notificación en BD:', e?.message || e);
    }

    // Push del navegador: solo para los tipos que realmente ameritan sacar
    // al usuario de lo que esté haciendo. No bloquea ni afecta el resultado
    // de createNotification si falla.
    if (TIPOS_CON_PUSH.has(tipo)) {
      try {
        const ticketId = dataExtra && dataExtra.ticketId ? Number(dataExtra.ticketId) : null;
        await pushService.enviarATodasLasSuscripciones(pool, usuarioId, {
          titulo: 'AGYDA — Soporte TI',
          cuerpo: mensaje,
          url: ticketId ? `/tickets?id=${ticketId}` : '/tickets',
          tag: ticketId ? `ticket-${ticketId}` : 'agyda',
        });
      } catch (e) {
        logger.warn('⚠️ Error enviando push para notificación:', e?.message || e);
      }
    }

    // Correo electrónico al técnico: solo asignación de ticket + SLA en
    // riesgo/vencido (ver TIPOS_CON_CORREO). Si el usuario no tiene correo
    // registrado, se omite en silencio — no bloquea ni afecta el resto.
    const ticketId = dataExtra && dataExtra.ticketId ? Number(dataExtra.ticketId) : null;
    if (TIPOS_CON_CORREO.has(tipo) && ticketId) {
      try {
        const rsUser = await pool.request().input('uid', sql.Int, usuarioId)
          .query(`SELECT NEUS_NOMBRES as nombre, NEUS_CORREO as correo FROM NEUS_USUARIOS WHERE NEUS_ID=@uid`);
        const destino = rsUser.recordset[0];
        if (destino?.correo) {
          const rsTicket = await pool.request().input('tid', sql.Int, ticketId)
            .query(`SELECT TITULO as titulo, PRIORIDAD as prioridad FROM TICKETS WHERE TICKET_ID=@tid`);
          const ticket = rsTicket.recordset[0];
          await emailService.sendTicketNotificacionEmail({
            to: destino.correo,
            nombreTecnico: destino.nombre,
            ticketId,
            tituloTicket: ticket?.titulo || null,
            prioridad: ticket?.prioridad || null,
            mensaje,
            tipo,
          });
        }
      } catch (e) {
        logger.warn('⚠️ Error enviando correo de notificación de ticket:', e?.message || e);
      }
    }

    return newId;
  },

  async broadcastNews({ noticiaId, titulo, categoria, destacada, roles, tenantKey }) {
    try {
      if (!noticiaId || !titulo) return 0;
      const pool = await databaseService.getPool(tenantKey);
      const sql = require('mssql');
      const upperRoles = Array.isArray(roles) ? roles.filter(r => /^[A-Za-z0-9_]+$/.test(r)).map(r => r.toUpperCase()) : [];
      let usersQuery = `SELECT NEUS_ID as id FROM dbo.NEUS_USUARIOS WHERE ISNULL(NEUS_ACTIVO,1)=1`;
      if (upperRoles.length > 0) {
        const inList = upperRoles.map(r => `'${r}'`).join(',');
        usersQuery += ` AND UPPER(NEUS_TIPOUSUARIO) IN (${inList})`;
      }
      const usersRs = await pool.request().query(usersQuery);
      const usuarios = usersRs.recordset || [];
      if (usuarios.length === 0) return 0;

      const baseMensaje = `📰 Nueva noticia: ${titulo}`;
      const dataExtra = { noticiaId, titulo, categoria: categoria || null, destacada: destacada ? 1 : 0 };

      for (const u of usuarios) {
        try {
          await notificationService.createNotification({
            usuarioId: Number(u.id),
            mensaje: baseMensaje,
            tipo: 'noticia',
            dataExtra,
            tenantKey,
          });
        } catch (innerErr) {
          console.warn('⚠️ Error notificando usuario', u.id, innerErr.message);
        }
      }
      logger.info(`📢 Broadcast de noticia ${noticiaId} enviado a ${usuarios.length} usuarios`);
      return usuarios.length;
    } catch (e) {
      logger.error('❌ Error en broadcastNews:', e.message);
      return 0;
    }
  },

  async listNotifications(usuarioId, onlyUnread = false, limit = 100, tenantKey) {
    const pool = await databaseService.getPool(tenantKey);
    const sql = require('mssql');
    let q = `SELECT TOP (${Number(limit)})
               NOTI_ID as id,
               USER_ID as usuarioId,
               MENSAJE as mensaje,
               TIPO as tipo,
               TICKET_ID as ticketId,
               DATA_EXTRA as dataExtra,
               LEIDA as leida,
               CREATED_AT as fecha
             FROM NOTIFICACIONES
             WHERE USER_ID = @usuarioId`;
    if (onlyUnread) q += ` AND LEIDA = 0`;
    q += ` ORDER BY CREATED_AT DESC`;
    const rs = await pool.request().input('usuarioId', sql.Int, usuarioId).query(q);
    return rs.recordset.map(r => {
      let parsedExtra = null;
      if (r.dataExtra) {
        try { parsedExtra = JSON.parse(r.dataExtra); } catch (_) {}
      }
      // Compatibilidad: si no hay dataExtra JSON pero hay ticketId, construirlo
      if (!parsedExtra && r.ticketId) parsedExtra = { ticketId: r.ticketId };
      return {
        id: r.id,
        usuarioId: r.usuarioId,
        mensaje: r.mensaje,
        tipo: r.tipo,
        leida: Boolean(r.leida),
        fecha: r.fecha,
        dataExtra: parsedExtra,
      };
    });
  },

  async markAsRead(id, tenantKey) {
    const pool = await databaseService.getPool(tenantKey);
    const sql = require('mssql');
    await pool.request().input('id', sql.Int, id).query(`UPDATE NOTIFICACIONES SET LEIDA=1 WHERE NOTI_ID=@id`);
    return true;
  },

  async markAllAsRead(usuarioId, tenantKey) {
    const pool = await databaseService.getPool(tenantKey);
    const sql = require('mssql');
    await pool.request().input('usuarioId', sql.Int, usuarioId).query(`UPDATE NOTIFICACIONES SET LEIDA=1 WHERE USER_ID=@usuarioId`);
    return true;
  }
};

module.exports = notificationService;
