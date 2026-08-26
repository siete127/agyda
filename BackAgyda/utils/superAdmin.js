const { DEFAULT_TENANT } = require('../config/tenants');

// ADM_0001 (Edgar Montoya), TI_0117 (Abner Diaz) — ambos en la BD 'agyda'.
const SUPER_ADMIN_IDS = new Set([1, 96]);

// El ID por sí solo no basta: cada empresa numera su propio NEUS_ID desde 1,
// así que el primer usuario de CUALQUIER empresa nueva tendría id=1 y
// colisionaría si no se exige también que la sesión sea de la empresa maestra.
function esSuperAdminFijo(req) {
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  const empresa = (req.user?.empresa || DEFAULT_TENANT).toLowerCase();
  return empresa === DEFAULT_TENANT && SUPER_ADMIN_IDS.has(parseInt(uid));
}

module.exports = { SUPER_ADMIN_IDS, esSuperAdminFijo };
