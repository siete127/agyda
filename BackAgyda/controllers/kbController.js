const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

const TIPOS_VALIDOS = ['articulo', 'faq'];

exports.getArticulos = async (req, res) => {
  try {
    const { q, categoria, tipo } = req.query;
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
    if (tipo && TIPOS_VALIDOS.includes(tipo)) {
      conditions.push('ART_TIPO = @tipo');
      request.input('tipo', sql.NVarChar, tipo);
    }

    const rs = await request.query(`
      SELECT TOP 100
        ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria, ART_TIPO as tipo,
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
      SELECT ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria, ART_TIPO as tipo,
             ART_AUTOR_NOMBRE as autorNombre, ART_FECHA_CREACION as fechaCreacion, ART_FECHA_ACTUALIZACION as fechaActualizacion
      FROM KB_ARTICULOS WHERE ART_ID=@id AND ART_ACTIVO=1`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
    res.json({ success: true, data: rs.recordset[0] });
  } catch (e) {
    console.error('Error obteniendo artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Lógica de negocio separada del handler HTTP para que ticketController pueda
// reusarla al crear un artículo directamente desde el flujo de cierre de
// ticket (mismo patrón que crearTicketInterno en ticketController.js).
async function crearArticuloInterno(pool, { titulo, contenido, categoria, tipo, autorId, autorNombre, ip }) {
  const tipoVal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'articulo';
  if (!titulo || !contenido) {
    return { ok: false, status: 400, message: 'titulo y contenido son requeridos' };
  }

  const ins = await pool.request()
    .input('tit', sql.NVarChar, titulo)
    .input('cont', sql.NVarChar, contenido)
    .input('cat', sql.NVarChar, categoria || null)
    .input('tipo', sql.NVarChar, tipoVal)
    .input('autorId', sql.Int, autorId || null)
    .input('autorNombre', sql.NVarChar, autorNombre || null)
    .query(`INSERT INTO KB_ARTICULOS (ART_TITULO, ART_CONTENIDO, ART_CATEGORIA, ART_TIPO, ART_AUTOR_ID, ART_AUTOR_NOMBRE)
            VALUES (@tit, @cont, @cat, @tipo, @autorId, @autorNombre);
            SELECT SCOPE_IDENTITY() as id;`);

  const articuloId = Number(ins.recordset[0].id);
  await logAudit(pool, { userId: autorId || null, userName: autorNombre || null, modulo: 'kb', accion: 'crear', entidadId: String(articuloId), detalle: { titulo, tipo: tipoVal }, ip: ip || null });

  return { ok: true, status: 201, data: { id: articuloId, titulo, contenido, categoria: categoria || null, tipo: tipoVal, autorNombre: autorNombre || null } };
}

exports.createArticulo = async (req, res) => {
  try {
    const { titulo, contenido, categoria, tipo } = req.body;
    const autorId = req.user?.id || Number(req.headers['usuarioid']) || null;
    const autorNombre = req.user?.nombre || null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await crearArticuloInterno(pool, { titulo, contenido, categoria, tipo, autorId, autorNombre, ip: req.ip });
    if (!result.ok) return res.status(result.status).json({ success: false, message: result.message });
    res.status(result.status).json({ success: true, data: result.data });
  } catch (e) {
    console.error('Error creando artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.crearArticuloInterno = crearArticuloInterno;

exports.updateArticulo = async (req, res) => {
  try {
    const { id } = req.params;
    const { titulo, contenido, categoria, tipo } = req.body;
    const tipoVal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'articulo';

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('tit', sql.NVarChar, titulo)
      .input('cont', sql.NVarChar, contenido)
      .input('cat', sql.NVarChar, categoria || null)
      .input('tipo', sql.NVarChar, tipoVal)
      .query(`UPDATE KB_ARTICULOS SET ART_TITULO=@tit, ART_CONTENIDO=@cont, ART_CATEGORIA=@cat, ART_TIPO=@tipo, ART_FECHA_ACTUALIZACION=GETDATE()
              WHERE ART_ID=@id`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo: 'kb', accion: 'editar', entidadId: String(id), detalle: { titulo, tipo: tipoVal }, ip: req.ip });
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
