const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');
const notificationService = require('../services/notificationService');

// Cierre de citas (CRM Cliente). Cada 10 min revisa las citas cuyo horario
// ya terminó (CITA_FECHA_HORA + CITA_DURACION_MIN <= ahora) y siguen abiertas
// (sin estatus final ni marca de "ya se avisó"), y le notifica una sola vez
// al asesor asignado para que confirme si la cita terminó y si el cliente
// asistió (ver citaController.confirmarCierre). El anti-repetición es el
// propio BIT CITA_PENDIENTE_CIERRE: una vez en 1, no se vuelve a notificar
// aunque el asesor tarde en responder — se resuelve manualmente desde la
// agenda (ver citaController.confirmarCierre) hasta que quede en un estatus
// final o el asesor decida que sigue en curso.
async function runTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CITA CIERRE][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  let citas;
  try {
    citas = await pool.request().query(`
      SELECT K.CITA_ID as id, K.CITA_TITULO as titulo, K.CITA_ASIGNADO_A as asignadoA,
             C.CONT_NOMBRE as contactoNombre
      FROM CLI_CITAS K
      INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
      WHERE K.CITA_ACTIVO = 1
        AND K.CITA_ESTATUS NOT IN ('cancelada','asistio','no_asistio')
        AND K.CITA_PENDIENTE_CIERRE = 0
        AND DATEADD(MINUTE, K.CITA_DURACION_MIN, K.CITA_FECHA_HORA) <= GETDATE()
    `);
  } catch (e) {
    console.error(`[CITA CIERRE][${tenantKey}] Error consultando citas:`, e.message);
    return;
  }

  for (const c of citas.recordset) {
    try {
      await pool.request().input('id', sql.Int, c.id)
        .query(`UPDATE CLI_CITAS SET CITA_PENDIENTE_CIERRE=1 WHERE CITA_ID=@id`);

      if (c.asignadoA) {
        await notificationService.createNotification({
          usuarioId: c.asignadoA,
          mensaje: `¿Ya terminó tu cita "${c.titulo}" con ${c.contactoNombre || 'el cliente'}?`,
          tipo: 'cita-confirmar-cierre',
          dataExtra: { citaId: c.id },
          tenantKey,
        });
      }
    } catch (e) {
      console.error(`[CITA CIERRE][${tenantKey}] Error procesando cita ${c.id}:`, e.message);
    }
  }
}

async function run() {
  for (const { key } of listTenants()) {
    await runTenant(key);
  }
}

cron.schedule('*/10 * * * *', () => {
  console.log('[CITA CIERRE] Evaluando citas por cerrar...');
  run();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await run();
    res.json({ success: true, message: 'Cierre de citas ejecutado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = run;
exports._runTenant = runTenant;
