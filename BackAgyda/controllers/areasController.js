const sql = require('mssql');
const databaseService = require('../services/databaseService');
const { AREA_KEYS } = require('../constants/areas');
const logger = global.logger || require('../utils/logger');
const { logAudit } = require('../services/auditService');

function isValidArea(areaKey) {
  return AREA_KEYS.includes(areaKey);
}

// ── KPIs ─────────────────────────────────────────────────────────────────
async function getKpis(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const periodo = req.query.periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('periodo', sql.NVarChar, periodo)
      .query(`
        SELECT AK_KPI_KEY as kpiKey, AK_LABEL as label, AK_VALOR as valor, AK_META as meta,
               AK_UNIDAD as unidad, AK_TONO as tono, AK_PERIODO as periodo, AK_FECHA_CORTE as fechaCorte
        FROM AREA_KPIS
        WHERE AK_AREA_KEY = @areaKey AND AK_PERIODO = @periodo
        ORDER BY AK_ID
      `);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('areasController.getKpis', err);
    res.status(500).json({ success: false, message: 'Error al obtener KPIs' });
  }
}

// Upsert de un KPI — usado por los controladores de cada área para publicar su resumen
async function upsertKpi({ areaKey, kpiKey, label, valor, meta, unidad, tono, periodo, updatedBy, tenantKey }) {
  const pool = await databaseService.getPool(tenantKey);
  const p = periodo || new Date().toISOString().slice(0, 7);
  await pool.request()
    .input('areaKey', sql.NVarChar, areaKey)
    .input('kpiKey', sql.NVarChar, kpiKey)
    .input('label', sql.NVarChar, label)
    .input('valor', sql.Decimal(18, 2), valor || 0)
    .input('meta', sql.Decimal(18, 2), meta ?? null)
    .input('unidad', sql.NVarChar, unidad || null)
    .input('tono', sql.NVarChar, tono || 'brand')
    .input('periodo', sql.NVarChar, p)
    .input('updatedBy', sql.Int, updatedBy || null)
    .query(`
      MERGE AREA_KPIS AS target
      USING (SELECT @areaKey AS AK_AREA_KEY, @kpiKey AS AK_KPI_KEY, @periodo AS AK_PERIODO) AS src
      ON target.AK_AREA_KEY = src.AK_AREA_KEY AND target.AK_KPI_KEY = src.AK_KPI_KEY AND target.AK_PERIODO = src.AK_PERIODO
      WHEN MATCHED THEN UPDATE SET AK_LABEL=@label, AK_VALOR=@valor, AK_META=@meta, AK_UNIDAD=@unidad, AK_TONO=@tono, AK_FECHA_CORTE=GETDATE(), AK_UPDATED_BY=@updatedBy
      WHEN NOT MATCHED THEN INSERT (AK_AREA_KEY, AK_KPI_KEY, AK_LABEL, AK_VALOR, AK_META, AK_UNIDAD, AK_TONO, AK_PERIODO, AK_UPDATED_BY)
        VALUES (@areaKey, @kpiKey, @label, @valor, @meta, @unidad, @tono, @periodo, @updatedBy);
    `);
}

// Actualiza solo la gobernanza (responsable/fórmula/origen) de un KPI ya publicado, sin tocar su valor
async function actualizarGobernanzaKpi(req, res) {
  try {
    const { areaKey, kpiKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const { periodo, responsableId, formula, origen } = req.body;
    const p = periodo || new Date().toISOString().slice(0, 7);
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('kpiKey', sql.NVarChar, kpiKey)
      .input('periodo', sql.NVarChar, p)
      .input('responsableId', sql.Int, responsableId ?? null)
      .input('formula', sql.NVarChar, formula ?? null)
      .input('origen', sql.NVarChar, origen ?? null)
      .query(`
        UPDATE AREA_KPIS SET AK_RESPONSABLE_ID=@responsableId, AK_FORMULA=@formula, AK_ORIGEN=@origen
        WHERE AK_AREA_KEY=@areaKey AND AK_KPI_KEY=@kpiKey AND AK_PERIODO=@periodo
      `);
    if (rs.rowsAffected[0] === 0) return res.status(404).json({ success: false, message: 'KPI no encontrado para ese periodo' });
    await logAudit(pool, {
      userId: req.user?.id, userName: req.user?.nombre, modulo: 'indicadores-empresariales', accion: 'actualizar-gobernanza-kpi',
      entidadId: `${areaKey}:${kpiKey}:${p}`, detalle: { responsableId, formula, origen }, ip: req.ip,
    });
    res.json({ success: true });
  } catch (err) {
    logger.error('areasController.actualizarGobernanzaKpi', err);
    res.status(500).json({ success: false, message: 'Error al actualizar gobernanza del KPI' });
  }
}

// ── Objetivo ─────────────────────────────────────────────────────────────
async function getObjetivo(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .query(`SELECT AO_OBJETIVO as objetivo, AO_MISION as mision, AO_VISION as vision, AO_UPDATED_AT as updatedAt FROM AREA_OBJETIVOS WHERE AO_AREA_KEY=@areaKey`);
    res.json({ success: true, data: rs.recordset[0] || { objetivo: '', mision: '', vision: '' } });
  } catch (err) {
    logger.error('areasController.getObjetivo', err);
    res.status(500).json({ success: false, message: 'Error al obtener objetivo' });
  }
}

