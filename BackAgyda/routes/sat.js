const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/satCatalogosController');
const { authenticateToken } = require('../middleware/auth');

// Catálogos SAT — lectura para cualquier usuario autenticado (son públicos).
router.get('/prod-serv', authenticateToken, ctrl.buscarProdServ);
router.get('/unidades', authenticateToken, ctrl.buscarUnidades);
router.get('/regimen-fiscal', authenticateToken, ctrl.listRegimenFiscal);
router.get('/uso-cfdi', authenticateToken, ctrl.listUsoCfdi);
router.get('/forma-pago', authenticateToken, ctrl.listFormaPago);
router.get('/metodo-pago', authenticateToken, ctrl.listMetodoPago);

module.exports = router;
