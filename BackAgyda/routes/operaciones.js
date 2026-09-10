const express = require('express');
const router = express.Router();
const controller = require('../controllers/operacionesController');
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
