const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const { listTenants } = require('../config/tenants');

// Motor de SLA de las incidencias de cliente (CLI_INCIDENCIAS) — equivalente al
// ticketSlaCronController de TI. Cada 10 min revisa las incidencias abiertas:
//   - En riesgo (>= 80% del tiempo de SLA consumido, aún no vencido): avisa al asignado.
//   - Vencida (INC_FECHA_LIMITE_SLA < ahora): avisa al asignado + supervisores y
//     escala el estatus a 'escalado'.
// Los BIT INC_SLA_RIESGO_NOTIF / INC_SLA_VENCIDO_NOTIF evitan repetir el aviso.
// No se pausa el reloj en 'en_espera_cliente' (CLI_INCIDENCIAS no lleva acumulado
// de espera, a diferencia de TICKETS).

const UMBRAL_RIESGO = 0.8;

async function notificarCanales(pool, tenantKey, { usuarioId, tipo, mensaje, dataExtra, emailFn }) {
  if (!usuarioId) return;
  try {
    await notificationService.createNotification({ usuarioId, mensaje, tipo, dataExtra, tenantKey });
  } catch (e) {
    console.warn(`[CLI INC SLA][${tenantKey}] notif interna ${tipo} u${usuarioId}:`, e.message);
  }
  try {
    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT NEUS_NOMBRES AS nombre, NEUS_CORREO AS correo FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
    const u = rs.recordset[0];
    if (u && u.correo && emailFn) await emailFn(u);
  } catch (e) {
    console.warn(`[CLI INC SLA][${tenantKey}] correo ${tipo} u${usuarioId}:`, e.message);
  }
}

async function runSlaCheckTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CLI INC SLA][${tenantKey}] Sin pool:`, e.message);
    return;
  }

  let incidencias;
  try {
    incidencias = await pool.request().query(`
      SELECT i.INC_ID AS id, i.INC_FOLIO AS folio, i.INC_TITULO AS titulo, i.INC_PRIORIDAD AS prioridad,
             i.INC_ESTATUS AS estatus, i.INC_ASIGNADO_A AS asignadoA,
             i.INC_SLA_HORAS AS slaHoras, i.INC_FECHA_CREACION AS fechaCreacion,
             i.INC_FECHA_LIMITE_SLA AS fechaLimiteSla,
             i.INC_SLA_RIESGO_NOTIF AS riesgoNotif, i.INC_SLA_VENCIDO_NOTIF AS vencidoNotif,
             DATEDIFF(MINUTE, i.INC_FECHA_CREACION, GETDATE()) AS minutosTranscurridos,
             c.CONT_NOMBRE AS contactoNombre
      FROM CLI_INCIDENCIAS i
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = i.INC_CONTACTO_ID
      WHERE i.INC_ACTIVO = 1
        AND i.INC_ESTATUS NOT IN ('resuelto','cerrado')
        AND i.INC_FECHA_LIMITE_SLA IS NOT NULL
    `);
  } catch (e) {
    console.error(`[CLI INC SLA][${tenantKey}] Error consultando incidencias:`, e.message);
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

  for (const inc of incidencias.recordset) {
    const vencida = inc.fechaLimiteSla && new Date(inc.fechaLimiteSla) < new Date();
    const minSla = (inc.slaHoras || 0) * 60;
    const ratio = minSla > 0 ? inc.minutosTranscurridos / minSla : 0;

    try {
      if (vencida) {
        if (inc.vencidoNotif) continue;

        const destinatarios = new Set();
        if (inc.asignadoA) destinatarios.add(inc.asignadoA);
        for (const s of await getSupervisores()) destinatarios.add(s);

        for (const uid of destinatarios) {
          await notificarCanales(pool, tenantKey, {
            usuarioId: uid,
            tipo: 'cliente-incidencia-sla-vencido',
            mensaje: `SLA vencido: incidencia ${inc.folio} — ${inc.titulo}`,
            dataExtra: { incidenciaId: inc.id, folio: inc.folio },
            emailFn: (u) => emailService.sendIncidenciaSlaEmail({
              nombre: u.nombre, correo: u.correo, folio: inc.folio, titulo: inc.titulo,
              contactoNombre: inc.contactoNombre, prioridad: inc.prioridad,
              fechaLimiteSla: inc.fechaLimiteSla, nivel: 'vencido',
            }),
          });
        }

        await pool.request().input('id', sql.Int, inc.id).query(`
          UPDATE CLI_INCIDENCIAS
          SET INC_SLA_VENCIDO_NOTIF = 1,
              INC_ESTATUS = CASE WHEN INC_ESTATUS IN ('pendiente','en_proceso','en_espera_cliente')
                                 THEN 'escalado' ELSE INC_ESTATUS END
          WHERE INC_ID = @id
        `);
        continue;
      }

      if (!inc.riesgoNotif && ratio >= UMBRAL_RIESGO) {
        await notificarCanales(pool, tenantKey, {
          usuarioId: inc.asignadoA,
          tipo: 'cliente-incidencia-sla-riesgo',
          mensaje: `SLA en riesgo: incidencia ${inc.folio} — ${inc.titulo}`,
          dataExtra: { incidenciaId: inc.id, folio: inc.folio },
          emailFn: (u) => emailService.sendIncidenciaSlaEmail({
            nombre: u.nombre, correo: u.correo, folio: inc.folio, titulo: inc.titulo,
            contactoNombre: inc.contactoNombre, prioridad: inc.prioridad,
            fechaLimiteSla: inc.fechaLimiteSla, nivel: 'riesgo',
          }),
        });
        await pool.request().input('id', sql.Int, inc.id)
          .query(`UPDATE CLI_INCIDENCIAS SET INC_SLA_RIESGO_NOTIF = 1 WHERE INC_ID = @id`);
      }
    } catch (e) {
      console.error(`[CLI INC SLA][${tenantKey}] Error procesando incidencia ${inc.id}:`, e.message);
    }
  }
}

async function runSlaCheck() {
  for (const { key } of listTenants()) {
    await runSlaCheckTenant(key);
  }
}

cron.schedule('*/10 * * * *', () => {
  console.log('[CLI INC SLA] Evaluando SLA de incidencias de cliente abiertas...');
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