async function setObjetivo(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const { objetivo, mision, vision } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('objetivo', sql.NVarChar, objetivo || null)
      .input('mision', sql.NVarChar, mision || null)
      .input('vision', sql.NVarChar, vision || null)
      .input('updatedBy', sql.Int, req.user?.id || null)
      .query(`
        MERGE AREA_OBJETIVOS AS target
        USING (SELECT @areaKey AS AO_AREA_KEY) AS src ON target.AO_AREA_KEY = src.AO_AREA_KEY
        WHEN MATCHED THEN UPDATE SET AO_OBJETIVO=@objetivo, AO_MISION=@mision, AO_VISION=@vision, AO_UPDATED_BY=@updatedBy, AO_UPDATED_AT=GETDATE()
        WHEN NOT MATCHED THEN INSERT (AO_AREA_KEY, AO_OBJETIVO, AO_MISION, AO_VISION, AO_UPDATED_BY) VALUES (@areaKey, @objetivo, @mision, @vision, @updatedBy);
      `);
    res.json({ success: true });
  } catch (err) {
    logger.error('areasController.setObjetivo', err);
    res.status(500).json({ success: false, message: 'Error al guardar objetivo' });
  }
}

// ── Documentos ───────────────────────────────────────────────────────────
async function listDocumentos(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .query(`SELECT AD_ID as id, AD_TITULO as titulo, AD_CATEGORIA as categoria, AD_NOMBRE_ARCHIVO as nombreArchivo, AD_FECHA_SUBIDA as fechaSubida
              FROM AREA_DOCUMENTOS WHERE AD_AREA_KEY=@areaKey AND AD_ACTIVO=1 ORDER BY AD_FECHA_SUBIDA DESC`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('areasController.listDocumentos', err);
    res.status(500).json({ success: false, message: 'Error al listar documentos' });
  }
}

async function subirDocumento(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    if (!req.file) return res.status(400).json({ success: false, message: 'Archivo requerido' });
    const { titulo, categoria } = req.body;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('titulo', sql.NVarChar, titulo || req.file.originalname)
      .input('categoria', sql.NVarChar, categoria || null)
      .input('nombreArchivo', sql.NVarChar, req.file.filename)
      .input('rutaFisica', sql.NVarChar, req.file.path)
      .input('subidoPor', sql.Int, req.user?.id || null)
      .query(`INSERT INTO AREA_DOCUMENTOS (AD_AREA_KEY, AD_TITULO, AD_CATEGORIA, AD_NOMBRE_ARCHIVO, AD_RUTA_FISICA, AD_SUBIDO_POR)
              VALUES (@areaKey, @titulo, @categoria, @nombreArchivo, @rutaFisica, @subidoPor)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('areasController.subirDocumento', err);
    res.status(500).json({ success: false, message: 'Error al subir documento' });
  }
}

async function eliminarDocumento(req, res) {
  try {
    const { id } = req.params;
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request().input('id', sql.Int, id).query(`UPDATE AREA_DOCUMENTOS SET AD_ACTIVO=0 WHERE AD_ID=@id`);
    res.json({ success: true });
  } catch (err) {
    logger.error('areasController.eliminarDocumento', err);
    res.status(500).json({ success: false, message: 'Error al eliminar documento' });
  }
}

// ── Procesos ─────────────────────────────────────────────────────────────
async function listProcesos(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const pool = await databaseService.getPool(req.user?.empresa);
    const rs = await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .query(`SELECT AP_ID as id, AP_TITULO as titulo, AP_DESCRIPCION as descripcion, AP_ESTATUS as estatus, AP_ORDEN as orden
              FROM AREA_PROCESOS WHERE AP_AREA_KEY=@areaKey AND AP_ACTIVO=1 ORDER BY AP_ORDEN, AP_ID`);
    res.json({ success: true, data: rs.recordset });
  } catch (err) {
    logger.error('areasController.listProcesos', err);
    res.status(500).json({ success: false, message: 'Error al listar procesos' });
  }
}

async function crearProceso(req, res) {
  try {
    const { areaKey } = req.params;
    if (!isValidArea(areaKey)) return res.status(404).json({ success: false, message: 'Área no reconocida' });
    const { titulo, descripcion, estatus, orden } = req.body;
    if (!titulo) return res.status(400).json({ success: false, message: 'Título requerido' });
    const pool = await databaseService.getPool(req.user?.empresa);
    await pool.request()
      .input('areaKey', sql.NVarChar, areaKey)
      .input('titulo', sql.NVarChar, titulo)
      .input('descripcion', sql.NVarChar, descripcion || null)
      .input('estatus', sql.NVarChar, estatus || 'activo')
      .input('orden', sql.Int, orden || 0)
      .query(`INSERT INTO AREA_PROCESOS (AP_AREA_KEY, AP_TITULO, AP_DESCRIPCION, AP_ESTATUS, AP_ORDEN) VALUES (@areaKey, @titulo, @descripcion, @estatus, @orden)`);
    res.json({ success: true });
  } catch (err) {
    logger.error('areasController.crearProceso', err);
    res.status(500).json({ success: false, message: 'Error al crear proceso' });
  }
}

module.exports = {
  isValidArea,
  getKpis,
  upsertKpi,
  actualizarGobernanzaKpi,
  getObjetivo,
  setObjetivo,
  listDocumentos,
  subirDocumento,
  eliminarDocumento,
  listProcesos,
  crearProceso,
};
