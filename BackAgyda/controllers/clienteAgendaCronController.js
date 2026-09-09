const sql = require('mssql');
const cron = require('node-cron');
const databaseService = require('../services/databaseService');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const { getUsuariosParaNotificarCorreo } = require('../middleware/moduleAccess');
const { listTenants } = require('../config/tenants');

// Agenda de seguimiento a clientes — una corrida diaria (08:00 America/Mexico_City,
// mismo horario que el resto de crons del módulo) con tres responsabilidades:
//   1. Recordar tareas de cliente con fecha-hora (aviso previo + al vencer).
//   2. Recordar los seguimientos de la bitácora con "próxima fecha" que llegó a hoy.
//   3. Avisar de clientes sin ningún seguimiento en los últimos N días.
// Notifica siempre por notificación interna + socket + web push, y por correo si
// el destinatario tiene NEUS_CORREO.

const DIAS_INACTIVIDAD = 30;          // umbral "cliente sin contacto"
const DIAS_ANTISPAM_INACTIVIDAD = 30; // no repetir el aviso de inactividad más de 1 vez cada N días

// Notifica a un usuario por los 3 canales. `emailFn(usuario)` recibe { nombre, correo }.
async function notificarCanales(pool, tenantKey, { usuarioId, tipo, mensaje, dataExtra, emailFn }) {
  if (!usuarioId) return;
  try {
    await notificationService.createNotification({ usuarioId, mensaje, tipo, dataExtra, tenantKey });
  } catch (e) {
    console.warn(`[CLI AGENDA][${tenantKey}] notif interna ${tipo} u${usuarioId}:`, e.message);
  }
  try {
    const rs = await pool.request().input('uid', sql.Int, usuarioId)
      .query(`SELECT NEUS_NOMBRES AS nombre, NEUS_CORREO AS correo FROM NEUS_USUARIOS WHERE NEUS_ID = @uid`);
    const u = rs.recordset[0];
    if (u && u.correo && emailFn) await emailFn(u);
  } catch (e) {
    console.warn(`[CLI AGENDA][${tenantKey}] correo ${tipo} u${usuarioId}:`, e.message);
  }
}

