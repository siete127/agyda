const express = require('express');
const router = express.Router();
const controller = require('../controllers/notificacionesCorreoController');
const auth = require('../middleware/auth');

router.get('/', auth.authenticateToken, controller.getConfiguracion);
router.put('/:modulo/destinatario/:usuarioId', auth.authenticateToken, controller.setDestinatario);
router.put('/usuario/:usuarioId/correo', auth.authenticateToken, controller.setCorreoUsuario);

module.exports = router;
