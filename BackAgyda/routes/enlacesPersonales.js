const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/enlacesPersonalesController');
const { authenticateToken } = require('../middleware/auth');

// Cada usuario lee y edita solo sus propios enlaces (req.user.id).
router.get('/', authenticateToken, ctrl.getMios);
router.put('/', authenticateToken, ctrl.updateMios);

module.exports = router;
