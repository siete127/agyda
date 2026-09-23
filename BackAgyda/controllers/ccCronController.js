const cron = require('node-cron');
const sql = require('mssql');
const { listTenants } = require('../config/tenants');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const ccRouting = require('../services/ccRoutingService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');

async function runTenant(tenantKey) {
  let pool;
  try { pool = await databaseService.getPool(tenantKey); }
  catch (e) { console.error(`[ccCron][${tenantKey}] sin pool:`, e.message); return; }

  let cfg;
  try { cfg = await ccRouting.getConfig(pool); } catch { cfg = {}; }
  const sla1 = cfg.CF_SLA_PRIMERA_RESPUESTA_SEG || 120;
  const autocierreMin = cfg.CF_AUTOCIERRE_INACTIVIDAD_MIN || 60;

  try {
    // 1) SLA de primera respuesta — interacciones sin tomar que llevan mucho en cola.
    const enRiesgo = await pool.request().input('sla', sql.Int, sla1).query(`
      SELECT CI_ID id, CI_TIPO tipo, CI_CLIENTE_NOMBRE nombre
      FROM dbo.CCO_INTERACCIONES
      WHERE CI_ESTADO = 'en_cola'
        AND DATEDIFF(SECOND, CI_FECHA_INICIO, GETDATE()) > @sla
        AND CI_TICKET IS NOT NULL`);
    if (enRiesgo.recordset.length) {
      let supervisores = [];
      try { supervisores = await getUsuariosParaNotificarCorreo('contact-center', tenantKey); } catch { /* */ }
      for (const it of enRiesgo.recordset) {
        for (const sup of supervisores) {
          await notificationService.createNotification({
            usuarioId: sup, tipo: 'cc_sla_riesgo',
            mensaje: `Interacción de ${it.tipo} en cola sin atender: ${it.nombre || 'cliente'}`,
            dataExtra: { interaccionId: it.id }, dedupeKey: `cc-sla-${it.id}`, tenantKey,
          }).catch(() => {});
        }
      }
    }

    // 2) Reasignación de cola (por si un agente quedó disponible sin trigger).
    await ccRouting.intentarAsignarSiguienteEnCola(pool, tenantKey).catch(() => {});

    // 3) Autocierre por inactividad del cliente. Se le asigna la
    // tipificación "En proceso" de la campaña de esa interacción (si existe
    // y está activa) — pedido 2026-09-09: antes quedaba sin tipificar, y el
    // agente no siempre alcanza a tipificarla antes de que el cliente se
    // quede callado y el sistema la cierre solo. Búsqueda por NOMBRE exacto
    // (no un ID fijo, porque cada campaña tiene su propio catálogo) — si esa
    // campaña no tiene ninguna tipificación activa llamada así, se deja
    // igual que antes (sin tipificar), sin inventar ninguna.
    const inactivas = await pool.request().input('min', sql.Int, autocierreMin).query(`
      SELECT CI_ID id, CI_AGENTE_ID agenteId, CI_CAMPANIA_ID campaniaId
      FROM dbo.CCO_INTERACCIONES
      WHERE CI_ESTADO = 'activa'
        AND CI_FECHA_ULTIMO_MSJ_CLIENTE IS NOT NULL
        AND DATEDIFF(MINUTE, CI_FECHA_ULTIMO_MSJ_CLIENTE, GETDATE()) > @min`);
    for (const it of inactivas.recordset) {
      let tipEnProceso = null;
      if (it.campaniaId) {
        const tip = await pool.request().input('c', sql.Int, it.campaniaId).query(`
          SELECT TOP 1 CT_ID id FROM dbo.CCO_TIPIFICACIONES
          WHERE CT_ACTIVO = 1 AND CT_NOMBRE = N'En proceso' AND (CT_CAMPANIA_ID = @c OR CT_CAMPANIA_ID IS NULL)
          ORDER BY CASE WHEN CT_CAMPANIA_ID = @c THEN 0 ELSE 1 END`);
        tipEnProceso = tip.recordset[0]?.id || null;
      }
      await pool.request().input('id', sql.Int, it.id).input('tip', sql.Int, tipEnProceso).query(`
        UPDATE dbo.CCO_INTERACCIONES SET CI_ESTADO = 'cerrada', CI_FECHA_CIERRE = GETDATE(),
          CI_TIPIFICACION_ID = ISNULL(CI_TIPIFICACION_ID, @tip),
          CI_COMENTARIO_CIERRE = N'Cerrada automáticamente por inactividad del cliente'
        WHERE CI_ID = @id`);
      if (it.agenteId) {
        await pool.request().input('u', sql.Int, it.agenteId).query(`
          UPDATE dbo.CCO_AGENTE_ESTADO SET CAE_INTERACCIONES_ACTIVAS = CASE WHEN CAE_INTERACCIONES_ACTIVAS > 0 THEN CAE_INTERACCIONES_ACTIVAS - 1 ELSE 0 END WHERE CAE_USUARIO_ID = @u`);
      }
      ccRouting.emitir(tenantKey, `cc:interaccion:${it.id}`, 'cc:interaccion_cerrada', { interaccionId: it.id });
    }
  } catch (e) {
    console.error(`[ccCron][${tenantKey}]`, e.message);
  }
}

async function runAll() {
  for (const { key } of listTenants()) await runTenant(key);
}

cron.schedule('* * * * *', () => { runAll(); }, { timezone: 'America/Mexico_City' });

exports.runNow = async (_req, res) => {
  await runAll();
  res.json({ success: true, message: 'Cron de Contact Center ejecutado' });
};
exports.init = runAll;
