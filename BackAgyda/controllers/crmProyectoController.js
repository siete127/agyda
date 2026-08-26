const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { logAudit } = require('../services/auditService');

const TAREAS_INICIALES = ['Seguimiento al cliente', 'Preparar propuesta'];
const ROLES_VALIDOS = new Set(['lider', 'miembro', 'revisor']);

function getUserId(req) {
  return req.user && (req.user.id || req.user.userId || req.user.NEUS_ID)
    ? parseInt(req.user.id || req.user.userId || req.user.NEUS_ID, 10)
    : null;
}

// Crea un proyecto de seguimiento en el módulo Proyectos a partir de una
// oportunidad del CRM, con los integrantes y roles elegidos manualmente
// (body.miembros: [{ nombre, rol }]) y 2 tareas iniciales fijas asignadas al
// líder del equipo. Si no se manda miembros, cae al fallback automático:
// asignado de la oportunidad, o quien la creó, como líder único.
// Idempotente: si la oportunidad ya tiene OPO_PROYECTO_ID, no crea un proyecto nuevo.
exports.generarProyectoDesdeOportunidad = async (req, res) => {
  let transaction;
  try {
    const opoId = parseInt(req.params.id, 10);
    if (!Number.isFinite(opoId)) {
      return res.status(400).json({ success: false, message: 'opoId inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const opoResult = await pool.request()
      .input('opoId', sql.Int, opoId)
      .query(`
        SELECT o.OPO_ID as id, o.OPO_NOMBRE as nombre, o.OPO_PROYECTO_ID as proyectoId,
               o.OPO_ASIGNADO_A as asignadoA, o.OPO_CREADO_POR as creadoPor,
               c.CONT_NOMBRE as contactoNombre, c.CONT_EMPRESA as contactoEmpresa
        FROM CRM_OPORTUNIDADES o
        LEFT JOIN CRM_CONTACTOS c ON c.CONT_ID = o.OPO_CONTACTO_ID
        WHERE o.OPO_ID = @opoId AND o.OPO_ACTIVO = 1
      `);
    if (!opoResult.recordset.length) {
      return res.status(404).json({ success: false, message: 'Oportunidad no encontrada' });
    }
    const opo = opoResult.recordset[0];

    if (opo.proyectoId) {
      return res.status(409).json({ success: false, message: 'Esta oportunidad ya tiene un proyecto vinculado', proyectoId: opo.proyectoId });
    }

    const nombreProyecto = (req.body?.nombreProyecto && String(req.body.nombreProyecto).trim()) || opo.nombre;

    // Miembros elegidos manualmente en el modal: [{ nombre, rol }]
    let miembros = Array.isArray(req.body?.miembros)
      ? req.body.miembros
          .map((m) => ({
            nombre: String(m?.nombre || '').trim(),
            rol: ROLES_VALIDOS.has(String(m?.rol || '').toLowerCase()) ? String(m.rol).toLowerCase() : 'miembro',
          }))
          .filter((m) => m.nombre)
      : [];

    // Fallback: sin miembros elegidos, usar el asignado de la oportunidad (o su creador) como líder
    if (!miembros.length) {
      const responsableId = opo.asignadoA || opo.creadoPor || null;
      if (responsableId) {
        const userResult = await pool.request()
          .input('id', sql.Int, responsableId)
          .query(`SELECT TOP 1 NEUS_NOMBRES FROM NEUS_USUARIOS WHERE NEUS_ID = @id AND NEUS_ACTIVO = 1`);
        const nombre = userResult.recordset[0]?.NEUS_NOMBRES;
        if (nombre) miembros = [{ nombre, rol: 'lider' }];
      }
    }

    // Responsable de las 2 tareas iniciales: el líder si hay uno, si no el primer miembro
    const lider = miembros.find((m) => m.rol === 'lider') || miembros[0] || null;
    const asignadoTareas = lider ? lider.nombre : null;

    const cliente = opo.contactoEmpresa || opo.contactoNombre || null;
    const creadorId = getUserId(req);

    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const proyIns = await new sql.Request(transaction)
      .input('nombre', sql.NVarChar, nombreProyecto)
      .input('descripcion', sql.NVarChar, `Proyecto generado automáticamente desde la oportunidad CRM "${opo.nombre}"`)
      .input('cliente', sql.NVarChar, cliente)
      .input('creadorId', sql.Int, creadorId)
      .query(`
        INSERT INTO PROYECTOS (PROY_NOMBRE, PROY_DESCRIPCION, PROY_FECHA_INICIO, PROY_ESTADO, PROY_CLIENTE, PROY_CREADOR_ID)
        VALUES (@nombre, @descripcion, GETDATE(), 'Activo', @cliente, @creadorId);
        SELECT SCOPE_IDENTITY() as id;
      `);
    const proyectoId = proyIns.recordset[0].id;

    for (const m of miembros) {
      await new sql.Request(transaction)
        .input('proyId', sql.Int, proyectoId)
        .input('nombre', sql.NVarChar, m.nombre)
        .input('rol', sql.NVarChar, m.rol)
        .query(`INSERT INTO PROYECTO_MIEMBROS (PMEM_PROY_ID, PMEM_NOMBRE, PMEM_ROL) VALUES (@proyId, @nombre, @rol)`);
    }

    for (const titulo of TAREAS_INICIALES) {
      await new sql.Request(transaction)
        .input('proyId', sql.Int, proyectoId)
        .input('titulo', sql.NVarChar, titulo)
        .input('estado', sql.NVarChar, 'todo')
        .input('progreso', sql.Decimal(5, 2), 0)
        .input('asignadoA', sql.NVarChar, asignadoTareas)
        .query(`
          INSERT INTO PROYECTO_TAREAS (PTAR_PROY_ID, PTAR_TITULO, PTAR_ESTADO, PTAR_PROGRESO, PTAR_ASIGNADO_A)
          VALUES (@proyId, @titulo, @estado, @progreso, @asignadoA)
        `);
    }

    await new sql.Request(transaction)
      .input('opoId', sql.Int, opoId)
      .input('proyId', sql.Int, proyectoId)
      .query(`UPDATE CRM_OPORTUNIDADES SET OPO_PROYECTO_ID = @proyId WHERE OPO_ID = @opoId`);

    await transaction.commit();

    // Notificar a cada miembro agregado (resolviendo su id por nombre, igual que proyectoController.createProyecto)
    try {
      for (const m of miembros) {
        const r = await pool.request()
          .input('nombre', sql.NVarChar, m.nombre)
          .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_NOMBRES=@nombre AND NEUS_ACTIVO=1`);
        if (r.recordset.length) {
          await notificationService.createNotification({
            usuarioId: r.recordset[0].NEUS_ID,
            tipo: 'proyecto',
            mensaje: `Se te asignó al proyecto "${nombreProyecto}" (como ${m.rol}), generado desde la oportunidad CRM "${opo.nombre}"`,
            dataExtra: { proyectoId, opoId },
            tenantKey: req.user?.empresa,
          });
        }
      }
    } catch (notifyErr) {
      console.warn('Error notificación (generarProyectoDesdeOportunidad):', notifyErr);
    }

    await logAudit(pool, {
      userId: creadorId, userName: req.user?.nombre || null,
      modulo: 'crm', accion: 'generar-proyecto', entidadId: String(proyectoId),
      detalle: { opoId, nombreProyecto }, ip: req.ip,
    });

    res.status(201).json({ success: true, proyectoId });
  } catch (e) {
    if (transaction) await transaction.rollback();
    console.error('Error generarProyectoDesdeOportunidad:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
