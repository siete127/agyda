const sql = require('mssql');

async function logAudit(pool, { userId, userName, modulo, accion, entidadId, detalle, ip }) {
  try {
    await pool.request()
      .input('uid', sql.Int,      userId   || null)
      .input('unm', sql.NVarChar, userName || null)
      .input('mod', sql.NVarChar, modulo)
      .input('acc', sql.NVarChar, accion)
      .input('eid', sql.NVarChar, entidadId != null ? String(entidadId) : null)
      .input('det', sql.NVarChar, detalle ? JSON.stringify(detalle) : null)
      .input('ip',  sql.NVarChar, ip       || null)
      .query(`
        INSERT INTO INTRANET_AUDITORIA (USUARIO_ID, USUARIO_NOMBRE, MODULO, ACCION, ENTIDAD_ID, DETALLE, IP_ORIGEN)
        VALUES (@uid, @unm, @mod, @acc, @eid, @det, @ip)
      `);
  } catch (e) {
    const logger = global.logger || console;
    logger.warn('[AUDIT] Error al registrar auditoría:', e.message);
  }
}

module.exports = { logAudit };
