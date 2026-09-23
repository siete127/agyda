// Migración de una sola ejecución: crea el registro PORTAL_USUARIOS (rol
// Admin, ancla) para cada usuario de portal ya existente antes de la Fase B.
// Debe correr DESPUÉS de que ensurePortalRolesSchema haya sembrado los 4
// roles de sistema, y ANTES de que el middleware reescrito (requirePortalCliente
// vía PORTAL_USUARIOS) entre en producción — si se invierte el orden, estos
// usuarios pierden acceso temporalmente.
// Uso: node scripts/migrar-portal-usuarios.js
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
const sql = require('mssql');
const dbConfig = require('../config/database');

async function main() {
  const pool = await new sql.ConnectionPool({ ...dbConfig, database: process.env.DB_NAME || 'intranet' }).connect();

  const rolAdminRs = await pool.request().query(`SELECT ROL_ID FROM PORTAL_ROLES WHERE NOMBRE='Admin' AND ES_SISTEMA=1`);
  const rolAdminId = rolAdminRs.recordset[0]?.ROL_ID;
  if (!rolAdminId) {
    console.error('No se encontró el sub-rol Admin sembrado. Corre primero el backend para que ensurePortalRolesSchema siembre los roles.');
    process.exit(1);
  }

  const result = await pool.request()
    .input('rolAdminId', sql.Int, rolAdminId)
    .query(`
      INSERT INTO PORTAL_USUARIOS (PU_NEUS_ID, PU_CONT_ID, PU_SUBROL_ID, PU_ES_ANCLA, PU_ACTIVO)
      OUTPUT INSERTED.PU_NEUS_ID, INSERTED.PU_CONT_ID
      SELECT c.CONT_NEUS_ID, c.CONT_ID, @rolAdminId, 1, 1
      FROM CRM_CONTACTOS c
      WHERE c.CONT_ES_CLIENTE = 1 AND c.CONT_NEUS_ID IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM PORTAL_USUARIOS pu WHERE pu.PU_NEUS_ID = c.CONT_NEUS_ID)
    `);

  console.log(`Migrados ${result.recordset.length} usuarios de portal existentes como Admin (ancla) de su empresa:`);
  console.log(JSON.stringify(result.recordset, null, 2));

  await pool.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
