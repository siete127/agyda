const express = require('express');
const router = express.Router();
const permisoController = require('../controllers/permisoController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, permisoController.getPermisos);
router.post('/', authenticateToken, permisoController.createPermiso);
router.put('/:id', authenticateToken, permisoController.updatePermiso);
// approve/reject usan un JWT de un solo uso en ?token= (link de correo),
// no requieren sesión de intranet a propósito.
router.get('/:id/approve', permisoController.approvePermiso);
router.get('/:id/reject', permisoController.rejectPermiso);

module.exports = router;
