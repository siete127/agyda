const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { asegurarAncla } = require('../services/portalAnclaService');

// Resuelve el usuario del Portal de Cliente logueado (req.user.id = NEUS_ID,
// puesto por authenticateToken) vía la tabla puente PORTAL_USUARIOS —
// desacopla "quién puede loguearse" de "a qué empresa (contacto ancla)
// pertenece", para permitir que varias personas de la misma empresa
// compartan las mismas facturas/citas/incidencias con distinto sub-rol.
// Se monta después de authenticateToken en toda ruta del portal-cliente.
async function requirePortalCliente(req, res, next) {
  try {
    if (req.user?.tipoUsuario !== 'CL') {
      return res.status(403).json({ success: false, message: 'Acceso exclusivo del portal de cliente' });
    }
    const pool = await databaseService.getPool(req.user.empresa);
    const buscar = () => pool.request()
      .input('neusId', sql.Int, req.user.id)
      .query(`
        SELECT c.CONT_ID as id, c.CONT_NOMBRE as nombre, c.CONT_EMPRESA as empresa,
               c.CONT_CORREO as correo, c.CONT_ES_CLIENTE as esCliente,
               pu.PU_SUBROL_ID as subrolId, pu.PU_ES_ANCLA as esAncla
        FROM dbo.PORTAL_USUARIOS pu
        JOIN dbo.CRM_CONTACTOS c ON c.CONT_ID = pu.PU_CONT_ID
        WHERE pu.PU_NEUS_ID=@neusId AND pu.PU_ACTIVO=1 AND c.CONT_ACTIVO=1
      `);
    let rs = await buscar();
    // Acceso dado desde Clientes/CRM que aún no está en el portal: se registra
    // como su cuenta principal y se vuelve a buscar (ver portalAnclaService).
    if (!rs.recordset[0] && await asegurarAncla(pool, { neusId: req.user.id }).catch(() => 0)) {
      rs = await buscar();
    }
    if (!rs.recordset[0]) {
      return res.status(404).json({ success: false, message: 'No hay un contacto vinculado a este usuario' });
    }
    req.contacto = { ...rs.recordset[0], esCliente: !!rs.recordset[0].esCliente, esAncla: !!rs.recordset[0].esAncla };
    next();
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
}

// Caché simple en memoria de las acciones permitidas por sub-rol — mismo
// patrón que getUserAllowedActions en moduleAccess.js. Los permisos se
// resuelven en tiempo real (no se copian al usuario), así que editar un
// sub-rol afecta de inmediato a todos sus usuarios en cuanto expira el TTL.
const _accionesPorRolCache = new Map(); // key: `${tenantKey}:${subrolId}` -> { ts, acciones: Set<string> }
const CACHE_TTL_MS = 60 * 1000;

async function getPortalRolAcciones(subrolId, tenantKey) {
  const cacheKey = `${tenantKey}:${subrolId}`;
  const hit = _accionesPorRolCache.get(cacheKey);
  if (hit && (Date.now() - hit.ts) < CACHE_TTL_MS) return hit.acciones;

  const pool = await databaseService.getPool(tenantKey);
  const rs = await pool.request()
    .input('rolId', sql.Int, subrolId)
    .query(`SELECT ACCION_KEY FROM PORTAL_ROLES_PERMISOS WHERE ROL_ID=@rolId`);
  const acciones = new Set(rs.recordset.map((r) => r.ACCION_KEY));
  _accionesPorRolCache.set(cacheKey, { ts: Date.now(), acciones });
  return acciones;
}

function invalidatePortalRolCache(subrolId, tenantKey) {
  if (subrolId != null && tenantKey) {
    _accionesPorRolCache.delete(`${tenantKey}:${subrolId}`);
  } else {
    _accionesPorRolCache.clear();
  }
}

// Middleware factory: requiere que el sub-rol del usuario del portal tenga
// la acción indicada. Debe montarse después de requirePortalCliente.
function requirePortalAction(accionKey) {
  return async (req, res, next) => {
    try {
      if (!req.contacto) {
        return res.status(500).json({ success: false, message: 'requirePortalCliente debe ejecutarse antes de requirePortalAction' });
      }
      const acciones = await getPortalRolAcciones(req.contacto.subrolId, req.user?.empresa);
      if (acciones.has(accionKey)) return next();
      return res.status(403).json({ success: false, message: 'Tu rol no tiene permiso para esta acción' });
    } catch (e) {
      res.status(500).json({ success: false, message: e.message });
    }
  };
}

module.exports = { requirePortalCliente, requirePortalAction, getPortalRolAcciones, invalidatePortalRolCache };