// ── 1. Recordatorio de tareas ─────────────────────────────────────────────
async function runRecordatorioTareas(pool, tenantKey) {
  // Aviso previo: entramos en la ventana "recordarme X antes" y aún no vence.
  try {
    const previas = await pool.request().query(`
      SELECT t.TAR_ID AS id, t.TAR_TITULO AS titulo, t.TAR_TIPO AS tipo, t.TAR_PRIORIDAD AS prioridad,
             t.TAR_ASIGNADO_A AS asignadoA, t.TAR_FECHA_HORA AS fechaHora,
             c.CONT_NOMBRE AS contactoNombre
      FROM CLI_TAREAS t
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = t.TAR_CONTACTO_ID
      WHERE t.TAR_ACTIVO = 1
        AND t.TAR_ESTATUS NOT IN ('completada','cancelada')
        AND t.TAR_ASIGNADO_A IS NOT NULL
        AND t.TAR_ALERTA_PREVIA_NOTIF = 0
        AND t.TAR_FECHA_HORA IS NOT NULL
        AND t.TAR_RECORDAR_MIN_ANTES IS NOT NULL
        AND GETDATE() >= DATEADD(MINUTE, -t.TAR_RECORDAR_MIN_ANTES, t.TAR_FECHA_HORA)
        AND GETDATE() < t.TAR_FECHA_HORA
    `);
    for (const t of previas.recordset) {
      await notificarCanales(pool, tenantKey, {
        usuarioId: t.asignadoA,
        tipo: 'cliente-tarea-vence',
        mensaje: `Recordatorio: ${t.titulo}${t.contactoNombre ? ` — ${t.contactoNombre}` : ''}`,
        dataExtra: { tareaId: t.id, contactoNombre: t.contactoNombre, fase: 'previa' },
        emailFn: (u) => emailService.sendRecordatorioTareaEmail({
          asignadoNombre: u.nombre, asignadoCorreo: u.correo, titulo: t.titulo, tipo: t.tipo,
          prioridad: t.prioridad, contactoNombre: t.contactoNombre, fechaHora: t.fechaHora, fase: 'previa',
        }),
      });
      await pool.request().input('id', sql.Int, t.id)
        .query(`UPDATE CLI_TAREAS SET TAR_ALERTA_PREVIA_NOTIF = 1 WHERE TAR_ID = @id`);
    }
  } catch (e) {
    console.error(`[CLI AGENDA][${tenantKey}] Error en aviso previo de tareas:`, e.message);
  }

  // Al vencer: la fecha-hora (o la fecha de vencimiento sin hora) ya pasó.
  try {
    const vencidas = await pool.request().query(`
      SELECT t.TAR_ID AS id, t.TAR_TITULO AS titulo, t.TAR_TIPO AS tipo, t.TAR_PRIORIDAD AS prioridad,
             t.TAR_ASIGNADO_A AS asignadoA,
             COALESCE(t.TAR_FECHA_HORA, CAST(t.TAR_FECHA_VENCIMIENTO AS DATETIME)) AS fechaHora,
             c.CONT_NOMBRE AS contactoNombre
      FROM CLI_TAREAS t
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = t.TAR_CONTACTO_ID
      WHERE t.TAR_ACTIVO = 1
        AND t.TAR_ESTATUS NOT IN ('completada','cancelada')
        AND t.TAR_ASIGNADO_A IS NOT NULL
        AND t.TAR_ALERTA_VENCE_NOTIF = 0
        AND COALESCE(t.TAR_FECHA_HORA, CAST(t.TAR_FECHA_VENCIMIENTO AS DATETIME)) IS NOT NULL
        AND COALESCE(t.TAR_FECHA_HORA, CAST(t.TAR_FECHA_VENCIMIENTO AS DATETIME)) <= GETDATE()
    `);
    for (const t of vencidas.recordset) {
      await notificarCanales(pool, tenantKey, {
        usuarioId: t.asignadoA,
        tipo: 'cliente-tarea-vence',
        mensaje: `Tarea vencida: ${t.titulo}${t.contactoNombre ? ` — ${t.contactoNombre}` : ''}`,
        dataExtra: { tareaId: t.id, contactoNombre: t.contactoNombre, fase: 'vence' },
        emailFn: (u) => emailService.sendRecordatorioTareaEmail({
          asignadoNombre: u.nombre, asignadoCorreo: u.correo, titulo: t.titulo, tipo: t.tipo,
          prioridad: t.prioridad, contactoNombre: t.contactoNombre, fechaHora: t.fechaHora, fase: 'vence',
        }),
      });
      await pool.request().input('id', sql.Int, t.id)
        .query(`UPDATE CLI_TAREAS SET TAR_ALERTA_VENCE_NOTIF = 1 WHERE TAR_ID = @id`);
    }
  } catch (e) {
    console.error(`[CLI AGENDA][${tenantKey}] Error en aviso de tareas vencidas:`, e.message);
  }
}

// ── 2. Próxima fecha de seguimiento ───────────────────────────────────────
async function runProximaFechaSeguimiento(pool, tenantKey) {
  try {
    // Se toma el seguimiento más reciente por contacto (el que fija la próxima
    // fecha vigente). Solo se avisa una vez (SEG_ALERTA_PROXIMA_NOTIF IS NULL).
    const rs = await pool.request().query(`
      WITH Ultimo AS (
        SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s.SEG_CONTACTO_ID ORDER BY s.SEG_FECHA DESC) AS rn
        FROM CLI_SEGUIMIENTOS s
        WHERE s.SEG_ACTIVO = 1
      )
      SELECT u.SEG_ID AS id, u.SEG_CONTACTO_ID AS contactoId, u.SEG_USUARIO_ID AS usuarioId,
             CONVERT(NVARCHAR(10), u.SEG_PROXIMA_FECHA, 23) AS proximaFecha,
             u.SEG_MOTIVO AS motivo, u.SEG_ACUERDOS AS acuerdos,
             c.CONT_NOMBRE AS contactoNombre
      FROM Ultimo u
      INNER JOIN CRM_CONTACTOS c ON c.CONT_ID = u.SEG_CONTACTO_ID
      WHERE u.rn = 1
        AND u.SEG_PROXIMA_FECHA IS NOT NULL
        AND u.SEG_PROXIMA_FECHA <= CAST(GETDATE() AS DATE)
        AND u.SEG_USUARIO_ID IS NOT NULL
        AND u.SEG_ALERTA_PROXIMA_NOTIF IS NULL
    `);
    for (const s of rs.recordset) {
      await notificarCanales(pool, tenantKey, {
        usuarioId: s.usuarioId,
        tipo: 'cliente-seguimiento-hoy',
        mensaje: `Seguimiento pendiente hoy: ${s.contactoNombre}`,
        dataExtra: { seguimientoId: s.id, contactoId: s.contactoId },
        emailFn: (u) => emailService.sendProximaFechaSeguimientoEmail({
          usuarioNombre: u.nombre, usuarioCorreo: u.correo, contactoNombre: s.contactoNombre,
          proximaFecha: s.proximaFecha, motivo: s.motivo, acuerdos: s.acuerdos,
        }),
      });
      await pool.request().input('id', sql.Int, s.id)
        .query(`UPDATE CLI_SEGUIMIENTOS SET SEG_ALERTA_PROXIMA_NOTIF = GETDATE() WHERE SEG_ID = @id`);
    }
  } catch (e) {
    console.error(`[CLI AGENDA][${tenantKey}] Error en próxima fecha de seguimiento:`, e.message);
  }
}

