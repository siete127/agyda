const { DEFAULT_TENANT } = require('../config/tenants');

// ADM_0001 (Edgar Montoya), TI_0117 (Abner Diaz), TI_0110 (Ines Jessica Ramos
// Meneses) — los tres en la BD 'agyda'.
const SUPER_ADMIN_IDS = new Set([1, 96, 64]);

// El ID por sí solo no basta: cada empresa numera su propio NEUS_ID desde 1,
// así que el primer usuario de CUALQUIER empresa nueva tendría id=1 y
// colisionaría si no se exige también que la sesión sea de la empresa maestra.
// Por eso el cross-empresa (abajo) se valida por username, que sí es estable
// entre BDs, y no por ese ID numérico.

// Usernames (NEUS_USUARIO / ventasUsuario del JWT) que son super admin en
// CUALQUIER empresa donde tengan cuenta y se logueen, no solo 'agyda'.
// Ver esSuperAdminFijo — a diferencia de SUPER_ADMIN_IDS, esto no exige
// empresa === DEFAULT_TENANT.
const SUPER_ADMIN_CROSS_EMPRESA_USERNAMES = new Set(['TI_0117']);

function esSuperAdminFijo(req) {
  const uid = req.user && (req.user.id || req.user.sub || req.user.userId);
  const empresa = (req.user?.empresa || DEFAULT_TENANT).toLowerCase();
  if (empresa === DEFAULT_TENANT && SUPER_ADMIN_IDS.has(parseInt(uid))) return true;

  const username = req.user?.ventasUsuario || req.user?.username || '';
  return SUPER_ADMIN_CROSS_EMPRESA_USERNAMES.has(String(username).toUpperCase());
}

module.exports = { SUPER_ADMIN_IDS, SUPER_ADMIN_CROSS_EMPRESA_USERNAMES, esSuperAdminFijo };
