/**
 * CRM Cliente — Fase 8. Backfill de permiso ofertas-gestionar.
 * Da acceso a Ofertas a quien ya gestiona clientes o envía encuestas (perfil de
 * quien haría campañas). Idempotente, itera tenants. Molde de
 * backfillPermisosCitas.js.
 *
 * Ejecutar desde BackAgyda/:  NODE_ENV=development node scripts/backfillPermisosOfertas.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

const SI_TIENE = ['clientes-gestionar', 'clientes-encuestas', '*'];

function orClauses(list, col) { return list.map((_, i) => `${col} = @a${i}`).join(' OR '); }
function bind(request, sql, list) { list.forEach((a, i) => request.input(`a${i}`, sql.NVarChar, a)); }

async function backfillTenant(tenantKey) {
  const sql = require('mssql');
  let pool;
  try { pool = await databaseService.getPool(tenantKey); }
  catch (e) { console.log(`  [${tenantKey}] sin pool: ${e.message}`); return; }

  let roles = 0, usuarios = 0;
  try {
    let rq = pool.request(); bind(rq, sql, SI_TIENE);
    roles = (await rq.query(`
      INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
      SELECT DISTINCT p.ROL_ID, 'atencion-cliente', 'ofertas-gestionar'
      FROM INTRANET_ROLES_PERMISOS p
      WHERE p.MODULO_KEY = 'atencion-cliente' AND (${orClauses(SI_TIENE, 'p.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_ROLES_PERMISOS x WHERE x.ROL_ID=p.ROL_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('ofertas-gestionar','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;

    rq = pool.request(); bind(rq, sql, SI_TIENE);
    usuarios = (await rq.query(`
      INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
      SELECT DISTINCT a.USUARIO_ID, 'atencion-cliente', 'ofertas-gestionar', 1
      FROM INTRANET_USUARIOS_ACCIONES a
      WHERE a.ALLOW=1 AND a.MODULO_KEY='atencion-cliente' AND (${orClauses(SI_TIENE, 'a.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x WHERE x.USUARIO_ID=a.USUARIO_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('ofertas-gestionar','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;
  } catch (e) {
    console.log(`  [${tenantKey}] error: ${e.message}`);
  }
  console.log(`  [${tenantKey}] roles +${roles} · usuarios +${usuarios}`);
}

(async () => {
  await databaseService.initialize();
  console.log('Backfill de permiso ofertas-gestionar\n');
  for (const t of listTenants()) await backfillTenant(t.key);
  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
