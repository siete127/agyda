const express = require('express');
const router = express.Router();
const controller = require('../controllers/operacionesController');
const supervisorAlarmas = require('../controllers/supervisorAlarmasController'); // registra el cron de alarmas al require
const supervisorNotificaciones = require('../controllers/supervisorNotificacionesController');
const supervisorAccionesRemotas = require('../controllers/supervisorAccionesRemotasController');
const supervisorVistas = require('../controllers/supervisorVistasController');
const auth = require('../middleware/auth');
const { uploadRdl } = require('../middleware/rdlUpload');

router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/campanias', auth.authenticateToken, controller.listCampanias);
router.post('/campanias', auth.authenticateToken, controller.crearCampania);
router.get('/asignaciones', auth.authenticateToken, controller.listAsignaciones);
router.post('/asignaciones', auth.authenticateToken, controller.crearAsignacion);

// Supervisores
router.get('/supervisores', auth.authenticateToken, controller.listSupervisores);
router.post('/supervisores', auth.authenticateToken, controller.asignarSupervisor);
router.delete('/supervisores/:id', auth.authenticateToken, controller.quitarSupervisor);
router.get('/supervisores/mi-panel', auth.authenticateToken, controller.getMiPanel);
router.get('/supervisores/historial-asignaciones', auth.authenticateToken, controller.getHistorialAsignaciones);
router.get('/supervisores/productividad', auth.authenticateToken, controller.getProductividadDia);
router.get('/supervisores/comparador', auth.authenticateToken, controller.getComparador);
router.get('/supervisores/historico-sla', auth.authenticateToken, controller.getHistoricoSla);
router.get('/supervisores/alarmas', auth.authenticateToken, supervisorAlarmas.listInstancias);
router.post('/supervisores/alarmas/:id/atender', auth.authenticateToken, supervisorAlarmas.atenderInstancia);

// Notificaciones a agentes (Fase 2, 3.3) — cualquier usuario autenticado
// puede consultar/cerrar SUS pendientes; crear y ver el historial de
// enviadas se restringe por dentro del controlador (AD/TI o supervisor de
// la campaña/skill/agente destino).
router.get('/supervisores/notificaciones', auth.authenticateToken, supervisorNotificaciones.listEnviadas);
router.post('/supervisores/notificaciones', auth.authenticateToken, supervisorNotificaciones.crear);
router.get('/supervisores/notificaciones/pendientes', auth.authenticateToken, supervisorNotificaciones.pendientes);
router.post('/supervisores/notificaciones/:id/cerrar', auth.authenticateToken, supervisorNotificaciones.cerrar);

// Acciones remotas sobre la sesión del agente (Fase 3, 3.7) — el permiso
// puntual (¿es agente de una campaña asignada a este supervisor?) se valida
// dentro del controlador, reutilizando el mismo chequeo de notificaciones.
router.post('/supervisores/agentes/:id/desconectar', auth.authenticateToken, supervisorAccionesRemotas.desconectar);
router.post('/supervisores/agentes/:id/refrescar', auth.authenticateToken, supervisorAccionesRemotas.refrescar);

// Vistas guardadas / columnas visibles (Fase 3, 3.6) — preferencia personal
// del usuario autenticado, sin restricción de rol.
router.get('/supervisores/vistas/:tabla', auth.authenticateToken, supervisorVistas.get);
router.put('/supervisores/vistas/:tabla', auth.authenticateToken, supervisorVistas.guardar);

// Tiempos
router.get('/tiempos', auth.authenticateToken, controller.getTiemposAgente);
router.get('/tiempos/mis-agentes', auth.authenticateToken, controller.getMisAgentes);

// KPIs
router.get('/kpis', auth.authenticateToken, controller.getKpis);

// Metas
router.get('/metas', auth.authenticateToken, controller.listMetas);
router.post('/metas', auth.authenticateToken, controller.crearMeta);
router.delete('/metas/:id', auth.authenticateToken, controller.eliminarMeta);

// Suite de reportes (antes "Reportes diarios")
router.get('/reportes-diarios', auth.authenticateToken, controller.getReporteDiario);
router.get('/reportes-postulantes', auth.authenticateToken, controller.getReportePostulantes);
router.get('/reportes-postulantes/excel', auth.authenticateToken, controller.exportarReportePostulantes);
router.get('/reportes-postulantes/ejecutivo-reclutamiento', auth.authenticateToken, controller.getReporteEjecutivoReclutamiento);

// Interacciones cerradas — listado general con buscador (todas las campañas/canales)
router.get('/interacciones', auth.authenticateToken, controller.listInteracciones);
router.get('/interacciones/excel', auth.authenticateToken, controller.exportarInteracciones);

// Suite de reportes — catálogo de definiciones .rdl / .rdlc de Reporting Services
router.get('/suite-reportes/carpetas', auth.authenticateToken, controller.listRdlCarpetas);
router.post('/suite-reportes/carpetas', auth.authenticateToken, controller.crearRdlCarpeta);
router.patch('/suite-reportes/carpetas/:id', auth.authenticateToken, controller.renombrarRdlCarpeta);
router.delete('/suite-reportes/carpetas/:id', auth.authenticateToken, controller.eliminarRdlCarpeta);

router.get('/suite-reportes/rdl', auth.authenticateToken, controller.listRdl);
router.post('/suite-reportes/rdl', auth.authenticateToken, uploadRdl.single('archivo'), controller.subirRdl);
router.get('/suite-reportes/rdl/:id/raw', auth.authenticateToken, controller.descargarRdl);
router.patch('/suite-reportes/rdl/:id', auth.authenticateToken, controller.actualizarRdl);
router.delete('/suite-reportes/rdl/:id', auth.authenticateToken, controller.eliminarRdl);

// Constructor de reportes (variables del sistema, estilo InConcert)
router.get('/suite-reportes/builder/catalogo', auth.authenticateToken, controller.getBuilderCatalogo);
router.get('/suite-reportes/builder/catalogo-filtro/:catalogo', auth.authenticateToken, controller.getBuilderCatalogoFiltro);
router.post('/suite-reportes/builder/ejecutar', auth.authenticateToken, controller.ejecutarBuilder);
router.get('/suite-reportes/builder/reportes', auth.authenticateToken, controller.listReportesConstruidos);
router.post('/suite-reportes/builder/reportes', auth.authenticateToken, controller.guardarReporteConstruido);
router.patch('/suite-reportes/builder/reportes/:id', auth.authenticateToken, controller.actualizarReporteConstruido);
router.delete('/suite-reportes/builder/reportes/:id', auth.authenticateToken, controller.eliminarReporteConstruido);

// Asesores (panel self-service del propio agente)
router.get('/asesores/mi-resumen', auth.authenticateToken, controller.getMiResumenAsesor);

module.exports = router;
