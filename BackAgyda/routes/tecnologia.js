const express = require('express');
const router = express.Router();
const controller = require('../controllers/tecnologiaController');
const auth = require('../middleware/auth');
const apiKeyAuth = require('../middleware/apiKeyAuth');

router.get('/dashboard', auth.authenticateToken, controller.getDashboard);
router.get('/mantenimientos', auth.authenticateToken, controller.listMantenimientos);
router.post('/mantenimientos', auth.authenticateToken, controller.crearMantenimiento);
router.get('/incidentes', auth.authenticateToken, controller.listIncidentes);
router.post('/incidentes', auth.authenticateToken, controller.crearIncidente);

// Internet y redes
router.get('/enlaces', auth.authenticateToken, controller.listEnlaces);
router.post('/enlaces', auth.authenticateToken, controller.crearEnlace);
router.put('/enlaces/:id', auth.authenticateToken, controller.actualizarEnlace);
router.delete('/enlaces/:id', auth.authenticateToken, controller.eliminarEnlace);
router.get('/incidentes-red', auth.authenticateToken, controller.listIncidentesRed);
router.post('/incidentes-red', auth.authenticateToken, controller.crearIncidenteRed);
router.patch('/incidentes-red/:id/resolver', auth.authenticateToken, controller.resolverIncidenteRed);
router.get('/dashboard-red', auth.authenticateToken, controller.getDashboardRed);

// Monitoreo de red en vivo — ingesta del agente (API key) + lecturas (sesión)
router.post('/red/ingesta', apiKeyAuth, controller.ingestaRed);
router.get('/red/estado-actual', auth.authenticateToken, controller.getEstadoActualRed);
router.get('/red/mediciones', auth.authenticateToken, controller.getMedicionesRed);
router.get('/red/dispositivos', auth.authenticateToken, controller.getDispositivosRed);
router.patch('/red/dispositivos/:id', auth.authenticateToken, controller.actualizarDispositivoRed);
// Descarga del instalador del agente PRECONFIGURADO para la empresa del usuario
router.get('/red/agente/instalador', auth.authenticateToken, auth.verificarRol(['AD', 'TI']), controller.descargarAgente);

// Respaldos
router.get('/respaldos/config', auth.authenticateToken, controller.listRespaldosConfig);
router.post('/respaldos/config', auth.authenticateToken, controller.crearRespaldoConfig);
router.put('/respaldos/config/:id', auth.authenticateToken, controller.actualizarRespaldoConfig);
router.delete('/respaldos/config/:id', auth.authenticateToken, controller.eliminarRespaldoConfig);
router.get('/respaldos/registros', auth.authenticateToken, controller.listRespaldosRegistros);
router.post('/respaldos/registros', auth.authenticateToken, controller.crearRespaldoRegistro);

// Sistemas
router.get('/sistemas', auth.authenticateToken, controller.listSistemas);
router.post('/sistemas', auth.authenticateToken, controller.crearSistema);
router.put('/sistemas/:id', auth.authenticateToken, controller.actualizarSistema);
router.delete('/sistemas/:id', auth.authenticateToken, controller.eliminarSistema);
router.get('/incidentes-sistema', auth.authenticateToken, controller.listIncidentesSistema);
router.post('/incidentes-sistema', auth.authenticateToken, controller.crearIncidenteSistema);
router.patch('/incidentes-sistema/:id/resolver', auth.authenticateToken, controller.resolverIncidenteSistema);
router.get('/dashboard-sistemas', auth.authenticateToken, controller.getDashboardSistemas);

module.exports = router;
