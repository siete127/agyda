// Migración de una sola ejecución: CLIENTES (legacy) -> CRM_CONTACTOS.
// Ver plan en C:\Users\Usuario\.claude\plans\keen-floating-seahorse.md (Fase A.5).
// Uso: node scripts/migrar-clientes-a-contactos.js
require('dotenv').config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
const sql = require('mssql');
const dbConfig = require('../config/database');

async function main() {
  const pool = await new sql.ConnectionPool({ ...dbConfig, database: process.env.DB_NAME || 'intranet' }).connect();
  const transaction = new sql.Transaction(pool);
  await transaction.begin();

  try {
    // CL_OBSERVACIONES solo existe donde ya corrió su esquema (ensureSolicitudFiscalSchema).
    const conObs = (await transaction.request().query(
      `SELECT COL_LENGTH('dbo.CLIENTES', 'CL_OBSERVACIONES') AS n`)).recordset[0].n !== null;
    const clientes = (await transaction.request().query(`
      SELECT CL_ID, NEUS_ID, CL_EMPRESA, CL_NOMBRE, CL_TELEFONO, CL_CORREO, CL_CIUDAD, CL_ACTIVO,
             CL_FECHA_REGISTRO, CL_RFC, CL_CALLE, CL_NUM_EXT, CL_NUM_INT, CL_COLONIA, CL_CP, CL_PAIS,
             CL_RAZON_SOCIAL, CL_REGIMEN_FISCAL, CL_USO_CFDI, CL_CORREO_FACTURACION,
             ${conObs ? 'CL_OBSERVACIONES' : 'CAST(NULL AS NVARCHAR(1000)) AS CL_OBSERVACIONES'}
      FROM CLIENTES
    `)).recordset;

    console.log(`Encontrados ${clientes.length} clientes en CLIENTES.`);
    const mapeo = {}; // CL_ID -> CONT_ID
    let insertados = 0;
    let actualizados = 0;

    for (const cl of clientes) {
      let contId = null;

      if (cl.NEUS_ID) {
        const porNeus = await transaction.request()
          .input('neusId', sql.Int, cl.NEUS_ID)
          .query(`SELECT CONT_ID FROM CRM_CONTACTOS WHERE CONT_NEUS_ID = @neusId`);
        if (porNeus.recordset[0]) contId = porNeus.recordset[0].CONT_ID;
      }
      if (!contId && cl.CL_CORREO) {
        const porCorreo = await transaction.request()
          .input('correo', sql.NVarChar, cl.CL_CORREO)
          .query(`SELECT TOP 1 CONT_ID FROM CRM_CONTACTOS WHERE CONT_CORREO = @correo`);
        if (porCorreo.recordset[0]) contId = porCorreo.recordset[0].CONT_ID;
      }

      if (contId) {
        await transaction.request()
          .input('id', sql.Int, contId)
          .input('empresa', sql.NVarChar, cl.CL_EMPRESA || null)
          .input('nombre', sql.NVarChar, cl.CL_NOMBRE || null)
          .input('telefono', sql.NVarChar, cl.CL_TELEFONO || null)
          .input('ciudad', sql.NVarChar, cl.CL_CIUDAD || null)
          .input('correo', sql.NVarChar, cl.CL_CORREO || null)
          .input('rfc', sql.NVarChar, cl.CL_RFC || null)
          .input('razonSocial', sql.NVarChar, cl.CL_RAZON_SOCIAL || null)
          .input('regimenFiscal', sql.NVarChar, cl.CL_REGIMEN_FISCAL || null)
          .input('usoCfdi', sql.NVarChar, cl.CL_USO_CFDI || null)
          .input('correoFacturacion', sql.NVarChar, cl.CL_CORREO_FACTURACION || null)
          .input('calle', sql.NVarChar, cl.CL_CALLE || null)
          .input('numExt', sql.NVarChar, cl.CL_NUM_EXT || null)
          .input('numInt', sql.NVarChar, cl.CL_NUM_INT || null)
          .input('colonia', sql.NVarChar, cl.CL_COLONIA || null)
          .input('cp', sql.NVarChar, cl.CL_CP || null)
          .input('pais', sql.NVarChar, cl.CL_PAIS || null)
          .input('neusId', sql.Int, cl.NEUS_ID || null)
          .input('observaciones', sql.NVarChar, cl.CL_OBSERVACIONES || null)
          .query(`
            UPDATE CRM_CONTACTOS SET
              CONT_EMPRESA = COALESCE(CONT_EMPRESA, @empresa),
              CONT_NOMBRE = COALESCE(CONT_NOMBRE, @nombre),
              CONT_TELEFONO = COALESCE(CONT_TELEFONO, @telefono),
              CONT_CIUDAD = COALESCE(CONT_CIUDAD, @ciudad),
              CONT_CORREO = COALESCE(CONT_CORREO, @correo),
              CONT_RFC = COALESCE(CONT_RFC, @rfc),
              CONT_RAZON_SOCIAL = COALESCE(CONT_RAZON_SOCIAL, @razonSocial),
              CONT_REGIMEN_FISCAL = COALESCE(CONT_REGIMEN_FISCAL, @regimenFiscal),
              CONT_USO_CFDI = COALESCE(CONT_USO_CFDI, @usoCfdi),
              CONT_CORREO_FACTURACION = COALESCE(CONT_CORREO_FACTURACION, @correoFacturacion),
              CONT_CALLE = COALESCE(CONT_CALLE, @calle),
              CONT_NUM_EXT = COALESCE(CONT_NUM_EXT, @numExt),
              CONT_NUM_INT = COALESCE(CONT_NUM_INT, @numInt),
              CONT_COLONIA = COALESCE(CONT_COLONIA, @colonia),
              CONT_CP = COALESCE(CONT_CP, @cp),
              CONT_PAIS = COALESCE(CONT_PAIS, @pais),
              CONT_NEUS_ID = COALESCE(CONT_NEUS_ID, @neusId),
              CONT_OBSERVACIONES = COALESCE(CONT_OBSERVACIONES, @observaciones),
              CONT_ES_CLIENTE = 1
            WHERE CONT_ID = @id
          `);
        actualizados++;
      } else {
        const ins = await transaction.request()
          .input('neusId', sql.Int, cl.NEUS_ID || null)
          .input('empresa', sql.NVarChar, cl.CL_EMPRESA || null)
          .input('nombre', sql.NVarChar, cl.CL_NOMBRE || cl.CL_EMPRESA || 'Cliente')
          .input('telefono', sql.NVarChar, cl.CL_TELEFONO || null)
          .input('ciudad', sql.NVarChar, cl.CL_CIUDAD || null)
          .input('correo', sql.NVarChar, cl.CL_CORREO || null)
          .input('activo', sql.Bit, cl.CL_ACTIVO ? 1 : 0)
          .input('fecha', sql.DateTime, cl.CL_FECHA_REGISTRO || new Date())
          .input('rfc', sql.NVarChar, cl.CL_RFC || null)
          .input('razonSocial', sql.NVarChar, cl.CL_RAZON_SOCIAL || null)
          .input('regimenFiscal', sql.NVarChar, cl.CL_REGIMEN_FISCAL || null)
          .input('usoCfdi', sql.NVarChar, cl.CL_USO_CFDI || null)
          .input('correoFacturacion', sql.NVarChar, cl.CL_CORREO_FACTURACION || null)
          .input('calle', sql.NVarChar, cl.CL_CALLE || null)
          .input('numExt', sql.NVarChar, cl.CL_NUM_EXT || null)
          .input('numInt', sql.NVarChar, cl.CL_NUM_INT || null)
          .input('colonia', sql.NVarChar, cl.CL_COLONIA || null)
          .input('cp', sql.NVarChar, cl.CL_CP || null)
          .input('pais', sql.NVarChar, cl.CL_PAIS || null)
          .input('observaciones', sql.NVarChar, cl.CL_OBSERVACIONES || null)
          .query(`
            INSERT INTO CRM_CONTACTOS (
              CONT_NEUS_ID, CONT_EMPRESA, CONT_NOMBRE, CONT_TELEFONO, CONT_CIUDAD, CONT_CORREO,
              CONT_ACTIVO, CONT_FECHA, CONT_RFC, CONT_RAZON_SOCIAL, CONT_REGIMEN_FISCAL, CONT_USO_CFDI,
              CONT_CORREO_FACTURACION, CONT_CALLE, CONT_NUM_EXT, CONT_NUM_INT, CONT_COLONIA, CONT_CP, CONT_PAIS,
              CONT_OBSERVACIONES, CONT_ES_CLIENTE
            ) VALUES (
              @neusId, @empresa, @nombre, @telefono, @ciudad, @correo,
              @activo, @fecha, @rfc, @razonSocial, @regimenFiscal, @usoCfdi,
              @correoFacturacion, @calle, @numExt, @numInt, @colonia, @cp, @pais,
              @observaciones, 1
            );
            SELECT SCOPE_IDENTITY() as id;
          `);
        contId = ins.recordset[0].id;
        insertados++;
      }

      mapeo[cl.CL_ID] = contId;
      console.log(`CLIENTES.CL_ID=${cl.CL_ID} (${cl.CL_EMPRESA || cl.CL_NOMBRE}) -> CRM_CONTACTOS.CONT_ID=${contId}`);
    }

    // Migrar CLIENTE_PRODUCTOS_SERVICIOS -> CRM_CONTACTO_PRODUCTOS_SERVICIOS
    let cpsExisteTabla = true;
    let cpsFilas = [];
    try {
      cpsFilas = (await transaction.request().query(`SELECT CL_ID, PS_ID FROM CLIENTE_PRODUCTOS_SERVICIOS`)).recordset;
    } catch (e) {
      cpsExisteTabla = false;
    }
    let cpsMigradas = 0;
    if (cpsExisteTabla) {
      for (const row of cpsFilas) {
        const contId = mapeo[row.CL_ID];
        if (!contId) continue;
        await transaction.request()
          .input('contId', sql.Int, contId)
          .input('psId', sql.Int, row.PS_ID)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID=@contId AND CCPS_PS_ID=@psId)
              INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
          `);
        cpsMigradas++;
      }
    }
    console.log(`CLIENTE_PRODUCTOS_SERVICIOS migradas: ${cpsMigradas} de ${cpsFilas.length}`);

    // Migrar CLIENTE_SERVICIOS (legacy, catálogo SERVICIOS) -> CRM_CONTACTO_PRODUCTOS_SERVICIOS,
    // resolviendo el PS_ID equivalente en PRODUCTOS_SERVICIOS por nombre.
    let servFilas = [];
    try {
      servFilas = (await transaction.request().query(`
        SELECT cs.CL_ID, s.SERV_NOMBRE
        FROM CLIENTE_SERVICIOS cs
        JOIN SERVICIOS s ON s.SERV_ID = cs.SERV_ID
      `)).recordset;
    } catch (e) { /* tabla legacy puede no existir */ }
    let servMigradas = 0;
    let servSinMatch = 0;
    for (const row of servFilas) {
      const contId = mapeo[row.CL_ID];
      if (!contId) continue;
      const psRs = await transaction.request()
        .input('nombre', sql.NVarChar, row.SERV_NOMBRE)
        .query(`SELECT TOP 1 PS_ID FROM PRODUCTOS_SERVICIOS WHERE PS_NOMBRE = @nombre`);
      const psId = psRs.recordset[0]?.PS_ID;
      if (!psId) { servSinMatch++; console.warn(`  Sin match de PS_ID para servicio legacy "${row.SERV_NOMBRE}" (CL_ID=${row.CL_ID})`); continue; }
      await transaction.request()
        .input('contId', sql.Int, contId)
        .input('psId', sql.Int, psId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID=@contId AND CCPS_PS_ID=@psId)
            INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
        `);
      servMigradas++;
    }
    console.log(`CLIENTE_SERVICIOS migradas: ${servMigradas} de ${servFilas.length} (${servSinMatch} sin match)`);

    // CLIENTE_PRODUCTOS: mismo tratamiento, por completitud (hoy 0 filas esperadas).
    let prodFilas = [];
    try {
      prodFilas = (await transaction.request().query(`
        SELECT cp.CL_ID, p.PROD_NOMBRE
        FROM CLIENTE_PRODUCTOS cp
        JOIN PRODUCTOS p ON p.PROD_ID = cp.PROD_ID
      `)).recordset;
    } catch (e) { /* tabla legacy puede no existir */ }
    let prodMigradas = 0;
    for (const row of prodFilas) {
      const contId = mapeo[row.CL_ID];
      if (!contId) continue;
      const psRs = await transaction.request()
        .input('nombre', sql.NVarChar, row.PROD_NOMBRE)
        .query(`SELECT TOP 1 PS_ID FROM PRODUCTOS_SERVICIOS WHERE PS_NOMBRE = @nombre`);
      const psId = psRs.recordset[0]?.PS_ID;
      if (!psId) { console.warn(`  Sin match de PS_ID para producto legacy "${row.PROD_NOMBRE}" (CL_ID=${row.CL_ID})`); continue; }
      await transaction.request()
        .input('contId', sql.Int, contId)
        .input('psId', sql.Int, psId)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM CRM_CONTACTO_PRODUCTOS_SERVICIOS WHERE CCPS_CONT_ID=@contId AND CCPS_PS_ID=@psId)
            INSERT INTO CRM_CONTACTO_PRODUCTOS_SERVICIOS (CCPS_CONT_ID, CCPS_PS_ID) VALUES (@contId, @psId)
        `);
      prodMigradas++;
    }
    console.log(`CLIENTE_PRODUCTOS migradas: ${prodMigradas} de ${prodFilas.length}`);

    await transaction.commit();
    console.log('\nMigración completada.');
    console.log(`Resumen: ${insertados} contactos nuevos, ${actualizados} contactos existentes actualizados.`);
    console.log('Mapeo CL_ID -> CONT_ID:', JSON.stringify(mapeo, null, 2));
  } catch (err) {
    await transaction.rollback();
    console.error('Migración abortada (rollback):', err);
    process.exit(1);
  }

  await pool.close();
}

main().catch((e) => { console.error(e); process.exit(1); });
