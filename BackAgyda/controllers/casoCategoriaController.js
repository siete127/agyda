const sql = require('mssql');
const databaseService = require('../services/databaseService');

// ─────────────────────────────────────────────────────────────────────────────
// Catálogo configurable de categorías → subcategorías de casos/incidencias.
// La categoría solo agrupa (Soporte técnico, Cobros o facturación); la
// prioridad vive en la subcategoría (Dudas del sistema=baja, Fallas del
// sistema=alta, etc.) y es la que se asigna automáticamente al crear un caso
// desde el Portal de Cliente. CASO_CATEGORIA en CASOS sigue siendo texto
// libre ("Categoría > Subcategoría"), no FK, para no invalidar casos
// históricos si una subcategoría se renombra, desactiva o elimina.
// ─────────────────────────────────────────────────────────────────────────────

const PRIORIDADES_VALIDAS = new Set(['baja', 'media', 'alta', 'critica']);

// Árbol completo (activas e inactivas) — uso administrativo en AGYDA.
exports.listCategorias = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const cats = await pool.request().query(`
      SELECT CAT_ID as id, CAT_NOMBRE as nombre, CAT_ORDEN as orden, CAT_ACTIVO as activo
      FROM CASOS_CATEGORIAS ORDER BY CAT_ORDEN ASC, CAT_NOMBRE ASC
    `);
    const subs = await pool.request().query(`
      SELECT SUB_ID as id, SUB_CAT_ID as categoriaId, SUB_NOMBRE as nombre,
             SUB_PRIORIDAD as prioridad, SUB_ORDEN as orden, SUB_ACTIVO as activo
      FROM CASOS_SUBCATEGORIAS ORDER BY SUB_ORDEN ASC, SUB_NOMBRE ASC
    `);
    const data = cats.recordset.map((c) => ({
      ...c,
      subcategorias: subs.recordset.filter((s) => s.categoriaId === c.id),
    }));
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

