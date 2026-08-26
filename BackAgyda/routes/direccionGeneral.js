const express = require('express');
const router = express.Router();
const multer = require('multer');
const controller = require('../controllers/direccionGeneralController');
const planeacionController = require('../controllers/planeacionEstrategicaController');
const decisionesController = require('../controllers/decisionesController');
const reportesEjecutivosController = require('../controllers/reportesEjecutivosController');
const mejoraContinuaController = require('../controllers/mejoraContinuaController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadOkrEvidencias } = require('../middleware/okrEvidenciaUpload');
const { uploadDecisionAdjuntos } = require('../middleware/decisionAdjuntoUpload');
const { uploadMejoraContinuaAdjuntos } = require('../middleware/mejoraContinuaAdjuntoUpload');

const okrCrear = requireActionAccess('direccion-general', 'okr-crear');
const okrEditar = requireActionAccess('direccion-general', 'okr-editar');
const okrEliminar = requireActionAccess('direccion-general', 'okr-eliminar');
const okrCheckin = requireActionAccess('direccion-general', 'okr-checkin');
const okrComentar = requireActionAccess('direccion-general', 'okr-comentar');

const decisionCrear = requireActionAccess('direccion-general', 'decision-crear');
const decisionAprobar = requireActionAccess('direccion-general', 'decision-aprobar');
const decisionEliminar = requireActionAccess('direccion-general', 'decision-eliminar');
const decisionComentar = requireActionAccess('direccion-general', 'decision-comentar');
const decisionAdminTipos = requireActionAccess('direccion-general', 'decision-admin-tipos');

const reporteCrear = requireActionAccess('direccion-general', 'reporte-crear');
const reporteEliminar = requireActionAccess('direccion-general', 'reporte-eliminar');

const indicadoresVer = requireActionAccess('direccion-general', 'indicadores-ver');
const indicadoresExportar = requireActionAccess('direccion-general', 'indicadores-exportar');
const indicadoresComentar = requireActionAccess('direccion-general', 'indicadores-comentar');

const mejoraContinuaCrear = requireActionAccess('direccion-general', 'mejora-continua-crear');
const mejoraContinuaGestionar = requireActionAccess('direccion-general', 'mejora-continua-gestionar');
const mejoraContinuaEliminar = requireActionAccess('direccion-general', 'mejora-continua-eliminar');

const supervisionVer = requireActionAccess('direccion-general', 'supervision-ver');

router.get('/resumen', auth.authenticateToken, controller.getResumen);
router.get('/supervision', auth.authenticateToken, supervisionVer, controller.getSupervisionGeneral);
router.get('/indicadores', auth.authenticateToken, indicadoresVer, controller.getIndicadores);
router.get('/indicadores/export/pdf', auth.authenticateToken, indicadoresExportar, controller.exportarIndicadoresPdf);
router.post('/indicadores/compartir', auth.authenticateToken, indicadoresExportar, controller.generarLinkIndicadores);
router.get('/indicadores/publico/:token', controller.getIndicadoresPublico); // ruta pública, sin auth
router.get('/indicadores/:areaKey/:kpiKey/historico', auth.authenticateToken, indicadoresVer, controller.getKpiHistorico);
router.get('/indicadores/:areaKey/:kpiKey/comentarios', auth.authenticateToken, indicadoresVer, controller.listComentariosKpi);
router.post('/indicadores/:areaKey/:kpiKey/comentarios', auth.authenticateToken, indicadoresComentar, controller.crearComentarioKpi);
router.delete('/indicadores/comentarios/:id', auth.authenticateToken, indicadoresComentar, controller.eliminarComentarioKpi);

router.get('/planeacion/export/pdf', auth.authenticateToken, planeacionController.exportarPdf);
router.get('/planeacion/objetivos', auth.authenticateToken, planeacionController.listObjetivos);
router.post('/planeacion/objetivos', auth.authenticateToken, okrCrear, planeacionController.crearObjetivo);
router.put('/planeacion/objetivos/:id', auth.authenticateToken, okrEditar, planeacionController.actualizarObjetivo);
router.put('/planeacion/objetivos/:id/estatus-manual', auth.authenticateToken, okrEditar, planeacionController.actualizarEstatusManual);
router.delete('/planeacion/objetivos/:id', auth.authenticateToken, okrEliminar, planeacionController.eliminarObjetivo);
router.post('/planeacion/objetivos/:objetivoId/resultados', auth.authenticateToken, okrCrear, planeacionController.crearResultadoClave);
router.put('/planeacion/resultados/:id', auth.authenticateToken, okrCheckin, planeacionController.actualizarResultadoClave);
router.delete('/planeacion/resultados/:id', auth.authenticateToken, okrEliminar, planeacionController.eliminarResultadoClave);
router.get('/planeacion/resultados/:id/checkins', auth.authenticateToken, planeacionController.getKrCheckins);
router.get('/planeacion/resultados/:id/milestones', auth.authenticateToken, planeacionController.listMilestones);
router.post('/planeacion/resultados/:id/milestones', auth.authenticateToken, okrEditar, planeacionController.crearMilestone);
router.put('/planeacion/milestones/:milestoneId', auth.authenticateToken, okrCheckin, planeacionController.actualizarMilestone);
router.delete('/planeacion/milestones/:milestoneId', auth.authenticateToken, okrEliminar, planeacionController.eliminarMilestone);

router.get('/planeacion/objetivos/:id/comentarios', auth.authenticateToken, planeacionController.listComentarios);
router.post('/planeacion/objetivos/:id/comentarios', auth.authenticateToken, okrComentar, planeacionController.crearComentario);
router.delete('/planeacion/comentarios/:id', auth.authenticateToken, planeacionController.eliminarComentario);

router.get('/planeacion/resultados/:id/evidencias', auth.authenticateToken, planeacionController.listEvidencias);
router.post('/planeacion/resultados/:id/evidencias', auth.authenticateToken, okrCheckin, uploadOkrEvidencias.array('evidencias', 5), planeacionController.subirEvidencias);
router.delete('/planeacion/evidencias/:id', auth.authenticateToken, planeacionController.eliminarEvidencia);
router.get('/planeacion/evidencias/:id/ver', auth.authenticateToken, planeacionController.verEvidencia);

// ── Toma de decisiones ──────────────────────────────────────────────────
router.get('/decisiones/tipos', auth.authenticateToken, decisionesController.listTipos);
router.post('/decisiones/tipos', auth.authenticateToken, decisionAdminTipos, decisionesController.crearTipo);
router.put('/decisiones/tipos/:id', auth.authenticateToken, decisionAdminTipos, decisionesController.actualizarTipo);
router.delete('/decisiones/tipos/:id', auth.authenticateToken, decisionAdminTipos, decisionesController.eliminarTipo);

router.get('/decisiones/export/pdf', auth.authenticateToken, decisionesController.exportarPdf);
router.get('/decisiones/resumen', auth.authenticateToken, decisionesController.getResumen);
router.get('/decisiones', auth.authenticateToken, decisionesController.listDecisiones);
router.get('/decisiones/:id', auth.authenticateToken, decisionesController.getDecision);
router.post('/decisiones', auth.authenticateToken, decisionCrear, decisionesController.crearDecision);
router.put('/decisiones/:id/cancelar', auth.authenticateToken, decisionesController.cancelarDecision);
router.put('/decisiones/:id/aprobar', auth.authenticateToken, decisionAprobar, decisionesController.aprobarDecision);
router.put('/decisiones/:id/rechazar', auth.authenticateToken, decisionAprobar, decisionesController.rechazarDecision);
router.delete('/decisiones/:id', auth.authenticateToken, decisionEliminar, decisionesController.eliminarDecision);

router.get('/decisiones/:id/comentarios', auth.authenticateToken, decisionesController.listComentarios);
router.post('/decisiones/:id/comentarios', auth.authenticateToken, decisionComentar, decisionesController.crearComentario);
router.delete('/decisiones/comentarios/:id', auth.authenticateToken, decisionesController.eliminarComentario);

router.get('/decisiones/:id/adjuntos', auth.authenticateToken, decisionesController.listAdjuntos);
router.post('/decisiones/:id/adjuntos', auth.authenticateToken, uploadDecisionAdjuntos.array('adjuntos', 5), decisionesController.subirAdjuntos);
router.delete('/decisiones/adjuntos/:id', auth.authenticateToken, decisionesController.eliminarAdjunto);
router.get('/decisiones/adjuntos/:id/ver', auth.authenticateToken, decisionesController.verAdjunto);

// ── Reportes ejecutivos ─────────────────────────────────────────────────
router.get('/reportes-ejecutivos/catalogo', auth.authenticateToken, reportesEjecutivosController.getCatalogo);
router.get('/reportes-ejecutivos/filtro-opciones', auth.authenticateToken, reportesEjecutivosController.getOpcionesFiltro);
router.post('/reportes-ejecutivos/ejecutar', auth.authenticateToken, reportesEjecutivosController.ejecutarReporte);
router.post('/reportes-ejecutivos/export/pdf', auth.authenticateToken, reportesEjecutivosController.exportarPdf);
router.get('/reportes-ejecutivos/plantillas', auth.authenticateToken, reportesEjecutivosController.listPlantillas);
router.post('/reportes-ejecutivos/plantillas', auth.authenticateToken, reporteCrear, reportesEjecutivosController.crearPlantilla);
router.get('/reportes-ejecutivos/plantillas/:id', auth.authenticateToken, reportesEjecutivosController.getPlantilla);
router.put('/reportes-ejecutivos/plantillas/:id', auth.authenticateToken, reporteCrear, reportesEjecutivosController.actualizarPlantilla);
router.delete('/reportes-ejecutivos/plantillas/:id', auth.authenticateToken, reporteEliminar, reportesEjecutivosController.eliminarPlantilla);
router.post('/reportes-ejecutivos/plantillas/:id/ejecutar', auth.authenticateToken, reportesEjecutivosController.ejecutarPlantilla);

// ── Seguimiento y mejora continua ──────────────────────────────────────
router.get('/mejora-continua/export/pdf', auth.authenticateToken, mejoraContinuaController.exportarPdf);
router.get('/mejora-continua/hallazgos', auth.authenticateToken, mejoraContinuaController.listHallazgos);
router.post('/mejora-continua/hallazgos', auth.authenticateToken, mejoraContinuaCrear, mejoraContinuaController.crearHallazgo);
router.put('/mejora-continua/hallazgos/:id', auth.authenticateToken, mejoraContinuaGestionar, mejoraContinuaController.actualizarHallazgo);
router.put('/mejora-continua/hallazgos/:id/verificar', auth.authenticateToken, mejoraContinuaGestionar, mejoraContinuaController.verificarCierre);
router.put('/mejora-continua/hallazgos/:id/reabrir', auth.authenticateToken, mejoraContinuaGestionar, mejoraContinuaController.reabrirHallazgo);
router.delete('/mejora-continua/hallazgos/:id', auth.authenticateToken, mejoraContinuaEliminar, mejoraContinuaController.eliminarHallazgo);

router.get('/mejora-continua/hallazgos/:id/acciones', auth.authenticateToken, mejoraContinuaController.listAcciones);
router.post('/mejora-continua/hallazgos/:id/acciones', auth.authenticateToken, mejoraContinuaGestionar, mejoraContinuaController.crearAccion);
router.put('/mejora-continua/acciones/:id', auth.authenticateToken, mejoraContinuaGestionar, mejoraContinuaController.actualizarAccion);
router.delete('/mejora-continua/acciones/:id', auth.authenticateToken, mejoraContinuaEliminar, mejoraContinuaController.eliminarAccion);

router.get('/mejora-continua/hallazgos/:id/historial', auth.authenticateToken, mejoraContinuaController.listHistorial);

router.get('/mejora-continua/hallazgos/:id/comentarios', auth.authenticateToken, mejoraContinuaController.listComentarios);
router.post('/mejora-continua/hallazgos/:id/comentarios', auth.authenticateToken, mejoraContinuaController.crearComentario);
router.delete('/mejora-continua/comentarios/:id', auth.authenticateToken, mejoraContinuaController.eliminarComentario);

router.get('/mejora-continua/hallazgos/:id/adjuntos', auth.authenticateToken, mejoraContinuaController.listAdjuntosHallazgo);
router.post('/mejora-continua/hallazgos/:id/adjuntos', auth.authenticateToken, mejoraContinuaGestionar, uploadMejoraContinuaAdjuntos.array('adjuntos', 5), mejoraContinuaController.subirAdjuntosHallazgo);
router.delete('/mejora-continua/adjuntos/:id', auth.authenticateToken, mejoraContinuaEliminar, mejoraContinuaController.eliminarAdjuntoHallazgo);
router.get('/mejora-continua/adjuntos/:id/ver', auth.authenticateToken, mejoraContinuaController.verAdjuntoHallazgo);

// Manejo de errores de Multer dentro de este router (ej. archivo demasiado grande o tipo no permitido)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ success: false, message: 'Archivo demasiado grande (máximo 10MB)', errorCode: 'OKR_EVIDENCIA_TOO_LARGE' });
    }
    return res.status(400).json({ success: false, message: err.message || 'Error de carga de archivo', errorCode: 'OKR_EVIDENCIA_MULTER_ERROR' });
  }
  if (err) {
    return res.status(400).json({ success: false, message: err.message || 'Error de carga de archivo' });
  }
  next();
});

module.exports = router;
