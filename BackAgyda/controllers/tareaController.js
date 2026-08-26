const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const { validateDate } = require('../utils/validators');
const { logAudit } = require('../services/auditService');

/**
 * Obtiene los IDs de usuario del líder, revisor y creador de un proyecto.
 * Devuelve un Set<number> con todos los destinatarios únicos.
 */
async function getDestinatariosProyecto(pool, proyId) {
  const miembrosQ = await pool.request()
    .input('proyId', sql.Int, proyId)
    .query(`
      SELECT u.NEUS_ID as uid
      FROM PROYECTO_MIEMBROS m
      JOIN NEUS_USUARIOS u
        ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
         = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
      WHERE m.PMEM_PROY_ID = @proyId
        AND LOWER(m.PMEM_ROL) IN ('lider','líder','leader','revisor','reviewer')
        AND u.NEUS_ACTIVO = 1
    `);
  const proyQ = await pool.request()
    .input('proyId', sql.Int, proyId)
    .query(`SELECT PROY_CREADOR_ID as creadorId FROM PROYECTOS WHERE PROY_ID = @proyId`);
  const set = new Set(miembrosQ.recordset.map((r) => Number(r.uid)));
  const creadorId = proyQ.recordset[0]?.creadorId;
  if (creadorId) set.add(Number(creadorId));
  return set;
}

/**
 * Notifica a todos los destinatarios de un proyecto (líder, revisor, creador).
 * Excluye al usuario que genera la acción (remitenteId).
 */
async function notificarEquipoProyecto(pool, proyId, { mensaje, tipo, dataExtra, remitenteId, tenantKey }) {
  try {
    const destinatarios = await getDestinatariosProyecto(pool, proyId);
    for (const uid of destinatarios) {
      if (remitenteId && uid === Number(remitenteId)) continue; // no autonotificar
      await notificationService.createNotification({ usuarioId: uid, mensaje, tipo, dataExtra, tenantKey });
    }
  } catch (e) {
    console.warn('⚠️ Error notificando equipo proyecto:', e?.message || e);
  }
}

