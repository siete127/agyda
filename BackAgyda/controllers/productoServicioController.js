const sql = require('mssql');
const databaseService = require('../services/databaseService');

const TIPOS = ['PRODUCTO', 'SERVICIO'];
const RECURRENCIAS = ['MENSUAL', 'ANUAL', 'UNICO'];

function parseTipo(v) {
  const t = String(v || '').toUpperCase();
  return TIPOS.includes(t) ? t : 'PRODUCTO';
}

function parseRecurrencia(v) {
  const r = String(v || '').toUpperCase();
  return RECURRENCIAS.includes(r) ? r : 'UNICO';
}

exports.getAll = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        PS_ID as id, PS_TIPO as tipo, PS_NOMBRE as nombre,
        PS_DESCRIPCION as descripcion, PS_PRECIO as precio,
        PS_RECURRENCIA as recurrencia, PS_ACTIVO as activo,
        PS_COSTO as costo, PS_CLAVE_PROD_SERV as claveProdServ,
        PS_CLAVE_UNIDAD as claveUnidad, PS_UNIDAD_NOMBRE as unidadNombre,
        PS_IVA_TASA as ivaTasa,
        PS_FECHA_REGISTRO as fechaRegistro
      FROM PRODUCTOS_SERVICIOS
      ORDER BY PS_NOMBRE ASC
    `);
    return res.json({ success: true, data: result.recordset });
  } catch (e) {
    console.error('Error listando productos/servicios:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.create = async (req, res) => {
  try {
    const { tipo, nombre, descripcion, precio, recurrencia, activo,
            costo, claveProdServ, claveUnidad, unidadNombre, ivaTasa } = req.body;
    if (!nombre || String(nombre).trim() === '') {
      return res.status(400).json({ success: false, message: 'Falta el nombre' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('tipo', sql.NVarChar(20), parseTipo(tipo))
      .input('nombre', sql.NVarChar(200), nombre)
      .input('descripcion', sql.NVarChar(500), descripcion || null)
      .input('precio', sql.Decimal(18, 2), Number(precio) || 0)
      .input('recurrencia', sql.NVarChar(20), parseRecurrencia(recurrencia))
      .input('activo', sql.Bit, (activo === undefined || activo === null) ? 1 : (activo ? 1 : 0))
      .input('costo', sql.Decimal(18, 2), (costo === undefined || costo === null || costo === '') ? null : Number(costo))
      .input('cps', sql.NVarChar(12), claveProdServ ? String(claveProdServ).slice(0, 12) : null)
      .input('cu', sql.NVarChar(6), claveUnidad ? String(claveUnidad).slice(0, 6) : null)
      .input('un', sql.NVarChar(100), unidadNombre ? String(unidadNombre).slice(0, 100) : null)
      .input('iva', sql.Decimal(5, 4), (ivaTasa === undefined || ivaTasa === null || ivaTasa === '') ? 0.16 : Number(ivaTasa))
      .query(`
        INSERT INTO PRODUCTOS_SERVICIOS (PS_TIPO, PS_NOMBRE, PS_DESCRIPCION, PS_PRECIO, PS_RECURRENCIA, PS_ACTIVO,
          PS_COSTO, PS_CLAVE_PROD_SERV, PS_CLAVE_UNIDAD, PS_UNIDAD_NOMBRE, PS_IVA_TASA)
        OUTPUT INSERTED.PS_ID as id
        VALUES (@tipo, @nombre, @descripcion, @precio, @recurrencia, @activo,
          @costo, @cps, @cu, @un, @iva)
      `);

    return res.status(201).json({ success: true, data: { id: result.recordset[0].id } });
  } catch (e) {
    console.error('Error creando producto/servicio:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }

    const { tipo, nombre, descripcion, precio, recurrencia, activo,
            costo, claveProdServ, claveUnidad, unidadNombre, ivaTasa } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    await pool.request()
      .input('id', sql.Int, id)
      .input('tipo', sql.NVarChar(20), tipo !== undefined ? parseTipo(tipo) : null)
      .input('nombre', sql.NVarChar(200), nombre || null)
      .input('descripcion', sql.NVarChar(500), descripcion !== undefined ? descripcion : null)
      .input('precio', sql.Decimal(18, 2), precio !== undefined && precio !== null ? Number(precio) : null)
      .input('recurrencia', sql.NVarChar(20), recurrencia !== undefined ? parseRecurrencia(recurrencia) : null)
      .input('activo', sql.Bit, (activo === undefined || activo === null) ? null : (activo ? 1 : 0))
      .input('costo', sql.Decimal(18, 2), costo === undefined ? null : (costo === null || costo === '' ? null : Number(costo)))
      .input('costoSet', sql.Bit, costo === undefined ? 0 : 1)
      .input('cps', sql.NVarChar(12), claveProdServ !== undefined ? (claveProdServ ? String(claveProdServ).slice(0, 12) : null) : null)
      .input('cpsSet', sql.Bit, claveProdServ === undefined ? 0 : 1)
      .input('cu', sql.NVarChar(6), claveUnidad !== undefined ? (claveUnidad ? String(claveUnidad).slice(0, 6) : null) : null)
      .input('cuSet', sql.Bit, claveUnidad === undefined ? 0 : 1)
      .input('un', sql.NVarChar(100), unidadNombre !== undefined ? (unidadNombre ? String(unidadNombre).slice(0, 100) : null) : null)
      .input('unSet', sql.Bit, unidadNombre === undefined ? 0 : 1)
      .input('iva', sql.Decimal(5, 4), (ivaTasa === undefined || ivaTasa === null || ivaTasa === '') ? null : Number(ivaTasa))
      .query(`
        UPDATE PRODUCTOS_SERVICIOS SET
          PS_TIPO = COALESCE(@tipo, PS_TIPO),
          PS_NOMBRE = COALESCE(@nombre, PS_NOMBRE),
          PS_DESCRIPCION = COALESCE(@descripcion, PS_DESCRIPCION),
          PS_PRECIO = COALESCE(@precio, PS_PRECIO),
          PS_RECURRENCIA = COALESCE(@recurrencia, PS_RECURRENCIA),
          PS_ACTIVO = CASE WHEN @activo IS NULL THEN PS_ACTIVO ELSE @activo END,
          PS_COSTO = CASE WHEN @costoSet = 1 THEN @costo ELSE PS_COSTO END,
          PS_CLAVE_PROD_SERV = CASE WHEN @cpsSet = 1 THEN @cps ELSE PS_CLAVE_PROD_SERV END,
          PS_CLAVE_UNIDAD = CASE WHEN @cuSet = 1 THEN @cu ELSE PS_CLAVE_UNIDAD END,
          PS_UNIDAD_NOMBRE = CASE WHEN @unSet = 1 THEN @un ELSE PS_UNIDAD_NOMBRE END,
          PS_IVA_TASA = COALESCE(@iva, PS_IVA_TASA)
        WHERE PS_ID = @id
      `);

    return res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando producto/servicio:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: 'ID inválido' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);

    const enUso = await pool.request()
      .input('id', sql.Int, id)
      .query(`SELECT COUNT(1) as cnt FROM CLIENTE_PRODUCTOS_SERVICIOS WHERE PS_ID = @id`);

    if (enUso.recordset[0].cnt > 0) {
      await pool.request()
        .input('id', sql.Int, id)
        .query(`UPDATE PRODUCTOS_SERVICIOS SET PS_ACTIVO = 0 WHERE PS_ID = @id`);
      return res.json({ success: true, message: 'Tiene clientes asignados: se desactivó en lugar de eliminarse' });
    }

    await pool.request().input('id', sql.Int, id).query(`DELETE FROM PRODUCTOS_SERVICIOS WHERE PS_ID = @id`);
    return res.json({ success: true, message: 'Eliminado' });
  } catch (e) {
    console.error('Error eliminando producto/servicio:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};
