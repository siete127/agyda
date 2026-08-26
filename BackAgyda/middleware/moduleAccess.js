const databaseService = require('../services/databaseService');
const { DEFAULT_TENANT } = require('../config/tenants');
const { SUPER_ADMIN_IDS, esSuperAdminFijo } = require('../utils/superAdmin');

// Cache simple en memoria para reducir lecturas frecuentes (opcional).
// Se indexa también por empresa: el mismo userId numérico puede existir en
// más de un tenant con permisos distintos.
const cache = new Map(); // key: `${tenantKey}:${userId}` -> { ts: number, modules: Set<string> }
const CACHE_TTL_MS = 60 * 1000; // 1 minuto

function _now() { return Date.now(); }

// ── Módulos activos por empresa (multi-tenant) ──
// Tabla exclusiva de la BD maestra 'agyda' (ver schemaService.ensureEmpresasModulosSchema).
// Cachea el set de módulos BLOQUEADOS (ALLOW=0) por empresa — ausencia de
// filas para un módulo = activo, así que solo hace falta guardar excepciones.
const empresaModulosCache = new Map(); // key: empKey -> { ts, blocked: Set<string> }

async function getEmpresaModulosBloqueados(empKey) {
  const key = String(empKey || DEFAULT_TENANT).toLowerCase();
  const hit = empresaModulosCache.get(key);
  if (hit && (_now() - hit.ts) < CACHE_TTL_MS) return hit.blocked;

  const pool = await databaseService.getPool(DEFAULT_TENANT); // siempre la BD maestra
  const rs = await pool.request()
    .input('empKey', require('mssql').NVarChar, key)
    .query(`SELECT MODULO_KEY FROM INTRANET_EMPRESAS_MODULOS WHERE EMP_KEY=@empKey AND ALLOW=0`);

  const blocked = new Set(rs.recordset.map((r) => String(r.MODULO_KEY).toLowerCase()));
  empresaModulosCache.set(key, { ts: _now(), blocked });
  return blocked;
}

function invalidateEmpresaModulosCache(empKey) {
  empresaModulosCache.delete(String(empKey || DEFAULT_TENANT).toLowerCase());
}

async function getUserAllowedModules(userId, tenantKey = DEFAULT_TENANT) {
  const key = `${tenantKey}:${userId}`;
  const hit = cache.get(key);
  if (hit && (_now() - hit.ts) < CACHE_TTL_MS) {
    return hit.modules;
  }
  const pool = await databaseService.getPool(tenantKey);
  const rs = await pool.request().query(`
    SELECT MODULO_KEY, ALLOW FROM INTRANET_USUARIOS_MODULOS WHERE USUARIO_ID = ${parseInt(userId)}
  `);
  const allowed = new Set();
  let anyRow = false;
  for (const r of rs.recordset) {
    anyRow = true;
    if (r.ALLOW === true || r.ALLOW === 1) {
      allowed.add(String(r.MODULO_KEY).toLowerCase());
    }
  }
  // Política de compatibilidad: si el usuario no tiene filas, permitir todo
  const modules = anyRow ? allowed : new Set(['*']);
  cache.set(key, { ts: _now(), modules });
  return modules;
}

// Middleware: requiere acceso al módulo indicado
// - Super-admin fijo: siempre permitido, ni el bloqueo de empresa le aplica
// - Módulo desactivado para la empresa del usuario: denegado, incluso a un
//   admin normal (rol AD no fijo) — se evalúa ANTES del atajo de rol de abajo
// - Admin (AD/admin/Administrador) siempre permitido
// - Si el usuario no tiene filas en la tabla, se permite por compatibilidad
// - En otro caso, debe existir ALLOW=1 para el módulo
function requireModuleAccess(modKey) {
  const keyNorm = String(modKey || '').toLowerCase();
  return async (req, res, next) => {
    try {
      if (esSuperAdminFijo(req)) return next();

      const blocked = await getEmpresaModulosBloqueados(req.user?.empresa);
      if (blocked.has(keyNorm)) {
        return res.status(403).json({ success: false, message: 'Módulo desactivado para tu empresa', modulo: modKey });
      }

      const tipo = (req.user && (req.user.tipoUsuario || req.user.role || req.user.tipousuario) || '').toString().toLowerCase();
      const adminAliases = new Set(['ad','admin','administrador','administradora']);
      if (adminAliases.has(tipo)) return next();

      const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
      if (!uid) return res.status(401).json({ success:false, message: 'Token inválido' });

      const allowed = await getUserAllowedModules(uid, req.user?.empresa);
      if (allowed.has('*') || allowed.has(keyNorm)) return next();

      return res.status(403).json({ success:false, message: 'Acceso denegado al módulo', modulo: modKey });
    } catch (e) {
      console.error('[moduleAccess] error:', e && e.message);
      return res.status(500).json({ success:false, message: 'Error verificando accesos de módulo' });
    }
  };
}

// ── Permisos granulares por acción dentro de un módulo ──
const actionCache = new Map(); // key: `${tenantKey}:${userId}:${moduloKey}` -> { ts, actions: Set<string> }

