const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const ctrl = require('../controllers/facturasController');

router.get('/', authenticateToken, ctrl.list);
router.get('/:id', authenticateToken, ctrl.getById);
router.get('/:id/documento/:formato', authenticateToken, ctrl.descargar);
router.post('/desde-cotizacion/:cotId', authenticateToken, requireActionAccess('crm', 'facturar'), ctrl.desdeCotizacion);
router.post('/:id/cancelar', authenticateToken, requireActionAccess('crm', 'facturacion-cancelar'), ctrl.cancelar);

module.exports = router;
