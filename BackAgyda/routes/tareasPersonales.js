const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/tareasPersonalesController');
const { authenticateToken, verificarRol } = require('../middleware/auth');

router.use(authenticateToken);

// Cualquier usuario autenticado ve y completa las suyas.
router.get('/mis-tareas', ctrl.misTareas);
router.get('/combinadas', ctrl.combinadas);
router.post('/:id/completar', ctrl.completar);

// Solo AD administra (ver todas, crear, editar, eliminar).
const soloAD = [verificarRol(['AD'])];
router.get('/', ...soloAD, ctrl.list);
router.post('/', ...soloAD, ctrl.create);
router.put('/:id', ...soloAD, ctrl.update);
router.delete('/:id', ...soloAD, ctrl.remove);

module.exports = router;
