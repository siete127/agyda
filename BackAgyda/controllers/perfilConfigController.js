const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// CRUD de PERFILES = plantillas de datos de usuario (puesto, departamento,
// horario, vacaciones, permisos, rol). Al crear un usuario se elige un perfil
// y esos campos se autocompletan.

exports.listPerfiles = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        p.PERFIL_ID, p.NOMBRE, p.DESCRIPCION, p.ROL_ID, p.PUESTO, p.DEPARTAMENTO,
        p.ID_HORARIO, p.ACTIVO, p.CREADO_EN,
        r.NOMBRE AS ROL_NOMBRE, r.ROL_BASE
      FROM dbo.INTRANET_PERFILES p
      LEFT JOIN dbo.INTRANET_ROLES r ON r.ROL_ID = p.ROL_ID
      ORDER BY p.NOMBRE
    `);
    return res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listPerfiles:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo perfiles' });
  }
};

exports.getPerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`
        SELECT p.*, r.NOMBRE AS ROL_NOMBRE, r.ROL_BASE
        FROM dbo.INTRANET_PERFILES p
        LEFT JOIN dbo.INTRANET_ROLES r ON r.ROL_ID = p.ROL_ID
        WHERE p.PERFIL_ID = @id
      `);
    if (rs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Perfil no encontrado' });
    }
    return res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error getPerfil:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo el perfil' });
  }
};

function normalizeBody(b) {
  const num = (v) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));
  const str = (v) => (v ? String(v).trim() : null);
  return {
    nombre: str(b.nombre),
    descripcion: str(b.descripcion),
    rolId: num(b.rolId),
    puesto: str(b.puesto),
    departamento: str(b.departamento),
    idHorario: num(b.idHorario),
  };
}

exports.createPerfil = async (req, res) => {
  try {
    const d = normalizeBody(req.body);
    if (!d.nombre) return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const dup = await pool.request()
      .input('n', sql.NVarChar, d.nombre)
      .query(`SELECT PERFIL_ID FROM dbo.INTRANET_PERFILES WHERE NOMBRE = @n`);
    if (dup.recordset.length) {
      return res.status(400).json({ success: false, message: 'Ya existe un perfil con ese nombre' });
    }

    const ins = await pool.request()
      .input('nombre', sql.NVarChar, d.nombre)
      .input('desc', sql.NVarChar, d.descripcion)
      .input('rolId', sql.Int, d.rolId)
      .input('puesto', sql.NVarChar, d.puesto)
      .input('depto', sql.NVarChar, d.departamento)
      .input('idHorario', sql.Int, d.idHorario)
      .input('creadoPor', sql.Int, req.user?.id || null)
      .query(`
        INSERT INTO dbo.INTRANET_PERFILES
          (NOMBRE, DESCRIPCION, ROL_ID, PUESTO, DEPARTAMENTO, ID_HORARIO, ACTIVO, CREADO_POR)
        VALUES (@nombre, @desc, @rolId, @puesto, @depto, @idHorario, 1, @creadoPor);
        SELECT SCOPE_IDENTITY() AS PERFIL_ID;
      `);

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'accesos', accion: 'perfil-crear', entidadId: ins.recordset[0].PERFIL_ID,
      detalle: { nombre: d.nombre }, ip: req.ip,
    });
    return res.status(201).json({ success: true, message: 'Perfil creado', data: { perfilId: ins.recordset[0].PERFIL_ID } });
  } catch (e) {
    console.error('Error createPerfil:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.updatePerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const d = normalizeBody(req.body);
    const pool = await databaseService.getPool(req.user?.empresa);

    const ex = await pool.request().input('id', sql.Int, parseInt(id))
      .query(`SELECT PERFIL_ID FROM dbo.INTRANET_PERFILES WHERE PERFIL_ID = @id`);
    if (ex.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Perfil no encontrado' });
    }

    await pool.request()
      .input('id', sql.Int, parseInt(id))
      .input('nombre', sql.NVarChar, d.nombre)
      .input('desc', sql.NVarChar, d.descripcion)
      .input('rolId', sql.Int, d.rolId)
      .input('puesto', sql.NVarChar, d.puesto)
      .input('depto', sql.NVarChar, d.departamento)
      .input('idHorario', sql.Int, d.idHorario)
      .query(`
        UPDATE dbo.INTRANET_PERFILES SET
          NOMBRE       = ISNULL(@nombre, NOMBRE),
          DESCRIPCION  = @desc,
          ROL_ID       = @rolId,
          PUESTO       = @puesto,
          DEPARTAMENTO = @depto,
          ID_HORARIO   = @idHorario
        WHERE PERFIL_ID = @id
      `);

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'accesos', accion: 'perfil-editar', entidadId: parseInt(id),
      detalle: { nombre: d.nombre }, ip: req.ip,
    });
    return res.json({ success: true, message: 'Perfil actualizado' });
  } catch (e) {
    console.error('Error updatePerfil:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.deletePerfil = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const ex = await pool.request().input('id', sql.Int, parseInt(id))
      .query(`SELECT NOMBRE FROM dbo.INTRANET_PERFILES WHERE PERFIL_ID = @id`);
    if (ex.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Perfil no encontrado' });
    }
    await pool.request().input('id', sql.Int, parseInt(id))
      .query(`DELETE FROM dbo.INTRANET_PERFILES WHERE PERFIL_ID = @id`);

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'accesos', accion: 'perfil-eliminar', entidadId: parseInt(id),
      detalle: { nombre: ex.recordset[0].NOMBRE }, ip: req.ip,
    });
    return res.json({ success: true, message: 'Perfil eliminado' });
  } catch (e) {
    console.error('Error deletePerfil:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
