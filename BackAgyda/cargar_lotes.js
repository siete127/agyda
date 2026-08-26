const sql = require('mssql');
const fs = require('fs');
const path = require('path');

const config = {
  server: 'localhost\\SQLARDABYTEC',
  database: 'MIS_Ardaby',
  user: 'sa',
  password: 'Y!2={1kU@5rQ',
  port: 1433,
  options: { encrypt: false, trustServerCertificate: true, enableArithAbort: true },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 30000,
  requestTimeout: 120000,
};

const LOTES_DIR = 'C:\\Users\\Administrator\\Desktop\\lotes';
// Archivos a ignorar (no son lotes de leads)
const IGNORAR = new Set(['ya_descargados.txt']);

async function main() {
  console.log('Conectando a SQL Server...');
  const pool = await sql.connect(config);

  // 1. Crear tabla Vicidial_Leads_Completo2
  console.log('Creando tabla Vicidial_Leads_Completo2...');
  await pool.request().batch(`
    IF OBJECT_ID('dbo.Vicidial_Leads_Completo2', 'U') IS NULL
    BEGIN
      CREATE TABLE dbo.Vicidial_Leads_Completo2 (
        id         NVARCHAR(30)  NOT NULL,
        nombre     NVARCHAR(200) NULL,
        procedencia NVARCHAR(100) NULL,
        CONSTRAINT PK_Leads2 PRIMARY KEY (id)
      )
      PRINT 'Tabla creada'
    END
    ELSE
      PRINT 'Tabla ya existe'
  `);

  // 2. Cargar números existentes en Vicidial_Leads_Completo para deduplicar
  console.log('Cargando numeros existentes en Vicidial_Leads_Completo...');
  const existResult = await pool.request().query(`
    SELECT CAST(PhoneNumber AS NVARCHAR(30)) AS tel FROM dbo.Vicidial_Leads_Completo WHERE PhoneNumber IS NOT NULL
  `);
  const existentes = new Set(existResult.recordset.map(r => r.tel.trim()));
  console.log(`  -> ${existentes.size.toLocaleString()} numeros existentes`);

  // 3. Cargar números ya en Vicidial_Leads_Completo2 (si ya corrió antes parcialmente)
  const enTabla2Result = await pool.request().query(`SELECT id FROM dbo.Vicidial_Leads_Completo2`);
  const enTabla2 = new Set(enTabla2Result.recordset.map(r => r.id.trim()));
  console.log(`  -> ${enTabla2.size.toLocaleString()} numeros ya en Leads2`);

  // 4. Procesar cada archivo
  const archivos = fs.readdirSync(LOTES_DIR)
    .filter(f => f.endsWith('.txt') && !IGNORAR.has(f))
    .sort();

  let totalInsertados = 0;
  let totalDuplicados = 0;
  let totalOmitidos = 0;

  for (const archivo of archivos) {
    const rutaArchivo = path.join(LOTES_DIR, archivo);
    // procedencia = nombre del archivo sin extensión
    const procedencia = path.basename(archivo, '.txt');

    const lineas = fs.readFileSync(rutaArchivo, 'utf8').split('\n');
    const registros = [];

    for (let i = 0; i < lineas.length; i++) {
      const linea = lineas[i].trim();
      if (!linea) continue;

      const partes = linea.split('\t');
      const tel = partes[0].trim();
      const nombre = partes[1] ? partes[1].trim() : null;

      // Saltar encabezado
      if (tel.toUpperCase() === 'TELEFONO') continue;
      // Saltar si no es un número válido
      if (!/^\d{7,15}$/.test(tel)) continue;

      if (existentes.has(tel) || enTabla2.has(tel)) {
        totalDuplicados++;
        continue;
      }

      registros.push({ tel, nombre, procedencia });
      existentes.add(tel); // evitar duplicados entre archivos
      enTabla2.add(tel);
    }

    if (registros.length === 0) {
      console.log(`  [${archivo}] -> 0 nuevos (todos duplicados)`);
      continue;
    }

    // Insertar en lotes de 600 (límite SQL Server: 2100 params / 3 cols = 700, margen de seguridad)
    const BATCH = 600;
    let insertados = 0;
    for (let i = 0; i < registros.length; i += BATCH) {
      const chunk = registros.slice(i, i + BATCH);
      const req = pool.request();
      const values = chunk.map((r, idx) => {
        req.input(`id${idx}`,     sql.NVarChar(30),  r.tel);
        req.input(`nom${idx}`,    sql.NVarChar(200), r.nombre);
        req.input(`proc${idx}`,   sql.NVarChar(100), r.procedencia);
        return `(@id${idx}, @nom${idx}, @proc${idx})`;
      }).join(',\n');

      await req.query(`
        INSERT INTO dbo.Vicidial_Leads_Completo2 (id, nombre, procedencia)
        VALUES ${values}
      `);
      insertados += chunk.length;
    }

    totalInsertados += insertados;
    console.log(`  [${archivo}] -> ${insertados.toLocaleString()} insertados`);
  }

  // 5. Resumen final
  const countResult = await pool.request().query(`SELECT COUNT(*) as total FROM dbo.Vicidial_Leads_Completo2`);
  console.log('\n========================================');
  console.log(`Total insertados esta corrida : ${totalInsertados.toLocaleString()}`);
  console.log(`Total duplicados omitidos     : ${totalDuplicados.toLocaleString()}`);
  console.log(`Total en Leads2 ahora         : ${countResult.recordset[0].total.toLocaleString()}`);
  console.log('========================================');

  await pool.close();
}

main().catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
