const express = require('express');
const router = express.Router();

const webphoneController = require('../controllers/webphoneController');
const webphoneVistasController = require('../controllers/webphoneVistasController');
const webphoneCredencialesController = require('../controllers/webphoneCredencialesController');
const { authenticateToken, verificarRol } = require('../middleware/auth');

// Public (secret-protected) endpoint for telephony integration.
router.post('/incoming-call', webphoneController.incomingCall);
router.get('/incoming-call', webphoneController.incomingCall);

// Vistas embebidas del Webphone (URLs configurables) — lectura para cualquier
// usuario autenticado, administración solo AD/TI.
router.get('/vistas', authenticateToken, webphoneVistasController.getVistas);
router.post('/vistas', authenticateToken, verificarRol(['AD', 'TI']), webphoneVistasController.createVista);
router.put('/vistas/:id', authenticateToken, verificarRol(['AD', 'TI']), webphoneVistasController.updateVista);
router.delete('/vistas/:id', authenticateToken, verificarRol(['AD', 'TI']), webphoneVistasController.deleteVista);

// Credenciales de VICIdial por agente y por vista (para auto-login) —
// administración exclusiva AD/TI. Los passwords nunca se devuelven en texto
// plano por API. Declarada antes de las rutas /credenciales/:neusId para que
// Express no confunda "auto-login-url" con un :neusId.
router.get('/credenciales/auto-login-url', authenticateToken, webphoneCredencialesController.getAutoLoginUrl);
router.get('/credenciales', authenticateToken, verificarRol(['AD', 'TI']), webphoneCredencialesController.getCredenciales);
router.put('/credenciales/:neusId/:vistaId', authenticateToken, verificarRol(['AD', 'TI']), webphoneCredencialesController.upsertCredencial);
router.delete('/credenciales/:neusId/:vistaId', authenticateToken, verificarRol(['AD', 'TI']), webphoneCredencialesController.deleteCredencial);

module.exports = router;
