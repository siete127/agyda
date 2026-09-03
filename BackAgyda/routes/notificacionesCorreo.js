const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificacionesCorreoController');
const auth = require('../middleware/auth');

router.get('/', auth.authenticateToken, controller.getConfiguracion);
router.put('/:modulo/destinatario/:usuarioId', auth.authenticateToken, controller.setDestinatario);
router.put('/usuario/:usuarioId/correo', auth.authenticateToken, controller.setCorreoUsuario);

router.get('/servidor', auth.authenticateToken, controller.getServidorConfig);
router.put('/servidor', auth.authenticateToken, controller.saveServidorConfig);
router.post('/servidor/prueba', auth.authenticateToken, controller.enviarPrueba);

// Vinculación de Telegram — cualquier usuario autenticado gestiona la suya propia.
router.get('/telegram/estado', auth.authenticateToken, controller.getEstadoTelegram);
router.post('/telegram/codigo', auth.authenticateToken, controller.generarCodigoTelegram);
router.post('/telegram/desvincular', auth.authenticateToken, controller.desvincularTelegram);

module.exports = router;
