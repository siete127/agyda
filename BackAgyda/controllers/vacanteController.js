const sql = require('mssql');
const databaseService = require('../services/databaseService');
const socketService = require('../services/socketService');
const { logAudit } = require('../services/auditService');

const MODALIDADES_VALIDAS = ['remoto', 'presencial', 'hibrido'];

const SELECT_VACANTE = `
  SELECT
    VAC_ID as id,
    VAC_TITULO as titulo,
    VAC_DESCRIPCION as descripcion,
    VAC_REQUISITOS as requisitos,
    VAC_UBICACION as ubicacion,
    VAC_MODALIDAD as modalidad,
    VAC_TIPO_CONTRATO as tipoContrato,
    VAC_SALARIO as salario,
    VAC_AUTOR_ID as autorId,
    VAC_AUTOR_NOMBRE as autorNombre,
    VAC_FECHA_CREACION as fechaCreacion,
    VAC_FECHA_ACTUALIZACION as fechaActualizacion,
    VAC_FECHA_LIMITE as fechaLimite,
    VAC_ACTIVO as activo
  FROM dbo.INTRANET_VACANTES
`;

exports.getVacantes = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

    const pool = await databaseService.getPool(req.user?.empresa);
    const includeInactive = String(req.query.includeInactive || req.query.all || '0').toLowerCase();
    const showAll = includeInactive === '1' || includeInactive === 'true' || includeInactive === 'yes';
    const whereClause = showAll ? '1=1' : 'VAC_ACTIVO = 1';

    const result = await pool.request().query(`
      ${SELECT_VACANTE}
      WHERE ${whereClause}
      ORDER BY VAC_FECHA_CREACION DESC
    `);

    res.json({ success: true, data: result.recordset });
  } catch (error) {
    console.error('Error obteniendo vacantes:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getVacanteById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('id', sql.Int, id)
      .query(`${SELECT_VACANTE} WHERE VAC_ID = @id`);

    if (result.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Vacante no encontrada' });
    }

    res.json({ success: true, data: result.recordset[0] });
  } catch (error) {
    console.error('Error obteniendo vacante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createVacante = async (req, res) => {
  try {
    const {
      titulo,
      descripcion,
      requisitos,
      ubicacion,
      modalidad,
      tipoContrato,
      salario,
      fechaLimite,
    } = req.body;

    if (!titulo || !descripcion) {
      return res.status(400).json({ success: false, message: 'Faltan campos requeridos: titulo, descripcion' });
    }

    const modalidadValida = MODALIDADES_VALIDAS.includes(modalidad) ? modalidad : null;
    const autorId = req.user?.id || null;
    const autorNombre = req.user?.nombre || null;

    const pool = await databaseService.getPool(req.user?.empresa);

    const result = await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('requisitos', sql.NVarChar, requisitos || null)
      .input('ubicacion', sql.NVarChar, ubicacion || null)
      .input('modalidad', sql.NVarChar, modalidadValida)
      .input('tipoContrato', sql.NVarChar, tipoContrato || null)
      .input('salario', sql.NVarChar, salario || null)
      .input('autorId', sql.Int, autorId)
      .input('autorNombre', sql.NVarChar, autorNombre)
      .input('fechaLimite', sql.DateTime, fechaLimite || null)
      .input('activo', sql.Bit, true)
      .query(`
        INSERT INTO dbo.INTRANET_VACANTES (
          VAC_TITULO, VAC_DESCRIPCION, VAC_REQUISITOS, VAC_UBICACION, VAC_MODALIDAD,
          VAC_TIPO_CONTRATO, VAC_SALARIO, VAC_AUTOR_ID, VAC_AUTOR_NOMBRE,
          VAC_FECHA_CREACION, VAC_FECHA_LIMITE, VAC_ACTIVO
        )
        VALUES (
          @titulo, @descripcion, @requisitos, @ubicacion, @modalidad,
          @tipoContrato, @salario, @autorId, @autorNombre,
          GETDATE(), @fechaLimite, @activo
        );
        SELECT SCOPE_IDENTITY() as id;
      `);

    const vacanteId = result.recordset[0].id;

    const creada = await pool.request()
      .input('id', sql.Int, vacanteId)
      .query(`${SELECT_VACANTE} WHERE VAC_ID = @id`);

    const data = creada.recordset[0];

    try {
      socketService.getIO(req.user?.empresa).emit('vacante:created', data);
    } catch (e) {
      console.warn('⚠️ No se pudo emitir vacante:created:', e?.message || e);
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'crear', entidadId: String(vacanteId || ''), detalle: { titulo }, ip: req.ip });
    res.status(201).json({ success: true, data });
  } catch (error) {
    console.error('Error creando vacante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateVacante = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      titulo,
      descripcion,
      requisitos,
      ubicacion,
      modalidad,
      tipoContrato,
      salario,
      fechaLimite,
      activo,
    } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);

    const existing = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT VAC_ID FROM dbo.INTRANET_VACANTES WHERE VAC_ID = @id');

    if (existing.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Vacante no encontrada' });
    }

    const modalidadValida = MODALIDADES_VALIDAS.includes(modalidad) ? modalidad : null;

    await pool.request()
      .input('id', sql.Int, id)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion)
      .input('requisitos', sql.NVarChar, requisitos || null)
      .input('ubicacion', sql.NVarChar, ubicacion || null)
      .input('modalidad', sql.NVarChar, modalidadValida)
      .input('tipoContrato', sql.NVarChar, tipoContrato || null)
      .input('salario', sql.NVarChar, salario || null)
      .input('fechaLimite', sql.DateTime, fechaLimite || null)
      .input('activo', sql.Bit, activo !== false)
      .query(`
        UPDATE dbo.INTRANET_VACANTES
        SET
          VAC_TITULO = @titulo,
          VAC_DESCRIPCION = @descripcion,
          VAC_REQUISITOS = @requisitos,
          VAC_UBICACION = @ubicacion,
          VAC_MODALIDAD = @modalidad,
          VAC_TIPO_CONTRATO = @tipoContrato,
          VAC_SALARIO = @salario,
          VAC_FECHA_LIMITE = @fechaLimite,
          VAC_FECHA_ACTUALIZACION = GETDATE(),
          VAC_ACTIVO = @activo
        WHERE VAC_ID = @id
      `);

    const actualizada = await pool.request()
      .input('id', sql.Int, id)
      .query(`${SELECT_VACANTE} WHERE VAC_ID = @id`);

    const data = actualizada.recordset[0];

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('vacante:updated', data);
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'editar', entidadId: req.params.id, detalle: { titulo }, ip: req.ip });
    res.json({ success: true, data });
  } catch (error) {
    console.error('Error actualizando vacante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteVacante = async (req, res) => {
  try {
    const { id } = req.params;
    const { permanent } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const check = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT VAC_ID, VAC_ACTIVO FROM dbo.INTRANET_VACANTES WHERE VAC_ID = @id');

    if (check.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Vacante no encontrada' });
    }

    const isActive = check.recordset[0].VAC_ACTIVO;

    if (permanent === '1' || !isActive) {
      await pool.request()
        .input('id', sql.Int, id)
        .query('DELETE FROM dbo.INTRANET_VACANTES WHERE VAC_ID = @id');

      if (socketService.getIO(req.user?.empresa)) {
        socketService.getIO(req.user?.empresa).emit('vacante:deleted', { id: parseInt(id), permanent: true });
      }

      await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'eliminar', entidadId: req.params.id, detalle: { permanent: true }, ip: req.ip });
      res.json({ success: true, message: 'Vacante eliminada permanentemente', permanent: true });
    } else {
      await pool.request()
        .input('id', sql.Int, id)
        .query('UPDATE dbo.INTRANET_VACANTES SET VAC_ACTIVO = 0, VAC_FECHA_ACTUALIZACION = GETDATE() WHERE VAC_ID = @id');

      if (socketService.getIO(req.user?.empresa)) {
        socketService.getIO(req.user?.empresa).emit('vacante:hidden', { id: parseInt(id), activo: false });
      }

      await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: 'ocultar', entidadId: req.params.id, detalle: { permanent: false }, ip: req.ip });
      res.json({ success: true, message: 'Vacante despublicada', permanent: false });
    }
  } catch (error) {
    console.error('Error eliminando vacante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('activo', sql.Bit, activo === true)
      .query(`
        UPDATE dbo.INTRANET_VACANTES
        SET VAC_ACTIVO = @activo, VAC_FECHA_ACTUALIZACION = GETDATE()
        WHERE VAC_ID = @id
      `);

    if (socketService.getIO(req.user?.empresa)) {
      socketService.getIO(req.user?.empresa).emit('vacante:toggleActivo', { id: parseInt(id), activo });
    }

    await logAudit(pool, { userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'vacantes', accion: activo ? 'publicar' : 'despublicar', entidadId: req.params.id, detalle: {}, ip: req.ip });
    res.json({ success: true, message: 'Estado actualizado' });
  } catch (error) {
    console.error('Error cambiando estado activo de vacante:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
