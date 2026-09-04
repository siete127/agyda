const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const ctrl = require('../controllers/facturasController');

router.get('/', authenticateToken, ctrl.list);
router.post('/desde-cotizacion/:cotId', authenticateToken, requireActionAccess('crm', 'facturar'), ctrl.desdeCotizacion);

// Pagos y notas de crédito — rutas específicas antes de las genéricas /:id.
router.get('/:id/pagos', authenticateToken, ctrl.listPagos);
router.post('/:id/pagos', authenticateToken, requireActionAccess('crm', 'facturar'), ctrl.registrarPago);
router.post('/pagos/:pagoId/cancelar', authenticateToken, requireActionAccess('crm', 'facturar'), ctrl.cancelarPago);
router.get('/:id/notas-credito', authenticateToken, ctrl.listNotasCredito);
router.post('/:id/notas-credito', authenticateToken, requireActionAccess('crm', 'nota-credito'), ctrl.emitirNotaCredito);
router.post('/notas-credito/:ncId/cancelar', authenticateToken, requireActionAccess('crm', 'nota-credito'), ctrl.cancelarNotaCredito);
router.get('/pagos/:docId/documento/:formato', authenticateToken, (req, res) => { req.params.tipo = 'pago'; ctrl.descargarSecundario(req, res); });
router.get('/notas-credito/:docId/documento/:formato', authenticateToken, (req, res) => { req.params.tipo = 'nota-credito'; ctrl.descargarSecundario(req, res); });

router.get('/:id', authenticateToken, ctrl.getById);
router.get('/:id/documento/:formato', authenticateToken, ctrl.descargar);
router.post('/:id/cancelar', authenticateToken, requireActionAccess('crm', 'facturacion-cancelar'), ctrl.cancelar);

module.exports = router;
