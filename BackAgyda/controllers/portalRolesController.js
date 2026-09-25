const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { invalidatePortalRolCache } = require('../middleware/portalCliente');

// CRUD de sub-roles del Portal de Cliente, para empleados internos de AGYDA
// (no confundir con INTRANET_ROLES, que son los roles del panel interno).
// Calcado de rolController.js pero sin el concepto de "módulos": el portal
// solo tiene un puñado de endpoints, así que basta una lista plana de
// ACCION_KEY. Los permisos se resuelven en tiempo real (ver
// middleware/portalCliente.js getPortalRolAcciones), así que aquí solo hace
// falta invalidar el caché tras editar/borrar un rol.

const PORTAL_ACCIONES = [
  { key: 'ver-resumen', nombre: 'Ver resumen' },
  { key: 'ver-proyectos', nombre: 'Ver proyectos' },
  { key: 'ver-cotizaciones', nombre: 'Ver cotizaciones' },
  { key: 'ver-facturas', nombre: 'Ver facturas' },
  { key: 'descargar-documentos', nombre: 'Descargar documentos' },
  { key: 'subir-documentos', nombre: 'Subir documentos' },
  { key: 'chatear-asesor', nombre: 'Chatear con mi asesor' },
  { key: 'ver-citas', nombre: 'Ver citas' },
  { key: 'gestionar-citas', nombre: 'Confirmar / solicitar cambio de cita' },
  { key: 'ver-incidencias', nombre: 'Ver incidencias' },
  { key: 'crear-incidencias', nombre: 'Crear incidencias' },
  { key: 'gestionar-usuarios', nombre: 'Gestionar usuarios de mi empresa' },
];
const ACCION_KEYS = new Set(PORTAL_ACCIONES.map((a) => a.key));

exports.PORTAL_ACCIONES = PORTAL_ACCIONES;

exports.listAcciones = (req, res) => {
  res.json({ success: true, data: PORTAL_ACCIONES });
};

exports.listRoles = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT
        r.ROL_ID, r.NOMBRE, r.DESCRIPCION, r.ES_SISTEMA, r.ACTIVO, r.CREADO_EN,
        (SELECT COUNT(*) FROM PORTAL_USUARIOS pu WHERE pu.PU_SUBROL_ID = r.ROL_ID AND pu.PU_ACTIVO = 1) AS USUARIOS_COUNT
      FROM PORTAL_ROLES r
      ORDER BY r.ES_SISTEMA DESC, r.NOMBRE
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (e) {
    console.error('Error listRoles (portal):', e);
    res.status(500).json({ success: false, message: 'Error obteniendo roles del portal' });
  }
};

