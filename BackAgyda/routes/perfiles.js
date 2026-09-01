const express = require('express');
const router = express.Router();
const perfilConfigController = require('../controllers/perfilConfigController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// La gestión de perfiles requiere la acción 'accesos/gestionar' (igual que roles).
router.use(authenticateToken, requireActionAccess('accesos', 'gestionar'));

router.get('/', perfilConfigController.listPerfiles);
router.get('/:id', perfilConfigController.getPerfil);
router.post('/', perfilConfigController.createPerfil);
router.put('/:id', perfilConfigController.updatePerfil);
router.delete('/:id', perfilConfigController.deletePerfil);

module.exports = router;
