const crypto = require('crypto');
const sql = require('mssql');
const databaseService = require('../services/databaseService');

// Autenticación por API-key para endpoints públicos consumidos por sistemas
// externos (sin sesión JWT). Independiente de authenticateToken: no setea
// req.user, setea req.apiClient para no colisionar con el flujo de sesión humana.
async function apiKeyAuth(req, res, next) {
  try {
    const key = req.headers['x-api-key'];
    if (!key) return res.status(401).json({ success: false, message: 'X-Api-Key requerido' });

    const hash = crypto.createHash('sha256').update(key).digest('hex');
    const pool = await databaseService.getPool(req.query.empresa || req.body?.empresa);

    const rs = await pool.request().input('hash', sql.NVarChar, hash).query(`
      SELECT KEY_ID, NOMBRE FROM TICKETS_API_KEYS WHERE KEY_HASH=@hash AND ACTIVA=1
    `);
    if (!rs.recordset.length) return res.status(401).json({ success: false, message: 'API key inválida' });

    await pool.request().input('id', sql.Int, rs.recordset[0].KEY_ID)
      .query(`UPDATE TICKETS_API_KEYS SET ULTIMO_USO=GETDATE() WHERE KEY_ID=@id`);

    req.apiClient = { keyId: rs.recordset[0].KEY_ID, nombre: rs.recordset[0].NOMBRE };
    req.dbPool = pool;
    next();
  } catch (e) {
    console.error('Error en apiKeyAuth:', e);
    res.status(500).json({ success: false, message: 'Error de autenticación' });
  }
}

module.exports = apiKeyAuth;