// ── 3. Inactividad de clientes ────────────────────────────────────────────
async function runInactividadClientes(pool, tenantKey) {
  try {
    const rs = await pool.request()
      .input('dias', sql.Int, DIAS_INACTIVIDAD)
      .input('antispam', sql.Int, DIAS_ANTISPAM_INACTIVIDAD)
      .query(`
        SELECT c.CONT_ID AS contactoId, c.CONT_NOMBRE AS contactoNombre,
               c.CONT_RESPONSABLE_ID AS responsableId,
               MAX(s.SEG_FECHA) AS ultimoSeguimiento
        FROM CRM_CONTACTOS c
        LEFT JOIN CLI_SEGUIMIENTOS s ON s.SEG_CONTACTO_ID = c.CONT_ID AND s.SEG_ACTIVO = 1
        WHERE c.CONT_ES_CLIENTE = 1 AND c.CONT_ACTIVO = 1
          AND (c.CONT_ULTIMA_ALERTA_INACTIVIDAD IS NULL
               OR c.CONT_ULTIMA_ALERTA_INACTIVIDAD < DATEADD(DAY, -@antispam, GETDATE()))
        GROUP BY c.CONT_ID, c.CONT_NOMBRE, c.CONT_RESPONSABLE_ID
        HAVING MAX(s.SEG_FECHA) IS NULL OR MAX(s.SEG_FECHA) < DATEADD(DAY, -@dias, GETDATE())
      `);

    if (!rs.recordset.length) return;

    // Fallback cuando el cliente no tiene responsable asignado.
    let supervisores = null;
    const getSupervisores = async () => {
      if (supervisores === null) {
        try { supervisores = await getUsuariosParaNotificarCorreo('atencion-cliente', tenantKey); }
        catch { supervisores = []; }
      }
      return supervisores;
    };

    for (const c of rs.recordset) {
      const dias = c.ultimoSeguimiento
        ? Math.floor((Date.now() - new Date(c.ultimoSeguimiento).getTime()) / 86400000)
        : DIAS_INACTIVIDAD;
      const destinatarios = c.responsableId ? [c.responsableId] : await getSupervisores();

      for (const uid of destinatarios) {
        await notificarCanales(pool, tenantKey, {
          usuarioId: uid,
          tipo: 'cliente-inactivo',
          mensaje: `${c.contactoNombre} lleva ${dias} días sin seguimiento`,
          dataExtra: { contactoId: c.contactoId, diasSinContacto: dias },
          emailFn: (u) => emailService.sendClienteInactivoEmail({
            responsableNombre: u.nombre, responsableCorreo: u.correo, contactoNombre: c.contactoNombre,
            diasSinContacto: dias, ultimoSeguimiento: c.ultimoSeguimiento,
          }),
        });
      }
      // Sellar aunque no haya habido destinatarios: respeta la ventana anti-spam.
      await pool.request().input('id', sql.Int, c.contactoId)
        .query(`UPDATE CRM_CONTACTOS SET CONT_ULTIMA_ALERTA_INACTIVIDAD = GETDATE() WHERE CONT_ID = @id`);
    }
  } catch (e) {
    console.error(`[CLI AGENDA][${tenantKey}] Error en inactividad de clientes:`, e.message);
  }
}

async function runAgendaTenant(tenantKey) {
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.error(`[CLI AGENDA][${tenantKey}] Sin pool:`, e.message);
    return;
  }
  await runRecordatorioTareas(pool, tenantKey);
  await runProximaFechaSeguimiento(pool, tenantKey);
  await runInactividadClientes(pool, tenantKey);
}

async function runAgenda() {
  for (const { key } of listTenants()) {
    await runAgendaTenant(key);
  }
}

cron.schedule('0 8 * * *', () => {
  console.log('[CLI AGENDA] Ejecutando agenda de seguimiento a clientes...');
  runAgenda();
}, { timezone: 'America/Mexico_City' });

exports.runNow = async (req, res) => {
  try {
    await runAgenda();
    res.json({ success: true, message: 'Agenda de seguimiento ejecutada' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.init = runAgenda;
