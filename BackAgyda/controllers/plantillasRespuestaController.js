const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// Plantillas de respuesta rápida para tickets: texto reutilizable que un
// técnico inserta directo en un comentario o en el diagnóstico/acciones al
// resolver (dentro de la misma app, a diferencia de las de correo).

exports.getPlantillas = async (req, res) => {
  try {
    const soloActivas = req.query.activas !== 'false';
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT PR_ID as id, PR_NOMBRE as nombre, PR_CONTENIDO as contenido,
             PR_ACTIVA as activa, PR_FECHA_CREACION as fechaCreacion
      FROM TICKETS_PLANTILLAS_RESPUESTA
      ${soloActivas ? 'WHERE PR_ACTIVA = 1' : ''}
      ORDER BY PR_NOMBRE ASC`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando plantillas de respuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createPlantilla = async (req, res) => {
  try {
    const { nombre, contenido } = req.body;
    if (!nombre || !contenido) {
      return res.status(400).json({ success: false, message: 'nombre y contenido son requeridos' });
    }
    const userId = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('contenido', sql.NVarChar, contenido)
      .input('creadoPor', sql.Int, userId)
      .query(`INSERT INTO TICKETS_PLANTILLAS_RESPUESTA (PR_NOMBRE, PR_CONTENIDO, PR_CREADO_POR)
              VALUES (@nombre, @contenido, @creadoPor);
              SELECT SCOPE_IDENTITY() as id;`);

    const id = Number(ins.recordset[0].id);
    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'plantillas_respuesta', accion: 'crear', entidadId: String(id), detalle: { nombre }, ip: req.ip });
    res.status(201).json({ success: true, data: { id, nombre, contenido, activa: true } });
  } catch (e) {
    console.error('Error creando plantilla de respuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, contenido } = req.body;
    if (!nombre || !contenido) {
      return res.status(400).json({ success: false, message: 'nombre y contenido son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('contenido', sql.NVarChar, contenido)
      .query(`UPDATE TICKETS_PLANTILLAS_RESPUESTA SET PR_NOMBRE=@nombre, PR_CONTENIDO=@contenido WHERE PR_ID=@id`);

    if (!upd.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_respuesta', accion: 'editar', entidadId: String(id), detalle: { nombre }, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando plantilla de respuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE TICKETS_PLANTILLAS_RESPUESTA SET PR_ACTIVA = 1 - PR_ACTIVA WHERE PR_ID=@id`);
    if (!upd.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_respuesta', accion: 'toggle-activa', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de plantilla de respuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deletePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const del = await pool.request().input('id', sql.Int, id).query(`DELETE FROM TICKETS_PLANTILLAS_RESPUESTA WHERE PR_ID=@id`);
    if (!del.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_respuesta', accion: 'eliminar', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando plantilla de respuesta:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
