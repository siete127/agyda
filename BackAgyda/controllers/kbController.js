const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

exports.getArticulos = async (req, res) => {
  try {
    const { q, categoria } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conditions = ['ART_ACTIVO = 1'];
    const request = pool.request();
    if (q) {
      conditions.push('(ART_TITULO LIKE @q OR ART_CONTENIDO LIKE @q)');
      request.input('q', sql.NVarChar, `%${q}%`);
    }
    if (categoria) {
      conditions.push('ART_CATEGORIA = @categoria');
      request.input('categoria', sql.NVarChar, categoria);
    }

    const rs = await request.query(`
      SELECT TOP 100
        ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria,
        ART_AUTOR_NOMBRE as autorNombre, ART_FECHA_CREACION as fechaCreacion, ART_FECHA_ACTUALIZACION as fechaActualizacion
      FROM KB_ARTICULOS
      WHERE ${conditions.join(' AND ')}
      ORDER BY ART_FECHA_CREACION DESC`);

    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando artículos KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getArticuloById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria,
             ART_AUTOR_NOMBRE as autorNombre, ART_FECHA_CREACION as fechaCreacion, ART_FECHA_ACTUALIZACION as fechaActualizacion
      FROM KB_ARTICULOS WHERE ART_ID=@id AND ART_ACTIVO=1`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
    res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error obteniendo artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createArticulo = async (req, res) => {
  try {
    const { titulo, contenido, categoria } = req.body;
    const autorId = req.user?.id || Number(req.headers['usuarioid']) || null;
    const autorNombre = req.user?.nombre || null;

    if (!titulo || !contenido) {
      return res.status(400).json({ success: false, message: 'titulo y contenido son requeridos' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    const ins = await pool.request()
      .input('tit', sql.NVarChar, titulo)
      .input('cont', sql.NVarChar, contenido)
      .input('cat', sql.NVarChar, categoria || null)
      .input('autorId', sql.Int, autorId)
      .input('autorNombre', sql.NVarChar, autorNombre)
      .query(`INSERT INTO KB_ARTICULOS (ART_TITULO, ART_CONTENIDO, ART_CATEGORIA, ART_AUTOR_ID, ART_AUTOR_NOMBRE)
              VALUES (@tit, @cont, @cat, @autorId, @autorNombre);
              SELECT SCOPE_IDENTITY() as id;`);

    const articuloId = Number(ins.recordset[0].id);
    await logAudit(pool, { userId: autorId, userName: autorNombre, modulo: 'kb', accion: 'crear', entidadId: String(articuloId), detalle: { titulo }, ip: req.ip });

    res.status(201).json({ success: true, data: { id: articuloId, titulo, contenido, categoria: categoria || null, autorNombre } });
  } catch (e) {
    console.error('Error creando artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, contenido, categoria } = req.body;

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('tit', sql.NVarChar, titulo)
      .input('cont', sql.NVarChar, contenido)
      .input('cat', sql.NVarChar, categoria || null)
      .query(`UPDATE KB_ARTICULOS SET ART_TITULO=@tit, ART_CONTENIDO=@cont, ART_CATEGORIA=@cat, ART_FECHA_ACTUALIZACION=GETDATE()
              WHERE ART_ID=@id`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo: 'kb', accion: 'editar', entidadId: String(id), detalle: { titulo }, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.toggleActivo = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE KB_ARTICULOS SET ART_ACTIVO = 1 - ART_ACTIVO WHERE ART_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo: 'kb', accion: 'toggle-activo', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando estado de artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
