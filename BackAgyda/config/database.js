const sql = require('mssql');

const config = {
  server: process.env.DB_SERVER || 'SQLARDABYTEC',
  database: process.env.DB_NAME || 'intranet',
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'Y!2={1kU@5rQ',
  port: parseInt(process.env.DB_PORT) || 1433,
  options: { 
    encrypt: false, 
    trustServerCertificate: true,
    enableArithAbort: true
  },
  pool: { 
    max: 10, 
    min: 0, 
    idleTimeoutMillis: 30000,
    acquireTimeoutMillis: 30000
  },
  connectionTimeout: 30000,
  requestTimeout: 30000
};

module.exports = config;
