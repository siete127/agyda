require('dotenv').config({ path: require('path').join(__dirname, '..', '.env.development') });

const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

/*
  Crea una API key para el agente de monitoreo de red y la imprime UNA vez.
  Uso:
    node scripts/crear-api-key-red.js "Agente red oficina"        (tenant por defecto)
    node scripts/crear-api-key-red.js "Agente red demo" demo      (otro tenant)
*/
async function run() {
  const nombre = process.argv[2];
  const empresa = process.argv[3] || undefined;
  if (!nombre) {
    console.log('Uso: node scripts/crear-api-key-red.js "<nombre>" [empresa]');
    process.exit(1);
  }

  await databaseService.initialize();
  const pool = await databaseService.getPool(empresa);

  const rawKey = crypto.randomBytes(24).toString('hex');
  const hash = crypto.createHash('sha256').update(rawKey).digest('hex');

  const ins = await pool.request()
    .input('hash', sql.NVarChar, hash)
    .input('nombre', sql.NVarChar, nombre)
    .query(`INSERT INTO TICKETS_API_KEYS (KEY_HASH, NOMBRE) VALUES (@hash, @nombre);
            SELECT SCOPE_IDENTITY() as id;`);

  console.log('');
  console.log('  API key creada (id ' + ins.recordset[0].id + ')');
  console.log('  Nombre : ' + nombre);
  console.log('  Empresa: ' + (empresa || 'default'));
  console.log('');
  console.log('  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │  ' + rawKey + '  │');
  console.log('  └─────────────────────────────────────────────────────────────┘');
  console.log('');
  console.log('  Pégala en agente-red.config.json → "ApiKey". No se vuelve a mostrar.');
  process.exit(0);
}

run().catch((e) => { console.error(e); process.exit(1); });
