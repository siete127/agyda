const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { listTenants } = require('../config/tenants');

const UMBRALES_ALERTA_DIAS = [30, 15, 7];

// Alertas previas al vencimiento (30/15/7 días antes) — no cambian REC_ESTATUS,
// solo notifican y marcan REC_ULTIMA_ALERTA_DIAS para no repetir el mismo umbral.
// Corre en el mismo cron que el envío de vencidos, como responsabilidades
// separadas dentro de la misma función (misma tabla, mismo horario).
async function runAlertasVencimientoProximo(pool, tenantKey) {
  try {
    const proximos = await pool.request().query(`
      SELECT r.REC_ID as id, r.REC_CONTACTO_ID as contactoId, r.REC_CONCEPTO as concepto, r.REC_MONTO as monto,
             CONVERT(NVARCHAR(10), r.REC_FECHA_LIMITE, 23) as fechaLimite, r.REC_CREADO_POR as creadoPor,
             r.REC_ULTIMA_ALERTA_DIAS as ultimaAlertaDias,
             DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.REC_FECHA_LIMITE) as diasRestantes,
             c.CONT_NOMBRE as contactoNombre, c.CONT_CORREO as contactoCorreo,
             o.OPO_NOMBRE as opoNombre
      FROM CRM_RECORDATORIOS_PAGO r
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = r.REC_CONTACTO_ID
      LEFT JOIN CRM_OPORTUNIDADES o ON o.OPO_ID = r.REC_OPO_ID
      WHERE r.REC_ACTIVO = 1
        AND r.REC_ESTATUS IN ('pendiente','enviado')
        AND DATEDIFF(DAY, CAST(GETDATE() AS DATE), r.REC_FECHA_LIMITE) IN (${UMBRALES_ALERTA_DIAS.join(',')})
    `);

    for (const rec of proximos.recordset) {
      if (rec.ultimaAlertaDias === rec.diasRestantes) continue; // ya se avisó este umbral
      if (!rec.contactoCorreo) continue;

      try {
        await emailService.sendAlertaVencimientoProximo({
          contactoNombre: rec.contactoNombre,
          contactoCorreo: rec.contactoCorreo,
          concepto: rec.concepto,
          monto: rec.monto,
          fechaLimite: rec.fechaLimite,
          diasRestantes: rec.diasRestantes,
          opoNombre: rec.opoNombre || null,
        });

        await pool.request()
          .input('id', sql.Int, rec.id)
          .input('dias', sql.Int, rec.diasRestantes)
          .query(`UPDATE CRM_RECORDATORIOS_PAGO SET REC_ULTIMA_ALERTA_DIAS=@dias WHERE REC_ID=@id`);

        if (rec.creadoPor) {
          await notificationService.createNotification({
            usuarioId: rec.creadoPor,
            mensaje: `Pago de ${rec.contactoNombre} vence en ${rec.diasRestantes} día(s): ${rec.concepto}`,
            tipo: 'cliente-pago-por-vencer',
            dataExtra: { recordatorioId: rec.id, contactoId: rec.contactoId, diasRestantes: rec.diasRestantes },
            tenantKey,
          });
        }

        console.log(`[CRM RECORDATORIOS] Alerta previa (${rec.diasRestantes}d) enviada para recordatorio ${rec.id}`);
      } catch (e) {
        console.error(`[CRM RECORDATORIOS] Error alerta previa recordatorio ${rec.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[CRM RECORDATORIOS] Error consultando próximos a vencer:', e.message);
  }
}

async function runRecordatoriosPago() {
  for (const { key } of listTenants()) {
    await runRecordatoriosPagoTenant(key);
  }
}

async function runRecordatoriosPagoTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CRM RECORDATORIOS][${tenantKey}] Sin pool:`, e.message); return;
  }

  try {
    const pendientes = await pool.request().query(`
      SELECT r.REC_ID as id, r.REC_CONTACTO_ID as contactoId, r.REC_OPO_ID as opoId,
             r.REC_CONCEPTO as concepto, r.REC_MONTO as monto,
             CONVERT(NVARCHAR(10), r.REC_FECHA_LIMITE, 23) as fechaLimite,
             r.REC_CREADO_POR as creadoPor,
             c.CONT_NOMBRE as contactoNombre, c.CONT_CORREO as contactoCorreo,
             o.OPO_NOMBRE as opoNombre
      FROM CRM_RECORDATORIOS_PAGO r
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = r.REC_CONTACTO_ID
      LEFT JOIN CRM_OPORTUNIDADES o ON o.OPO_ID = r.REC_OPO_ID
      WHERE r.REC_ACTIVO = 1
        AND r.REC_ESTATUS = 'pendiente'
        AND CAST(r.REC_FECHA_LIMITE AS DATE) <= CAST(GETDATE() AS DATE)
    `);

    for (const rec of pendientes.recordset) {
      if (!rec.contactoCorreo) {
        console.warn(`[CRM RECORDATORIOS] Recordatorio ${rec.id} sin correo de contacto — se omite, queda pendiente`);
        continue;
      }

      try {
        await emailService.sendRecordatorioPagoEmail({
          contactoNombre: rec.contactoNombre,
          contactoCorreo: rec.contactoCorreo,
          concepto: rec.concepto,
          monto: rec.monto,
          fechaLimite: rec.fechaLimite,
          opoNombre: rec.opoNombre || null,
        });

        await pool.request()
          .input('id', sql.Int, rec.id)
          .query(`UPDATE CRM_RECORDATORIOS_PAGO SET REC_ESTATUS='enviado', REC_FECHA_ENVIO=GETDATE() WHERE REC_ID=@id`);

        if (rec.opoId) {
          await pool.request()
            .input('opoId', sql.Int, rec.opoId)
            .input('content', sql.NVarChar, `Recordatorio de pago enviado: $${Number(rec.monto).toFixed(2)} - ${rec.concepto}`)
            .query(`
              INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_NOMBRE)
              VALUES (@opoId,'nota',@content,'Sistema')
            `);
        }

        if (rec.creadoPor) {
          await notificationService.createNotification({
            usuarioId: rec.creadoPor,
            mensaje: `Recordatorio de pago enviado a ${rec.contactoNombre}: ${rec.concepto}`,
            tipo: 'crm-recordatorio-pago',
            dataExtra: { recordatorioId: rec.id, contactoId: rec.contactoId },
            tenantKey,
          });
        }

        // Automatización 2: pago vencido → seguimiento prioritario (rojo) en la
        // bitácora del cliente, visible en el Perfil de Cliente (Fase 2).
        try {
          await pool.request()
            .input('contactoId', sql.Int, rec.contactoId)
            .input('nota', sql.NVarChar(sql.MAX), `Pago vencido: ${rec.concepto} — $${Number(rec.monto).toFixed(2)}`)
            .query(`
              INSERT INTO CLI_SEGUIMIENTOS (SEG_CONTACTO_ID, SEG_TIPO_CONTACTO, SEG_ESTATUS_COLOR, SEG_NOTA)
              VALUES (@contactoId, 'otro', 'rojo', @nota)
            `);
          await pool.request()
            .input('contactoId', sql.Int, rec.contactoId)
            .query(`UPDATE CRM_CONTACTOS SET CONT_ESTATUS_CLIENTE='rojo' WHERE CONT_ID=@contactoId`);
        } catch (e) {
          console.error(`[CRM RECORDATORIOS] Error registrando seguimiento de vencido ${rec.id}:`, e.message);
        }

        console.log(`[CRM RECORDATORIOS] Recordatorio ${rec.id} enviado a ${rec.contactoCorreo}`);
      } catch (e) {
        console.error(`[CRM RECORDATORIOS] Error procesando recordatorio ${rec.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error('[CRM RECORDATORIOS] Error consultando pendientes:', e.message);
  }

  await runAlertasVencimientoProximo(pool, tenantKey);
}

// Cron: todos los días a las 8:00 AM
cron.schedule('0 8 * * *', () => {
  console.log('[CRM RECORDATORIOS] Ejecutando envío de recordatorios de pago...');
  runRecordatoriosPago();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await runRecordatoriosPago();
    res.json({ success: true, message: 'Recordatorios de pago ejecutados' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runRecordatoriosPago;
