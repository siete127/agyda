const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { getCategoriasValidas } = require('./activoMobiliarioCatalogoController');

const ESTADOS_VALIDOS = ['disponible', 'asignado', 'reparacion', 'baja'];
const PROPIETARIOS_VALIDOS = ['ROSA', 'ARDABYTEC', 'MIXTO'];

let columnasAseguradas = null;
async function ensureMobiliarioColumns(pool) {
  if (columnasAseguradas) return columnasAseguradas;
  columnasAseguradas = (async () => {
    const alters = [
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ACTIVOS_MOBILIARIO' AND COLUMN_NAME='MOB_CANTIDAD')
       ALTER TABLE dbo.ACTIVOS_MOBILIARIO ADD MOB_CANTIDAD INT NOT NULL CONSTRAINT DF_MOB_CANTIDAD DEFAULT 1`,
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ACTIVOS_MOBILIARIO' AND COLUMN_NAME='MOB_VALOR')
       ALTER TABLE dbo.ACTIVOS_MOBILIARIO ADD MOB_VALOR DECIMAL(10,2) NULL`,
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ACTIVOS_MOBILIARIO' AND COLUMN_NAME='MOB_PROVEEDOR')
       ALTER TABLE dbo.ACTIVOS_MOBILIARIO ADD MOB_PROVEEDOR NVARCHAR(100) NULL`,
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ACTIVOS_MOBILIARIO' AND COLUMN_NAME='MOB_FECHA_COMPRA')
       ALTER TABLE dbo.ACTIVOS_MOBILIARIO ADD MOB_FECHA_COMPRA NVARCHAR(30) NULL`,
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='ACTIVOS_MOBILIARIO' AND COLUMN_NAME='MOB_PROPIETARIO')
       ALTER TABLE dbo.ACTIVOS_MOBILIARIO ADD MOB_PROPIETARIO NVARCHAR(20) NULL`,
    ];
    for (const stmt of alters) {
      await pool.request().query(stmt);
    }
  })();
  return columnasAseguradas;
}

exports.getMobiliario = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureMobiliarioColumns(pool);
    const result = await pool.request().query(`
      SELECT
        m.MOB_ID            AS id,
        m.MOB_CATEGORIA     AS categoria,
        m.MOB_MARCA         AS marca,
        m.MOB_MODELO        AS modelo,
        m.MOB_NUMERO_SERIE  AS numeroSerie,
        m.MOB_COLOR         AS color,
        m.MOB_UBICACION     AS ubicacion,
        m.MOB_DEPARTAMENTO  AS departamento,
        m.MOB_ESTADO        AS estado,
        m.MOB_ASIGNADO_A    AS asignadoA,
        nu.NEUS_NOMBRES     AS asignadoNombre,
        m.MOB_NOTAS         AS notas,
        m.MOB_CANTIDAD      AS cantidad,
        m.MOB_VALOR         AS valor,
        m.MOB_PROVEEDOR     AS proveedor,
        m.MOB_FECHA_COMPRA  AS fechaCompra,
        m.MOB_PROPIETARIO   AS propietario,
        m.MOB_FECHA_REGISTRO AS fechaRegistro
      FROM dbo.ACTIVOS_MOBILIARIO m
      LEFT JOIN dbo.NEUS_USUARIOS nu ON nu.NEUS_ID = m.MOB_ASIGNADO_A
      WHERE m.MOB_ACTIVO = 1
      ORDER BY m.MOB_CATEGORIA, m.MOB_ID
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('getMobiliario:', e);
    return res.status(500).json({ success: false, message: 'Error al obtener mobiliario' });
  }
};

exports.createMobiliario = async (req, res) => {
  try {
    const { categoria, marca, modelo, numeroSerie, color, ubicacion, departamento, estado, asignadoA, notas,
            cantidad, valor, proveedor, fechaCompra, propietario } = req.body;

    const categoriasValidas = await getCategoriasValidas(req.user?.empresa);
    if (!categoria || !categoriasValidas.includes(categoria))
      return res.status(400).json({ success: false, message: 'Categoría inválida' });
    if (estado && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    if (propietario && !PROPIETARIOS_VALIDOS.includes(propietario))
      return res.status(400).json({ success: false, message: 'Propietario inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureMobiliarioColumns(pool);
    const result = await pool.request()
      .input('categoria',    sql.NVarChar(50),  categoria)
      .input('marca',        sql.NVarChar(100), marca        || null)
      .input('modelo',       sql.NVarChar(100), modelo       || null)
      .input('numeroSerie',  sql.NVarChar(100), numeroSerie  || null)
      .input('color',        sql.NVarChar(50),  color        || null)
      .input('ubicacion',    sql.NVarChar(150), ubicacion    || null)
      .input('departamento', sql.NVarChar(100), departamento || null)
      .input('estado',       sql.NVarChar(30),  estado       || 'disponible')
      .input('asignadoA',    sql.SmallInt,      asignadoA    || null)
      .input('notas',        sql.NVarChar(300), notas        || null)
      .input('cantidad',     sql.Int,           cantidad     || 1)
      .input('valor',        sql.Decimal(10,2), valor        || null)
      .input('proveedor',    sql.NVarChar(100), proveedor    || null)
      .input('fechaCompra',  sql.NVarChar(30),  fechaCompra  || null)
      .input('propietario',  sql.NVarChar(20),  propietario  || null)
      .query(`
        INSERT INTO dbo.ACTIVOS_MOBILIARIO
          (MOB_CATEGORIA, MOB_MARCA, MOB_MODELO, MOB_NUMERO_SERIE, MOB_COLOR,
           MOB_UBICACION, MOB_DEPARTAMENTO, MOB_ESTADO, MOB_ASIGNADO_A, MOB_NOTAS,
           MOB_CANTIDAD, MOB_VALOR, MOB_PROVEEDOR, MOB_FECHA_COMPRA, MOB_PROPIETARIO)
        OUTPUT INSERTED.MOB_ID AS id
        VALUES
          (@categoria, @marca, @modelo, @numeroSerie, @color,
           @ubicacion, @departamento, @estado, @asignadoA, @notas,
           @cantidad, @valor, @proveedor, @fechaCompra, @propietario)
      `);

    return res.status(201).json({ success: true, id: result.recordset[0].id });
  } catch (e) {
    console.error('createMobiliario:', e);
    return res.status(500).json({ success: false, message: 'Error al crear activo' });
  }
};

exports.updateMobiliario = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { categoria, marca, modelo, numeroSerie, color, ubicacion, departamento, estado, asignadoA, notas,
            cantidad, valor, proveedor, fechaCompra, propietario } = req.body;

    if (categoria) {
      const categoriasValidas = await getCategoriasValidas(req.user?.empresa);
      if (!categoriasValidas.includes(categoria))
        return res.status(400).json({ success: false, message: 'Categoría inválida' });
    }
    if (estado && !ESTADOS_VALIDOS.includes(estado))
      return res.status(400).json({ success: false, message: 'Estado inválido' });
    if (propietario && !PROPIETARIOS_VALIDOS.includes(propietario))
      return res.status(400).json({ success: false, message: 'Propietario inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    await ensureMobiliarioColumns(pool);
    await pool.request()
      .input('id',           sql.Int,           id)
      .input('categoria',    sql.NVarChar(50),  categoria    || null)
      .input('marca',        sql.NVarChar(100), marca        || null)
      .input('modelo',       sql.NVarChar(100), modelo       || null)
      .input('numeroSerie',  sql.NVarChar(100), numeroSerie  || null)
      .input('color',        sql.NVarChar(50),  color        || null)
      .input('ubicacion',    sql.NVarChar(150), ubicacion    || null)
      .input('departamento', sql.NVarChar(100), departamento || null)
      .input('estado',       sql.NVarChar(30),  estado       || null)
      .input('asignadoA',    sql.SmallInt,      asignadoA    || null)
      .input('notas',        sql.NVarChar(300), notas        || null)
      .input('cantidad',     sql.Int,           cantidad     || null)
      .input('valor',        sql.Decimal(10,2), valor        || null)
      .input('proveedor',    sql.NVarChar(100), proveedor    || null)
      .input('fechaCompra',  sql.NVarChar(30),  fechaCompra  || null)
      .input('propietario',  sql.NVarChar(20),  propietario  || null)
      .query(`
        UPDATE dbo.ACTIVOS_MOBILIARIO SET
          MOB_CATEGORIA    = COALESCE(@categoria,    MOB_CATEGORIA),
          MOB_MARCA        = COALESCE(@marca,        MOB_MARCA),
          MOB_MODELO       = COALESCE(@modelo,       MOB_MODELO),
          MOB_NUMERO_SERIE = COALESCE(@numeroSerie,  MOB_NUMERO_SERIE),
          MOB_COLOR        = COALESCE(@color,        MOB_COLOR),
          MOB_UBICACION    = COALESCE(@ubicacion,    MOB_UBICACION),
          MOB_DEPARTAMENTO = COALESCE(@departamento, MOB_DEPARTAMENTO),
          MOB_ESTADO       = COALESCE(@estado,       MOB_ESTADO),
          MOB_ASIGNADO_A   = @asignadoA,
          MOB_NOTAS        = COALESCE(@notas,        MOB_NOTAS),
          MOB_CANTIDAD     = COALESCE(@cantidad,     MOB_CANTIDAD),
          MOB_VALOR        = COALESCE(@valor,        MOB_VALOR),
          MOB_PROVEEDOR    = COALESCE(@proveedor,    MOB_PROVEEDOR),
          MOB_FECHA_COMPRA = COALESCE(@fechaCompra,  MOB_FECHA_COMPRA),
          MOB_PROPIETARIO  = COALESCE(@propietario,  MOB_PROPIETARIO)
        WHERE MOB_ID = @id AND MOB_ACTIVO = 1
      `);

    return res.json({ success: true });
  } catch (e) {
    console.error('updateMobiliario:', e);
    return res.status(500).json({ success: false, message: 'Error al actualizar activo' });
  }
};

exports.deleteMobiliario = async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .query(`UPDATE dbo.ACTIVOS_MOBILIARIO SET MOB_ACTIVO = 0 WHERE MOB_ID = @id`);
    return res.json({ success: true });
  } catch (e) {
    console.error('deleteMobiliario:', e);
    return res.status(500).json({ success: false, message: 'Error al eliminar activo' });
  }
};
