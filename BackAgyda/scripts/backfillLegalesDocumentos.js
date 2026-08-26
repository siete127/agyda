require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });

const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

const LEGALES_DIR = 'C:/inetpub/wwwroot/intranet/intranet/Legales';

async function run() {
  // Script CLI de un solo uso — el directorio LEGALES_DIR es de la empresa Agyda,
  // así que corre solo contra su BD (tenant por defecto).
  await databaseService.initialize();
  const pool = await databaseService.getPool();

  if (!fs.existsSync(LEGALES_DIR)) {
    console.log('❌ No existe el directorio de Legales:', LEGALES_DIR);
    process.exit(0);
  }

  const files = fs.readdirSync(LEGALES_DIR).filter(f => {
    try {
      return fs.lstatSync(path.join(LEGALES_DIR, f)).isFile();
    } catch {
      return false;
    }
  });

  let inserted = 0;
  let skipped = 0;

  for (const filename of files) {
    const existsRs = await pool.request()
      .input('filename', sql.NVarChar, filename)
      .query('SELECT LD_ID as id FROM LEGALES_DOCUMENTOS WHERE LD_NOMBRE_ARCHIVO=@filename');

    if (existsRs.recordset.length > 0) {
      skipped++;
      continue;
    }

    const titulo = filename.replace(/^\d+-/, '');

    await pool.request()
      .input('titulo', sql.NVarChar, titulo)
      .input('categoria', sql.NVarChar, null)
      .input('nombreArchivo', sql.NVarChar, filename)
      .input('nombreOriginal', sql.NVarChar, titulo)
      .input('subidoPor', sql.Int, null)
      .query(`
        INSERT INTO LEGALES_DOCUMENTOS (LD_TITULO, LD_CATEGORIA, LD_NOMBRE_ARCHIVO, LD_NOMBRE_ORIGINAL, LD_SUBIDO_POR)
        VALUES (@titulo, @categoria, @nombreArchivo, @nombreOriginal, @subidoPor)
      `);

    inserted++;
  }

  console.log(`✅ Backfill completado. Insertados: ${inserted}, Omitidos: ${skipped}`);
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Error en backfill de LEGALES_DOCUMENTOS:', err);
  process.exit(1);
});
