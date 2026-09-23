/**
 * CRM Cliente — Fase 3. Backfill de permisos citas-ver / citas-gestionar.
 * Da acceso a la nueva Agenda de Citas a quien ya gestiona casos o tareas de
 * cliente, para que la pantalla no nazca inaccesible para los usuarios ya
 * configurados en Accesos. Idempotente (INSERT ... WHERE NOT EXISTS), itera
 * todos los tenants. Molde de backfillPermisosCasos.js.
 *
 * Ejecutar desde BackAgyda/:  NODE_ENV=development node scripts/backfillPermisosCitas.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

// Acciones que "califican" para recibir el permiso nuevo.
const VER_SI_TIENE = ['casos-ver', 'casos-gestionar', 'clientes-tareas', 'clientes-ver', '*'];
const GESTIONAR_SI_TIENE = ['casos-gestionar', 'clientes-tareas', '*'];

function orClauses(list, col) {
  return list.map((_, i) => `${col} = @a${i}`).join(' OR ');
}
function bind(request, sql, list) {
  list.forEach((a, i) => request.input(`a${i}`, sql.NVarChar, a));
}

async function backfillTenant(tenantKey) {
  const sql = require('mssql');
  let pool;
  try { pool = await databaseService.getPool(tenantKey); }
  catch (e) { console.log(`  [${tenantKey}] sin pool: ${e.message}`); return; }

  const r = { rolesVer: 0, rolesGest: 0, usVer: 0, usGest: 0 };

  try {
    // Roles
    let rq = pool.request(); bind(rq, sql, VER_SI_TIENE);
    r.rolesVer = (await rq.query(`
      INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
      SELECT DISTINCT p.ROL_ID, 'atencion-cliente', 'citas-ver'
      FROM INTRANET_ROLES_PERMISOS p
      WHERE p.MODULO_KEY = 'atencion-cliente' AND (${orClauses(VER_SI_TIENE, 'p.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_ROLES_PERMISOS x WHERE x.ROL_ID=p.ROL_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('citas-ver','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;

    rq = pool.request(); bind(rq, sql, GESTIONAR_SI_TIENE);
    r.rolesGest = (await rq.query(`
      INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
      SELECT DISTINCT p.ROL_ID, 'atencion-cliente', 'citas-gestionar'
      FROM INTRANET_ROLES_PERMISOS p
      WHERE p.MODULO_KEY = 'atencion-cliente' AND (${orClauses(GESTIONAR_SI_TIENE, 'p.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_ROLES_PERMISOS x WHERE x.ROL_ID=p.ROL_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('citas-gestionar','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;

    // Usuarios (acciones)
    rq = pool.request(); bind(rq, sql, VER_SI_TIENE);
    r.usVer = (await rq.query(`
      INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
      SELECT DISTINCT a.USUARIO_ID, 'atencion-cliente', 'citas-ver', 1
      FROM INTRANET_USUARIOS_ACCIONES a
      WHERE a.ALLOW=1 AND a.MODULO_KEY='atencion-cliente' AND (${orClauses(VER_SI_TIENE, 'a.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x WHERE x.USUARIO_ID=a.USUARIO_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('citas-ver','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;

    rq = pool.request(); bind(rq, sql, GESTIONAR_SI_TIENE);
    r.usGest = (await rq.query(`
      INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
      SELECT DISTINCT a.USUARIO_ID, 'atencion-cliente', 'citas-gestionar', 1
      FROM INTRANET_USUARIOS_ACCIONES a
      WHERE a.ALLOW=1 AND a.MODULO_KEY='atencion-cliente' AND (${orClauses(GESTIONAR_SI_TIENE, 'a.ACCION_KEY')})
        AND NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x WHERE x.USUARIO_ID=a.USUARIO_ID AND x.MODULO_KEY='atencion-cliente' AND x.ACCION_KEY IN ('citas-gestionar','*'))
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;
  } catch (e) {
    console.log(`  [${tenantKey}] error: ${e.message}`);
  }

  console.log(`  [${tenantKey}] roles +ver:${r.rolesVer} +gestionar:${r.rolesGest} · usuarios +ver:${r.usVer} +gestionar:${r.usGest}`);
}

(async () => {
  await databaseService.initialize();
  console.log('Backfill de permisos Agenda de Citas\n');
  for (const t of listTenants()) await backfillTenant(t.key);
  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
