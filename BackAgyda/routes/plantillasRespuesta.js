const express = require('express');
const router = express.Router();
const plantillasRespuestaController = require('../controllers/plantillasRespuestaController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('tickets', 'ver'), plantillasRespuestaController.getPlantillas);
router.post('/', requireActionAccess('tickets', 'gestionar-estado'), plantillasRespuestaController.createPlantilla);
router.put('/:id', requireActionAccess('tickets', 'gestionar-estado'), plantillasRespuestaController.updatePlantilla);
router.post('/:id/toggle-activa', requireActionAccess('tickets', 'gestionar-estado'), plantillasRespuestaController.toggleActiva);
router.delete('/:id', requireActionAccess('tickets', 'gestionar-estado'), plantillasRespuestaController.deletePlantilla);

module.exports = router;
