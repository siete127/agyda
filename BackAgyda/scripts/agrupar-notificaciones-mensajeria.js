/*
 * Colapsa las notificaciones de MENSAJERÍA no leídas que quedaron una-por-mensaje
 * (antes de que existiera el dedup por conversación). Por cada (USER_ID, canalId):
 * conserva la notificación más reciente, le pone dedupeKey + count, y elimina el
 * resto. Las ya leídas no se tocan.
 *
 *   node scripts/agrupar-notificaciones-mensajeria.js              (dry-run)
 *   node scripts/agrupar-notificaciones-mensajeria.js --aplicar
 *   node scripts/agrupar-notificaciones-mensajeria.js --empresa=demo --aplicar
 */
require('dotenv').config({ path: process.env.NODE_ENV === 'production' ? '.env' : `${__dirname}/../.env.development` });
const sql = require('mssql');
const databaseService = require('../services/databaseService');

const EMPRESA = process.argv.find((a) => a.startsWith('--empresa='))?.split('=')[1] || 'agyda';
const APLICAR = process.argv.includes('--aplicar');

const canalDe = (dataExtra) => {
  try { return Number(JSON.parse(dataExtra || '{}').canalId) || null; } catch { return null; }
};

(async () => {
  const pool = await databaseService.getPool(EMPRESA);

  const rs = await pool.request().query(`
    SELECT NOTI_ID, USER_ID, MENSAJE, DATA_EXTRA, CREATED_AT
    FROM NOTIFICACIONES
    WHERE TIPO = 'mensajeria' AND LEIDA = 0
    ORDER BY NOTI_ID DESC
  `);

  // grupo: USER_ID|canalId -> { keep: fila más reciente, borrar: [ids] }
  const grupos = new Map();
  for (const r of rs.recordset) {
    const canal = canalDe(r.DATA_EXTRA);
    if (!canal) continue;
    const k = `${r.USER_ID}|${canal}`;
    if (!grupos.has(k)) grupos.set(k, { canal, userId: r.USER_ID, keep: r, borrar: [] });
    else grupos.get(k).borrar.push(r.NOTI_ID);
  }

  const conColapso = [...grupos.values()].filter((g) => g.borrar.length > 0);
  const totalBorrar = conColapso.reduce((s, g) => s + g.borrar.length, 0);

  console.log(`\nGrupos (usuario+canal) con más de una notificación sin leer: ${conColapso.length}`);
  console.log(`Notificaciones a eliminar (se conserva la más reciente de cada grupo): ${totalBorrar}\n`);
  for (const g of conColapso.slice(0, 15)) {
    console.log(`  user ${g.userId} · canal ${g.canal}: conserva #${g.keep.NOTI_ID}, elimina ${g.borrar.length}`);
  }
  if (conColapso.length > 15) console.log(`  … y ${conColapso.length - 15} grupos más`);

  if (!APLICAR) { console.log('\nDry-run. Ejecuta con --aplicar.\n'); process.exit(0); }

  const tx = pool.transaction();
  await tx.begin();
  try {
    for (const g of conColapso) {
      const count = g.borrar.length + 1;
      let extra = {};
      try { extra = JSON.parse(g.keep.DATA_EXTRA || '{}'); } catch { extra = {}; }
      extra.dedupeKey = `msj-canal-${g.canal}`;
      extra.count = count;
      const baseMsg = String(g.keep.MENSAJE || '').replace(/\s+·\s+\d+ mensajes nuevos$/, '');
      const msg = `${baseMsg}  ·  ${count} mensajes nuevos`;

      await tx.request()
        .input('id', sql.Int, g.keep.NOTI_ID)
        .input('msg', sql.NVarChar, msg)
        .input('extra', sql.NVarChar, JSON.stringify(extra))
        .query(`UPDATE NOTIFICACIONES SET MENSAJE=@msg, DATA_EXTRA=@extra WHERE NOTI_ID=@id`);

      // borrar el resto en lotes
      for (let i = 0; i < g.borrar.length; i += 500) {
        const lote = g.borrar.slice(i, i + 500).join(',');
        await tx.request().query(`DELETE FROM NOTIFICACIONES WHERE NOTI_ID IN (${lote})`);
      }
    }
    await tx.commit();
    console.log(`\n✅ ${conColapso.length} conversaciones colapsadas · ${totalBorrar} notificaciones eliminadas.\n`);
  } catch (e) {
    await tx.rollback();
    console.error('\n❌ Rollback:', e.message, '\n');
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
