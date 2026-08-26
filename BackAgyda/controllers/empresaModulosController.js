const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { getIO } = require('../services/socketService');
const { esSuperAdminFijo } = require('../utils/superAdmin');
const { DEFAULT_TENANT } = require('../config/tenants');
const { invalidateEmpresaModulosCache } = require('../middleware/moduleAccess');

function notifyEmpresaModulosUpdated(empKey) {
  try { getIO(empKey).emit('empresa-modulos-updated'); } catch (_) { /* sin sockets activos, no bloquea */ }
}

// GET /accesos/empresas/:empKey/modulos — devuelve el catálogo completo con
// su estado ALLOW resuelto (true si no hay fila = activo por default).
exports.getEmpresaModulos = async (req, res) => {
  try {
    if (!esSuperAdminFijo(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { empKey } = req.params;
    const empKeyNorm = String(empKey || '').toLowerCase();
    if (!empKeyNorm) return res.status(400).json({ success: false, message: 'empKey requerido' });

    // require perezoso: evita ciclo de carga entre accesoController y este archivo.
    const { MODULOS_DISPONIBLES } = require('./accesoController');

    const pool = await databaseService.getPool(DEFAULT_TENANT);
    const rs = await pool.request()
      .input('empKey', sql.NVarChar, empKeyNorm)
      .query(`SELECT MODULO_KEY, ALLOW FROM INTRANET_EMPRESAS_MODULOS WHERE EMP_KEY=@empKey`);

    const overrides = new Map(rs.recordset.map((r) => [String(r.MODULO_KEY), r.ALLOW === true || r.ALLOW === 1]));
    const data = MODULOS_DISPONIBLES.map((m) => ({
      key: m.key,
      nombre: m.nombre,
      descripcion: m.descripcion,
      allow: overrides.has(m.key) ? overrides.get(m.key) : true,
    }));

    return res.json({ success: true, data: { empKey: empKeyNorm, modulos: data } });
  } catch (e) {
    console.error('Error getEmpresaModulos:', e);
    return res.status(500).json({ success: false, message: 'Error obteniendo módulos de la empresa' });
  }
};

// PUT /accesos/empresas/:empKey/modulos/:moduloKey  { allow: boolean }
exports.setEmpresaModulo = async (req, res) => {
  try {
    if (!esSuperAdminFijo(req)) return res.status(403).json({ success: false, message: 'No autorizado' });
    const { empKey, moduloKey } = req.params;
    const { allow } = req.body || {};
    const empKeyNorm = String(empKey || '').toLowerCase();
    const key = String(moduloKey || '').toLowerCase();
    if (!empKeyNorm || !key) return res.status(400).json({ success: false, message: 'empKey y moduloKey requeridos' });
    if (typeof allow !== 'boolean') return res.status(400).json({ success: false, message: 'allow (boolean) requerido' });
    if (key === '*' || key === 'areas-portal') {
      return res.status(400).json({ success: false, message: 'Este valor no es un módulo asignable' });
    }

    const { MODULOS_DISPONIBLES } = require('./accesoController');
    if (!MODULOS_DISPONIBLES.some((m) => m.key === key)) {
      return res.status(400).json({ success: false, message: 'Módulo desconocido' });
    }

    const adminId = req.user?.id || req.user?.sub || req.user?.userId || null;
    const pool = await databaseService.getPool(DEFAULT_TENANT);
    await pool.request()
      .input('empKey', sql.NVarChar, empKeyNorm)
      .input('moduloKey', sql.NVarChar, key)
      .input('allow', sql.Bit, allow)
      .input('grantedBy', sql.Int, adminId ? parseInt(adminId) : null)
      .query(`
        MERGE INTRANET_EMPRESAS_MODULOS AS target
        USING (SELECT @empKey AS EMP_KEY, @moduloKey AS MODULO_KEY) AS src
        ON target.EMP_KEY = src.EMP_KEY AND target.MODULO_KEY = src.MODULO_KEY
        WHEN MATCHED THEN UPDATE SET ALLOW = @allow, GRANTED_BY = @grantedBy, GRANTED_AT = GETDATE()
        WHEN NOT MATCHED THEN INSERT (EMP_KEY, MODULO_KEY, ALLOW, GRANTED_BY) VALUES (src.EMP_KEY, src.MODULO_KEY, @allow, @grantedBy);
      `);

    invalidateEmpresaModulosCache(empKeyNorm);
    notifyEmpresaModulosUpdated(empKeyNorm);

    return res.json({ success: true, message: allow ? 'Módulo activado para la empresa' : 'Módulo desactivado para la empresa' });
  } catch (e) {
    console.error('Error setEmpresaModulo:', e);
    return res.status(500).json({ success: false, message: 'Error actualizando módulo de la empresa' });
  }
};
