const express = require('express');
const router = express.Router();
const controller = require('../controllers/atencionClienteController');
const clienteSeguimiento = require('../controllers/clienteSeguimientoController');
const clienteFechas = require('../controllers/clienteFechasController');
const clienteFechasCron = require('../controllers/clienteFechasCronController');
const clienteAgendaCron = require('../controllers/clienteAgendaCronController');
const clienteIncSlaCron = require('../controllers/clienteIncidenciasSlaCronController');
const citaRecordatorioCron = require('../controllers/citaRecordatorioCronController');
const caso = require('../controllers/casoController');
const cita = require('../controllers/citaController');
const oferta = require('../controllers/ofertaController');
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
router.get('/mi-agenda', auth.authenticateToken, clienteSeguimiento.getMiAgenda);
router.get('/clientes/:id/tareas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), clienteSeguimiento.listTareasByContacto);
router.post('/clientes/:id/tareas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.createTarea);
router.patch('/tareas/:id/estatus', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.updateTareaEstatus);
router.patch('/tareas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.updateTarea);
router.delete('/tareas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-tareas'), clienteSeguimiento.deleteTarea);
router.post('/agenda/run-cron', auth.authenticateToken, auth.verificarRol(['AD']), clienteAgendaCron.runNow);

// ── Incidencias → unificadas en "Casos" (Fase 9). Solo queda el cron de SLA,
//    que ahora corre sobre CASOS tipo 'incidencia'. La tabla CLI_INCIDENCIAS y
//    sus rutas/controlador legacy se eliminaron; la tabla SQL se conserva.
router.post('/incidencias/sla/run-cron', auth.authenticateToken, auth.verificarRol(['AD']), clienteIncSlaCron.runNow);

// ── Casos (unificado) ─────────────────────────────────────────────────────
// Reemplaza gradualmente a Consultas/Aclaraciones/Quejas/Incidencias. Para
// CASO_TIPO='queja', el control de acceso extra (códigos de empleado) se aplica
// DENTRO del controlador, no aquí — decisión de diseño, ver casoController.js.
// Rutas específicas ANTES de /casos/:id para que no colisionen.
router.get('/casos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.list);
router.post('/casos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.create);
router.get('/casos/evidencias/:evidenciaId/download', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.downloadEvidencia);
router.delete('/casos/evidencias/:evidenciaId', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.deleteEvidencia);
router.get('/casos/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.getById);
router.delete('/casos/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.deleteCaso);
router.patch('/casos/:id/estatus', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.updateEstatus);
router.patch('/casos/:id/solucion', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.updateSolucion);
router.get('/casos/:id/comentarios', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.listComentarios);
router.post('/casos/:id/comentarios', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.addComentario);
router.get('/casos/:id/evidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.listEvidencias);
router.post('/casos/:id/evidencias', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), uploadCrmDocumento.single('file'), caso.subirEvidencia);
router.get('/casos/:id/accion-correctiva', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-ver'), caso.getAccionCorrectiva);
router.post('/casos/:id/accion-correctiva', auth.authenticateToken, requireActionAccess('atencion-cliente', 'casos-gestionar'), caso.createAccionCorrectiva);
router.get('/clientes/:id/casos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), caso.listByContacto);

// ── Citas y tratamientos (CRM Cliente) ───────────────────────────────────────
// Rutas específicas ANTES de /citas/:id para que no colisionen.
router.get('/citas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-ver'), cita.list);
router.post('/citas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.create);
router.get('/citas/solicitudes', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-ver'), cita.listSolicitudes);
router.patch('/citas/solicitudes/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.resolverSolicitud);
router.post('/citas/recordatorios/run-cron', auth.authenticateToken, auth.verificarRol(['AD']), citaRecordatorioCron.runNow);
router.get('/citas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-ver'), cita.getById);
router.patch('/citas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.update);
router.delete('/citas/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.remove);
router.patch('/citas/:id/estatus', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.updateEstatus);
router.post('/citas/:id/cancelar', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.cancelar);
router.get('/clientes/:id/citas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'clientes-ver'), cita.listByContacto);
router.get('/tratamientos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-ver'), cita.listTratamientos);
router.post('/tratamientos', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.createTratamiento);
router.get('/tratamientos/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-ver'), cita.getTratamiento);
router.patch('/tratamientos/:id', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.updateTratamiento);
router.post('/tratamientos/:id/sesiones', auth.authenticateToken, requireActionAccess('atencion-cliente', 'citas-gestionar'), cita.addSesion);

// ── Ofertas a segmento de clientes (CRM Cliente) ─────────────────────────────
router.get('/ofertas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ofertas-gestionar'), oferta.list);
router.post('/ofertas', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ofertas-gestionar'), oferta.create);
router.post('/ofertas/preview-segmento', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ofertas-gestionar'), oferta.previewSegmento);
router.post('/ofertas/:id/enviar', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ofertas-gestionar'), oferta.enviar);
router.get('/ofertas/:id/envios', auth.authenticateToken, requireActionAccess('atencion-cliente', 'ofertas-gestionar'), oferta.getEnvios);

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
