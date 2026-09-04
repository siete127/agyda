const express = require('express');
const router = express.Router();
const { authenticateToken, verificarRol } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');
const cfg = require('../controllers/facturacionConfigController');
const fiscal = require('../controllers/empresaFiscalController');

const soloConfig = [authenticateToken, verificarRol(['AD', 'TI']), requireActionAccess('crm', 'facturacion-configurar')];

// Datos fiscales del emisor + CSD
router.get('/emisor', authenticateToken, verificarRol(['AD', 'TI']), fiscal.getFiscal);
router.put('/emisor', ...soloConfig, fiscal.updateFiscal);
router.post('/emisor/csd', ...soloConfig, fiscal.subirCSD);
router.delete('/emisor/csd', ...soloConfig, fiscal.eliminarCSD);

// PAC
router.get('/config', authenticateToken, verificarRol(['AD', 'TI']), cfg.getConfig);
router.put('/config', ...soloConfig, cfg.updateConfig);
router.post('/config/probar', ...soloConfig, cfg.probarConexion);

module.exports = router;
