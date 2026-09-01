const express = require('express');
const router = express.Router();
const productoServicioController = require('../controllers/productoServicioController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('productos-servicios', 'ver'), productoServicioController.getAll);
router.post('/', requireActionAccess('productos-servicios', 'crear'), productoServicioController.create);
router.put('/:id', requireActionAccess('productos-servicios', 'editar'), productoServicioController.update);
router.delete('/:id', requireActionAccess('productos-servicios', 'eliminar'), productoServicioController.delete);

module.exports = router;
