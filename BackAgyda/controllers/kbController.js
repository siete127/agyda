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
        ART_AUTOR_NOMBRE as autorNombre, ART_FECHA_CREACION as fechaCreacion, ART_FECHA_ACTUALIZACION as fechaActualizacion,
        ART_PUBLICO as publico, ART_EVIDENCIA_URL as evidenciaUrl
      FROM KB_ARTICULOS
      WHERE ${conditions.join(' AND ')}
      ORDER BY ART_FECHA_CREACION DESC`);

    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listando artículos KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Traducción automática del contenido dinámico de la KB pública (título,
// categoría, contenido) — no hay versión en inglés capturada por el autor,
// así que se traduce al vuelo con el traductor gratuito de Google. Import
// dinámico porque el paquete es ESM puro (no soporta require() directo desde
// CommonJS). Si el traductor falla (rate-limit, sin red, etc.) se devuelve el
// texto original en español en vez de romper la respuesta — degradado, no error.
let _translateFn = null;
async function getTranslateFn() {
  if (!_translateFn) {
    const mod = await import('@vitalets/google-translate-api');
    _translateFn = mod.translate;
  }
  return _translateFn;
}

// Devuelve { text, ok } — ok=false cuando la traducción falló y `text` es
// simplemente el original (fallback). El llamador NO debe cachear un
// resultado con ok=false, o el fallback en español quedaría grabado como si
// fuera la traducción en inglés para siempre.
async function traducirTexto(texto, to) {
  if (!texto) return { text: texto, ok: true };
  try {
    const translate = await getTranslateFn();
    const { text } = await translate(texto, { to });
    return { text, ok: true };
  } catch (e) {
    console.warn('⚠️ Error traduciendo texto KB (se usa original):', e?.message || e);
    return { text: texto, ok: false };
  }
}

// Con caché: si el artículo ya tiene su traducción guardada (columnas
// ART_*_EN, ver ensureKbSchema), se usa esa directo sin llamar al traductor
// — solo se traduce (y se guarda para la próxima vez) la primera vez que
// alguien pide ese artículo en inglés. Esto es lo que evita el rate-limit del
// traductor gratuito bajo tráfico real.
async function traducirArticulo(pool, articulo, lang) {
  if (lang !== 'en') return articulo;

  if (articulo.tituloEn || articulo.contenidoEn) {
    return {
      ...articulo,
      titulo: articulo.tituloEn || articulo.titulo,
      categoria: articulo.categoriaEn || articulo.categoria,
      contenido: articulo.contenidoEn || articulo.contenido,
    };
  }

  const [rTitulo, rCategoria, rContenido] = await Promise.all([
    traducirTexto(articulo.titulo, 'en'),
    traducirTexto(articulo.categoria, 'en'),
    traducirTexto(articulo.contenido, 'en'),
  ]);
  const titulo = rTitulo.text, categoria = rCategoria.text, contenido = rContenido.text;

  // Solo se persiste en caché si TODAS las traducciones fueron reales — un
  // fallback parcial guardado a medias dejaría campos mezclados ES/EN
  // marcados como "ya traducido" para siempre.
  if (rTitulo.ok && rCategoria.ok && rContenido.ok) {
    try {
      await pool.request()
        .input('id', sql.Int, articulo.id)
        .input('tituloEn', sql.NVarChar, titulo)
        .input('categoriaEn', sql.NVarChar, categoria)
        .input('contenidoEn', sql.NVarChar, contenido)
        .query(`UPDATE KB_ARTICULOS SET ART_TITULO_EN=@tituloEn, ART_CATEGORIA_EN=@categoriaEn, ART_CONTENIDO_EN=@contenidoEn, ART_TRADUCIDO_EN=GETDATE() WHERE ART_ID=@id`);
    } catch (e) {
      console.warn('⚠️ No se pudo guardar traducción en caché (artículo #' + articulo.id + '):', e?.message || e);
    }
  }

  return { ...articulo, titulo, categoria, contenido };
}

// Público (sin sesión) — la página institucional lo usa para que cualquier
// visitante busque soluciones por su cuenta, sin necesitar cuenta ni login.
// Solo artículos activos; nunca expone autor ni fechas de edición.
exports.getArticulosPublicos = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { q, categoria, tipo, lang } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);

    const conditions = ['ART_ACTIVO = 1', 'ART_PUBLICO = 1'];
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
        ART_TITULO_EN as tituloEn, ART_CONTENIDO_EN as contenidoEn, ART_CATEGORIA_EN as categoriaEn,
        ART_EVIDENCIA_URL as evidenciaUrl
      FROM KB_ARTICULOS
      WHERE ${conditions.join(' AND ')}
      ORDER BY ART_FECHA_CREACION DESC`);

    const data = lang === 'en'
      ? await Promise.all(rs.recordset.map((a) => traducirArticulo(pool, a, 'en')))
      : rs.recordset;

    res.json({ success: true, data });
  } catch (e) {
    console.error('Error listando artículos KB públicos:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getArticuloPublicoById = async (req, res) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const { id } = req.params;
    const { lang } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria, ART_TIPO as tipo,
        ART_TITULO_EN as tituloEn, ART_CONTENIDO_EN as contenidoEn, ART_CATEGORIA_EN as categoriaEn,
        ART_EVIDENCIA_URL as evidenciaUrl
      FROM KB_ARTICULOS WHERE ART_ID=@id AND ART_ACTIVO=1 AND ART_PUBLICO=1`);
    if (!rs.recordset.length) return res.status(404).json({ success: false, message: 'Artículo no encontrado' });
    const articulo = await traducirArticulo(pool, rs.recordset[0], lang);
    res.json({ success: true, data: articulo });
  } catch (e) {
    console.error('Error obteniendo artículo KB público:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getArticuloById = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().input('id', sql.Int, id).query(`
      SELECT ART_ID as id, ART_TITULO as titulo, ART_CONTENIDO as contenido, ART_CATEGORIA as categoria, ART_TIPO as tipo,
             ART_AUTOR_NOMBRE as autorNombre, ART_FECHA_CREACION as fechaCreacion, ART_FECHA_ACTUALIZACION as fechaActualizacion,
             ART_EVIDENCIA_URL as evidenciaUrl
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
async function crearArticuloInterno(pool, { titulo, contenido, categoria, tipo, evidenciaUrl, autorId, autorNombre, ip }) {
  const tipoVal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'articulo';
  if (!titulo || !contenido) {
    return { ok: false, status: 400, message: 'titulo y contenido son requeridos' };
  }

  const ins = await pool.request()
    .input('tit', sql.NVarChar, titulo)
    .input('cont', sql.NVarChar, contenido)
    .input('cat', sql.NVarChar, categoria || null)
    .input('tipo', sql.NVarChar, tipoVal)
    .input('evid', sql.NVarChar, evidenciaUrl || null)
    .input('autorId', sql.Int, autorId || null)
    .input('autorNombre', sql.NVarChar, autorNombre || null)
    .query(`INSERT INTO KB_ARTICULOS (ART_TITULO, ART_CONTENIDO, ART_CATEGORIA, ART_TIPO, ART_EVIDENCIA_URL, ART_AUTOR_ID, ART_AUTOR_NOMBRE)
            VALUES (@tit, @cont, @cat, @tipo, @evid, @autorId, @autorNombre);
            SELECT SCOPE_IDENTITY() as id;`);

  const articuloId = Number(ins.recordset[0].id);
  await logAudit(pool, { userId: autorId || null, userName: autorNombre || null, modulo: 'kb', accion: 'crear', entidadId: String(articuloId), detalle: { titulo, tipo: tipoVal }, ip: ip || null });

  return { ok: true, status: 201, data: { id: articuloId, titulo, contenido, categoria: categoria || null, tipo: tipoVal, evidenciaUrl: evidenciaUrl || null, autorNombre: autorNombre || null } };
}

exports.createArticulo = async (req, res) => {
  try {
    const { titulo, contenido, categoria, tipo, evidenciaUrl } = req.body;
    const autorId = req.user?.id || Number(req.headers['usuarioid']) || null;
    const autorNombre = req.user?.nombre || null;

    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await crearArticuloInterno(pool, { titulo, contenido, categoria, tipo, evidenciaUrl, autorId, autorNombre, ip: req.ip });
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
    const { titulo, contenido, categoria, tipo, evidenciaUrl } = req.body;
    const tipoVal = TIPOS_VALIDOS.includes(tipo) ? tipo : 'articulo';

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('tit', sql.NVarChar, titulo)
      .input('cont', sql.NVarChar, contenido)
      .input('cat', sql.NVarChar, categoria || null)
      .input('tipo', sql.NVarChar, tipoVal)
      .input('evid', sql.NVarChar, evidenciaUrl || null)
      .query(`UPDATE KB_ARTICULOS SET ART_TITULO=@tit, ART_CONTENIDO=@cont, ART_CATEGORIA=@cat, ART_TIPO=@tipo, ART_EVIDENCIA_URL=@evid, ART_FECHA_ACTUALIZACION=GETDATE()
              WHERE ART_ID=@id`);

    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo: 'kb', accion: 'editar', entidadId: String(id), detalle: { titulo, tipo: tipoVal }, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error actualizando artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

// Sube una imagen para insertar su link dentro del contenido de un artículo
// (el contenido es texto plano, no hay editor rich-text: el frontend agrega
// la URL devuelta al final del campo Solución antes de guardar).
exports.uploadImagen = async (req, res) => {
  try {
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: 'Imagen requerida (campo: imagen)' });

    const KB_IMAGEN_PUBLIC_BASE = process.env.KB_IMAGEN_PUBLIC_BASE_URL || '/intranet/ArdaWiki';
    const publicUrl = `${KB_IMAGEN_PUBLIC_BASE}/${encodeURIComponent(file.filename)}`;

    const pool = await databaseService.getPool(req.user?.empresa);
    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null, modulo: 'kb', accion: 'subir-imagen',
      entidadId: null, detalle: { filename: file.filename }, ip: req.ip,
    });

    res.json({ success: true, data: { url: publicUrl, filename: file.filename } });
  } catch (e) {
    console.error('Error subiendo imagen KB:', e);
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

// Alterna visibilidad público/privado — independiente de activo/inactivo.
// Privado = solo visible dentro de ArdaWiki (AGYDA interno). Público =
// también aparece en el sitio web institucional.
exports.togglePublico = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE KB_ARTICULOS SET ART_PUBLICO = 1 - ART_PUBLICO WHERE ART_ID=@id`);
    await logAudit(pool, { userId: req.user?.id||null, userName: req.user?.nombre||null, modulo: 'kb', accion: 'toggle-publico', entidadId: String(id), detalle: {}, ip: req.ip });
    res.json({ success: true });
  } catch (e) {
    console.error('Error cambiando visibilidad de artículo KB:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
