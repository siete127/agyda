const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, verificarRol } = require('../middleware/auth');

// GET /api/reports/usuarios/times?from=YYYY-MM-DD&to=YYYY-MM-DD&format=csv|json
router.get('/usuarios/times', authenticateToken, verificarRol(['AD', 'admin', 'Administrador']), reportController.getUserTimesReport);

// GET /api/reports/resumen-general?from=&to=&rol= — solo AD
router.get('/resumen-general', authenticateToken, verificarRol(['AD', 'admin', 'Administrador']), reportController.getResumenGeneral);

// GET /api/reports/banio?from=YYYY-MM-DDTHH:mm&to=YYYY-MM-DDTHH:mm&statusId=N
router.get('/banio', authenticateToken, verificarRol(['AD', 'TI', 'admin', 'Administrador']), reportController.getBanioReport);

// Pausas: iniciar, terminar, consultar activa
router.post('/pausa/iniciar',  authenticateToken, reportController.iniciarPausa);
router.post('/pausa/terminar', authenticateToken, reportController.terminarPausa);
router.get('/pausa/activa',    authenticateToken, reportController.getPausaActiva);

module.exports = router;
