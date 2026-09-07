const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const qr = require('../controllers/qrGeneratorController');

// Autorización (AD/TI) resuelta dentro del propio controlador — mismo patrón
// que ccConfigController.js.
router.get('/', authenticateToken, qr.listar);
router.post('/', authenticateToken, qr.generar);
router.delete('/:id', authenticateToken, qr.eliminar);

module.exports = router;
