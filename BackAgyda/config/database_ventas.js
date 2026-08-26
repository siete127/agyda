// Configuración para la base de datos ventas (plata_prospectPRO)
module.exports = {
  user: process.env.VENTAS_DB_USER || 'sa',
  password: process.env.VENTAS_DB_PASSWORD || 'Y!2={1kU@5rQ',
  server: process.env.VENTAS_DB_SERVER || 'ventas.ardabytec.vip',
  port: parseInt(process.env.VENTAS_DB_PORT) || 1433,
  database: process.env.VENTAS_DB_NAME || 'plata_prospectPRO',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    enableArithAbort: true,
    requestTimeout: 30000,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};
