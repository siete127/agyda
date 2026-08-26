const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { listTenants } = require('../config/tenants');

// Renovaciones y fechas importantes de cliente (Fase 6) — evalúa los umbrales
// CSV configurables por registro (FEC_DIAS_ALERTA, default '30,15,7'), envía
// alerta al responsable del cliente (no al cliente, a diferencia de los
// recordatorios de pago), y si la fecha es recurrente anual la reprograma al
// año siguiente cuando ya pasó. Corre para cada empresa configurada.
async function runAlertasFechasImportantes() {
  for (const { key } of listTenants()) {
    await runAlertasFechasImportantesTenant(key);
  }
}

async function runAlertasFechasImportantesTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CLI FECHAS][${tenantKey}] Sin pool:`, e.message); return;
  }

  try {
    const fechas = await pool.request().query(`
      SELECT f.FEC_ID as id, f.FEC_CONTACTO_ID as contactoId, f.FEC_TIPO as tipo, f.FEC_DESCRIPCION as descripcion,
             CONVERT(NVARCHAR(10), f.FEC_FECHA, 23) as fecha, f.FEC_RECURRENTE_ANUAL as recurrenteAnual,
             f.FEC_DIAS_ALERTA as diasAlerta, f.FEC_ULTIMA_ALERTA_DIAS as ultimaAlertaDias,
             DATEDIFF(DAY, CAST(GETDATE() AS DATE), f.FEC_FECHA) as diasRestantes,
             c.CONT_NOMBRE as contactoNombre, c.CONT_RESPONSABLE_ID as responsableId
      FROM CLI_FECHAS_IMPORTANTES f
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = f.FEC_CONTACTO_ID
      WHERE f.FEC_ACTIVO = 1 AND f.FEC_ESTATUS = 'vigente'
    `);

    for (const fec of fechas.recordset) {
      try {
        const umbrales = String(fec.diasAlerta || '30,15,7').split(',').map((d) => parseInt(d.trim(), 10)).filter(Number.isInteger);

        if (umbrales.includes(fec.diasRestantes) && fec.ultimaAlertaDias !== fec.diasRestantes) {
          if (fec.responsableId) {
            const responsable = await pool.request()
              .input('id', sql.Int, fec.responsableId)
              .query(`SELECT NEUS_CORREO as correo, NEUS_NOMBRES as nombre FROM NEUS_USUARIOS WHERE NEUS_ID=@id`);
            const resp = responsable.recordset[0];
            if (resp?.correo) {
              await emailService.sendAlertaFechaImportanteEmail({
                responsableNombre: resp.nombre,
                responsableCorreo: resp.correo,
                contactoNombre: fec.contactoNombre,
                tipo: fec.tipo,
                descripcion: fec.descripcion,
                fecha: fec.fecha,
                diasRestantes: fec.diasRestantes,
              });
            }
            await notificationService.createNotification({
              usuarioId: fec.responsableId,
              mensaje: `${fec.contactoNombre}: ${fec.descripcion} en ${fec.diasRestantes} día(s)`,
              tipo: 'cliente-fecha-importante',
              dataExtra: { fechaId: fec.id, contactoId: fec.contactoId, diasRestantes: fec.diasRestantes },
              tenantKey,
            });
          }

          await pool.request()
            .input('id', sql.Int, fec.id)
            .input('dias', sql.Int, fec.diasRestantes)
            .query(`UPDATE CLI_FECHAS_IMPORTANTES SET FEC_ULTIMA_ALERTA_DIAS=@dias WHERE FEC_ID=@id`);

          console.log(`[CLI FECHAS][${tenantKey}] Alerta (${fec.diasRestantes}d) enviada para fecha ${fec.id}`);
        }

        // Fecha ya pasada: si es recurrente anual, reprograma al año siguiente;
        // si no, se marca vencida (deja de evaluarse en corridas futuras).
        if (fec.diasRestantes < 0) {
          if (fec.recurrenteAnual) {
            await pool.request()
              .input('id', sql.Int, fec.id)
              .query(`UPDATE CLI_FECHAS_IMPORTANTES SET FEC_FECHA=DATEADD(YEAR, 1, FEC_FECHA), FEC_ULTIMA_ALERTA_DIAS=NULL WHERE FEC_ID=@id`);
            console.log(`[CLI FECHAS][${tenantKey}] Fecha recurrente ${fec.id} reprogramada al año siguiente`);
          } else {
            await pool.request()
              .input('id', sql.Int, fec.id)
              .query(`UPDATE CLI_FECHAS_IMPORTANTES SET FEC_ESTATUS='vencida' WHERE FEC_ID=@id`);
          }
        }
      } catch (e) {
        console.error(`[CLI FECHAS][${tenantKey}] Error procesando fecha ${fec.id}:`, e.message);
      }
    }
  } catch (e) {
    console.error(`[CLI FECHAS][${tenantKey}] Error consultando fechas importantes:`, e.message);
  }
}

// Cron: todos los días a las 8:00 AM — mismo horario que el resto de crons de
// Seguimiento de Clientes, para consistencia operativa.
cron.schedule('0 8 * * *', () => {
  console.log('[CLI FECHAS] Ejecutando evaluación de fechas importantes...');
  runAlertasFechasImportantes();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await runAlertasFechasImportantes();
    res.json({ success: true, message: 'Evaluación de fechas importantes ejecutada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runAlertasFechasImportantes;
