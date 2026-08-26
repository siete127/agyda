const sql = require('mssql');
const dbConfig = require('../config/database');
const schemaService = require('./schemaService');
const { getTenantConfig, DEFAULT_TENANT } = require('../config/tenants');
const logger = global.logger || require('../utils/logger');

// Un pool de conexión por empresa (tenant). pools[key] guarda el pool ya
// listo; initPromises[key] guarda la promesa en vuelo mientras se conecta,
// para que peticiones concurrentes durante el arranque no disparen
// ensureAllSchemas en paralelo sobre la misma BD (deadlocks de DDL).
const pools = {};
const initPromises = {};

async function initialize(tenantKey = DEFAULT_TENANT) {
  const { key, database } = getTenantConfig(tenantKey);

  if (initPromises[key]) return initPromises[key];

  initPromises[key] = (async () => {
    try {
      const config = { ...dbConfig, database };
      // ConnectionPool (no sql.connect, que usa un único pool global implícito
      // de la librería): cada empresa necesita su propio pool real e
      // independiente, o la segunda conexión pisa/reusa la de la primera.
      const pool = await new sql.ConnectionPool(config).connect();
      pools[key] = pool;
      logger.info(`✅ Conexión a SQL Server inicializada (empresa: ${key}, BD: ${database})`);

      // Asegurar esquemas necesarios en la BD de esta empresa
      await schemaService.ensureAllSchemas(pool);
      await schemaService.removeClientesUniqueConstraint(pool);

      // Las empresas creadas dinámicamente (módulo Accesos > Empresas) viven
      // en INTRANET_EMPRESAS, solo dentro de la BD maestra. Se cargan al
      // caché en memoria de config/tenants.js justo después de asegurar su
      // esquema, para que sobrevivan a un restart del proceso.
      if (key === DEFAULT_TENANT) {
        await schemaService.loadDynamicTenants(pool);
      }

      return pool;
    } catch (error) {
      logger.error(`❌ Error inicializando pool (empresa: ${key}):`, error);
      // Permitir reintentar en la siguiente llamada si falló
      initPromises[key] = null;
      pools[key] = undefined;
      throw error;
    }
  })();

  return initPromises[key];
}

async function getPool(tenantKey = DEFAULT_TENANT) {
  const { key } = getTenantConfig(tenantKey);
  if (!pools[key]) {
    await initialize(key);
  }
  return pools[key];
}

async function close(tenantKey) {
  const keys = tenantKey ? [getTenantConfig(tenantKey).key] : Object.keys(pools);
  for (const key of keys) {
    if (pools[key]) {
      await pools[key].close();
      pools[key] = undefined;
      initPromises[key] = null;
      logger.info(`✅ Conexión a BD cerrada (empresa: ${key})`);
    }
  }
}

// Manejo de errores de conexión
sql.on('error', err => {
  logger.error('❌ Error de SQL Server:', err);
});

module.exports = {
  initialize,
  getPool,
  close,
};
