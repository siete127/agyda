/*
 * Limpieza puntual: elimina los tickets de PRUEBA identificados manualmente
 * (títulos "prueba*", "test*", "asd", "pp", "Holi", "ayudaaa", etc.) junto con
 * todos sus registros hijos. Ejecución única, transaccional.
 *
 *   node scripts/limpiar-tickets-prueba.js            (dry-run: solo lista)
 *   node scripts/limpiar-tickets-prueba.js --aplicar  (ejecuta el borrado)
 */
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : '.env.development' });
const databaseService = require('../services/databaseService');

const TICKET_IDS = [
  77, 79, 88, 108, 109, 127, 134, 138, 139, 141, 147, 148, 149, 150, 171, 180,
  214, 224, 229, 230, 231, 253, 367, 403, 406, 408, 414, 416, 417, 419, 420, 421, 423,
];

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'agyda';
const APLICAR = process.argv.includes('--aplicar');

(async () => {
  const pool = await databaseService.getPool(EMPRESA);
  const idList = TICKET_IDS.join(',');

  const rs = await pool.request().query(`
    SELECT TICKET_ID, TITULO, ESTADO, CONVERT(varchar(10), FECHA_CREACION, 120) fecha
    FROM TICKETS WHERE TICKET_ID IN (${idList}) ORDER BY TICKET_ID
  `);
  console.log(`\nTickets a eliminar (${rs.recordset.length}):`);
  console.table(rs.recordset);

  if (!APLICAR) {
    console.log('\nDry-run. Ejecuta con --aplicar para borrar.\n');
    process.exit(0);
  }

  const tx = pool.transaction();
  await tx.begin();
  try {
    const q = (sql) => tx.request().query(sql);
    // Hijos que se borran
    await q(`DELETE FROM TICKET_COMENTARIOS   WHERE TICKET_ID IN (${idList})`);
    await q(`DELETE FROM TICKET_HISTORIAL     WHERE TICKET_ID IN (${idList})`);
    await q(`DELETE FROM TICKET_SATISFACCION  WHERE TICKET_ID IN (${idList})`);
    await q(`DELETE FROM TICKET_CAMPOS_VALORES WHERE TCV_TICKET_ID IN (${idList})`);
    await q(`DELETE FROM TICKET_ESCALAMIENTOS WHERE TICKET_ID IN (${idList})`);
    await q(`DELETE FROM NOTIFICACIONES       WHERE TICKET_ID IN (${idList})`);
    // Conversaciones que solo se desvinculan (no se borra el chat/sesión)
    await q(`UPDATE LIVECHAT_CONVERSACIONES SET LC_TICKET_ID = NULL WHERE LC_TICKET_ID IN (${idList})`);
    await q(`UPDATE CHATBOT_SESIONES       SET SES_TICKET_ID = NULL WHERE SES_TICKET_ID IN (${idList})`);
    // El ticket
    const del = await q(`DELETE FROM TICKETS WHERE TICKET_ID IN (${idList})`);
    await tx.commit();
    console.log(`\n✅ Eliminados ${del.rowsAffected[0]} tickets de prueba y sus registros hijos.\n`);
  } catch (e) {
    await tx.rollback();
    console.error('\n❌ Rollback:', e.message, '\n');
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
