const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');

// Catálogo de funciones de usuario (INTRANET_FUNCIONES) y quién tiene cada una
// (INTRANET_USUARIO_FUNCIONES). Se asignan a cualquier usuario sin importar su
// rol. Las de sistema (ES_SISTEMA) no se renombran de clave ni se borran.

async function pool(req) { return databaseService.getPool(req.user?.empresa); }
const claveDe = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const auditar = (p, req, accion, entidadId, detalle) => logAudit(p, {
  userId: req.user?.id, userName: req.user?.nombre || null, modulo: 'usuarios', accion, entidadId, detalle, ip: req.ip,
}).catch(() => {});

// GET /api/funciones-usuario
exports.listar = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().query(`
      SELECT f.FUN_ID id, f.FUN_CLAVE clave, f.FUN_NOMBRE nombre, f.FUN_DESCRIPCION descripcion, f.FUN_COLOR color,
             f.FUN_ES_SISTEMA esSistema, f.FUN_ACTIVO activo,
             (SELECT COUNT(*) FROM dbo.INTRANET_USUARIO_FUNCIONES uf
                JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = uf.UF_USUARIO_ID AND u.NEUS_ACTIVO = 1
              WHERE uf.UF_FUNCION_ID = f.FUN_ID) usuarios
      FROM dbo.INTRANET_FUNCIONES f
      ORDER BY f.FUN_ES_SISTEMA DESC, f.FUN_NOMBRE`);
    res.json({ success: true, data: r.recordset.map((x) => ({ ...x, esSistema: !!x.esSistema, activo: !!x.activo })) });
  } catch (e) {
    console.error('funcionesUsuario.listar:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener las funciones' });
  }
};

// POST /api/funciones-usuario { nombre, descripcion?, color? }
exports.crear = async (req, res) => {
  try {
    const nombre = String(req.body?.nombre || '').trim().slice(0, 100);
    if (!nombre) return res.status(400).json({ success: false, message: 'Falta el nombre' });
    const clave = claveDe(nombre);
    if (!clave) return res.status(400).json({ success: false, message: 'Nombre inválido' });
    const p = await pool(req);
    const dup = await p.request().input('c', sql.NVarChar(60), clave).query('SELECT 1 FROM dbo.INTRANET_FUNCIONES WHERE FUN_CLAVE = @c');
    if (dup.recordset.length) return res.status(409).json({ success: false, message: 'Ya existe una función con ese nombre' });
    const r = await p.request()
      .input('c', sql.NVarChar(60), clave).input('n', sql.NVarChar(100), nombre)
      .input('d', sql.NVarChar(300), String(req.body?.descripcion || '').trim().slice(0, 300) || null)
      .input('col', sql.VarChar(9), /^#[0-9a-f]{6}$/i.test(req.body?.color || '') ? req.body.color : null)
      .query(`INSERT INTO dbo.INTRANET_FUNCIONES (FUN_CLAVE, FUN_NOMBRE, FUN_DESCRIPCION, FUN_COLOR)
              OUTPUT INSERTED.FUN_ID id VALUES (@c, @n, @d, @col)`);
    await auditar(p, req, 'funcion-crear', r.recordset[0].id, { nombre });
    res.status(201).json({ success: true, data: { id: r.recordset[0].id } });
  } catch (e) {
    console.error('funcionesUsuario.crear:', e.message);
    res.status(500).json({ success: false, message: 'Error al crear la función' });
  }
};

// PUT /api/funciones-usuario/:id { nombre?, descripcion?, color?, activo? }
exports.actualizar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = await pool(req);
    const b = req.body || {};
    const sets = [];
    const rq = p.request().input('id', sql.Int, id);
    if (b.nombre !== undefined) {
      const n = String(b.nombre).trim().slice(0, 100);
      if (!n) return res.status(400).json({ success: false, message: 'El nombre no puede quedar vacío' });
      sets.push('FUN_NOMBRE = @n'); rq.input('n', sql.NVarChar(100), n);
    }
    if (b.descripcion !== undefined) { sets.push('FUN_DESCRIPCION = @d'); rq.input('d', sql.NVarChar(300), String(b.descripcion || '').trim().slice(0, 300) || null); }
    if (b.color !== undefined) { sets.push('FUN_COLOR = @col'); rq.input('col', sql.VarChar(9), /^#[0-9a-f]{6}$/i.test(b.color || '') ? b.color : null); }
    if (b.activo !== undefined) { sets.push('FUN_ACTIVO = @a'); rq.input('a', sql.Bit, !!b.activo); }
    if (!sets.length) return res.json({ success: true });
    const r = await rq.query(`UPDATE dbo.INTRANET_FUNCIONES SET ${sets.join(', ')} WHERE FUN_ID = @id`);
    if (!r.rowsAffected[0]) return res.status(404).json({ success: false, message: 'Función no encontrada' });
    await auditar(p, req, 'funcion-editar', id, b);
    res.json({ success: true });
  } catch (e) {
    console.error('funcionesUsuario.actualizar:', e.message);
    res.status(500).json({ success: false, message: 'Error al guardar la función' });
  }
};

// DELETE /api/funciones-usuario/:id — solo las que no son de sistema.
exports.eliminar = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const p = await pool(req);
    const f = await p.request().input('id', sql.Int, id).query('SELECT FUN_ES_SISTEMA sis FROM dbo.INTRANET_FUNCIONES WHERE FUN_ID = @id');
    if (!f.recordset.length) return res.status(404).json({ success: false, message: 'Función no encontrada' });
    if (f.recordset[0].sis) return res.status(409).json({ success: false, message: 'Las funciones del sistema no se pueden eliminar (puedes desactivarlas)' });
    await p.request().input('id', sql.Int, id).query('DELETE FROM dbo.INTRANET_FUNCIONES WHERE FUN_ID = @id');
    await auditar(p, req, 'funcion-eliminar', id, null);
    res.json({ success: true });
  } catch (e) {
    console.error('funcionesUsuario.eliminar:', e.message);
    res.status(500).json({ success: false, message: 'Error al eliminar la función' });
  }
};

