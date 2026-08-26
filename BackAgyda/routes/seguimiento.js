const express = require('express');
const router = express.Router();
const seguimientoController = require('../controllers/seguimientoController');
const { authenticateToken } = require('../middleware/auth');

// Vista consolidada — cada fuente (Consultas/Aclaraciones/Quejas) filtra
// internamente según los permisos reales del usuario, así que basta con
// sesión válida; no hace falta una acción extra en Accesos para esto.
router.get('/casos-abiertos', authenticateToken, seguimientoController.getCasosAbiertos);

module.exports = router;
