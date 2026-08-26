const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.getAll = async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const pool = await databaseService.getPool(req.user?.empresa);
    const r = pool.request();
    let where = 'WHERE 1=1';
    if (anio) { r.input('anio', sql.Int, parseInt(anio)); where += ' AND c.CUOTA_ANIO=@anio'; }
    if (mes)  { r.input('mes',  sql.Int, parseInt(mes));  where += ' AND c.CUOTA_MES=@mes'; }

    const result = await r.query(`
      SELECT
        c.CUOTA_ID as id,
        c.CUOTA_USUARIO_ID as usuarioId,
        u.NEUS_NOMBRES as nombre,
        c.CUOTA_ANIO as anio,
        c.CUOTA_MES as mes,
        c.CUOTA_META as meta,
        ISNULL((
          SELECT SUM(o.OPO_VALOR)
          FROM CRM_OPORTUNIDADES o
          WHERE o.OPO_ASIGNADO_A = c.CUOTA_USUARIO_ID
            AND o.OPO_ETAPA = 'ganado'
            AND o.OPO_ACTIVO = 1
            AND YEAR(o.OPO_FECHA_CIERRE)  = c.CUOTA_ANIO
            AND MONTH(o.OPO_FECHA_CIERRE) = c.CUOTA_MES
        ), 0) as logrado
      FROM CRM_CUOTAS c
      JOIN NEUS_USUARIOS u ON u.NEUS_ID = c.CUOTA_USUARIO_ID
      ${where}
      ORDER BY c.CUOTA_ANIO DESC, c.CUOTA_MES DESC, u.NEUS_NOMBRES
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getMia = async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false });
    const now = new Date();
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request()
      .input('uid',  sql.Int, userId)
      .input('anio', sql.Int, now.getFullYear())
      .input('mes',  sql.Int, now.getMonth() + 1)
      .query(`
        SELECT
          c.CUOTA_META as meta,
          ISNULL((
            SELECT SUM(o.OPO_VALOR)
            FROM CRM_OPORTUNIDADES o
            WHERE o.OPO_ASIGNADO_A = @uid
              AND o.OPO_ETAPA = 'ganado'
              AND o.OPO_ACTIVO = 1
              AND YEAR(o.OPO_FECHA_CIERRE)  = @anio
              AND MONTH(o.OPO_FECHA_CIERRE) = @mes
          ), 0) as logrado
        FROM CRM_CUOTAS c
        WHERE c.CUOTA_USUARIO_ID=@uid AND c.CUOTA_ANIO=@anio AND c.CUOTA_MES=@mes
      `);
    res.json({ success: true, data: result.recordset[0] ?? null });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.upsert = async (req, res) => {
  try {
    const { usuarioId, anio, mes, meta } = req.body;
    if (!usuarioId || !anio || !mes || meta == null)
      return res.status(400).json({ success: false, message: 'usuarioId, anio, mes y meta son requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('uid',  sql.Int,          usuarioId)
      .input('anio', sql.Int,          anio)
      .input('mes',  sql.Int,          mes)
      .input('meta', sql.Decimal(18,2), meta)
      .query(`
        MERGE CRM_CUOTAS AS target
        USING (VALUES (@uid, @anio, @mes, @meta)) AS src(uid, anio, mes, meta)
          ON target.CUOTA_USUARIO_ID=src.uid AND target.CUOTA_ANIO=src.anio AND target.CUOTA_MES=src.mes
        WHEN MATCHED    THEN UPDATE SET CUOTA_META=src.meta
        WHEN NOT MATCHED THEN INSERT (CUOTA_USUARIO_ID,CUOTA_ANIO,CUOTA_MES,CUOTA_META)
                              VALUES (src.uid,src.anio,src.mes,src.meta);
      `);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.delete = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query(`DELETE FROM CRM_CUOTAS WHERE CUOTA_ID=@id`);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
