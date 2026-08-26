const express = require('express');
const router = express.Router();
const notificationController = require('../controllers/notificacionController.js');
const { authenticateToken, requireSelfOrAdmin } = require('../middleware/auth');

// GET /api/notificaciones/user/:usuarioId
router.get('/user/:usuarioId', authenticateToken, requireSelfOrAdmin('usuarioId'), notificationController.listByUser);
// POST /api/notificaciones/mark-all/:usuarioId
router.post('/mark-all/:usuarioId', authenticateToken, requireSelfOrAdmin('usuarioId'), notificationController.markAllRead);
// POST /api/notificaciones/mark/:id
router.post('/mark/:id', authenticateToken, notificationController.markRead);

module.exports = router;
