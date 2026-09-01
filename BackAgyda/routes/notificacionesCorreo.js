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

module.exports = router;
