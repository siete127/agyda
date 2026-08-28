const express = require('express');
const router = express.Router();
const plantillasCorreoController = require('../controllers/plantillasCorreoController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('tickets', 'ver'), plantillasCorreoController.getPlantillas);
router.post('/', requireActionAccess('tickets', 'gestionar-estado'), plantillasCorreoController.createPlantilla);
router.put('/:id', requireActionAccess('tickets', 'gestionar-estado'), plantillasCorreoController.updatePlantilla);
router.post('/:id/toggle-activa', requireActionAccess('tickets', 'gestionar-estado'), plantillasCorreoController.toggleActiva);
router.delete('/:id', requireActionAccess('tickets', 'gestionar-estado'), plantillasCorreoController.deletePlantilla);

module.exports = router;