// Solo activas (categoría y subcategoría) — consumido por el formulario
// interno y el Portal de Cliente para armar el selector en 2 pasos.
exports.listCategoriasActivas = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa || req.contacto?.empresa);
    const cats = await pool.request().query(`
      SELECT CAT_ID as id, CAT_NOMBRE as nombre, CAT_ORDEN as orden
      FROM CASOS_CATEGORIAS WHERE CAT_ACTIVO=1 ORDER BY CAT_ORDEN ASC, CAT_NOMBRE ASC
    `);
    const subs = await pool.request().query(`
      SELECT SUB_ID as id, SUB_CAT_ID as categoriaId, SUB_NOMBRE as nombre,
             SUB_PRIORIDAD as prioridad, SUB_ORDEN as orden
      FROM CASOS_SUBCATEGORIAS WHERE SUB_ACTIVO=1 ORDER BY SUB_ORDEN ASC, SUB_NOMBRE ASC
    `);
    const data = cats.recordset
      .map((c) => ({ ...c, subcategorias: subs.recordset.filter((s) => s.categoriaId === c.id) }))
      .filter((c) => c.subcategorias.length > 0);
    res.json({ success: true, data });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createCategoria = async (req, res) => {
  try {
    const { nombre, orden } = req.body || {};
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) return res.status(400).json({ success: false, message: 'El nombre es requerido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('nombre', sql.NVarChar(80), nombreLimpio)
      .input('orden', sql.Int, Number.isInteger(orden) ? orden : 0)
      .query(`
        INSERT INTO CASOS_CATEGORIAS (CAT_NOMBRE, CAT_ORDEN)
        OUTPUT INSERTED.CAT_ID as id
        VALUES (@nombre, @orden)
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (e) {
    if (e.message?.includes('UQ_CASOS_CATEGORIAS_NOMBRE')) {
      return res.status(409).json({ success: false, message: 'Ya existe una categoría con ese nombre' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateCategoria = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'id inválido' });
    const { nombre, orden, activo } = req.body || {};

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(80), nombre !== undefined ? String(nombre).trim() : null)
      .input('orden', sql.Int, Number.isInteger(orden) ? orden : null)
      .input('activo', sql.Bit, typeof activo === 'boolean' ? activo : null)
      .query(`
        UPDATE CASOS_CATEGORIAS SET
          CAT_NOMBRE = COALESCE(@nombre, CAT_NOMBRE),
          CAT_ORDEN = COALESCE(@orden, CAT_ORDEN),
          CAT_ACTIVO = COALESCE(@activo, CAT_ACTIVO)
        WHERE CAT_ID = @id
      `);
    res.json({ success: true });
  } catch (e) {
    if (e.message?.includes('UQ_CASOS_CATEGORIAS_NOMBRE')) {
      return res.status(409).json({ success: false, message: 'Ya existe una categoría con ese nombre' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

// Borrado físico solo si no tiene subcategorías (evita dejar huérfanas).
exports.deleteCategoria = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'id inválido' });

    const pool = await databaseService.getPool(req.user?.empresa);
    const tieneSubs = await pool.request().input('id', sql.Int, id)
      .query(`SELECT COUNT(*) as n FROM CASOS_SUBCATEGORIAS WHERE SUB_CAT_ID=@id`);
    if (tieneSubs.recordset[0].n > 0) {
      return res.status(409).json({ success: false, message: 'Elimina primero sus subcategorías' });
    }
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM CASOS_CATEGORIAS WHERE CAT_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createSubcategoria = async (req, res) => {
  try {
    const categoriaId = parseInt(req.params.categoriaId, 10);
    if (!Number.isInteger(categoriaId) || categoriaId <= 0) return res.status(400).json({ success: false, message: 'categoriaId inválido' });
    const { nombre, prioridad, orden } = req.body || {};
    const nombreLimpio = String(nombre || '').trim();
    if (!nombreLimpio) return res.status(400).json({ success: false, message: 'El nombre es requerido' });
    const prioridadFinal = PRIORIDADES_VALIDAS.has(prioridad) ? prioridad : 'media';

    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('catId', sql.Int, categoriaId)
      .input('nombre', sql.NVarChar(80), nombreLimpio)
      .input('prioridad', sql.NVarChar(20), prioridadFinal)
      .input('orden', sql.Int, Number.isInteger(orden) ? orden : 0)
      .query(`
        INSERT INTO CASOS_SUBCATEGORIAS (SUB_CAT_ID, SUB_NOMBRE, SUB_PRIORIDAD, SUB_ORDEN)
        OUTPUT INSERTED.SUB_ID as id
        VALUES (@catId, @nombre, @prioridad, @orden)
      `);
    res.json({ success: true, data: { id: rs.recordset[0].id } });
  } catch (e) {
    if (e.message?.includes('UQ_CASOS_SUBCATEGORIAS')) {
      return res.status(409).json({ success: false, message: 'Ya existe una subcategoría con ese nombre en esta categoría' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateSubcategoria = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'id inválido' });
    const { nombre, prioridad, orden, activo } = req.body || {};
    if (prioridad !== undefined && !PRIORIDADES_VALIDAS.has(prioridad)) {
      return res.status(400).json({ success: false, message: 'Prioridad inválida' });
    }

    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, id)
      .input('nombre', sql.NVarChar(80), nombre !== undefined ? String(nombre).trim() : null)
      .input('prioridad', sql.NVarChar(20), prioridad ?? null)
      .input('orden', sql.Int, Number.isInteger(orden) ? orden : null)
      .input('activo', sql.Bit, typeof activo === 'boolean' ? activo : null)
      .query(`
        UPDATE CASOS_SUBCATEGORIAS SET
          SUB_NOMBRE = COALESCE(@nombre, SUB_NOMBRE),
          SUB_PRIORIDAD = COALESCE(@prioridad, SUB_PRIORIDAD),
          SUB_ORDEN = COALESCE(@orden, SUB_ORDEN),
          SUB_ACTIVO = COALESCE(@activo, SUB_ACTIVO)
        WHERE SUB_ID = @id
      `);
    res.json({ success: true });
  } catch (e) {
    if (e.message?.includes('UQ_CASOS_SUBCATEGORIAS')) {
      return res.status(409).json({ success: false, message: 'Ya existe una subcategoría con ese nombre en esta categoría' });
    }
    res.status(500).json({ success: false, message: e.message });
  }
};

// Borrado físico: los casos ya creados guardan el texto ("Cat > Sub") tal
// cual, así que borrar la subcategoría del catálogo no los afecta.
exports.deleteSubcategoria = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: 'id inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`DELETE FROM CASOS_SUBCATEGORIAS WHERE SUB_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
