const sql = require('mssql');
const databaseService = require('../services/databaseService');

/** Devuelve true si el usuario puede administrar el proyecto (AD siempre, o líder del proyecto) */
async function puedeAdministrar(pool, proyId, req) {
  const tipo = String(req.headers['x-user-tipo'] || '').toUpperCase();
  if (tipo === 'AD') return true;
  const usuarioId = parseInt(req.headers['usuarioid'] || '0') || null;
  if (!usuarioId) return false;
  const r = await pool.request()
    .input('proyId', sql.Int, proyId)
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
  return r.recordset.length > 0;
}

const ESTATUS_BASE = [
  { nombre: 'Pendiente',   color: '#6B7280', orden: 1 },
  { nombre: 'En progreso', color: '#1B4FD8', orden: 2 },
  { nombre: 'Completada',  color: '#059669', orden: 3 },
];

// Crear tabla PROYECTO_ESTATUS si no existe, en cada empresa configurada
Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='PROYECTO_ESTATUS')
      CREATE TABLE PROYECTO_ESTATUS (
        PEST_ID    INT IDENTITY PRIMARY KEY,
        PEST_PROY_ID INT NOT NULL,
        PEST_NOMBRE  NVARCHAR(100) NOT NULL,
        PEST_COLOR   NVARCHAR(20)  NOT NULL DEFAULT '#6B7280',
        PEST_ORDEN   INT NOT NULL DEFAULT 1
      )
    `).catch(() => {});
  });
}).catch(() => {});

async function seedEstatus(pool, proyId) {
  const check = await pool.request()
    .input('proyId', sql.Int, proyId)
    .query('SELECT COUNT(*) c FROM PROYECTO_ESTATUS WHERE PEST_PROY_ID = @proyId');
  if (check.recordset[0].c > 0) return;
  for (const e of ESTATUS_BASE) {
    await pool.request()
      .input('proyId', sql.Int, proyId)
      .input('nombre', sql.NVarChar, e.nombre)
      .input('color',  sql.NVarChar, e.color)
      .input('orden',  sql.Int, e.orden)
      .query('INSERT INTO PROYECTO_ESTATUS (PEST_PROY_ID,PEST_NOMBRE,PEST_COLOR,PEST_ORDEN) VALUES (@proyId,@nombre,@color,@orden)');
  }
}

exports.getEstatus = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await seedEstatus(pool, Number(id));
    const r = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT PEST_ID as id, PEST_NOMBRE as nombre, PEST_COLOR as color, PEST_ORDEN as orden FROM PROYECTO_ESTATUS WHERE PEST_PROY_ID=@id ORDER BY PEST_ORDEN');
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createEstatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, color } = req.body;
    if (!nombre) return res.status(400).json({ success: false, message: 'Falta nombre' });
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!await puedeAdministrar(pool, Number(id), req))
      return res.status(403).json({ success: false, message: 'Solo el líder o un AD puede gestionar los estatus.' });
    const maxOrden = await pool.request()
      .input('id', sql.Int, id)
      .query('SELECT ISNULL(MAX(PEST_ORDEN),0)+1 as next FROM PROYECTO_ESTATUS WHERE PEST_PROY_ID=@id');
    const orden = maxOrden.recordset[0].next;
    const ins = await pool.request()
      .input('id',     sql.Int,      Number(id))
      .input('nombre', sql.NVarChar, nombre.trim())
      .input('color',  sql.NVarChar, color || '#6B7280')
      .input('orden',  sql.Int,      orden)
      .query('INSERT INTO PROYECTO_ESTATUS (PEST_PROY_ID,PEST_NOMBRE,PEST_COLOR,PEST_ORDEN) VALUES (@id,@nombre,@color,@orden); SELECT SCOPE_IDENTITY() as id');
    return res.status(201).json({ success: true, data: { id: ins.recordset[0].id, nombre: nombre.trim(), color: color || '#6B7280', orden } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateEstatus = async (req, res) => {
  try {
    const { id, estatusId } = req.params;
    const { nombre, color, orden } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!await puedeAdministrar(pool, Number(id), req))
      return res.status(403).json({ success: false, message: 'Solo el líder o un AD puede gestionar los estatus.' });
    await pool.request()
      .input('id',        sql.Int,      Number(id))
      .input('estatusId', sql.Int,      Number(estatusId))
      .input('nombre',    sql.NVarChar, nombre || null)
      .input('color',     sql.NVarChar, color  || null)
      .input('orden',     sql.Int,      orden  != null ? Number(orden) : null)
      .query(`UPDATE PROYECTO_ESTATUS SET
        PEST_NOMBRE = COALESCE(@nombre, PEST_NOMBRE),
        PEST_COLOR  = COALESCE(@color,  PEST_COLOR),
        PEST_ORDEN  = COALESCE(@orden,  PEST_ORDEN)
      WHERE PEST_ID=@estatusId AND PEST_PROY_ID=@id`);
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteEstatus = async (req, res) => {
  try {
    const { id, estatusId } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    if (!await puedeAdministrar(pool, Number(id), req))
      return res.status(403).json({ success: false, message: 'Solo el líder o un AD puede gestionar los estatus.' });
    // No eliminar si hay tareas con ese estatus
    const est = await pool.request()
      .input('estatusId', sql.Int, Number(estatusId))
      .input('id',        sql.Int, Number(id))
      .query('SELECT PEST_NOMBRE FROM PROYECTO_ESTATUS WHERE PEST_ID=@estatusId AND PEST_PROY_ID=@id');
    if (est.recordset.length === 0)
      return res.status(404).json({ success: false, message: 'Estatus no encontrado' });
    const nombre = est.recordset[0].PEST_NOMBRE;
    const tareas = await pool.request()
      .input('proyId', sql.Int, Number(id))
      .input('nombre', sql.NVarChar, nombre)
      .query('SELECT COUNT(*) c FROM PROYECTO_TAREAS WHERE PTAR_PROY_ID=@proyId AND PTAR_ESTADO=@nombre');
    if (tareas.recordset[0].c > 0)
      return res.status(409).json({ success: false, message: `No se puede eliminar: hay ${tareas.recordset[0].c} tarea(s) con este estatus` });
    await pool.request()
      .input('estatusId', sql.Int, Number(estatusId))
      .input('id',        sql.Int, Number(id))
      .query('DELETE FROM PROYECTO_ESTATUS WHERE PEST_ID=@estatusId AND PEST_PROY_ID=@id');
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
