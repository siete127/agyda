const express = require('express');
const router = express.Router();
const uiController = require('../controllers/uiController');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Público: se usa para pintar el fondo incluso en login / sin token.
router.get('/background', uiController.getBackground);

// Solo admin: cambia el fondo global para todos.
router.put('/background', authenticateToken, requireAdmin, uiController.updateBackground);

module.exports = router;
