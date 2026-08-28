const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const socketService = require('../services/socketService');
const { listTenants } = require('../config/tenants');

// Recordatorios automáticos: notifica al técnico asignado cuando un ticket
// abierto lleva N días sin actividad (sin comentarios ni cambios de historial).
// Mismo patrón que ticketSlaCronController.js, pero "sin actividad" puede
// resetearse (a diferencia del SLA, que solo empeora), así que se compara
// contra FECHA_ULTIMO_RECORDATORIO en vez de usar un bit "ya notificado".
async function getRecordatoriosConfig(pool) {
  try {
    const rs = await pool.request().query(`SELECT TOP 1 TRC_ACTIVO as activo, TRC_DIAS_SIN_ACTIVIDAD as diasSinActividad FROM TICKETS_RECORDATORIOS_CONFIG ORDER BY TRC_ID`);
    return rs.recordset[0] || { activo: true, diasSinActividad: 3 };
  } catch (e) {
    return { activo: true, diasSinActividad: 3 };
  }
}

async function runRecordatoriosCheck() {
  for (const { key } of listTenants()) {
    await runRecordatoriosCheckTenant(key);
  }
}

async function runRecordatoriosCheckTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[TICKETS RECORDATORIOS CRON][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  try {
    const config = await getRecordatoriosConfig(pool);
    if (!config.activo) return;

    // Última actividad real = la fecha más reciente entre creación del ticket,
    // último historial y último comentario. Un ticket sin ningún evento
    // posterior a su creación usa FECHA_CREACION como línea base.
    const rs = await pool.request().input('dias', sql.Int, config.diasSinActividad).query(`
      SELECT t.TICKET_ID as id, t.ASIGNADO_A, t.FECHA_ULTIMO_RECORDATORIO,
        (SELECT MAX(x) FROM (VALUES
          (t.FECHA_CREACION),
          ((SELECT MAX(CREATED_AT) FROM TICKET_HISTORIAL WHERE TICKET_ID = t.TICKET_ID)),
          ((SELECT MAX(CREATED_AT) FROM TICKET_COMENTARIOS WHERE TICKET_ID = t.TICKET_ID))
        ) AS v(x)) as ultimaActividad
      FROM TICKETS t
      WHERE t.ESTADO NOT IN ('resuelto','cerrado','en_espera')
        AND t.ASIGNADO_A IS NOT NULL
    `);

    for (const t of rs.recordset) {
      const ultimaActividad = new Date(t.ultimaActividad);
      const diasInactivo = (Date.now() - ultimaActividad.getTime()) / (1000 * 60 * 60 * 24);
      if (diasInactivo < config.diasSinActividad) continue;

      // Ya se avisó DESPUÉS de la última actividad conocida — no repetir hasta
      // que haya actividad nueva y vuelva a pasar el umbral otra vez.
      if (t.FECHA_ULTIMO_RECORDATORIO && new Date(t.FECHA_ULTIMO_RECORDATORIO) >= ultimaActividad) continue;

      try {
        await notificationService.createNotification({
          usuarioId: t.ASIGNADO_A,
          mensaje: `Ticket #${t.id} sin actividad hace ${Math.floor(diasInactivo)} días`,
          tipo: 'ticket_sin_actividad',
          dataExtra: { ticketId: t.id },
          tenantKey,
        });
        const io = socketService.getIO(tenantKey);
        io.to(`user:${t.ASIGNADO_A}`).emit('ticket:updated', { ticketId: t.id, tipo: 'recordatorio_inactividad' });
      } catch (e) {
        console.warn(`[TICKETS RECORDATORIOS CRON] Error notificando ticket ${t.id}:`, e.message);
      }

      await pool.request().input('tid', sql.Int, t.id)
        .query(`UPDATE TICKETS SET FECHA_ULTIMO_RECORDATORIO = GETDATE() WHERE TICKET_ID=@tid`);
    }
  } catch (e) {
    console.error(`[TICKETS RECORDATORIOS CRON][${tenantKey}] Error evaluando recordatorios:`, e.message);
  }
}

// Cron: una vez al día, a las 9:00
cron.schedule('0 9 * * *', () => {
  console.log('[TICKETS RECORDATORIOS CRON] Evaluando tickets sin actividad...');
  runRecordatoriosCheck();
});

exports.runNow = async (req, res) => {
  try {
    await runRecordatoriosCheck();
    res.json({ success: true, message: 'Chequeo de recordatorios de tickets ejecutado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getConfig = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const config = await getRecordatoriosConfig(pool);
    res.json({ success: true, data: config });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateConfig = async (req, res) => {
  try {
    const { activo, diasSinActividad } = req.body;
    const dias = Number(diasSinActividad);
    if (!Number.isFinite(dias) || dias < 1) {
      return res.status(400).json({ success: false, message: 'diasSinActividad debe ser un número mayor a 0' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('activo', sql.Bit, activo ? 1 : 0)
      .input('dias', sql.Int, dias)
      .query(`
        UPDATE TICKETS_RECORDATORIOS_CONFIG SET TRC_ACTIVO=@activo, TRC_DIAS_SIN_ACTIVIDAD=@dias, TRC_FECHA_ACTUALIZACION=GETDATE()
        WHERE TRC_ID = (SELECT TOP 1 TRC_ID FROM TICKETS_RECORDATORIOS_CONFIG ORDER BY TRC_ID)
      `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runRecordatoriosCheck;
