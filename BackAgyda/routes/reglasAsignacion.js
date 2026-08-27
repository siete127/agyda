const express = require('express');
const router = express.Router();
const reglasAsignacionController = require('../controllers/reglasAsignacionController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('configuracion', 'ver'), reglasAsignacionController.getReglas);
router.post('/', requireActionAccess('configuracion', 'configurar'), reglasAsignacionController.createRegla);
router.put('/:id', requireActionAccess('configuracion', 'configurar'), reglasAsignacionController.updateRegla);
router.delete('/:id', requireActionAccess('configuracion', 'configurar'), reglasAsignacionController.deleteRegla);
router.patch('/reordenar', requireActionAccess('configuracion', 'configurar'), reglasAsignacionController.reordenarReglas);
router.post('/simular', requireActionAccess('configuracion', 'ver'), reglasAsignacionController.simularAsignacion);

module.exports = router;
