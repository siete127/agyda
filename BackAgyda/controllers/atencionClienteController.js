const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function listRetencion(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT AR_ID as id, AR_CLIENTE_ID as clienteId, AR_CLIENTE_NOMBRE as clienteNombre,
             AR_ESTATUS as estatus, AR_FECHA_EVALUACION as fechaEvaluacion, AR_MOTIVO_RIESGO as motivoRiesgo
      FROM AC_RETENCION ORDER BY AR_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('atencionClienteController.listRetencion', err);
    res.status(500).json({ success: false, message: 'Error al listar retención' });
  }
}

async function crearRetencion(req, res) {
  try {
    const { clienteId, clienteNombre, estatus, motivoRiesgo } = req.body;
    if (!clienteNombre) return res.status(400).json({ success: false, message: 'Nombre de cliente requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('clienteId', sql.Int, clienteId || null)
      .input('clienteNombre', sql.NVarChar, clienteNombre)
      .input('estatus', sql.NVarChar, estatus || 'estable')
      .input('motivoRiesgo', sql.NVarChar, motivoRiesgo || null)
      .query(`INSERT INTO AC_RETENCION (AR_CLIENTE_ID, AR_CLIENTE_NOMBRE, AR_ESTATUS, AR_MOTIVO_RIESGO) VALUES (@clienteId, @clienteNombre, @estatus, @motivoRiesgo)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('atencionClienteController.crearRetencion', err);
    res.status(500).json({ success: false, message: 'Error al crear evaluación de retención' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const riesgoRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM AC_RETENCION WHERE AR_ESTATUS = 'riesgo'
    `);
    const clientesEnRiesgo = riesgoRs.recordset[0].total;

    const totalRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM AC_RETENCION
    `);
    const totalEvaluados = totalRs.recordset[0].total;

    await upsertKpi({ tenantKey: req.user?.empresa,
      areaKey: 'atencion-cliente',
      kpiKey: 'clientes_riesgo',
      label: 'Clientes en riesgo',
      valor: clientesEnRiesgo,
      unidad: '',
      tono: clientesEnRiesgo > 0 ? 'warn' : 'success',
    });

    res.json({
      success: true,
      data: {
        clientesEnRiesgo,
        totalEvaluados,
      },
    });
  } catch (err) {
    logger.error('atencionClienteController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

module.exports = {
  listRetencion,
  crearRetencion,
  getDashboard,
};
