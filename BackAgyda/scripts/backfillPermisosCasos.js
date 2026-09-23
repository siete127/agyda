/**
 * Fase 9 del rediseño de Atención al Cliente — backfill de permisos ANTES de
 * retirar el módulo legacy `quejas` y las acciones viejas de `atencion-cliente`
 * (ver-consultas, gestionar-consultas, ver-aclaraciones, gestionar-aclaraciones,
 * incidencias-ver, incidencias-gestionar, crear-consulta, crear-aclaracion).
 *
 * Sin esto, cualquier rol/usuario que solo tuviera el permiso viejo se quedaría
 * sin acceso a Casos (que lo reemplaza). El script:
 *   1. A quien tenga CUALQUIER permiso viejo de lectura  -> le da 'casos-ver'.
 *   2. A quien tenga CUALQUIER permiso viejo de gestión  -> le da 'casos-gestionar'.
 *   3. A quien tenga acceso al MÓDULO 'quejas'            -> le da acceso al
 *      módulo 'atencion-cliente'.
 * Opera sobre INTRANET_ROLES_PERMISOS (rol) e INTRANET_USUARIOS_ACCIONES /
 * INTRANET_USUARIOS_MODULOS (usuario). Idempotente (MERGE / NOT EXISTS).
 *
 * Ejecutar desde BackAgyda/:  NODE_ENV=development node scripts/backfillPermisosCasos.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });
const databaseService = require('../services/databaseService');
const { listTenants } = require('../config/tenants');

// Acciones viejas que dan derecho a VER casos.
const VIEJAS_LECTURA = [
  { modulo: 'atencion-cliente', accion: 'ver-consultas' },
  { modulo: 'atencion-cliente', accion: 'ver-aclaraciones' },
  { modulo: 'atencion-cliente', accion: 'incidencias-ver' },
  { modulo: 'quejas', accion: 'ver' },
  { modulo: 'quejas', accion: 'comentar' },
  { modulo: 'quejas', accion: '*' },
];
// Acciones viejas que dan derecho a GESTIONAR casos.
const VIEJAS_GESTION = [
  { modulo: 'atencion-cliente', accion: 'crear-consulta' },
  { modulo: 'atencion-cliente', accion: 'gestionar-consultas' },
  { modulo: 'atencion-cliente', accion: 'crear-aclaracion' },
  { modulo: 'atencion-cliente', accion: 'gestionar-aclaraciones' },
  { modulo: 'atencion-cliente', accion: 'incidencias-gestionar' },
  { modulo: 'quejas', accion: 'crear' },
  { modulo: 'quejas', accion: 'gestionar-estatus' },
  { modulo: 'quejas', accion: 'accion-correctiva' },
  { modulo: 'quejas', accion: '*' },
];

function orClauses(pairs, colMod, colAcc) {
  return pairs.map((_, i) => `(${colMod} = @m${i} AND ${colAcc} = @a${i})`).join(' OR ');
}
function bindPairs(request, sql, pairs) {
  pairs.forEach((p, i) => {
    request.input(`m${i}`, sql.NVarChar, p.modulo);
    request.input(`a${i}`, sql.NVarChar, p.accion);
  });
}

async function backfillTenant(tenantKey) {
  const sql = require('mssql');
  let pool;
  try {
    pool = await databaseService.getPool(tenantKey);
  } catch (e) {
    console.log(`  [${tenantKey}] sin pool: ${e.message}`);
    return;
  }

  const resumen = { rolesVer: 0, rolesGestionar: 0, usuariosVer: 0, usuariosGestionar: 0, modulos: 0 };

  // ── 1. ROLES ──────────────────────────────────────────────────────────────
  try {
    const rVer = pool.request();
    bindPairs(rVer, sql, VIEJAS_LECTURA);
    const res = await rVer.query(`
      INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
      SELECT DISTINCT p.ROL_ID, 'atencion-cliente', 'casos-ver'
      FROM INTRANET_ROLES_PERMISOS p
      WHERE (${orClauses(VIEJAS_LECTURA, 'p.MODULO_KEY', 'p.ACCION_KEY')})
        AND NOT EXISTS (
          SELECT 1 FROM INTRANET_ROLES_PERMISOS x
          WHERE x.ROL_ID = p.ROL_ID AND x.MODULO_KEY = 'atencion-cliente' AND x.ACCION_KEY IN ('casos-ver','*'))
      ;SELECT @@ROWCOUNT AS n`);
    resumen.rolesVer = res.recordset[0].n;

    const rGes = pool.request();
    bindPairs(rGes, sql, VIEJAS_GESTION);
    const res2 = await rGes.query(`
      INSERT INTO INTRANET_ROLES_PERMISOS (ROL_ID, MODULO_KEY, ACCION_KEY)
      SELECT DISTINCT p.ROL_ID, 'atencion-cliente', 'casos-gestionar'
      FROM INTRANET_ROLES_PERMISOS p
      WHERE (${orClauses(VIEJAS_GESTION, 'p.MODULO_KEY', 'p.ACCION_KEY')})
        AND NOT EXISTS (
          SELECT 1 FROM INTRANET_ROLES_PERMISOS x
          WHERE x.ROL_ID = p.ROL_ID AND x.MODULO_KEY = 'atencion-cliente' AND x.ACCION_KEY IN ('casos-gestionar','*'))
      ;SELECT @@ROWCOUNT AS n`);
    resumen.rolesGestionar = res2.recordset[0].n;
  } catch (e) {
    console.log(`  [${tenantKey}] roles: ${e.message}`);
  }

  // ── 2. USUARIOS (acciones) ────────────────────────────────────────────────
  try {
    const uVer = pool.request();
    bindPairs(uVer, sql, VIEJAS_LECTURA);
    const res = await uVer.query(`
      INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
      SELECT DISTINCT a.USUARIO_ID, 'atencion-cliente', 'casos-ver', 1
      FROM INTRANET_USUARIOS_ACCIONES a
      WHERE a.ALLOW = 1 AND (${orClauses(VIEJAS_LECTURA, 'a.MODULO_KEY', 'a.ACCION_KEY')})
        AND NOT EXISTS (
          SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x
          WHERE x.USUARIO_ID = a.USUARIO_ID AND x.MODULO_KEY = 'atencion-cliente' AND x.ACCION_KEY IN ('casos-ver','*'))
      ;SELECT @@ROWCOUNT AS n`);
    resumen.usuariosVer = res.recordset[0].n;

    const uGes = pool.request();
    bindPairs(uGes, sql, VIEJAS_GESTION);
    const res2 = await uGes.query(`
      INSERT INTO INTRANET_USUARIOS_ACCIONES (USUARIO_ID, MODULO_KEY, ACCION_KEY, ALLOW)
      SELECT DISTINCT a.USUARIO_ID, 'atencion-cliente', 'casos-gestionar', 1
      FROM INTRANET_USUARIOS_ACCIONES a
      WHERE a.ALLOW = 1 AND (${orClauses(VIEJAS_GESTION, 'a.MODULO_KEY', 'a.ACCION_KEY')})
        AND NOT EXISTS (
          SELECT 1 FROM INTRANET_USUARIOS_ACCIONES x
          WHERE x.USUARIO_ID = a.USUARIO_ID AND x.MODULO_KEY = 'atencion-cliente' AND x.ACCION_KEY IN ('casos-gestionar','*'))
      ;SELECT @@ROWCOUNT AS n`);
    resumen.usuariosGestionar = res2.recordset[0].n;
  } catch (e) {
    console.log(`  [${tenantKey}] usuarios acciones: ${e.message}`);
  }

  // ── 3. USUARIOS (acceso al módulo) ────────────────────────────────────────
  try {
    const res = await pool.request().query(`
      INSERT INTO INTRANET_USUARIOS_MODULOS (USUARIO_ID, MODULO_KEY, ALLOW)
      SELECT DISTINCT m.USUARIO_ID, 'atencion-cliente', 1
      FROM INTRANET_USUARIOS_MODULOS m
      WHERE m.MODULO_KEY = 'quejas' AND m.ALLOW = 1
        AND NOT EXISTS (
          SELECT 1 FROM INTRANET_USUARIOS_MODULOS x
          WHERE x.USUARIO_ID = m.USUARIO_ID AND x.MODULO_KEY = 'atencion-cliente')
      ;SELECT @@ROWCOUNT AS n`);
    resumen.modulos = res.recordset[0].n;
  } catch (e) {
    console.log(`  [${tenantKey}] usuarios modulos: ${e.message}`);
  }

  console.log(`  [${tenantKey}] roles +ver:${resumen.rolesVer} +gestionar:${resumen.rolesGestionar} · usuarios +ver:${resumen.usuariosVer} +gestionar:${resumen.usuariosGestionar} · modulo atencion-cliente +${resumen.modulos}`);
}

(async () => {
  await databaseService.initialize();
  console.log('Backfill de permisos Casos (Fase 9)\n');
  for (const t of listTenants()) {
    await backfillTenant(t.key);
  }
  console.log('\nListo.');
  process.exit(0);
})().catch((e) => { console.error('FALLO:', e); process.exit(1); });