async function getUserAllowedActions(userId, moduloKey, tenantKey = DEFAULT_TENANT) {
  const cacheKey = `${tenantKey}:${userId}:${moduloKey}`;
  const hit = actionCache.get(cacheKey);
  if (hit && (_now() - hit.ts) < CACHE_TTL_MS) return hit.actions;

  const pool = await databaseService.getPool(tenantKey);
  const rs = await pool.request()
    .input('uid', require('mssql').Int, parseInt(userId))
    .input('mod', require('mssql').NVarChar, String(moduloKey).toLowerCase())
    .query(`SELECT ACCION_KEY, ALLOW FROM INTRANET_USUARIOS_ACCIONES WHERE USUARIO_ID = @uid AND MODULO_KEY = @mod`);

  const allowed = new Set();
  let anyRow = false;
  for (const r of rs.recordset) {
    anyRow = true;
    if (r.ALLOW === true || r.ALLOW === 1) allowed.add(String(r.ACCION_KEY).toLowerCase());
  }
  // Sin filas configuradas para este módulo = todas las acciones permitidas (compatibilidad)
  const actions = anyRow ? allowed : new Set(['*']);
  actionCache.set(cacheKey, { ts: _now(), actions });
  return actions;
}

function invalidateActionsCache(userId, moduloKey, tenantKey = DEFAULT_TENANT) {
  if (moduloKey) actionCache.delete(`${tenantKey}:${userId}:${moduloKey}`);
  else {
    const prefix = `${tenantKey}:${userId}:`;
    for (const key of actionCache.keys()) {
      if (key.startsWith(prefix)) actionCache.delete(key);
    }
  }
}

// Middleware: requiere permiso sobre una acción específica de un módulo
// - Los 2 super-admins fijos siempre permitidos
// - Cualquier otro usuario (incluido AD/TI) respeta lo configurado en Accesos
// - Sin filas configuradas para el módulo = permitido (compatibilidad, ver getUserAllowedActions)
function requireActionAccess(moduloKey, accionKey) {
  const modNorm = String(moduloKey || '').toLowerCase();
  const accNorm = String(accionKey || '').toLowerCase();
  return async (req, res, next) => {
    try {
      const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
      if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });
      if (esSuperAdminFijo(req)) return next();

      const blocked = await getEmpresaModulosBloqueados(req.user?.empresa);
      if (blocked.has(modNorm)) {
        return res.status(403).json({ success: false, message: 'Módulo desactivado para tu empresa', modulo: moduloKey });
      }

      const allowed = await getUserAllowedActions(uid, modNorm, req.user?.empresa);
      if (allowed.has('*') || allowed.has(accNorm)) return next();

      return res.status(403).json({ success: false, message: 'Acceso denegado a esta función', modulo: moduloKey, accion: accionKey });
    } catch (e) {
      console.error('[moduleAccess] error acción:', e && e.message);
      return res.status(500).json({ success: false, message: 'Error verificando permisos de acción' });
    }
  };
}

// Middleware: permite el acceso si el usuario tiene CUALQUIERA de las acciones
// dadas (par [moduloKey, accionKey]). Usado en rutas compartidas entre dos
// módulos durante una migración (ej. documentos de cliente accesibles tanto por
// permisos legados de 'crm' como por los nuevos de 'atencion-cliente'), para no
// cortar el acceso a usuarios ya configurados bajo el permiso viejo.
function requireAnyActionAccess(pares) {
  return async (req, res, next) => {
    try {
      const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
      if (!uid) return res.status(401).json({ success: false, message: 'Token inválido' });
      if (esSuperAdminFijo(req)) return next();

      const blocked = await getEmpresaModulosBloqueados(req.user?.empresa);
      for (const [moduloKey, accionKey] of pares) {
        const modNorm = String(moduloKey || '').toLowerCase();
        if (blocked.has(modNorm)) continue; // este par está bloqueado a nivel empresa, probar el siguiente
        const allowed = await getUserAllowedActions(uid, modNorm, req.user?.empresa);
        if (allowed.has('*') || allowed.has(String(accionKey || '').toLowerCase())) return next();
      }

      return res.status(403).json({ success: false, message: 'Acceso denegado a esta función' });
    } catch (e) {
      console.error('[moduleAccess] error acción (any):', e && e.message);
      return res.status(500).json({ success: false, message: 'Error verificando permisos de acción' });
    }
  };
}

// Usuarios a notificar por correo para un módulo: los que tienen la acción
// 'notificar-correo' habilitada explícitamente en Accesos (INTRANET_USUARIOS_ACCIONES).
// A diferencia de getUserAllowedActions, aquí "sin filas configuradas" = NO notificar
// (opt-in explícito, no el comodín de compatibilidad de las demás acciones).
async function getUsuariosParaNotificarCorreo(moduloKey, tenantKey = DEFAULT_TENANT) {
  const mod = String(moduloKey || '').toLowerCase();
  const pool = await databaseService.getPool(tenantKey);
  const rs = await pool.request()
    .input('mod', require('mssql').NVarChar, mod)
    .input('accion', require('mssql').NVarChar, 'notificar-correo')
    .query(`SELECT USUARIO_ID FROM INTRANET_USUARIOS_ACCIONES WHERE MODULO_KEY = @mod AND ACCION_KEY = @accion AND ALLOW = 1`);
  return rs.recordset.map((r) => r.USUARIO_ID);
}

module.exports = {
  requireModuleAccess,
  getUserAllowedModules,
  requireActionAccess,
  requireAnyActionAccess,
  getUserAllowedActions,
  invalidateActionsCache,
  getUsuariosParaNotificarCorreo,
  getEmpresaModulosBloqueados,
  invalidateEmpresaModulosCache,
  SUPER_ADMIN_IDS,
  esSuperAdminFijo,
};
