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

router.get('/:id/finanzas', requireActionAccess('clientes', 'ver'), clienteController.getFinanzasCliente);
router.get('/:id/productos-servicios', requireActionAccess('clientes', 'ver'), clienteController.getProductosServiciosCliente);
router.post('/:id/productos-servicios', requireActionAccess('clientes', 'editar'), clienteController.asignarProductoServicio);
router.delete('/:id/productos-servicios/:psId', requireActionAccess('clientes', 'editar'), clienteController.quitarProductoServicio);

module.exports = router;
