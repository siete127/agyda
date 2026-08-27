const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { logAudit } = require('../services/auditService');
const { MODULOS_DISPONIBLES, ACCIONES_POR_MODULO } = require('./accesoController');

const MODULO_KEYS = new Set(MODULOS_DISPONIBLES.map((m) => m.key));

// Deriva el código técnico (NEUS_TIPOUSUARIO) de un rol personalizado a partir
// de los módulos que incluye. Este código solo lo usa el control de acceso a
// rutas del backend/sidebar — los permisos reales los dan los módulos/acciones.
//  - módulos de administración → AD
//  - módulos propios de Call Center → CC
//  - en otro caso → ST (Staff)
const MODULOS_ADMIN = new Set(['usuarios', 'accesos', 'configuracion', 'auditoria', 'nomina', 'direccion-general']);
const MODULOS_CC = new Set(['webphone', 'evaluacion', 'livechat', 'operaciones']);
function derivarRolBase(modulos) {
  const set = new Set((modulos || []).map(String));
  for (const m of set) if (MODULOS_ADMIN.has(m)) return 'AD';
  for (const m of set) if (MODULOS_CC.has(m)) return 'CC';
  return 'ST';
}

// Normaliza { modulos: string[], acciones: Record<mod, string[]> } del body a una
// lista de filas { moduloKey, accionKey } para INTRANET_ROLES_PERMISOS, validando
// contra el catálogo real. accionKey '*' = acceso al módulo completo.
function buildPermisoRows(modulos, acciones) {
  const rows = [];
  const seen = new Set();
  const add = (mod, acc) => {
    const key = `${mod}|${acc}`;
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ moduloKey: mod, accionKey: acc });
  };

  for (const m of Array.isArray(modulos) ? modulos : []) {
    if (MODULO_KEYS.has(String(m))) add(String(m), '*');
  }

  const accObj = acciones && typeof acciones === 'object' ? acciones : {};
  for (const [mod, lista] of Object.entries(accObj)) {
    if (!MODULO_KEYS.has(mod)) continue;
    const disponibles = (ACCIONES_POR_MODULO[mod] ?? []).map((a) => a.key);
    // Una acción implica acceso al módulo.
    if (Array.isArray(lista) && lista.length) add(mod, '*');
    for (const acc of Array.isArray(lista) ? lista : []) {
      if (disponibles.includes(String(acc))) add(mod, String(acc));
    }
  }
  return rows;
}