// Migrar PTAR_ASIGNADO_A de INT a NVARCHAR para soportar múltiples asignados por nombre
Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME='PROYECTO_TAREAS' AND COLUMN_NAME='PTAR_ASIGNADO_A' AND DATA_TYPE='int'
      )
      BEGIN
        ALTER TABLE PROYECTO_TAREAS ALTER COLUMN PTAR_ASIGNADO_A NVARCHAR(500) NULL
      END
    `).catch(() => {});
  });
}).catch(() => {});

exports.getTareas = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const tareas = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT 
        PTAR_ID as id,
        PTAR_TITULO as title,
        PTAR_DESCRIPCION as description,
        PTAR_FECHA_LIMITE as dueDate,
        PTAR_FECHA_INICIO as startDate,
        PTAR_FECHA_FIN as endDate,
        PTAR_ESTADO as status,
        PTAR_PROGRESO as progress,
        PTAR_ASIGNADO_A as assignedTo,
        PTAR_APROBADO_POR as approvedBy,
        PTAR_FECHA_APROBACION as approvalDate,
        PTAR_FECHA_RECHAZO as rejectionDate,
        PTAR_ELIMINADA as eliminada
      FROM PROYECTO_TAREAS 
      WHERE PTAR_PROY_ID = @id AND (PTAR_ELIMINADA = 0 OR PTAR_ELIMINADA IS NULL)
      ORDER BY PTAR_ID DESC`);
    res.json({ success: true, data: tareas.recordset });
  } catch (e) {
    console.error('Error listando tareas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTareasEliminadas = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const tareas = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT 
        PTAR_ID as id,
        PTAR_TITULO as title,
        PTAR_DESCRIPCION as description,
        PTAR_FECHA_LIMITE as dueDate,
        PTAR_FECHA_INICIO as startDate,
        PTAR_FECHA_FIN as endDate,
        PTAR_ESTADO as status,
        PTAR_PROGRESO as progress,
        PTAR_ASIGNADO_A as assignedTo,
        PTAR_APROBADO_POR as approvedBy,
        PTAR_FECHA_APROBACION as approvalDate,
        PTAR_FECHA_RECHAZO as rejectionDate,
        PTAR_ELIMINADA as eliminada
      FROM PROYECTO_TAREAS 
      WHERE PTAR_PROY_ID = @id AND PTAR_ELIMINADA = 1 AND PTAR_ESTADO = 'Completado'
      ORDER BY PTAR_ID DESC`);
    res.json({ success: true, data: tareas.recordset });
  } catch (e) {
    console.error('Error listando tareas eliminadas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getTareaById = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT 
        PTAR_ID as id,
        PTAR_TITULO as title,
        PTAR_DESCRIPCION as description,
        PTAR_FECHA_LIMITE as dueDate,
        PTAR_FECHA_INICIO as startDate,
        PTAR_FECHA_FIN as endDate,
        PTAR_ESTADO as status,
        PTAR_PROGRESO as progress,
        PTAR_ASIGNADO_A as assignedTo,
        PTAR_APROBADO_POR as approvedBy,
        PTAR_FECHA_APROBACION as approvalDate,
        PTAR_FECHA_RECHAZO as rejectionDate
      FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);
    if (r.recordset.length === 0) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    console.error('Error obteniendo tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createTarea = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, descripcion, fechaLimite, estado, progreso, asignadoA, fechaInicio, fechaFin } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Falta título' });

    const pool = await databaseService.getPool(req.user?.empresa);

    // Solo líder o creador del proyecto pueden crear tareas (AD siempre puede)
    const usuarioId = parseInt(req.headers['usuarioid'] || '0') || null;
    const tipoUsuarioHeader = String(req.headers['x-user-tipo'] || '').toUpperCase();
    const esAD = tipoUsuarioHeader === 'AD';

    if (usuarioId && !esAD) {
      const perm = await pool.request()
        .input('proyId', sql.Int, id)
        .input('userId', sql.Int, usuarioId)
        .query(`
          SELECT 1 FROM PROYECTOS WHERE PROY_ID=@proyId AND PROY_CREADOR_ID=@userId
          UNION ALL
          SELECT 1 FROM PROYECTO_MIEMBROS m
            JOIN NEUS_USUARIOS u
              ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
               = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
          WHERE m.PMEM_PROY_ID=@proyId AND u.NEUS_ID=@userId
            AND LOWER(m.PMEM_ROL) IN ('lider','líder','leader')
        `);
      if (perm.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'Solo el líder o creador del proyecto pueden crear tareas.' });
      }
    }
    
    const estadoVal = String(estado || 'todo').toLowerCase();
    let progresoVal = progreso;
    if (progresoVal === null || progresoVal === undefined) {
      switch (estadoVal) {
        case 'done':
        case 'completed': progresoVal = 1.0; break;
        case 'review': progresoVal = 0.8; break;
        case 'in_progress': progresoVal = 0.5; break;
        default: progresoVal = 0.0; break;
      }
    }
    
    const ins = await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('fechaLimite', sql.DateTime, fechaLimite ? new Date(fechaLimite) : null)
      .input('estado', sql.NVarChar, estado || 'todo')
      .input('progreso', sql.Decimal(5,2), progresoVal)
      .input('asignadoA', sql.NVarChar, asignadoA ? String(asignadoA) : null)
      .input('fechaInicio', sql.DateTime, fechaInicio ? new Date(fechaInicio) : null)
      .input('fechaFin', sql.DateTime, fechaFin ? new Date(fechaFin) : null)
      .query(`INSERT INTO PROYECTO_TAREAS (PTAR_PROY_ID, PTAR_TITULO, PTAR_DESCRIPCION, PTAR_FECHA_LIMITE, PTAR_FECHA_INICIO, PTAR_FECHA_FIN, PTAR_ESTADO, PTAR_PROGRESO, PTAR_ASIGNADO_A)
              VALUES (@id, @titulo, @descripcion, @fechaLimite, @fechaInicio, @fechaFin, @estado, @progreso, @asignadoA); SELECT SCOPE_IDENTITY() as id;`);
    
    const st = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) total, SUM(CASE WHEN PTAR_ESTADO IN ('done','completed') THEN 1 ELSE 0 END) done FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id`);
    
    const total = Number(st.recordset[0]?.total || 0);
    const done = Number(st.recordset[0]?.done || 0);
    if (total > 0 && done === total) {
      await pool.request().input('id', sql.Int, id).query(`UPDATE PROYECTOS SET PROY_ESTADO = 'done' WHERE PROY_ID = @id`);
    } else {
      await pool.request().input('id', sql.Int, id).query(`UPDATE PROYECTOS SET PROY_ESTADO = 'in_progress' WHERE PROY_ID = @id`);
    }
    
    const tareaInsertId = ins.recordset[0].id;

    // 1. Notificar a los asignados directamente
    try {
      if (asignadoA) {
        const nombres = String(asignadoA).split(',').map((n) => n.trim()).filter(Boolean);
        for (const nombre of nombres) {
          const ur = await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_NOMBRES=@nombre AND NEUS_ACTIVO=1`);
          if (ur.recordset.length) {
            await notificationService.createNotification({
              usuarioId: ur.recordset[0].NEUS_ID,
              tipo: 'tarea',
              mensaje: `Se te asignó la tarea: "${String(titulo).slice(0, 80)}"`,
              dataExtra: { proyectoId: Number(id), tareaId: tareaInsertId },
              tenantKey: req.user?.empresa,
            });
          }
        }
      }
    } catch (e) { console.warn('Error notificando asignados (createTarea):', e?.message); }

    // 2. Notificar al líder, revisor y creador del proyecto
    const proyNomQ = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PROY_NOMBRE FROM PROYECTOS WHERE PROY_ID=@id`);
    const proyNombre = proyNomQ.recordset[0]?.PROY_NOMBRE ?? 'Proyecto';
    await notificarEquipoProyecto(pool, Number(id), {
      mensaje: `📋 Nueva tarea creada: "${String(titulo).slice(0, 80)}" · ${proyNombre}`,
      tipo: 'tarea',
      dataExtra: { proyectoId: Number(id), tareaId: tareaInsertId },
      remitenteId: usuarioId,
      tenantKey: req.user?.empresa,
    });

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tareas', accion:'crear', entidadId: String(tareaInsertId||''), detalle:{ titulo, proyectoId: req.params.id }, ip:req.ip });
    res.status(201).json({ success: true, data: { id: tareaInsertId } });
  } catch (e) {
    console.error('Error agregando tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateTarea = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const { titulo, descripcion, fechaLimite, estado, asignadoA, eliminada, fechaInicio, fechaFin } = req.body;

    const asignadoAStr = (asignadoA !== undefined && asignadoA !== null && String(asignadoA).trim() !== '') ? String(asignadoA).trim() : null;

    const pool = await databaseService.getPool(req.user?.empresa);

    // Verificar permisos
    const usuarioId = parseInt(req.headers['usuarioid'] || '0') || null;
    const tipoUsuarioHeader = String(req.headers['x-user-tipo'] || '').toUpperCase();
    const esAD = tipoUsuarioHeader === 'AD';
    const soloEstado = Object.keys(req.body).every((k) => k === 'estado'); // solo cambia el estado

    if (usuarioId && !esAD) {
      // Revisor puede mover (solo cambio de estado), pero no editar datos
      const permQuery = soloEstado
        ? `SELECT 1 FROM PROYECTOS WHERE PROY_ID=@proyId AND PROY_CREADOR_ID=@userId
           UNION ALL
           SELECT 1 FROM PROYECTO_MIEMBROS m
             JOIN NEUS_USUARIOS u
               ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
                = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
           WHERE m.PMEM_PROY_ID=@proyId AND u.NEUS_ID=@userId
             AND LOWER(m.PMEM_ROL) IN ('lider','líder','leader','revisor','reviewer')`
        : `SELECT 1 FROM PROYECTOS WHERE PROY_ID=@proyId AND PROY_CREADOR_ID=@userId
           UNION ALL
           SELECT 1 FROM PROYECTO_MIEMBROS m
             JOIN NEUS_USUARIOS u
               ON u.NEUS_NOMBRES COLLATE SQL_Latin1_General_CP1_CI_AI
                = m.PMEM_NOMBRE  COLLATE SQL_Latin1_General_CP1_CI_AI
           WHERE m.PMEM_PROY_ID=@proyId AND u.NEUS_ID=@userId
             AND LOWER(m.PMEM_ROL) IN ('lider','líder','leader')`;
      const perm = await pool.request()
        .input('proyId', sql.Int, id)
        .input('userId', sql.Int, usuarioId)
        .query(permQuery);
      if (perm.recordset.length === 0) {
        return res.status(403).json({ success: false, message: 'No tienes permiso para modificar esta tarea.' });
      }
    }

    // Obtener asignado previo
    const prev = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT PTAR_ASIGNADO_A as prevAsignado FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    // Construir SET dinámico: solo actualizar los campos que vienen en el body
    const body = req.body;
    const sets = [];
    const req2 = pool.request()
      .input('id',      sql.Int, id)
      .input('tareaId', sql.Int, tareaId);

    if ('titulo'      in body) { req2.input('titulo',      sql.NVarChar,  titulo || null);                           sets.push('PTAR_TITULO = COALESCE(@titulo, PTAR_TITULO)'); }
    if ('descripcion' in body) { req2.input('descripcion', sql.NVarChar,  descripcion ?? null);                      sets.push('PTAR_DESCRIPCION = @descripcion'); }
    if ('fechaLimite' in body) { req2.input('fechaLimite', sql.DateTime,  fechaLimite ? new Date(fechaLimite) : null); sets.push('PTAR_FECHA_LIMITE = @fechaLimite'); }
    if ('fechaInicio' in body) { req2.input('fechaInicio', sql.DateTime,  fechaInicio ? new Date(fechaInicio) : null); sets.push('PTAR_FECHA_INICIO = @fechaInicio'); }
    if ('fechaFin'    in body) { req2.input('fechaFin',    sql.DateTime,  fechaFin ? new Date(fechaFin) : null);      sets.push('PTAR_FECHA_FIN = @fechaFin'); }
    if ('estado'      in body) { req2.input('estado',      sql.NVarChar,  estado || null);                           sets.push('PTAR_ESTADO = COALESCE(@estado, PTAR_ESTADO)'); }
    if ('asignadoA'   in body) { req2.input('asignadoA',   sql.NVarChar,  asignadoAStr);                             sets.push('PTAR_ASIGNADO_A = @asignadoA'); }
    if ('eliminada'   in body) { req2.input('eliminada',   sql.Bit,       eliminada === true ? 1 : 0);               sets.push('PTAR_ELIMINADA = @eliminada'); }

    if (sets.length === 0) return res.json({ success: true, data: {} });

    const resultUpdate = await req2.query(
      `UPDATE PROYECTO_TAREAS SET ${sets.join(', ')} WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);
    
    const st = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) total, SUM(CASE WHEN PTAR_ESTADO IN ('done','completed') THEN 1 ELSE 0 END) done FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id`);
    
    const total = Number(st.recordset[0]?.total || 0);
    const done = Number(st.recordset[0]?.done || 0);
    if (total > 0 && done === total) {
      await pool.request().input('id', sql.Int, id).query(`UPDATE PROYECTOS SET PROY_ESTADO = 'done' WHERE PROY_ID = @id`);
    } else {
      await pool.request().input('id', sql.Int, id).query(`UPDATE PROYECTOS SET PROY_ESTADO = 'in_progress' WHERE PROY_ID = @id AND PROY_ESTADO = 'done'`);
    }
    
    const tareaActualizada = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT 
        PTAR_ID as id,
        PTAR_TITULO as titulo,
        PTAR_DESCRIPCION as descripcion,
        PTAR_FECHA_LIMITE as fechaLimite,
        PTAR_FECHA_INICIO as fechaInicio,
        PTAR_FECHA_FIN as fechaFin,
        PTAR_ESTADO as estado,
        PTAR_PROGRESO as progreso,
        PTAR_ASIGNADO_A as asignadoA,
        PTAR_APROBADO_POR as aprobadoPor,
        PTAR_FECHA_APROBACION as fechaAprobacion,
        PTAR_FECHA_RECHAZO as fechaRechazo
      FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);
    
    if (!tareaActualizada.recordset || tareaActualizada.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada después de actualizar.' });
    }

    const tituloTarea = tareaActualizada.recordset[0]?.titulo || titulo || 'Tarea';
    const proyNomQ2 = await pool.request().input('id', sql.Int, id)
      .query(`SELECT PROY_NOMBRE FROM PROYECTOS WHERE PROY_ID=@id`);
    const proyNombre2 = proyNomQ2.recordset[0]?.PROY_NOMBRE ?? 'Proyecto';

    // Notificar si cambió la asignación
    try {
      const prevAsignado = prev.recordset[0]?.prevAsignado ?? null;
      if (asignadoAStr && asignadoAStr !== prevAsignado) {
        const nombres = asignadoAStr.split(',').map((n) => n.trim()).filter(Boolean);
        for (const nombre of nombres) {
          const ur = await pool.request()
            .input('nombre', sql.NVarChar, nombre)
            .query(`SELECT TOP 1 NEUS_ID FROM NEUS_USUARIOS WHERE NEUS_NOMBRES=@nombre AND NEUS_ACTIVO=1`);
          if (ur.recordset.length) {
            await notificationService.createNotification({
              usuarioId: ur.recordset[0].NEUS_ID,
              tipo: 'tarea',
              mensaje: `Se te asignó la tarea: "${String(tituloTarea).slice(0, 80)}"`,
              dataExtra: { proyectoId: Number(id), tareaId: Number(tareaId) },
              tenantKey: req.user?.empresa,
            });
          }
        }
      }
    } catch (e) { console.warn('Error notificando asignados (updateTarea):', e?.message); }

    // Notificar al equipo si cambió el estado (movimiento de columna)
    if (estado) {
      await notificarEquipoProyecto(pool, Number(id), {
        mensaje: `🔄 Tarea movida a "${estado}": "${String(tituloTarea).slice(0, 70)}" · ${proyNombre2}`,
        tipo: 'tarea',
        dataExtra: { proyectoId: Number(id), tareaId: Number(tareaId) },
        remitenteId: usuarioId,
        tenantKey: req.user?.empresa,
      });
    }

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tareas', accion:'editar', entidadId: req.params.tareaId, detalle:{ titulo, proyectoId: req.params.id }, ip:req.ip });
    return res.json({ success: true, data: tareaActualizada.recordset[0] });
  } catch (e) {
    console.error('Error actualizando tarea:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
    

// Aprueba una tarea
exports.approveTarea = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const { aprobadoPor } = req.body; // usuario ID que aprueba
    if (aprobadoPor !== undefined && isNaN(parseInt(aprobadoPor))) {
      return res.status(400).json({ success: false, message: 'aprobadoPor debe ser numérico' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .input('aprobadoPor', sql.Int, aprobadoPor ? parseInt(aprobadoPor) : null)
      .input('fechaAprobacion', sql.DateTime, new Date())
      .query(`UPDATE PROYECTO_TAREAS SET 
        PTAR_ESTADO = 'Aprobado',
        PTAR_APROBADO_POR = @aprobadoPor,
        PTAR_FECHA_APROBACION = @fechaAprobacion,
        PTAR_FECHA_RECHAZO = NULL
      WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT PTAR_ID as id, PTAR_ESTADO as estado, PTAR_APROBADO_POR as aprobadoPor, PTAR_FECHA_APROBACION as fechaAprobacion FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tareas', accion:'aprobar', entidadId: req.params.tareaId, detalle:{ proyectoId: req.params.id }, ip:req.ip });
    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    console.error('Error aprobando tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Rechaza una tarea
exports.rejectTarea = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .input('fechaRechazo', sql.DateTime, new Date())
      .query(`UPDATE PROYECTO_TAREAS SET 
        PTAR_ESTADO = 'Rechazado',
        PTAR_FECHA_RECHAZO = @fechaRechazo,
        PTAR_FECHA_APROBACION = NULL,
        PTAR_APROBADO_POR = NULL
      WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT PTAR_ID as id, PTAR_ESTADO as estado, PTAR_FECHA_RECHAZO as fechaRechazo FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tareas', accion:'rechazar', entidadId: req.params.tareaId, detalle:{ proyectoId: req.params.id }, ip:req.ip });
    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    console.error('Error rechazando tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Actualiza fechas de inicio y fin
exports.updateTareaFechas = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const { fechaInicio, fechaFin } = req.body;
    if (fechaInicio && !validateDate(fechaInicio)) {
      return res.status(400).json({ success: false, message: 'fechaInicio inválida' });
    }
    if (fechaFin && !validateDate(fechaFin)) {
      return res.status(400).json({ success: false, message: 'fechaFin inválida' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .input('fechaInicio', sql.DateTime, fechaInicio ? new Date(fechaInicio) : null)
      .input('fechaFin', sql.DateTime, fechaFin ? new Date(fechaFin) : null)
      .query(`UPDATE PROYECTO_TAREAS SET 
        PTAR_FECHA_INICIO = @fechaInicio,
        PTAR_FECHA_FIN = @fechaFin
      WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    const r = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT PTAR_ID as id, PTAR_FECHA_INICIO as fechaInicio, PTAR_FECHA_FIN as fechaFin FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id`);

    res.json({ success: true, data: r.recordset[0] });
  } catch (e) {
    console.error('Error actualizando fechas de tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

/**
 * POST /proyectos/:id/tareas/:tareaId/completar
 * Notifica al líder, revisor y creador que un usuario marcó la tarea como lista para revisar.
 */
exports.completarTarea = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const remitenteId = parseInt(req.headers['usuarioid'] || '0') || null;
    const pool = await databaseService.getPool(req.user?.empresa);

    const tareaQ = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query(`SELECT PTAR_TITULO FROM PROYECTO_TAREAS WHERE PTAR_ID=@tareaId AND PTAR_PROY_ID=@id`);
    if (tareaQ.recordset.length === 0)
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    const titulo = tareaQ.recordset[0].PTAR_TITULO;
    const proyQ = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT PROY_NOMBRE FROM PROYECTOS WHERE PROY_ID=@id`);
    const proyNombre = proyQ.recordset[0]?.PROY_NOMBRE ?? 'Proyecto';

    await notificarEquipoProyecto(pool, Number(id), {
      mensaje: `✅ Tarea lista para revisar: "${String(titulo).slice(0, 80)}" · ${proyNombre}`,
      tipo: 'tarea_completada',
      dataExtra: { proyectoId: Number(id), tareaId: Number(tareaId) },
      remitenteId,
      tenantKey: req.user?.empresa,
    });

    return res.json({ success: true });
  } catch (e) {
    console.error('Error en completarTarea:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteTarea = async (req, res) => {
  try {
    const { id, tareaId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    
    const chk = await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query('SELECT PTAR_ID FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id');
    
    if (chk.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }
    
    await pool.request()
      .input('id', sql.Int, id)
      .input('tareaId', sql.Int, tareaId)
      .query('DELETE FROM PROYECTO_TAREAS WHERE PTAR_ID = @tareaId AND PTAR_PROY_ID = @id');
    
    const st = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(*) total, SUM(CASE WHEN PTAR_ESTADO IN ('done','completed') THEN 1 ELSE 0 END) done FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID = @id`);
    
    const total = Number(st.recordset[0]?.total || 0);
    const done = Number(st.recordset[0]?.done || 0);
    if (total > 0 && done !== total) {
      await pool.request().input('id', sql.Int, id).query(`UPDATE PROYECTOS SET PROY_ESTADO = 'in_progress' WHERE PROY_ID = @id AND PROY_ESTADO = 'done'`);
    }
    
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo:'tareas', accion:'eliminar', entidadId: req.params.tareaId, detalle:{ proyectoId: req.params.id }, ip:req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando tarea:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};