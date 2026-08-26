const sql = require('mssql');
const databaseService = require('../services/databaseService');

exports.getEmbudo = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        OPO_ETAPA as etapa,
        COUNT(*) as total,
        ISNULL(SUM(OPO_VALOR), 0) as valor
      FROM CRM_OPORTUNIDADES
      WHERE OPO_ACTIVO = 1
      GROUP BY OPO_ETAPA
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getForecast = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        YEAR(OPO_FECHA_CIERRE)  as anio,
        MONTH(OPO_FECHA_CIERRE) as mes,
        OPO_ETAPA as etapa,
        COUNT(*) as total,
        ISNULL(SUM(OPO_VALOR), 0) as valor
      FROM CRM_OPORTUNIDADES
      WHERE OPO_ACTIVO = 1
        AND OPO_FECHA_CIERRE IS NOT NULL
        AND OPO_ETAPA NOT IN ('ganado','perdido')
        AND OPO_FECHA_CIERRE >= DATEADD(MONTH, -1, GETDATE())
        AND OPO_FECHA_CIERRE <= DATEADD(MONTH, 6, GETDATE())
      GROUP BY YEAR(OPO_FECHA_CIERRE), MONTH(OPO_FECHA_CIERRE), OPO_ETAPA
      ORDER BY anio, mes, etapa
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getPorResponsable = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        u.NEUS_NOMBRES as nombre,
        o.OPO_ASIGNADO_A as usuarioId,
        COUNT(*) as total,
        ISNULL(SUM(CASE WHEN o.OPO_ETAPA = 'ganado' THEN o.OPO_VALOR ELSE 0 END), 0) as valorGanado,
        ISNULL(SUM(CASE WHEN o.OPO_ETAPA NOT IN ('ganado','perdido') THEN o.OPO_VALOR ELSE 0 END), 0) as valorPipeline,
        COUNT(CASE WHEN o.OPO_ETAPA = 'ganado' THEN 1 END) as ganadas,
        COUNT(CASE WHEN o.OPO_ETAPA = 'perdido' THEN 1 END) as perdidas
      FROM CRM_OPORTUNIDADES o
      LEFT JOIN NEUS_USUARIOS u ON u.NEUS_ID = o.OPO_ASIGNADO_A
      WHERE o.OPO_ACTIVO = 1 AND o.OPO_ASIGNADO_A IS NOT NULL
      GROUP BY o.OPO_ASIGNADO_A, u.NEUS_NOMBRES
      ORDER BY ISNULL(SUM(CASE WHEN o.OPO_ETAPA NOT IN ('ganado','perdido') THEN o.OPO_VALOR ELSE 0 END), 0) DESC
    `);
    res.json({ success: true, data: result.recordset });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

exports.getKpis = async (req, res) => {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const result = await pool.request().query(`
      SELECT
        COUNT(*) as totalOpos,
        ISNULL(SUM(CASE WHEN OPO_ETAPA NOT IN ('ganado','perdido') THEN OPO_VALOR ELSE 0 END), 0) as valorPipeline,
        ISNULL(SUM(CASE WHEN OPO_ETAPA = 'ganado' THEN OPO_VALOR ELSE 0 END), 0) as valorGanado,
        COUNT(CASE WHEN OPO_ETAPA = 'ganado' THEN 1 END) as totalGanadas,
        COUNT(CASE WHEN OPO_ETAPA = 'perdido' THEN 1 END) as totalPerdidas,
        COUNT(CASE WHEN OPO_ETAPA NOT IN ('ganado','perdido') THEN 1 END) as totalActivas,
        COUNT(CASE WHEN OPO_FECHA_CIERRE < CAST(GETDATE() AS DATE) AND OPO_ETAPA NOT IN ('ganado','perdido') THEN 1 END) as vencidas
      FROM CRM_OPORTUNIDADES
      WHERE OPO_ACTIVO = 1
    `);
    res.json({ success: true, data: result.recordset[0] });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};
