const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const socketService = require('../services/socketService');
const { listTenants } = require('../config/tenants');
const ticketController = require('./ticketController');

// Motor SLA activo: revisa tickets abiertos y (a) notifica cuando el SLA de
// resolución está en riesgo (umbral configurable en Configuración > Escalamientos,
// por defecto 80% del tiempo consumido), (b) al vencerse, notifica y —si el
// auto-escalamiento está activo— escala automáticamente al siguiente nivel.
async function getEscalamientoConfig(pool) {
  try {
    const rs = await pool.request().query(`SELECT TOP 1 TEC_AUTO_ESCALAMIENTO as autoEscalamiento, TEC_UMBRAL_RIESGO as umbralRiesgo FROM TICKETS_ESCALAMIENTO_CONFIG ORDER BY TEC_ID`);
    return rs.recordset[0] || { autoEscalamiento: true, umbralRiesgo: 0.8 };
  } catch (e) {
    return { autoEscalamiento: true, umbralRiesgo: 0.8 };
  }
}

async function runSlaCheck() {
  for (const { key } of listTenants()) {
    await runSlaCheckTenant(key);
  }
}

async function runSlaCheckTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[TICKETS SLA CRON][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  try {
    const reglas = await ticketController.cargarReglasSlaActivas(pool);
    if (!reglas.length) return;

    const escalamientoConfig = await getEscalamientoConfig(pool);

    const rs = await pool.request().query(`
      SELECT TICKET_ID as id, AREA, PRIORIDAD, ESTADO, FECHA_CREACION, ASIGNADO_A,
             NIVEL_ACTUAL, SLA_RIESGO_NOTIFICADO, SLA_VENCIDO_NOTIFICADO, MINUTOS_TOTAL_ESPERA
      FROM TICKETS
      WHERE ESTADO NOT IN ('resuelto','cerrado','en_espera')
    `);

    for (const t of rs.recordset) {
      const regla = ticketController.buscarReglaSla(reglas, t.PRIORIDAD, t.AREA);
      if (!regla) continue;

      // El reloj de SLA se pausa mientras el ticket está en espera: se descuenta
      // MINUTOS_TOTAL_ESPERA (tiempo ya acumulado en pausas anteriores) del total
      // transcurrido. Un ticket actualmente en_espera ya quedó excluido arriba.
      const minutosTranscurridos = Math.round((Date.now() - new Date(t.FECHA_CREACION).getTime()) / 60000) - (t.MINUTOS_TOTAL_ESPERA || 0);
      const minResolucion = regla.minResolucion;

      // Vencido: notificar (si no se hizo antes) y escalar al siguiente nivel
      if (minutosTranscurridos > minResolucion) {
        if (!t.SLA_VENCIDO_NOTIFICADO) {
          await notificarSlaVencido(pool, tenantKey, t);
          if (escalamientoConfig.autoEscalamiento && t.NIVEL_ACTUAL < 3) {
            try {
              await ticketController.escalarTicketInterno(pool, {
                ticketId: t.id,
                nivelDestino: t.NIVEL_ACTUAL + 1,
                motivo: 'SLA de resolución vencido',
                actorId: null,
                tenantKey,
                tipo: 'automatico',
              });
            } catch (e) {
              console.error(`[TICKETS SLA CRON] Error escalando ticket ${t.id}:`, e.message);
            }
          }
          await pool.request().input('tid', sql.Int, t.id)
            .query(`UPDATE TICKETS SET SLA_VENCIDO_NOTIFICADO = 1 WHERE TICKET_ID=@tid`);
        }
        continue;
      }

      // En riesgo (≥80% del tiempo consumido, aún no vencido): solo notificar una vez
      if (!t.SLA_RIESGO_NOTIFICADO && minutosTranscurridos >= minResolucion * escalamientoConfig.umbralRiesgo) {
        await notificarSlaRiesgo(pool, tenantKey, t, minResolucion - minutosTranscurridos);
        await pool.request().input('tid', sql.Int, t.id)
          .query(`UPDATE TICKETS SET SLA_RIESGO_NOTIFICADO = 1 WHERE TICKET_ID=@tid`);
      }
    }
  } catch (e) {
    console.error(`[TICKETS SLA CRON][${tenantKey}] Error evaluando SLA:`, e.message);
  }
}

async function notificarSlaRiesgo(pool, tenantKey, t, minutosRestantes) {
  if (!t.ASIGNADO_A) return;
  const mensaje = `SLA en riesgo: ticket #${t.id} vence en ~${Math.max(minutosRestantes, 0)} min`;
  try {
    await notificationService.createNotification({
      usuarioId: t.ASIGNADO_A, mensaje, tipo: 'ticket_sla_riesgo',
      dataExtra: { ticketId: t.id }, tenantKey,
    });
    const io = socketService.getIO(tenantKey);
    io.to(`user:${t.ASIGNADO_A}`).emit('ticket:updated', { ticketId: t.id, tipo: 'sla_riesgo' });
  } catch (e) {
    console.warn(`[TICKETS SLA CRON] Error notificando riesgo ticket ${t.id}:`, e.message);
  }
}

async function notificarSlaVencido(pool, tenantKey, t) {
  const mensaje = `SLA vencido: el ticket #${t.id} superó el tiempo de resolución`;
  try {
    if (t.ASIGNADO_A) {
      await notificationService.createNotification({
        usuarioId: t.ASIGNADO_A, mensaje, tipo: 'ticket_sla_vencido',
        dataExtra: { ticketId: t.id }, tenantKey,
      });
    }
    const io = socketService.getIO(tenantKey);
    io.to(`ticket:${t.id}`).emit('ticket:updated', { ticketId: t.id, tipo: 'sla_vencido' });
  } catch (e) {
    console.warn(`[TICKETS SLA CRON] Error notificando vencimiento ticket ${t.id}:`, e.message);
  }
}

// Cron: cada 5 minutos
cron.schedule('*/5 * * * *', () => {
  console.log('[TICKETS SLA CRON] Evaluando SLA de tickets abiertos...');
  runSlaCheck();
});

exports.runNow = async (req, res) => {
  try {
    await runSlaCheck();
    res.json({ success: true, message: 'Chequeo de SLA de tickets ejecutado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runSlaCheck;
