const express = require('express');
const router = express.Router();
const controller = require('../controllers/atencionClienteController');
const clienteSeguimiento = require('../controllers/clienteSeguimientoController');
const clienteIncidencias = require('../controllers/clienteIncidenciasController');
const clienteFechas = require('../controllers/clienteFechasController');
const clienteFechasCron = require('../controllers/clienteFechasCronController');
const clienteDashboard = require('../controllers/clienteDashboardController');
const auth = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const { uploadCrmDocumento } = require('../middleware/crmDocumentoUpload');

router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/retencion', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ver-retencion'), controller.listRetencion);
router.post('/retencion', auth.authenticateToken, requireActionAccess('atencion-cliente', 'crear-retencion'), controller.crearRetencion);

// ── Clientes: seguimiento (bitácora de contacto) ──────────────────────────
router.get('/clientes/:id/seguimientos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteSeguimiento.listSeguimientos);
router.post('/clientes/:id/seguimientos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-seguimiento'), clienteSeguimiento.createSeguimiento);
router.get('/clientes/:id/historial', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteSeguimiento.getHistorial);

// ── Clientes: tareas ───────────────────────────────────────────────────────
router.get('/tareas/mias', auth.authenticateToken, clienteSeguimiento.listTareasMias);
router.get('/clientes/:id/tareas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteSeguimiento.listTareasByContacto);
router.post('/clientes/:id/tareas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.createTarea);
router.patch('/tareas/:id/estatus', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.updateTareaEstatus);
router.delete('/tareas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.deleteTarea);

// ── Incidencias ─────────────────────────────────────────────────────────────
router.get('/incidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-ver'), clienteIncidencias.list);
router.get('/incidencias/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-ver'), clienteIncidencias.getById);
router.post('/incidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), clienteIncidencias.create);
router.patch('/incidencias/:id/estatus', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), clienteIncidencias.updateEstatus);
router.patch('/incidencias/:id/solucion', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), clienteIncidencias.updateSolucion);
router.get('/incidencias/:id/comentarios', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-ver'), clienteIncidencias.listComentarios);
router.post('/incidencias/:id/comentarios', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), clienteIncidencias.addComentario);
router.get('/clientes/:id/incidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteIncidencias.listByContacto);

// ── Incidencias: evidencias (adjuntos) ────────────────────────────────────
router.post('/incidencias/:id/evidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), uploadCrmDocumento.single('file'), clienteIncidencias.subirEvidencia);
router.get('/incidencias/:id/evidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-ver'), clienteIncidencias.listEvidencias);
router.get('/incidencias/evidencias/:evidenciaId/download', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-ver'), clienteIncidencias.downloadEvidencia);
router.delete('/incidencias/evidencias/:evidenciaId', auth.authenticateToken, requireActionAccess('atencion-cliente', 'incidencias-gestionar'), clienteIncidencias.deleteEvidencia);

// ── Renovaciones y fechas importantes ────────────────────────────────────────
router.get('/clientes/:id/fechas-importantes', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteFechas.listByContacto);
router.post('/clientes/:id/fechas-importantes', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-renovaciones'), clienteFechas.create);
router.put('/fechas-importantes/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-renovaciones'), clienteFechas.update);
router.delete('/fechas-importantes/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-renovaciones'), clienteFechas.delete);
router.post('/fechas-importantes/run-cron', auth.authenticateToken, auth.verificarRol(['AD']), clienteFechasCron.runNow);

// ── Dashboard y reportes ──────────────────────────────────────────────────
router.get('/clientes/dashboard', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-dashboard'), clienteDashboard.getDashboard);
router.get('/clientes/reportes', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-dashboard'), clienteDashboard.getReporte);

module.exports = router;