exports.listRoles = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        r.ROL_ID, r.NOMBRE, r.DESCRIPCION, r.ROL_BASE, r.ES_SISTEMA, r.ACTIVO, r.CREADO_EN,
        (SELECT COUNT(DISTINCT p.MODULO_KEY) FROM dbo.INTRANET_ROLES_PERMISOS p WHERE p.ROL_ID = r.ROL_ID) AS MODULOS_COUNT
      FROM dbo.INTRANET_ROLES r
      ORDER BY r.ES_SISTEMA DESC, r.NOMBRE
    `);
    return res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listRoles:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo roles' });
  }
};

exports.getRole = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT ROL_ID, NOMBRE, DESCRIPCION, ROL_BASE, ES_SISTEMA, ACTIVO FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id`);
    if (rolRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }

    const permRs = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT MODULO_KEY, ACCION_KEY FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID = @id`);

    const modulos = [];
    const accionesObj = {};
    for (const r of permRs.recordset) {
      if (r.ACCION_KEY === '*') {
        if (!modulos.includes(r.MODULO_KEY)) modulos.push(r.MODULO_KEY);
      } else {
        if (!accionesObj[r.MODULO_KEY]) accionesObj[r.MODULO_KEY] = [];
        accionesObj[r.MODULO_KEY].push(r.ACCION_KEY);
      }
    }

    return res.json({
      success: true,
      data: { ...rolRs.recordset[0], modulos, acciones: accionesObj },
    });
  } catch (e) {
    console.error('Error getRole:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo el rol' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { nombre, descripcion, modulos, acciones } = req.body;
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }

    const adminId = req.user && (req.user.id || req.user.sub || req.user.userId)
      ? parseInt(req.user.id || req.user.sub || req.user.userId) : null;
    const rows = buildPermisoRows(modulos, acciones);
    // El código técnico se deriva de los módulos elegidos.
    const base = derivarRolBase(Array.isArray(modulos) ? modulos : []);
    const pool = await databaseService.getPool(req.user?.empresa);

    const dup = await pool.request()
      .input('nombre', sql.NVarChar, String(nombre).trim())
      .query(`SELECT ROL_ID FROM dbo.INTRANET_ROLES WHERE NOMBRE = @nombre`);
    if (dup.recordset.length) {
      return res.status(400).json({ success: false, message: 'Ya existe un rol con ese nombre' });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      const ins = await new sql.Request(t)
        .input('nombre', sql.NVarChar, String(nombre).trim())
        .input('desc', sql.NVarChar, descripcion ? String(descripcion).trim() : null)
        .input('base', sql.NVarChar, base)
        .input('creadoPor', sql.Int, adminId)
        .query(`
          INSERT INTO dbo.INTRANET_ROLES (NOMBRE, DESCRIPCION, ROL_BASE, ES_SISTEMA, ACTIVO, CREADO_POR)
          VALUES (@nombre, @desc, @base, 0, 1, @creadoPor);
          SELECT SCOPE_IDENTITY() AS ROL_ID;
        `);
      const rolId = ins.recordset[0].ROL_ID;

      for (const row of rows) {
        await new sql.Request(t)
          .input('rolId', sql.Int, rolId)
          .input('modKey', sql.NVarChar, row.moduloKey)
          .input('accKey', sql.NVarChar, row.accionKey)
          .query(`INSERT INTO dbo.INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY) VALUES (@rolId, @modKey, @accKey)`);
      }
      await t.commit();

      await logAudit(pool, {
        userId: req.user?.id || null, userName: req.user?.nombre || null,
        modulo: 'accesos', accion: 'rol-crear', entidadId: rolId,
        detalle: { nombre, rolBase: base, permisos: rows.length }, ip: req.ip,
      });
      return res.status(201).json({ success: true, message: 'Rol creado', data: { rolId } });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('Error createRole:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, descripcion, modulos, acciones } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT ROL_ID, ES_SISTEMA FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id`);
    if (rolRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }
    const esSistema = rolRs.recordset[0].ES_SISTEMA === true || rolRs.recordset[0].ES_SISTEMA === 1;

    const rows = buildPermisoRows(modulos, acciones);
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      // Roles de sistema: solo se editan sus permisos, no nombre/código.
      // Roles personalizados: el código se re-deriva de los módulos elegidos.
      if (!esSistema) {
        const base = derivarRolBase(Array.isArray(modulos) ? modulos : []);
        await new sql.Request(t)
          .input('id', sql.Int, parseInt(id))
          .input('nombre', sql.NVarChar, nombre ? String(nombre).trim() : null)
          .input('desc', sql.NVarChar, descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : null)
          .input('base', sql.NVarChar, base)
          .query(`
            UPDATE dbo.INTRANET_ROLES SET
              NOMBRE      = ISNULL(@nombre, NOMBRE),
              DESCRIPCION = @desc,
              ROL_BASE    = @base
            WHERE ROL_ID = @id
          `);
      }

      await new sql.Request(t)
        .input('id', sql.Int, parseInt(id))
        .query(`DELETE FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID = @id`);
      for (const row of rows) {
        await new sql.Request(t)
          .input('rolId', sql.Int, parseInt(id))
          .input('modKey', sql.NVarChar, row.moduloKey)
          .input('accKey', sql.NVarChar, row.accionKey)
          .query(`INSERT INTO dbo.INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY) VALUES (@rolId, @modKey, @accKey)`);
      }
      await t.commit();

      await logAudit(pool, {
        userId: req.user?.id || null, userName: req.user?.nombre || null,
        modulo: 'accesos', accion: 'rol-editar', entidadId: parseInt(id),
        detalle: { esSistema, permisos: rows.length }, ip: req.ip,
      });
      return res.json({ success: true, message: 'Rol actualizado' });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('Error updateRole:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request()
      .input('id', sql.Int, parseInt(id))
      .query(`SELECT ROL_ID, ES_SISTEMA, NOMBRE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id`);
    if (rolRs.recordset.length === 0) {
      return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    }
    const esSistema = rolRs.recordset[0].ES_SISTEMA === true || rolRs.recordset[0].ES_SISTEMA === 1;

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      await new sql.Request(t).input('id', sql.Int, parseInt(id))
        .query(`DELETE FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID = @id`);
      await new sql.Request(t).input('id', sql.Int, parseInt(id))
        .query(`DELETE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id`);
      await t.commit();
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }

    await logAudit(pool, {
      userId: req.user?.id || null, userName: req.user?.nombre || null,
      modulo: 'accesos', accion: 'rol-eliminar', entidadId: parseInt(id),
      detalle: { nombre: rolRs.recordset[0].NOMBRE, esSistema }, ip: req.ip,
    });
    return res.json({ success: true, message: 'Rol eliminado' });
  } catch (e) {
    console.error('Error deleteRole:', e);
    return res.status(500).json({ success: false, message: e.message });
  }
};

