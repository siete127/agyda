const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const qr = require('../controllers/qrGeneratorController');

// Autorización (AD/TI) resuelta dentro del propio controlador — mismo patrón
// que ccConfigController.js.
router.get('/', authenticateToken, qr.listar);
router.post('/', authenticateToken, qr.generar);
router.delete('/:id', authenticateToken, qr.eliminar);
router.get('/:id/analytics', authenticateToken, qr.analytics);

// Público (sin auth) — landing del modo 'llamada_medible' y sus eventos.
// Montado también en server.js como GET /q/:token (fuera de /api) porque el
// QR físico debe verse como una URL corta y limpia, no /api/qr-generator/....
router.post('/publico/:token/intento', qr.registrarIntento);
router.post('/publico/:token/confirmar', qr.registrarConfirmacion);

module.exports = router;
