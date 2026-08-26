const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.getAuditoria = async (req, res) => {
  try {
    const { modulo, usuarioId, page = 1, limit = 50 } = req.query;
    // Ignorar fechas vacías o inválidas
    const fechaDesde = req.query.fechaDesde && req.query.fechaDesde.match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.fechaDesde : null;
    const fechaHasta = req.query.fechaHasta && req.query.fechaHasta.match(/^\d{4}-\d{2}-\d{2}$/) ? req.query.fechaHasta : null;
    console.log('[auditoria] query:', { modulo, usuarioId, fechaDesde, fechaHasta, page, limit });
    const pool = await databaseService.getPool(req.user?.empresa);
    const offset = (Number(page) - 1) * Number(limit);

    let where = [];
    const req1 = pool.request()
      .input('limit',  sql.Int, Number(limit))
      .input('offset', sql.Int, offset);

    if (modulo)      { req1.input('modulo', sql.NVarChar, modulo);           where.push('MODULO = @modulo'); }
    if (usuarioId)   { req1.input('uid',    sql.Int,      Number(usuarioId)); where.push('USUARIO_ID = @uid'); }
    if (fechaDesde)  { req1.input('fdesde', sql.Date,     new Date(fechaDesde)); where.push('FECHA >= @fdesde'); }
    if (fechaHasta)  { req1.input('fhasta', sql.Date,     new Date(fechaHasta)); where.push('FECHA < DATEADD(day,1,@fhasta)'); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const countReq = pool.request();
    if (modulo)      countReq.input('modulo', sql.NVarChar, modulo);
    if (usuarioId)   countReq.input('uid',    sql.Int,      Number(usuarioId));
    if (fechaDesde)  countReq.input('fdesde', sql.Date,     new Date(fechaDesde));
    if (fechaHasta)  countReq.input('fhasta', sql.Date,     new Date(fechaHasta));

    const [dataRs, countRs] = await Promise.all([
      req1.query(`
        SELECT AUDIT_ID as id, USUARIO_ID as usuarioId, USUARIO_NOMBRE as usuarioNombre,
               MODULO as modulo, ACCION as accion, ENTIDAD_ID as entidadId,
               DETALLE as detalle, IP_ORIGEN as ip, FECHA as fecha
        FROM INTRANET_AUDITORIA
        ${whereClause}
        ORDER BY FECHA DESC
        OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY
      `),
      countReq.query(`SELECT COUNT(*) as total FROM INTRANET_AUDITORIA ${whereClause}`)
    ]);

    const total = countRs.recordset[0].total;
    res.json({
      success: true,
      data:  dataRs.recordset,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit))
    });
  } catch (e) {
    console.error('[auditoria] getAuditoria error:', e.message);
    res.status(500).json({ success: false, message: e.message });
  }
};
