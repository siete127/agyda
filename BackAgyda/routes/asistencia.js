const express = require('express');
const router = express.Router();
const multer = require('multer');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const asistenciaController = require('../controllers/asistenciaController');
const asistenciaReporteController = require('../controllers/asistenciaReporteController');

const uploadMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post('/upload-biometrico', authenticateToken, verificarRol(['AD']), uploadMemory.single('archivo'), asistenciaController.uploadBiometrico);
router.post('/sync-biotime',     authenticateToken, verificarRol(['AD']), asistenciaController.syncBiotime);
router.get('/biotime/map',       authenticateToken, verificarRol(['AD']), asistenciaController.getBiotimeMap);
router.get('/biotime/alertas',   authenticateToken, verificarRol(['AD']), asistenciaController.getBiotimeAlertas);
router.post('/entrada', authenticateToken, requireActionAccess('asistencia-personal', 'marcar-entrada'), asistenciaController.marcarEntrada);
router.get('/entrada/hoy', authenticateToken, requireActionAccess('asistencia-personal', 'ver-historial'), asistenciaController.getEntradaHoy);
router.get('/mis-entradas', authenticateToken, requireActionAccess('asistencia-personal', 'ver-historial'), asistenciaController.getMisEntradas);
router.get('/retardos', authenticateToken, verificarRol(['AD']), asistenciaController.getReporteRetardos);
router.get('/retardos/stats', authenticateToken, verificarRol(['AD']), asistenciaController.getRetardosStats);
router.get('/resumen-mes', authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getResumenMes);
router.get('/resumen-dia', authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getResumenDia);
router.get('/excepciones',       authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getExcepciones);
router.post('/excepciones',      authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('asistencia', 'marcar-vacaciones'), asistenciaController.marcarExcepcion);
router.delete('/excepciones/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('asistencia', 'marcar-vacaciones'), asistenciaController.eliminarExcepcion);
router.get('/horarios',                          authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getHorarios);
router.put('/horarios/:id',                      authenticateToken, verificarRol(['AD']),       asistenciaController.updateHorario);
router.post('/horarios/:id/especiales',          authenticateToken, verificarRol(['AD']),       asistenciaController.createHorarioEspecial);
router.delete('/horarios/:id/especiales/:espId', authenticateToken, verificarRol(['AD']),       asistenciaController.deleteHorarioEspecial);
router.get('/exentos',      authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('asistencia', 'editar-horarios'), asistenciaController.getExentos);
router.post('/exentos',     authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('asistencia', 'editar-horarios'), asistenciaController.marcarExento);
router.delete('/exentos/:id', authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('asistencia', 'editar-horarios'), asistenciaController.quitarExento);

router.get('/bajas/config',          authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getBajasConfig);
router.put('/bajas/config',          authenticateToken, verificarRol(['AD']),       asistenciaController.updateBajasConfig);
router.get('/bajas/destinatarios',   authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getBajasDestinatarios);
router.put('/bajas/destinatarios',   authenticateToken, verificarRol(['AD']),       asistenciaController.setBajasDestinatarios);
router.get('/bajas/alertas',         authenticateToken, verificarRol(['AD', 'TI']), asistenciaController.getAlertasBaja);

router.post('/:asistenciaId/reporte', authenticateToken, verificarRol(['AD']), asistenciaReporteController.crearReporte);
router.get('/:asistenciaId/reporte', authenticateToken, verificarRol(['AD']), asistenciaReporteController.getReporte);
router.get('/reporte/:id/pdf', authenticateToken, verificarRol(['AD']), asistenciaReporteController.descargarPdf);

router.get('/actas', authenticateToken, verificarRol(['AD']), asistenciaReporteController.listarActas);
router.get('/acta/pendiente', authenticateToken, asistenciaReporteController.getActaPendiente);
router.post('/acta/:id/reconocer', authenticateToken, asistenciaReporteController.reconocerActa);
router.get('/acta/:id/pdf', authenticateToken, verificarRol(['AD']), asistenciaReporteController.descargarActaPdf);

module.exports = router;
