const express = require('express');
const router = express.Router();
const controller = require('../controllers/operacionesController');
const auth = require('../middleware/auth');

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

// Reportes diarios
router.get('/reportes-diarios', auth.authenticateToken, controller.getReporteDiario);

// Asesores (panel self-service del propio agente)
router.get('/asesores/mi-resumen', auth.authenticateToken, controller.getMiResumenAsesor);

module.exports = router;
