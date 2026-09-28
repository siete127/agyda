const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { DEFAULT_TENANT } = require('../config/tenants');
const { esSuperAdminFijo } = require('./superAdmin');

// Quién puede crear y configurar empresas (asistente "Crear empresa", catálogo
// de empresas y sus módulos):
//  1. Solo sesiones de la empresa maestra (Ardaby Tec). Desde cualquier otra
//     empresa se rechaza aunque el usuario tenga la acción marcada.
//  2. Los super-admins fijos, siempre.
//  3. Cualquier otro usuario, solo si tiene la acción accesos/crear-empresas
//     marcada EXPLÍCITAMENTE (directo o copiada de su rol). A diferencia del
//     resto de acciones, aquí NO aplica la compatibilidad de "módulo sin
//     configurar = todo permitido": sin la fila con ALLOW=1 no hay permiso.
async function puedeGestionarEmpresas(req) {
  const empresa = String(req.user?.empresa || DEFAULT_TENANT).toLowerCase();
  if (empresa !== DEFAULT_TENANT) return false;
  if (esSuperAdminFijo(req)) return true;

  const uid = parseInt(req.user && (req.user.id || req.user.sub || req.user.userId));
  if (!uid) return false;

  const { getEmpresaModulosBloqueados } = require('../middleware/moduleAccess');
  const bloqueados = await getEmpresaModulosBloqueados(DEFAULT_TENANT);
  if (bloqueados.has('accesos')) return false;

  const pool = await databaseService.getPool(DEFAULT_TENANT);
  const rs = await pool.request()
    .input('uid', sql.Int, uid)
    .query(`SELECT 1 AS ok FROM INTRANET_USUARIOS_ACCIONES
            WHERE USUARIO_ID = @uid AND MODULO_KEY = 'accesos' AND ACCION_KEY = 'crear-empresas' AND ALLOW = 1`);
  return rs.recordset.length > 0;
}

function requireGestionEmpresas(req, res, next) {
  puedeGestionarEmpresas(req)
    .then((ok) => (ok ? next() : res.status(403).json({ success: false, message: 'No tienes permiso para crear o configurar empresas' })))
    .catch((e) => {
      console.error('[gestionEmpresas] error verificando permiso:', e && e.message);
      res.status(500).json({ success: false, message: 'Error verificando el permiso de empresas' });
    });
}

module.exports = { puedeGestionarEmpresas, requireGestionEmpresas };
