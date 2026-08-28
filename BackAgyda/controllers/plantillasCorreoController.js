const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// Plantillas de correo: texto reutilizable que el técnico copia y pega en su
// cliente de correo. El sistema NO envía nada automáticamente (Correo no es
// un canal real de creación/respuesta de tickets en este proyecto).

exports.getPlantillas = async (req, res) => {
  try {
    const soloActivas = req.query.activas !== 'false';
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT PC_ID as id, PC_NOMBRE as nombre, PC_ASUNTO as asunto, PC_CONTENIDO as contenido,
             PC_ACTIVA as activa, PC_FECHA_CREACION as fechaCreacion
      FROM TICKETS_PLANTILLAS_CORREO
      ${soloActivas ? 'WHERE PC_ACTIVA = 1' : ''}
      ORDER BY PC_NOMBRE ASC`);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando plantillas de correo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createPlantilla = async (req, res) => {
  try {
    const { nombre, asunto, contenido } = req.body;
    if (!nombre || !contenido) {
      return res.status(400).json({ success: false, message: 'nombre y contenido son requeridos' });
    }
    const userId = req.user?.id || null;
    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('nombre', sql.NVarChar, nombre)
      .input('asunto', sql.NVarChar, asunto || null)
      .input('contenido', sql.NVarChar, contenido)
      .input('creadoPor', sql.Int, userId)
      .query(`INSERT INTO TICKETS_PLANTILLAS_CORREO (PC_NOMBRE, PC_ASUNTO, PC_CONTENIDO, PC_CREADO_POR)
              VALUES (@nombre, @asunto, @contenido, @creadoPor);
              SELECT SCOPE_IDENTITY() as id;`);

    const id = Number(ins.recordset[0].id);
    await logAudit(pool, { userId, userName: req.user?.nombre || null, modulo: 'plantillas_correo', accion: 'crear', entidadId: String(id), detalle: { nombre }, ip: req.ip });
    res.status(201).json({ success: true, data: { id, nombre, asunto: asunto || null, contenido, activa: true } });
  } catch (e) {
    console.error('Error creando plantilla de correo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, asunto, contenido } = req.body;
    if (!nombre || !contenido) {
      return res.status(400).json({ success: false, message: 'nombre y contenido son requeridos' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar, nombre)
      .input('asunto', sql.NVarChar, asunto || null)
      .input('contenido', sql.NVarChar, contenido)
      .query(`UPDATE TICKETS_PLANTILLAS_CORREO SET PC_NOMBRE=@nombre, PC_ASUNTO=@asunto, PC_CONTENIDO=@contenido WHERE PC_ID=@id`);

    if (!upd.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_correo', accion: 'editar', entidadId: String(id), detalle: { nombre }, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando plantilla de correo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleActiva = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const upd = await pool.request().input('id', sql.Int, id)
      .query(`UPDATE TICKETS_PLANTILLAS_CORREO SET PC_ACTIVA = 1 - PC_ACTIVA WHERE PC_ID=@id`);
    if (!upd.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_correo', accion: 'toggle-activa', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de plantilla de correo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deletePlantilla = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const del = await pool.request().input('id', sql.Int, id).query(`DELETE FROM TICKETS_PLANTILLAS_CORREO WHERE PC_ID=@id`);
    if (!del.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Plantilla no encontrada' });
    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'plantillas_correo', accion: 'eliminar', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error eliminando plantilla de correo:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
