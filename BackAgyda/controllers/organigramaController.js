const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Utilidad para construir árbol desde lista plana
function buildTree(rows) {
  const byId = new Map();
  rows.forEach(r => {
    byId.set(r.ORG_ID, { ...r, children: [] });
  });
  const roots = [];
  byId.forEach(node => {
    if (node.ORG_PADRE_ID && byId.has(node.ORG_PADRE_ID)) {
      byId.get(node.ORG_PADRE_ID).children.push(node);
    } else {
      roots.push(node);
    }
  });
  // Ordenar hijos por ORG_ORDEN
  const sortRec = list => {
    list.sort((a,b) => a.ORG_ORDEN - b.ORG_ORDEN);
    list.forEach(n => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

exports.getTree = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT o.ORG_ID, o.ORG_PADRE_ID, o.ORG_TITULO, o.ORG_DESCRIPCION, o.ORG_NEUS_ID, o.ORG_DEPARTAMENTO,
             o.ORG_ORDEN, o.ORG_ACTIVO, o.ORG_FECHA_CREACION, o.ORG_FECHA_MODIFICACION,
             u.NEUS_FOTO_URL as ORG_FOTO_URL
      FROM ORGANIGRAMA_NODOS o
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.ORG_NEUS_ID
      WHERE o.ORG_ACTIVO = 1
      ORDER BY ISNULL(o.ORG_PADRE_ID, 0), o.ORG_ORDEN
    `);
    const tree = buildTree(result.recordset);
    res.json({ success: true, data: tree, total: result.recordset.length });
  } catch (e) {
    console.error('Error getTree organigrama:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.createNode = async (req, res) => {
  try {
    const { padreId, titulo, descripcion, neusUsuarioId, departamento, orden } = req.body;
    if (!titulo) {
      return res.status(400).json({ success: false, message: 'titulo es requerido' });
    }
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    request.input('padreId', sql.Int, padreId || null);
    request.input('titulo', sql.NVarChar, titulo);
    request.input('descripcion', sql.NVarChar, descripcion || null);
    request.input('neusUsuarioId', sql.Int, neusUsuarioId || null);
    request.input('departamento', sql.NVarChar, departamento || null);
    request.input('orden', sql.Int, orden || 0);
    const insertResult = await request.query(`
      INSERT INTO ORGANIGRAMA_NODOS (ORG_PADRE_ID, ORG_TITULO, ORG_DESCRIPCION, ORG_NEUS_ID, ORG_DEPARTAMENTO, ORG_ORDEN)
      OUTPUT INSERTED.*
      VALUES (@padreId, @titulo, @descripcion, @neusUsuarioId, @departamento, @orden)
    `);
    res.status(201).json({ success: true, data: insertResult.recordset[0] });
  } catch (e) {
    console.error('Error createNode organigrama:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateNode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { titulo, descripcion, neusUsuarioId, departamento, activo } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    request.input('id', sql.Int, id);
    request.input('titulo', sql.NVarChar, titulo || null);
    request.input('descripcion', sql.NVarChar, descripcion || null);
    request.input('neusUsuarioId', sql.Int, neusUsuarioId || null);
    request.input('departamento', sql.NVarChar, departamento || null);
    request.input('activo', sql.Bit, typeof activo === 'boolean' ? (activo ? 1 : 0) : 1);
    const result = await request.query(`
      UPDATE ORGANIGRAMA_NODOS
      SET ORG_TITULO = ISNULL(@titulo, ORG_TITULO),
          ORG_DESCRIPCION = @descripcion,
          ORG_NEUS_ID = @neusUsuarioId,
          ORG_DEPARTAMENTO = @departamento,
          ORG_ACTIVO = @activo,
          ORG_FECHA_MODIFICACION = GETDATE()
      WHERE ORG_ID = @id;
      SELECT ORG_ID, ORG_PADRE_ID, ORG_TITULO, ORG_DESCRIPCION, ORG_NEUS_ID, ORG_DEPARTAMENTO,
             ORG_ORDEN, ORG_ACTIVO, ORG_FECHA_CREACION, ORG_FECHA_MODIFICACION
      FROM ORGANIGRAMA_NODOS WHERE ORG_ID = @id;
    `);
    if (!result.recordset[0]) return res.status(404).json({ success: false, message: 'Nodo no encontrado' });
    res.json({ success: true, data: result.recordset[0] });
  } catch (e) {
    console.error('Error updateNode organigrama:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteNode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    request.input('id', sql.Int, id);
    // Soft delete: marcar inactivo para preservar historia
    const result = await request.query(`
      UPDATE ORGANIGRAMA_NODOS SET ORG_ACTIVO = 0, ORG_FECHA_MODIFICACION = GETDATE() WHERE ORG_ID = @id;
      SELECT @@ROWCOUNT AS afectados;
    `);
    if (result.recordset[0].afectados === 0) return res.status(404).json({ success: false, message: 'Nodo no encontrado' });
    res.json({ success: true, message: 'Nodo eliminado (soft delete)' });
  } catch (e) {
    console.error('Error deleteNode organigrama:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.moveNode = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nuevoPadreId, nuevoOrden } = req.body;
    if (!id) return res.status(400).json({ success: false, message: 'ID inválido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const request = pool.request();
    request.input('id', sql.Int, id);
    request.input('padre', sql.Int, nuevoPadreId || null);
    request.input('orden', sql.Int, nuevoOrden || 0);
    await request.query(`
      UPDATE ORGANIGRAMA_NODOS
      SET ORG_PADRE_ID = @padre, ORG_ORDEN = @orden, ORG_FECHA_MODIFICACION = GETDATE()
      WHERE ORG_ID = @id;
    `);
    res.json({ success: true, message: 'Nodo movido' });
  } catch (e) {
    console.error('Error moveNode organigrama:', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
