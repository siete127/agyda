const sql = require('mssql');
const databaseService = require('../services/databaseService');
const notificationService = require('../services/notificationService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const PRIORIDADES = ['baja', 'media', 'alta'];

function notify(req, usuarioId) {
  try {
    socketService.getIO(req.user?.empresa)?.to(`user:${usuarioId}`).emit('tareas-personales:updated', {});
  } catch (_) { /* sin sockets, no bloquea */ }
}

function audit(pool, req, accion, detalle) {
  return logAudit(pool, {
    userId: req.user?.id, userName: req.user?.usuario, modulo: 'tareas-personales',
    accion, detalle: JSON.stringify(detalle), ip: req.ip,
  }).catch(() => {});
}

function mapRow(r) {
  return {
    id: r.TPER_ID,
    titulo: r.TPER_TITULO,
    descripcion: r.TPER_DESCRIPCION,
    asignadoA: r.TPER_ASIGNADO_A,
    asignadoPor: r.TPER_ASIGNADO_POR,
    asignadoPorNombre: r.ASIGNADO_POR_NOMBRE ?? null,
    prioridad: r.TPER_PRIORIDAD,
    fechaLimite: r.TPER_FECHA_LIMITE,
    completada: !!r.TPER_COMPLETADA,
    fechaCreacion: r.TPER_FECHA_CREACION,
    fechaCompletada: r.TPER_FECHA_COMPLETADA,
  };
}

// GET /api/tareas-personales/mis-tareas — solo las personales (sin proyecto) del usuario autenticado
exports.misTareas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        SELECT t.*, u.NEUS_NOMBRES AS ASIGNADO_POR_NOMBRE
        FROM dbo.TAREAS_PERSONALES t
        LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = t.TPER_ASIGNADO_POR
        WHERE t.TPER_ASIGNADO_A = @usuarioId
        ORDER BY t.TPER_COMPLETADA ASC, t.TPER_FECHA_LIMITE ASC, t.TPER_FECHA_CREACION DESC
      `);
    res.json({ success: true, data: result.recordset.map(mapRow) });
  } catch (e) {
    console.error('Error listando mis tareas personales:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/tareas-personales/combinadas — tareas personales + tareas de
// Proyectos asignadas al usuario, para la tarjeta "Mis tareas" del Inicio.
// PROYECTO_TAREAS.PTAR_ASIGNADO_A guarda nombres separados por ", " (no IDs),
// igual que PROYECTO_MIEMBROS — se filtra comparando por NEUS_NOMBRES.
exports.combinadas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const personalesReq = pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        SELECT t.*, u.NEUS_NOMBRES AS ASIGNADO_POR_NOMBRE
        FROM dbo.TAREAS_PERSONALES t
        LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = t.TPER_ASIGNADO_POR
        WHERE t.TPER_ASIGNADO_A = @usuarioId AND t.TPER_COMPLETADA = 0
      `);

    const deProyectosReq = pool.request()
      .input('usuarioId', sql.Int, req.user.id)
      .query(`
        SELECT pt.PTAR_ID AS id, pt.PTAR_TITULO AS titulo, pt.PTAR_FECHA_LIMITE AS fechaLimite,
               pt.PTAR_ESTADO AS estado, p.PROY_ID AS proyectoId, p.PROY_NOMBRE AS proyectoNombre
        FROM dbo.PROYECTO_TAREAS pt
        JOIN dbo.PROYECTOS p ON p.PROY_ID = pt.PTAR_PROY_ID
        CROSS APPLY (SELECT NEUS_NOMBRES FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @usuarioId) u
        WHERE (pt.PTAR_ELIMINADA = 0 OR pt.PTAR_ELIMINADA IS NULL)
          AND pt.PTAR_ESTADO NOT IN ('Completado', 'Cancelado')
          AND (',' + pt.PTAR_ASIGNADO_A + ',') LIKE ('%,' + u.NEUS_NOMBRES + ',%')
      `);

    const [personales, deProyectos] = await Promise.all([personalesReq, deProyectosReq]);

    const tareasPersonales = personales.recordset.map((r) => ({
      ...mapRow(r), origen: 'personal',
    }));
    const tareasProyecto = deProyectos.recordset.map((r) => ({
      id: r.id, titulo: r.titulo, fechaLimite: r.fechaLimite, completada: false,
      origen: 'proyecto', proyectoId: r.proyectoId, proyectoNombre: r.proyectoNombre,
    }));

    res.json({ success: true, data: [...tareasPersonales, ...tareasProyecto] });
  } catch (e) {
    console.error('Error listando tareas combinadas:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// GET /api/tareas-personales — todas las asignadas (solo AD, para administrar)
exports.list = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT t.*, u.NEUS_NOMBRES AS ASIGNADO_POR_NOMBRE, a.NEUS_NOMBRES AS ASIGNADO_A_NOMBRE
      FROM dbo.TAREAS_PERSONALES t
      LEFT JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = t.TPER_ASIGNADO_POR
      LEFT JOIN dbo.NEUS_USUARIOS a ON a.NEUS_ID = t.TPER_ASIGNADO_A
      ORDER BY t.TPER_FECHA_CREACION DESC
    `);
    res.json({
      success: true,
      data: result.recordset.map((r) => ({ ...mapRow(r), asignadoANombre: r.ASIGNADO_A_NOMBRE ?? null })),
    });
  } catch (e) {
    console.error('Error listando tareas personales:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tareas-personales — crear y asignar (solo AD)
exports.create = async (req, res) => {
  try {
    const { titulo, descripcion, asignadoA, prioridad, fechaLimite } = req.body || {};

    const errores = [];
    const tituloLimpio = String(titulo ?? '').trim();
    if (!tituloLimpio || tituloLimpio.length > 200) errores.push('El título es obligatorio (máximo 200 caracteres)');
    const asignadoAId = Number(asignadoA);
    if (!Number.isInteger(asignadoAId) || asignadoAId <= 0) errores.push('Debes seleccionar a quién asignar la tarea');
    const prioridadLimpia = PRIORIDADES.includes(prioridad) ? prioridad : 'media';
    if (errores.length) return res.status(400).json({ success: false, message: errores.join('. ') });

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('titulo', sql.NVarChar, tituloLimpio)
      .input('descripcion', sql.NVarChar, descripcion ? String(descripcion).trim() : null)
      .input('asignadoA', sql.Int, asignadoAId)
      .input('asignadoPor', sql.Int, req.user.id)
      .input('prioridad', sql.VarChar, prioridadLimpia)
      .input('fechaLimite', sql.Date, fechaLimite || null)
      .query(`
        INSERT INTO dbo.TAREAS_PERSONALES
          (TPER_TITULO, TPER_DESCRIPCION, TPER_ASIGNADO_A, TPER_ASIGNADO_POR, TPER_PRIORIDAD, TPER_FECHA_LIMITE)
        OUTPUT INSERTED.*
        VALUES (@titulo, @descripcion, @asignadoA, @asignadoPor, @prioridad, @fechaLimite)
      `);

    const tarea = mapRow(result.recordset[0]);

    await notificationService.createNotification({
      usuarioId: asignadoAId,
      tipo: 'tarea_personal',
      mensaje: `Se te asignó la tarea: "${tituloLimpio}"`,
      dataExtra: { tareaId: tarea.id },
      tenantKey: req.user?.empresa,
    });
    notify(req, asignadoAId);
    await audit(pool, req, 'crear', { tareaId: tarea.id, asignadoA: asignadoAId });

    res.json({ success: true, data: tarea });
  } catch (e) {
    console.error('Error creando tarea personal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// PUT /api/tareas-personales/:id — editar (solo AD)
exports.update = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { titulo, descripcion, asignadoA, prioridad, fechaLimite } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    const sets = [];
    const request = pool.request().input('id', sql.Int, id);
    if (titulo !== undefined) { sets.push('TPER_TITULO = @titulo'); request.input('titulo', sql.NVarChar, String(titulo).trim()); }
    if (descripcion !== undefined) { sets.push('TPER_DESCRIPCION = @descripcion'); request.input('descripcion', sql.NVarChar, descripcion ? String(descripcion).trim() : null); }
    if (asignadoA !== undefined) { sets.push('TPER_ASIGNADO_A = @asignadoA'); request.input('asignadoA', sql.Int, Number(asignadoA)); }
    if (prioridad !== undefined) { sets.push('TPER_PRIORIDAD = @prioridad'); request.input('prioridad', sql.VarChar, PRIORIDADES.includes(prioridad) ? prioridad : 'media'); }
    if (fechaLimite !== undefined) { sets.push('TPER_FECHA_LIMITE = @fechaLimite'); request.input('fechaLimite', sql.Date, fechaLimite || null); }

    if (!sets.length) return res.status(400).json({ success: false, message: 'Nada que actualizar' });

    const result = await request.query(`
      UPDATE dbo.TAREAS_PERSONALES SET ${sets.join(', ')} OUTPUT INSERTED.* WHERE TPER_ID = @id
    `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    const tarea = mapRow(result.recordset[0]);
    notify(req, tarea.asignadoA);
    await audit(pool, req, 'editar', { tareaId: id });
    res.json({ success: true, data: tarea });
  } catch (e) {
    console.error('Error editando tarea personal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// POST /api/tareas-personales/:id/completar — el asignado marca su propio avance
exports.completar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const completada = req.body?.completada !== false;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .input('usuarioId', sql.Int, req.user.id)
      .input('completada', sql.Bit, completada)
      .query(`
        UPDATE dbo.TAREAS_PERSONALES
        SET TPER_COMPLETADA = @completada, TPER_FECHA_COMPLETADA = CASE WHEN @completada = 1 THEN GETDATE() ELSE NULL END
        OUTPUT INSERTED.*
        WHERE TPER_ID = @id AND TPER_ASIGNADO_A = @usuarioId
      `);
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    res.json({ success: true, data: mapRow(result.recordset[0]) });
  } catch (e) {
    console.error('Error completando tarea personal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// DELETE /api/tareas-personales/:id — eliminar (solo AD)
exports.remove = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('id', sql.Int, id)
      .query('DELETE FROM dbo.TAREAS_PERSONALES OUTPUT DELETED.TPER_ASIGNADO_A WHERE TPER_ID = @id');
    if (!result.recordset.length) return res.status(404).json({ success: false, message: 'Tarea no encontrada' });

    notify(req, result.recordset[0].TPER_ASIGNADO_A);
    await audit(pool, req, 'eliminar', { tareaId: id });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando tarea personal:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