// Copia los permisos de un rol a las tablas individuales de un usuario.
// - reemplazar=false (default, al crear): solo añade lo que falta.
// - reemplazar=true (al cambiar el rol de un usuario existente): borra primero
//   todos sus permisos y deja exactamente los del rol.
// Devuelve el ROL_BASE del rol.
exports.aplicarRolAUsuario = async (pool, rolId, usuarioId, grantedBy, reemplazar = false) => {
  const rolRs = await pool.request()
    .input('id', sql.Int, parseInt(rolId))
    .query(`SELECT ROL_BASE FROM dbo.INTRANET_ROLES WHERE ROL_ID = @id AND ACTIVO = 1`);
  if (rolRs.recordset.length === 0) return null;
  const rolBase = rolRs.recordset[0].ROL_BASE;

  const permRs = await pool.request()
    .input('id', sql.Int, parseInt(rolId))
    .query(`SELECT MODULO_KEY, ACCION_KEY FROM dbo.INTRANET_ROLES_PERMISOS WHERE ROL_ID = @id`);

  const modulosSet = new Set();
  const accionesPorMod = {};
  for (const r of permRs.recordset) {
    modulosSet.add(r.MODULO_KEY);
    if (r.ACCION_KEY !== '*') {
      if (!accionesPorMod[r.MODULO_KEY]) accionesPorMod[r.MODULO_KEY] = [];
      accionesPorMod[r.MODULO_KEY].push(r.ACCION_KEY);
    }
  }

  const t = new sql.Transaction(pool);
  await t.begin();
  try {
    if (reemplazar) {
      await new sql.Request(t).input('u', sql.Int, parseInt(usuarioId))
        .query(`DELETE FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@u`);
      await new sql.Request(t).input('u', sql.Int, parseInt(usuarioId))
        .query(`DELETE FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@u`);
    }

    // Centinela: marca al usuario como "ya configurado" (no re-inicializar por rol).
    await new sql.Request(t)
      .input('usuarioId', sql.Int, parseInt(usuarioId))
      .query(`
        IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId AND MODULO_KEY='__initialized__')
          INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW) VALUES (@usuarioId, '__initialized__', 0)
      `);

    for (const modKey of modulosSet) {
      await new sql.Request(t)
        .input('usuarioId', sql.Int, parseInt(usuarioId))
        .input('moduloKey', sql.NVarChar, modKey)
        .input('grantedBy', sql.Int, grantedBy || null)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID=@usuarioId AND MODULO_KEY=@moduloKey)
            INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW, GRANTED_BY)
            VALUES (@usuarioId, @moduloKey, 1, @grantedBy)
        `);
    }

    for (const [modKey, lista] of Object.entries(accionesPorMod)) {
      await new sql.Request(t)
        .input('usuarioId', sql.Int, parseInt(usuarioId))
        .input('moduloKey', sql.NVarChar, modKey)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@usuarioId AND MODULO_KEY=@moduloKey AND ACCION_KEY='__initialized__')
            INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW) VALUES (@usuarioId, @moduloKey, '__initialized__', 0)
        `);
      for (const accKey of lista) {
        await new sql.Request(t)
          .input('usuarioId', sql.Int, parseInt(usuarioId))
          .input('moduloKey', sql.NVarChar, modKey)
          .input('accionKey', sql.NVarChar, accKey)
          .input('grantedBy', sql.Int, grantedBy || null)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID=@usuarioId AND MODULO_KEY=@moduloKey AND ACCION_KEY=@accionKey)
              INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW, GRANTED_BY)
              VALUES (@usuarioId, @moduloKey, @accionKey, 1, @grantedBy)
          `);
      }
    }
    await t.commit();
  } catch (err) {
    try { await t.rollback(); } catch (_) {}
    throw err;
  }

  return rolBase;
};
