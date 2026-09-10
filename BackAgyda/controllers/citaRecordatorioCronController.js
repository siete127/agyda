const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');
const citaController = require('./citaController');

// Recordatorios de cita (CRM Cliente — Fase 4). Cada 10 min revisa las citas
// abiertas y, por cada umbral de anticipación configurado en la cita
// (CITA_RECORDAR_MIN_ANTES, CSV de minutos, ej. "1440,60"), dispara el
// recordatorio si YA entramos en esa ventana y aún no se envió a ese umbral.
//
// El anti-repetición se apoya en CLI_CITAS_RECORD_LOG (NOT EXISTS por
// LOG_CITA_ID + LOG_UMBRAL_MIN con LOG_RESULTADO='enviado'), lo que permite
// umbrales arbitrarios. Los BIT CITA_ALERTA_24H/1H_NOTIF quedan como caché
// rápido de los dos umbrales estándar.
//
// Fase 4: enviarRecordatorioCita (en citaController) manda correo al cliente +
// notif al asesor. Fase 6 le agrega el envío por WhatsApp.

const CANAL_PRINCIPAL = 'correo'; // el umbral se considera "enviado" cuando el canal principal salió OK

function parseUmbrales(csv) {
  if (!csv) return [];
  return String(csv).split(',').map((n) => parseInt(String(n).trim(), 10)).filter((n) => Number.isFinite(n) && n >= 0);
}

async function runTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CITA RECORD][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  let citas;
  try {
    citas = await pool.request().query(`
      SELECT K.CITA_ID as id, K.CITA_TITULO as titulo, K.CITA_MODALIDAD as modalidad,
             K.CITA_FECHA_HORA as fechaHora, K.CITA_DURACION_MIN as duracionMin,
             K.CITA_ENLACE as enlace, K.CITA_TELEFONO as telefono,
             K.CITA_ASIGNADO_A as asignadoA, K.CITA_RECORDAR_MIN_ANTES as recordarMinAntes,
             K.CITA_ALERTA_24H_NOTIF as a24, K.CITA_ALERTA_1H_NOTIF as a1,
             C.CONT_NOMBRE as contactoNombre, C.CONT_CORREO as contactoCorreo, C.CONT_TELEFONO as contactoTelefono,
             DATEDIFF(MINUTE, GETDATE(), K.CITA_FECHA_HORA) as minutosFaltantes
      FROM CLI_CITAS K
      INNER JOIN CRM_CONTACTOS C ON C.CONT_ID = K.CITA_CONTACTO_ID
      WHERE K.CITA_ACTIVO = 1
        AND K.CITA_ESTATUS NOT IN ('cancelada','asistio','no_asistio')
        AND K.CITA_FECHA_HORA > GETDATE()
        AND K.CITA_RECORDAR_MIN_ANTES IS NOT NULL
    `);
  } catch (e) {
    console.error(`[CITA RECORD][${tenantKey}] Error consultando citas:`, e.message);
    return;
  }

  for (const c of citas.recordset) {
    // Umbrales de mayor a menor. Solo se dispara el umbral "más apropiado" para
    // el tiempo que falta: aquel donde minutosFaltantes ∈ (siguiente_menor, u].
    // Así, una cita creada faltando 40 min con umbrales [1440, 60] dispara solo
    // el de 60 (no también el de 24h, que ya "pasó"), y sin spam.
    const umbrales = parseUmbrales(c.recordarMinAntes).sort((a, b) => b - a);
    for (let idx = 0; idx < umbrales.length; idx++) {
      const u = umbrales[idx];
      const menorSiguiente = idx + 1 < umbrales.length ? umbrales[idx + 1] : 0;
      // Ventana: estamos dentro de "u minutos antes" pero aún no cruzamos el
      // siguiente umbral menor (que se encargará por su cuenta).
      if (c.minutosFaltantes < 0 || c.minutosFaltantes > u || c.minutosFaltantes <= menorSiguiente) continue;

      try {
        // ¿Ya se envió este umbral? (guardia principal — soporta umbrales libres)
        const ya = await pool.request()
          .input('cid', sql.Int, c.id)
          .input('u', sql.Int, u)
          .input('canal', sql.NVarChar(20), CANAL_PRINCIPAL)
          .query(`SELECT TOP 1 1 x FROM CLI_CITAS_RECORD_LOG WHERE LOG_CITA_ID=@cid AND LOG_UMBRAL_MIN=@u AND LOG_CANAL=@canal AND LOG_RESULTADO='enviado'`);
        if (ya.recordset.length) continue;

        await citaController.enviarRecordatorioCita(pool, tenantKey, {
          id: c.id, titulo: c.titulo, modalidad: c.modalidad, fechaHora: c.fechaHora,
          duracionMin: c.duracionMin, enlace: c.enlace, telefono: c.telefono,
          asignadoA: c.asignadoA, contactoNombre: c.contactoNombre,
          contactoCorreo: c.contactoCorreo, contactoTelefono: c.contactoTelefono,
        }, u);

        // Caché rápido de los dos umbrales estándar.
        if (u === 1440 && !c.a24) {
          await pool.request().input('id', sql.Int, c.id).query(`UPDATE CLI_CITAS SET CITA_ALERTA_24H_NOTIF=1 WHERE CITA_ID=@id`);
        } else if (u === 60 && !c.a1) {
          await pool.request().input('id', sql.Int, c.id).query(`UPDATE CLI_CITAS SET CITA_ALERTA_1H_NOTIF=1 WHERE CITA_ID=@id`);
        }
      } catch (e) {
        console.error(`[CITA RECORD][${tenantKey}] Error procesando cita ${c.id} umbral ${u}:`, e.message);
      }
    }
  }
}

async function run() {
  for (const { key } of listTenants()) {
    await runTenant(key);
  }
}

cron.schedule('*/10 * * * *', () => {
  console.log('[CITA RECORD] Evaluando recordatorios de cita...');
  run();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await run();
    res.json({ success: true, message: 'Recordatorios de cita ejecutados' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = run;
// Expuesto para pruebas / ejecución dirigida a un solo tenant.
exports._runTenant = runTenant;
