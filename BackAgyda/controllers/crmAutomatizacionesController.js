const sql       = require('mssql');
const nodemailer = require('nodemailer');
const cron       = require('node-cron');
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.SMTP_PORT || '465'),
  secure: (process.env.SMTP_SECURE || 'true') === 'true',
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
});

async function sendAlert(to, subject, body) {
  if (!to) return;
  try {
    await transporter.sendMail({
      from:    `"CRM AGYDA" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to, subject,
      html: body.replace(/\n/g, '<br>'),
    });
  } catch (e) {
    console.error('[CRM AUTO] Error email:', e.message);
  }
}

async function runAutomatizaciones() {
  for (const { key } of listTenants()) {
    await runAutomatizacionesTenant(key);
  }
}

async function runAutomatizacionesTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CRM AUTO][${tenantKey}] Sin pool:`, e.message); return;
  }

  // 1. Oportunidades sin actividad en 7+ días → crea tarea de seguimiento
  try {
    const inactivas = await pool.request().query(`
      SELECT o.OPO_ID as id, o.OPO_NOMBRE as nombre,
             u.NEUS_NOMBRES as responsable,
             o.OPO_ASIGNADO_A as asignadoA,
             DATEDIFF(DAY,
               ISNULL((SELECT MAX(INT_FECHA) FROM CRM_INTERACCIONES WHERE INT_OPO_ID=o.OPO_ID),o.OPO_FECHA),
               GETDATE()
             ) as diasSinActividad
      FROM CRM_OPORTUNIDADES o
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
      WHERE o.OPO_ACTIVO = 1
        AND o.OPO_ETAPA NOT IN ('ganado','perdido')
        AND DATEDIFF(DAY,
              ISNULL((SELECT MAX(INT_FECHA) FROM CRM_INTERACCIONES WHERE INT_OPO_ID=o.OPO_ID),o.OPO_FECHA),
              GETDATE()
            ) >= 7
        AND NOT EXISTS (
          SELECT 1 FROM CRM_ACTIVIDADES
          WHERE ACT_OPO_ID = o.OPO_ID
            AND ACT_COMPLETADA = 0
            AND ACT_TIPO = 'tarea'
            AND ACT_DESCRIPCION = 'Seguimiento automático — sin actividad reciente'
        )
    `);
    for (const opo of inactivas.recordset) {
      await pool.request()
        .input('opoId', sql.Int,      opo.id)
        .input('uid',   sql.Int,      opo.asignadoA || null)
        .query(`
          INSERT INTO CRM_ACTIVIDADES (ACT_OPO_ID,ACT_TIPO,ACT_DESCRIPCION,ACT_ASIGNADO_A)
          VALUES (@opoId,'tarea','Seguimiento automático — sin actividad reciente',@uid)
        `);
      await pool.request()
        .input('opoId',   sql.Int,      opo.id)
        .input('content', sql.NVarChar, `Alerta automática: ${opo.diasSinActividad} días sin actividad`)
        .query(`
          INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_NOMBRE)
          VALUES (@opoId,'nota',@content,'Sistema')
        `);
      console.log(`[CRM AUTO] Tarea seguimiento creada para oportunidad ${opo.id} (${opo.diasSinActividad}d sin actividad)`);
    }
  } catch (e) {
    console.error('[CRM AUTO] Error inactivas:', e.message);
  }

  // 2. Oportunidades con fecha de cierre vencida → notificar responsable
  try {
    const vencidas = await pool.request().query(`
      SELECT o.OPO_ID as id, o.OPO_NOMBRE as nombre,
             CONVERT(NVARCHAR(10), o.OPO_FECHA_CIERRE, 23) as fechaCierre,
             u.NEUS_NOMBRES as responsable
      FROM CRM_OPORTUNIDADES o
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
      WHERE o.OPO_ACTIVO = 1
        AND o.OPO_ETAPA NOT IN ('ganado','perdido')
        AND o.OPO_FECHA_CIERRE < CAST(GETDATE() AS DATE)
        AND NOT EXISTS (
          SELECT 1 FROM CRM_INTERACCIONES
          WHERE INT_OPO_ID = o.OPO_ID
            AND INT_TIPO = 'nota'
            AND INT_CONTENIDO LIKE 'Alerta automática: fecha de cierre vencida%'
            AND CAST(INT_FECHA AS DATE) = CAST(GETDATE() AS DATE)
        )
    `);
    for (const opo of vencidas.recordset) {
      await pool.request()
        .input('opoId',   sql.Int,      opo.id)
        .input('content', sql.NVarChar, `Alerta automática: fecha de cierre vencida (${opo.fechaCierre})`)
        .query(`
          INSERT INTO CRM_INTERACCIONES (INT_OPO_ID,INT_TIPO,INT_CONTENIDO,INT_USUARIO_NOMBRE)
          VALUES (@opoId,'nota',@content,'Sistema')
        `);
    }
    if (vencidas.recordset.length) console.log(`[CRM AUTO] ${vencidas.recordset.length} oportunidades con cierre vencido notificadas`);
  } catch (e) {
    console.error('[CRM AUTO] Error vencidas:', e.message);
  }
}

// Cron: todos los días a las 8:00 AM
cron.schedule('0 8 * * *', () => {
  console.log('[CRM AUTO] Ejecutando automatizaciones...');
  runAutomatizaciones();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await runAutomatizaciones();
    res.json({ success: true, message: 'Automatizaciones ejecutadas' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runAutomatizaciones;
