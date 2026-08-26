const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Categorías fijas del sistema — siempre disponibles, no se pueden eliminar.
// Las categorías custom creadas por el usuario se guardan en BD y usan un
// ícono genérico en el frontend ya que no hay forma de asignarles uno propio.
const CATEGORIAS_FIJAS = [
  'pantalla', 'monitor', 'mouse', 'teclado', 'router', 'switch',
  'escritorio', 'silla', 'base_lap', 'laptop', 'diadema', 'otro',
];

Promise.all(require('../config/tenants').listTenants().map(({ key }) => databaseService.getPool(key))).then((pools) => {
  pools.forEach((pool) => {
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ACTIVOS_MOB_CATEGORIAS')
      CREATE TABLE ACTIVOS_MOB_CATEGORIAS (
        CAT_ID     INT IDENTITY PRIMARY KEY,
        CAT_VALUE  NVARCHAR(50) NOT NULL UNIQUE,
        CAT_LABEL  NVARCHAR(100) NOT NULL
      )
    `).catch(() => {});
    pool.request().query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='ACTIVOS_MOB_DEPARTAMENTOS')
      CREATE TABLE ACTIVOS_MOB_DEPARTAMENTOS (
        DEP_ID     INT IDENTITY PRIMARY KEY,
        DEP_NOMBRE NVARCHAR(100) NOT NULL UNIQUE
      )
    `).catch(() => {});
  });
}).catch(() => {});

function slugify(label) {
  return String(label).trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
    .slice(0, 50);
}

exports.CATEGORIAS_FIJAS = CATEGORIAS_FIJAS;

/** Devuelve el set de valores de categoría válidos: fijas + custom en BD */
exports.getCategoriasValidas = async (tenantKey) => {
  const pool = await databaseService.getPool(tenantKey);
  const r = await pool.request().query('SELECT CAT_VALUE FROM ACTIVOS_MOB_CATEGORIAS');
  return [...CATEGORIAS_FIJAS, ...r.recordset.map((row) => row.CAT_VALUE)];
};

exports.getCategorias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query('SELECT CAT_ID as id, CAT_VALUE as value, CAT_LABEL as label FROM ACTIVOS_MOB_CATEGORIAS ORDER BY CAT_LABEL');
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('getCategorias:', e);
    return res.status(500).json({ success: false, message: 'Error al obtener categorías' });
  }
};

exports.createCategoria = async (req, res) => {
  try {
    const { label } = req.body || {};
    if (!label || !label.trim())
      return res.status(400).json({ success: false, message: 'Falta el nombre de la categoría' });

    const value = slugify(label);
    if (!value)
      return res.status(400).json({ success: false, message: 'Nombre inválido' });
    if (CATEGORIAS_FIJAS.includes(value))
      return res.status(409).json({ success: false, message: 'Ya existe una categoría del sistema con ese nombre' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const dup = await pool.request()
      .input('value', sql.NVarChar(50), value)
      .query('SELECT 1 FROM ACTIVOS_MOB_CATEGORIAS WHERE CAT_VALUE=@value');
    if (dup.recordset.length > 0)
      return res.status(409).json({ success: false, message: 'Ya existe esa categoría' });

    const ins = await pool.request()
      .input('value', sql.NVarChar(50), value)
      .input('label', sql.NVarChar(100), label.trim())
      .query('INSERT INTO ACTIVOS_MOB_CATEGORIAS (CAT_VALUE, CAT_LABEL) VALUES (@value, @label); SELECT SCOPE_IDENTITY() as id');

    return res.status(201).json({ success: true, data: { id: ins.recordset[0].id, value, label: label.trim() } });
  } catch (e) {
    console.error('createCategoria:', e);
    return res.status(500).json({ success: false, message: 'Error al crear categoría' });
  }
};

exports.getDepartamentos = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = await pool.request().query('SELECT DEP_ID as id, DEP_NOMBRE as nombre FROM ACTIVOS_MOB_DEPARTAMENTOS ORDER BY DEP_NOMBRE');
    return res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('getDepartamentos:', e);
    return res.status(500).json({ success: false, message: 'Error al obtener departamentos' });
  }
};

exports.createDepartamento = async (req, res) => {
  try {
    const { nombre } = req.body || {};
    if (!nombre || !nombre.trim())
      return res.status(400).json({ success: false, message: 'Falta el nombre del departamento' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const dup = await pool.request()
      .input('nombre', sql.NVarChar(100), nombre.trim())
      .query('SELECT 1 FROM ACTIVOS_MOB_DEPARTAMENTOS WHERE LOWER(DEP_NOMBRE)=LOWER(@nombre)');
    if (dup.recordset.length > 0)
      return res.status(409).json({ success: false, message: 'Ya existe ese departamento' });

    const ins = await pool.request()
      .input('nombre', sql.NVarChar(100), nombre.trim())
      .query('INSERT INTO ACTIVOS_MOB_DEPARTAMENTOS (DEP_NOMBRE) VALUES (@nombre); SELECT SCOPE_IDENTITY() as id');

    return res.status(201).json({ success: true, data: { id: ins.recordset[0].id, nombre: nombre.trim() } });
  } catch (e) {
    console.error('createDepartamento:', e);
    return res.status(500).json({ success: false, message: 'Error al crear departamento' });
  }
};
