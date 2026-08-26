const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { upsertKpi } = require('./areasController');
const logger = global.logger || require('../utils/logger');

async function listVacantes(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT RV_ID as id, RV_PUESTO as puesto, RV_AREA_KEY as areaKey, RV_ESTATUS as estatus, RV_FECHA_APERTURA as fechaApertura
      FROM RH_VACANTES ORDER BY RV_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('rhAreaController.listVacantes', err);
    res.status(500).json({ success: false, message: 'Error al listar vacantes' });
  }
}

async function crearVacante(req, res) {
  try {
    const { puesto, areaKey, estatus } = req.body;
    if (!puesto) return res.status(400).json({ success: false, message: 'Puesto requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('puesto', sql.NVarChar, puesto)
      .input('areaKey', sql.NVarChar, areaKey || null)
      .input('estatus', sql.NVarChar, estatus || 'abierta')
      .query(`INSERT INTO RH_VACANTES (RV_PUESTO, RV_AREA_KEY, RV_ESTATUS) VALUES (@puesto, @areaKey, @estatus)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('rhAreaController.crearVacante', err);
    res.status(500).json({ success: false, message: 'Error al crear vacante' });
  }
}

async function listCandidatos(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request().query(`
      SELECT RC_ID as id, RC_VACANTE_ID as vacanteId, RC_NOMBRE as nombre, RC_ETAPA as etapa, RC_FECHA as fecha
      FROM RH_CANDIDATOS ORDER BY RC_ID DESC
    `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('rhAreaController.listCandidatos', err);
    res.status(500).json({ success: false, message: 'Error al listar candidatos' });
  }
}

async function crearCandidato(req, res) {
  try {
    const { vacanteId, nombre, etapa } = req.body;
    if (!vacanteId || !nombre) return res.status(400).json({ success: false, message: 'Vacante y nombre requeridos' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('vacanteId', sql.Int, vacanteId)
      .input('nombre', sql.NVarChar, nombre)
      .input('etapa', sql.NVarChar, etapa || 'nuevo')
      .query(`INSERT INTO RH_CANDIDATOS (RC_VACANTE_ID, RC_NOMBRE, RC_ETAPA) VALUES (@vacanteId, @nombre, @etapa)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('rhAreaController.crearCandidato', err);
    res.status(500).json({ success: false, message: 'Error al crear candidato' });
  }
}

async function getDashboard(req, res) {
  try {
    const pool = await databaseService.getPool(req.user?.empresa);

    const vacantesRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM RH_VACANTES WHERE RV_ESTATUS = 'abierta'
    `);
    const vacantesAbiertas = vacantesRs.recordset[0].total;

    const candidatosRs = await pool.request().query(`
      SELECT COUNT(*) as total FROM RH_CANDIDATOS WHERE RC_ETAPA NOT IN ('rechazado', 'contratado')
    `);
    const candidatosActivos = candidatosRs.recordset[0].total;

    const porEtapaRs = await pool.request().query(`
      SELECT RC_ETAPA as etapa, COUNT(*) as count
      FROM RH_CANDIDATOS
      GROUP BY RC_ETAPA
    `);

    await upsertKpi({ tenantKey: req.user?.empresa, areaKey: 'rh', kpiKey: 'vacantes_abiertas', label: 'Vacantes abiertas', valor: vacantesAbiertas, unidad: '', tono: 'brand' });

    res.json({
      success: true,
      data: {
        vacantesAbiertas,
        candidatosActivos,
        porEtapa: porEtapaRs.recordset,
      },
    });
  } catch (err) {
    logger.error('rhAreaController.getDashboard', err);
    res.status(500).json({ success: false, message: 'Error al obtener dashboard' });
  }
}

module.exports = {
  listVacantes,
  crearVacante,
  listCandidatos,
  crearCandidato,
  getDashboard,
};