// GET /api/funciones-usuario/:id/usuarios
exports.listarUsuarios = async (req, res) => {
  try {
    const p = await pool(req);
    const r = await p.request().input('id', sql.Int, Number(req.params.id)).query(`
      SELECT u.NEUS_ID id, u.NEUS_NOMBRES nombre, u.NEUS_USUARIO usuario, u.NEUS_CORREO correo,
             UPPER(ISNULL(u.NEUS_TIPOUSUARIO, '')) rol, uf.UF_FECHA asignadoEn
      FROM dbo.INTRANET_USUARIO_FUNCIONES uf
      JOIN dbo.NEUS_USUARIOS u ON u.NEUS_ID = uf.UF_USUARIO_ID AND u.NEUS_ACTIVO = 1
      WHERE uf.UF_FUNCION_ID = @id
      ORDER BY u.NEUS_NOMBRES`);
    res.json({ success: true, data: r.recordset });
  } catch (e) {
    console.error('funcionesUsuario.listarUsuarios:', e.message);
    res.status(500).json({ success: false, message: 'Error al obtener los usuarios de la función' });
  }
};

// POST /api/funciones-usuario/:id/usuarios { usuarioIds: number[] } — agrega.
exports.agregarUsuarios = async (req, res) => {
  try {
    const id = Number(req.params.id);
    const ids = [...new Set((Array.isArray(req.body?.usuarioIds) ? req.body.usuarioIds : []).map(Number).filter((x) => x > 0))];
    if (!ids.length) return res.status(400).json({ success: false, message: 'Elige al menos un usuario' });
    const p = await pool(req);
    for (const uid of ids) {
      await p.request().input('u', sql.Int, uid).input('f', sql.Int, id).input('por', sql.Int, req.user?.id || null).query(`
        IF EXISTS (SELECT 1 FROM dbo.NEUS_USUARIOS WHERE NEUS_ID = @u)
          AND NOT EXISTS (SELECT 1 FROM dbo.INTRANET_USUARIO_FUNCIONES WHERE UF_USUARIO_ID = @u AND UF_FUNCION_ID = @f)
        INSERT INTO dbo.INTRANET_USUARIO_FUNCIONES (UF_USUARIO_ID, UF_FUNCION_ID, UF_ASIGNADO_POR) VALUES (@u, @f, @por)`);
    }
    await auditar(p, req, 'funcion-asignar', id, { usuarioIds: ids });
    res.json({ success: true });
  } catch (e) {
    console.error('funcionesUsuario.agregarUsuarios:', e.message);
    res.status(500).json({ success: false, message: 'Error al asignar la función' });
  }
};

// DELETE /api/funciones-usuario/:id/usuarios/:usuarioId
exports.quitarUsuario = async (req, res) => {
  try {
    const p = await pool(req);
    await p.request().input('u', sql.Int, Number(req.params.usuarioId)).input('f', sql.Int, Number(req.params.id))
      .query('DELETE FROM dbo.INTRANET_USUARIO_FUNCIONES WHERE UF_USUARIO_ID = @u AND UF_FUNCION_ID = @f');
    await auditar(p, req, 'funcion-quitar', Number(req.params.id), { usuarioId: Number(req.params.usuarioId) });
    res.json({ success: true });
  } catch (e) {
    console.error('funcionesUsuario.quitarUsuario:', e.message);
    res.status(500).json({ success: false, message: 'Error al quitar la función' });
  }
};
