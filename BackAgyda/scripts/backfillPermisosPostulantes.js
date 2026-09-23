/**
 * Gestión de postulantes — módulo nuevo 'postulantes', separado de
 * 'contact-center', con acciones granulares (ver/crear/tipificar/notas).
 * Backfill: da el módulo y sus 4 acciones a todo usuario que ya tuviera
 * acceso a Contact Center con 'ver' o 'atender', para que nadie pierda
 * acceso a Postulantes al separar el módulo. Idempotente
 * (INSERT ... WHERE NOT EXISTS), itera todos los tenants.
 * Molde de backfillPermisosCitas.js.
 *
 * Ejecutar desde BackAgyda/:  node scripts/backfillPermisosPostulantes.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

const CALIFICA_SI_TIENE = ['ver', 'atender', '*'];
const ACCIONES_NUEVAS = ['ver', 'crear', 'tipificar', 'notas'];

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

  const r = { modulos: 0, rolesAcciones: 0, usAcciones: 0 };

  try {
    // Módulo completo (INTRANET_USUARIOS_MODULOS) — quien ya tiene
    // 'contact-center' con ALLOW=1 recibe 'postulantes' con ALLOW=1.
    r.modulos = (await pool.request().query(`
      INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW)
      SELECT DISTINCT m.USUARIO_ID, 'postulantes', 1
      FROM INTRANET_USUARIOS_MODULOS m
      WHERE m.MODULO_KEY = 'contact-center' AND m.ALLOW = 1
        AND NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_MODULOS x WHERE x.USUARIO_ID=m.USUARIO_ID AND x.MODULO_KEY='postulantes')
      ;SELECT @@ROWCOUNT n`)).recordset[0].n;

    // Roles (INTRANET_ROLES_PERMISOS) — mismo criterio, por rol.
    for (const accion of ACCIONES_NUEVAS) {
      const rq = pool.request(); bind(rq, sql, CALIFICA_SI_TIENE);
      const n = (await rq.query(`
        INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
        SELECT DISTINCT p.ROL_ID, 'postulantes', '${accion}'
        FROM INTRANET_ROLES_PERMISOS p
        WHERE p.MODULO_KEY = 'contact-center' AND (${orClauses(CALIFICA_SI_TIENE, 'p.ACCION_KEY')})
          AND NOT EXISTS (SELECT 1 FROM INTRANET_ROLES_PERMISOS x WHERE x.ROL_ID=p.ROL_ID AND x.MODULO_KEY='postulantes' AND x.ACCION_KEY IN ('${accion}','*'))
        ;SELECT @@ROWCOUNT n`)).recordset[0].n;
      r.rolesAcciones += n;
    }

    // Usuarios (INTRANET_USUARIOS_ACCIONES) — mismo criterio, por usuario.
    for (const accion of ACCIONES_NUEVAS) {
      const rq = pool.request(); bind(rq, sql, CALIFICA_SI_TIENE);
      const n = (await rq.query(`
        INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
        SELECT DISTINCT a.USUARIO_ID, 'postulantes', '${accion}', 1
        FROM INTRANET_USUARIOS_ACCIONES a
        WHERE a.ALLOW=1 AND a.MODULO_KEY='contact-center' AND (${orClauses(CALIFICA_SI_TIENE, 'a.ACCION_KEY')})
          AND NOT EXISTS (SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x WHERE x.USUARIO_ID=a.USUARIO_ID AND x.MODULO_KEY='postulantes' AND x.ACCION_KEY IN ('${accion}','*'))
        ;SELECT @@ROWCOUNT n`)).recordset[0].n;
      r.usAcciones += n;
    }
  } catch (e) {
    console.log(`  [${tenantKey}] error: ${e.message}`);
  }

  console.log(`  [${tenantKey}] modulos:+${r.modulos} · roles-acciones:+${r.rolesAcciones} · usuarios-acciones:+${r.usAcciones}`);
}

(async () => {
  await databaseService.initialize();
  console.log('Backfill de permisos Postulantes\n');
  for (const t of listTenants()) await backfillTenant(t.key);
  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