exports.getRole = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rolRs = await pool.request().input('id', sql.Int, id).query(`SELECT ROL_ID, NOMBRE, DESCRIPCION, ES_SISTEMA, ACTIVO FROM PORTAL_ROLES WHERE ROL_ID=@id`);
    if (!rolRs.recordset[0]) return res.status(404).json({ success: false, message: 'Rol no encontrado' });

    const permRs = await pool.request().input('id', sql.Int, id).query(`SELECT ACCION_KEY FROM PORTAL_ROLES_PERMISOS WHERE ROL_ID=@id`);
    res.json({ success: true, data: { ...rolRs.recordset[0], acciones: permRs.recordset.map((r) => r.ACCION_KEY) } });
  } catch (e) {
    console.error('Error getRole (portal):', e);
    res.status(500).json({ success: false, message: 'Error obteniendo el rol' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const { nombre, descripcion, acciones } = req.body || {};
    if (!nombre || !String(nombre).trim()) {
      return res.status(400).json({ success: false, message: 'El nombre es obligatorio' });
    }
    const rows = (Array.isArray(acciones) ? acciones : []).filter((a) => ACCION_KEYS.has(a));

    const pool = await databaseService.getPool(req.user?.empresa);
    const dup = await pool.request().input('nombre', sql.NVarChar, String(nombre).trim()).query(`SELECT ROL_ID FROM PORTAL_ROLES WHERE NOMBRE=@nombre`);
    if (dup.recordset.length) return res.status(400).json({ success: false, message: 'Ya existe un sub-rol con ese nombre' });

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      const ins = await new sql.Request(t)
        .input('nombre', sql.NVarChar, String(nombre).trim())
        .input('desc', sql.NVarChar, descripcion ? String(descripcion).trim() : null)
        .input('creadoPor', sql.Int, req.user?.id || null)
        .query(`INSERT INTO PORTAL_ROLES (NOMBRE, DESCRIPCION, ES_SISTEMA, ACTIVO, CREADO_POR) VALUES (@nombre, @desc, 0, 1, @creadoPor); SELECT SCOPE_IDENTITY() as id;`);
      const rolId = ins.recordset[0].id;
      for (const accionKey of rows) {
        await new sql.Request(t).input('rolId', sql.Int, rolId).input('accionKey', sql.NVarChar, accionKey)
          .query(`INSERT INTO PORTAL_ROLES_PERMISOS (ROL_ID, ACCION_KEY) VALUES (@rolId, @accionKey)`);
      }
      await t.commit();
      res.status(201).json({ success: true, data: { rolId } });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('Error createRole (portal):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { nombre, descripcion, acciones } = req.body || {};
    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request().input('id', sql.Int, id).query(`SELECT ROL_ID, ES_SISTEMA FROM PORTAL_ROLES WHERE ROL_ID=@id`);
    if (!rolRs.recordset[0]) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    const esSistema = !!rolRs.recordset[0].ES_SISTEMA;

    const rows = (Array.isArray(acciones) ? acciones : []).filter((a) => ACCION_KEYS.has(a));
    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      // Roles de sistema (Admin/Supervisor/Apoyo/Agente): solo se editan sus
      // permisos, no el nombre.
      if (!esSistema && nombre) {
        await new sql.Request(t).input('id', sql.Int, id).input('nombre', sql.NVarChar, String(nombre).trim())
          .input('desc', sql.NVarChar, descripcion !== undefined ? (descripcion ? String(descripcion).trim() : null) : null)
          .query(`UPDATE PORTAL_ROLES SET NOMBRE=@nombre, DESCRIPCION=@desc WHERE ROL_ID=@id`);
      } else if (!esSistema && descripcion !== undefined) {
        await new sql.Request(t).input('id', sql.Int, id).input('desc', sql.NVarChar, descripcion ? String(descripcion).trim() : null)
          .query(`UPDATE PORTAL_ROLES SET DESCRIPCION=@desc WHERE ROL_ID=@id`);
      }

      await new sql.Request(t).input('id', sql.Int, id).query(`DELETE FROM PORTAL_ROLES_PERMISOS WHERE ROL_ID=@id`);
      for (const accionKey of rows) {
        await new sql.Request(t).input('rolId', sql.Int, id).input('accionKey', sql.NVarChar, accionKey)
          .query(`INSERT INTO PORTAL_ROLES_PERMISOS (ROL_ID, ACCION_KEY) VALUES (@rolId, @accionKey)`);
      }
      await t.commit();
      invalidatePortalRolCache(id, req.user?.empresa);
      res.json({ success: true, message: 'Sub-rol actualizado' });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('Error updateRole (portal):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const pool = await databaseService.getPool(req.user?.empresa);

    const rolRs = await pool.request().input('id', sql.Int, id).query(`SELECT ROL_ID, ES_SISTEMA FROM PORTAL_ROLES WHERE ROL_ID=@id`);
    if (!rolRs.recordset[0]) return res.status(404).json({ success: false, message: 'Rol no encontrado' });
    if (rolRs.recordset[0].ES_SISTEMA) return res.status(409).json({ success: false, message: 'No se puede eliminar un sub-rol de sistema' });

    const usoRs = await pool.request().input('id', sql.Int, id).query(`SELECT COUNT(*) as n FROM PORTAL_USUARIOS WHERE PU_SUBROL_ID=@id AND PU_ACTIVO=1`);
    if ((usoRs.recordset[0]?.n || 0) > 0) {
      return res.status(409).json({ success: false, message: `No se puede eliminar: ${usoRs.recordset[0].n} usuario(s) activo(s) tienen este sub-rol` });
    }

    const t = new sql.Transaction(pool);
    await t.begin();
    try {
      await new sql.Request(t).input('id', sql.Int, id).query(`DELETE FROM PORTAL_ROLES_PERMISOS WHERE ROL_ID=@id`);
      await new sql.Request(t).input('id', sql.Int, id).query(`DELETE FROM PORTAL_ROLES WHERE ROL_ID=@id`);
      await t.commit();
      invalidatePortalRolCache(id, req.user?.empresa);
      res.json({ success: true, message: 'Sub-rol eliminado' });
    } catch (err) {
      try { await t.rollback(); } catch (_) {}
      throw err;
    }
  } catch (e) {
    console.error('Error deleteRole (portal):', e);
    res.status(500).json({ success: false, message: e.message });
  }
};
