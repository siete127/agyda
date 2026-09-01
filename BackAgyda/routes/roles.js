const express = require('express');
const router = express.Router();
const rolController = require('../controllers/rolController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Toda la gestión de roles requiere la acción 'accesos/gestionar' — el mismo
// permiso que protege la edición de accesos por usuario.
router.use(authenticateToken, requireActionAccess('accesos', 'gestionar'));

router.get('/', rolController.listRoles);
router.get('/:id', rolController.getRole);
router.post('/', rolController.createRole);
router.put('/:id', rolController.updateRole);
router.delete('/:id', rolController.deleteRole);

module.exports = router;
