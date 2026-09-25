const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/evalCapacitacionController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Acciones de Accesos (módulo 'evaluacion'). El controlador además exige AD para escribir.
const M = 'evaluacion';

router.use(authenticateToken);

router.get('/',              requireActionAccess(M, 'ver'), ctrl.getAll);
router.post('/',             requireActionAccess(M, 'crear'), ctrl.create);
router.get('/:id',           requireActionAccess(M, 'ver'), ctrl.getById);
router.put('/:id',           requireActionAccess(M, 'editar'), ctrl.update);
router.patch('/:id/finalizar', requireActionAccess(M, 'finalizar'), ctrl.finalizar);
router.delete('/:id',        requireActionAccess(M, 'eliminar'), ctrl.delete_);

module.exports = router;
