const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const { listTenants } = require('../config/tenants');

// Motor de SLA de las incidencias de cliente (CASOS tipo 'incidencia') —
// equivalente al ticketSlaCronController de TI. Cada 10 min revisa las
// incidencias abiertas:
//   - En riesgo (>= 80% del tiempo de SLA consumido, aún no vencido): avisa al asignado.
//   - Vencida (fecha límite SLA < ahora): avisa al asignado + supervisores y
//     escala el estatus a 'escalado'.
// Los BIT CASO_SLA_RIESGO_NOTIF / CASO_SLA_VENCIDO_NOTIF evitan repetir el aviso.
// No se pausa el reloj en 'en_espera_cliente'.
//
// Fase 9 del rediseño de Atención al Cliente: se retiró la mitad que corría
// sobre CLI_INCIDENCIAS (tabla legacy, ya sin escrituras ni controlador). La
// tabla SQL se conserva como respaldo histórico.

const UMBRAL_RIESGO = 0.8;

async function notificarCanales(pool, tenantKey, { usuarioId, tipo, mensaje, dataExtra, emailFn }) {
  if (!usuarioId) return;
  try {
    await notificationService.createNotification({ usuarioId, mensaje, tipo, dataExtra, tenantKey });
  } catch (e) {
    console.warn(`[CASO INC SLA][${tenantKey}] notif interna ${tipo} u${usuarioId}:`, e.message);
  }
  try {
    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT NEUS_NOMBRES AS nombre, NEUS_CORREO AS correo FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
    const u = rs.recordset[0];
    if (u && u.correo && emailFn) await emailFn(u);
  } catch (e) {
    console.warn(`[CASO INC SLA][${tenantKey}] correo ${tipo} u${usuarioId}:`, e.message);
  }
}

async function runSlaCheckCasosTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CASO INC SLA][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  let casos;
  try {
    casos = await pool.request().query(`
      SELECT k.CASO_ID AS id, k.CASO_FOLIO AS folio, k.CASO_TITULO AS titulo, k.CASO_PRIORIDAD AS prioridad,
             k.CASO_ESTATUS AS estatus, k.CASO_ASIGNADO_A AS asignadoA,
             k.CASO_SLA_HORAS AS slaHoras, k.CASO_FECHA_CREACION AS fechaCreacion,
             k.CASO_FECHA_LIMITE_SLA AS fechaLimiteSla,
             k.CASO_SLA_RIESGO_NOTIF AS riesgoNotif, k.CASO_SLA_VENCIDO_NOTIF AS vencidoNotif,
             DATEDIFF(MINUTE, k.CASO_FECHA_CREACION, GETDATE()) AS minutosTranscurridos,
             c.CONT_NOMBRE AS contactoNombre
      FROM CASOS k
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = k.CASO_CONTACTO_ID
      WHERE k.CASO_ACTIVO = 1
        AND k.CASO_TIPO = 'incidencia'
        AND k.CASO_ESTATUS NOT IN ('resuelto','cerrado')
        AND k.CASO_FECHA_LIMITE_SLA IS NOT NULL
    `);
  } catch (e) {
    console.error(`[CASO INC SLA][${tenantKey}] Error consultando casos:`, e.message);
    return;
  }

  let supervisores = null;
  const getSupervisores = async () => {
    if (supervisores === null) {
      try { supervisores = await getUsuariosParaNotificarCorreo('atencion-cliente', tenantKey); }
      catch { supervisores = []; }
    }
    return supervisores;
  };

  for (const c of casos.recordset) {
    const vencida = c.fechaLimiteSla && new Date(c.fechaLimiteSla) < new Date();
    const minSla = (c.slaHoras || 0) * 60;
    const ratio = minSla > 0 ? c.minutosTranscurridos / minSla : 0;

    try {
      if (vencida) {
        if (c.vencidoNotif) continue;

        const destinatarios = new Set();
        if (c.asignadoA) destinatarios.add(c.asignadoA);
        for (const s of await getSupervisores()) destinatarios.add(s);

        for (const uid of destinatarios) {
          await notificarCanales(pool, tenantKey, {
            usuarioId: uid,
            tipo: 'cliente-incidencia-sla-vencido',
            mensaje: `SLA vencido: incidencia ${c.folio} — ${c.titulo}`,
            dataExtra: { casoId: c.id, folio: c.folio },
            emailFn: (u) => emailService.sendIncidenciaSlaEmail({
              nombre: u.nombre, correo: u.correo, folio: c.folio, titulo: c.titulo,
              contactoNombre: c.contactoNombre, prioridad: c.prioridad,
              fechaLimiteSla: c.fechaLimiteSla, nivel: 'vencido',
            }),
          });
        }

        await pool.request().input('id', sql.Int, c.id).query(`
          UPDATE CASOS
          SET CASO_SLA_VENCIDO_NOTIF = 1,
              CASO_ESTATUS = CASE WHEN CASO_ESTATUS IN ('pendiente','en_proceso','en_espera_cliente')
                                  THEN 'escalado' ELSE CASO_ESTATUS END
          WHERE CASO_ID = @id
        `);
        continue;
      }

      if (!c.riesgoNotif && ratio >= UMBRAL_RIESGO) {
        await notificarCanales(pool, tenantKey, {
          usuarioId: c.asignadoA,
          tipo: 'cliente-incidencia-sla-riesgo',
          mensaje: `SLA en riesgo: incidencia ${c.folio} — ${c.titulo}`,
          dataExtra: { casoId: c.id, folio: c.folio },
          emailFn: (u) => emailService.sendIncidenciaSlaEmail({
            nombre: u.nombre, correo: u.correo, folio: c.folio, titulo: c.titulo,
            contactoNombre: c.contactoNombre, prioridad: c.prioridad,
            fechaLimiteSla: c.fechaLimiteSla, nivel: 'riesgo',
          }),
        });
        await pool.request().input('id', sql.Int, c.id)
          .query(`UPDATE CASOS SET CASO_SLA_RIESGO_NOTIF = 1 WHERE CASO_ID = @id`);
      }
    } catch (e) {
      console.error(`[CASO INC SLA][${tenantKey}] Error procesando caso ${c.id}:`, e.message);
    }
  }
}

async function runSlaCheck() {
  for (const { key } of listTenants()) {
    await runSlaCheckCasosTenant(key);
  }
}

cron.schedule('*/10 * * * *', () => {
  console.log('[CASO INC SLA] Evaluando SLA de incidencias (casos) abiertas...');
  runSlaCheck();
});

exports.runNow = async (req, res) => {
  try {
    await runSlaCheck();
    res.json({ success: true, message: 'Chequeo de SLA de incidencias ejecutado' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runSlaCheck;
