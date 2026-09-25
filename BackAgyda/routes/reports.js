const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// GET /api/reports/usuarios/times?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
router.get('/usuarios/times', authenticateToken, verificarRol(['AD', 'admin', 'Administrador']), requireActionAccess('reports', 'ver-reportes'), reportController.getUserTimesReport);

// GET /api/reports/resumen-general?from=&to=&rol= — solo AD
router.get('/resumen-general', authenticateToken, verificarRol(['AD', 'admin', 'Administrador']), requireActionAccess('reports', 'ver-reportes'), reportController.getResumenGeneral);

// GET /api/reports/banio?from=YYYY-MM-DDTHH:mm&to=YYYY-MM-DDTHH:mm&statusId=N
router.get('/banio', authenticateToken, verificarRol(['AD', 'TI', 'admin', 'Administrador']), requireActionAccess('reports', 'ver-reportes'), reportController.getBanioReport);

// Pausas: iniciar, terminar, consultar activa. Requieren la acción
// reports:gestionar-pausas — si la empresa tiene el módulo desactivado o al
// usuario se le quitó la acción en Accesos, no puede marcar pausas.
const pausas = requireActionAccess('reports', 'gestionar-pausas');
router.post('/pausa/iniciar',  authenticateToken, pausas, reportController.iniciarPausa);
router.post('/pausa/terminar', authenticateToken, pausas, reportController.terminarPausa);
router.get('/pausa/activa',    authenticateToken, pausas, reportController.getPausaActiva);
router.get('/pausa/hoy',       authenticateToken, pausas, reportController.getPausaHoy);

// Tiempos de hoy: disponible/pausas — propio (cualquier usuario) y del equipo (permiso)
router.get('/tiempos/hoy',        authenticateToken, reportController.getTiemposHoy);
router.get('/tiempos/hoy/equipo', authenticateToken, requireActionAccess('reports', 'ver-equipo'), reportController.getTiemposHoyEquipo);

module.exports = router;
