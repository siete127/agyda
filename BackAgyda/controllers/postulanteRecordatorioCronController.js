const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');
const notificationService = require('../services/notificationService');

// Recordatorio de contacto a postulantes (Contact Center — Gestión de
// postulantes). Un agente/supervisor fija CP_RECORDAR_FECHA_HORA desde la UI;
// cada 5 min este cron revisa quiénes ya cruzaron esa fecha/hora y aún no
// tienen envío registrado en CCO_POSTULANTE_RECORD_LOG (anti-repetición, un
// solo disparo por postulante — a diferencia de citaRecordatorioCronController
// no hay umbrales múltiples, es una alarma puntual).
//
// Se notifica a los supervisores de la campaña (CC_CAMPANIAS_SUPERVISORES) y a
// los agentes de los grupos/skills de esa campaña (CCO_GRUPO_AGENTES) — no hay
// "asignado a" en el postulante, así que se avisa a todo el equipo de la campaña.

async function runTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[POSTULANTE RECORD][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  let pendientes;
  try {
    pendientes = await pool.request().query(`
      SELECT cp.CP_ID id, cp.CP_NOMBRE nombre, cp.CP_TELEFONO telefono,
             cp.CP_CAMPANIA_ID campaniaId, c.CM2_NOMBRE campaniaNombre
      FROM dbo.CCO_CAMPANIA_POSTULANTES cp
      JOIN dbo.CCO_CAMPANIAS c ON c.CM2_ID = cp.CP_CAMPANIA_ID
      WHERE cp.CP_RECORDAR_FECHA_HORA IS NOT NULL
        AND cp.CP_RECORDAR_FECHA_HORA <= GETDATE()
        AND NOT EXISTS (SELECT 1 FROM dbo.CCO_POSTULANTE_RECORD_LOG WHERE LOG_POSTULANTE_ID = cp.CP_ID)
    `);
  } catch (e) {
    console.error(`[POSTULANTE RECORD][${tenantKey}] Error consultando postulantes:`, e.message);
    return;
  }

  for (const p of pendientes.recordset) {
    try {
      const destinatarios = await pool.request().input('c', sql.Int, p.campaniaId).query(`
        SELECT usuarioId FROM (
          SELECT CS_SUPERVISOR_ID usuarioId FROM dbo.CC_CAMPANIAS_SUPERVISORES WHERE CS_CAMPANIA_ID = @c
          UNION
          SELECT ga.CGA_USUARIO_ID usuarioId
          FROM dbo.CCO_GRUPO_AGENTES ga
          JOIN dbo.CCO_GRUPOS g ON g.CG_ID = ga.CGA_GRUPO_ID
          WHERE g.CG_CAMPANIA_ID = @c AND g.CG_ACTIVO = 1 AND ga.CGA_ACTIVO = 1
        ) t WHERE usuarioId IS NOT NULL
      `);

      const mensaje = `Es hora de contactar a ${p.nombre} (${p.telefono}) — campaña ${p.campaniaNombre}`;
      for (const { usuarioId } of destinatarios.recordset) {
        await notificationService.createNotification({
          usuarioId,
          mensaje,
          tipo: 'postulante-recordatorio-contacto',
          dataExtra: { postulanteId: p.id, campaniaId: p.campaniaId },
          tenantKey,
        });
      }

      // Se marca como enviado aunque no haya destinatarios (campaña sin
      // supervisor/agentes asignados todavía) — si no, este postulante se
      // reintentaría cada 5 min para siempre sin que nadie lo reciba nunca.
      await pool.request().input('id', sql.Int, p.id)
        .query(`INSERT INTO dbo.CCO_POSTULANTE_RECORD_LOG (LOG_POSTULANTE_ID) VALUES (@id)`);
    } catch (e) {
      console.error(`[POSTULANTE RECORD][${tenantKey}] Error procesando postulante ${p.id}:`, e.message);
    }
  }
}

async function run() {
  for (const { key } of listTenants()) {
    await runTenant(key);
  }
}

cron.schedule('*/5 * * * *', () => {
  run();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await run();
    res.json({ success: true, message: 'Recordatorios de postulante ejecutados' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = run;
exports._runTenant = runTenant;
