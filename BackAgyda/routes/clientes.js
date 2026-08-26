const express = require('express');
const router = express.Router();
const clienteController = require('../controllers/clienteController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/productos', requireActionAccess('clientes', 'ver'), clienteController.getProductos);
router.get('/servicios', requireActionAccess('clientes', 'ver'), clienteController.getServicios);
router.get('/', requireActionAccess('clientes', 'ver'), clienteController.getClientes);
router.post('/', requireActionAccess('clientes', 'crear'), clienteController.createCliente);
router.put('/:id', requireActionAccess('clientes', 'editar'), clienteController.updateCliente);
router.delete('/:id', requireActionAccess('clientes', 'eliminar'), clienteController.deleteCliente);

module.exports = router;
