const express = require('express');
const router = express.Router();
const camposController = require('../controllers/camposPersonalizadosController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/', requireActionAccess('configuracion', 'ver'), camposController.getCampos);
router.post('/', requireActionAccess('configuracion', 'configurar'), camposController.createCampo);
router.put('/:id', requireActionAccess('configuracion', 'configurar'), camposController.updateCampo);
router.patch('/:id/activo', requireActionAccess('configuracion', 'configurar'), camposController.toggleCampoActivo);
router.delete('/:id', requireActionAccess('configuracion', 'configurar'), camposController.deleteCampo);

router.get('/por-categoria/:catId', requireActionAccess('tickets', 'ver'), camposController.getCamposPorCategoria);
router.get('/valores/:ticketId', requireActionAccess('tickets', 'ver'), camposController.getValoresDeTicket);

module.exports = router;
