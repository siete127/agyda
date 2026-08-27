const express = require('express');
const router = express.Router();
const kbController = require('../controllers/kbController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.use(authenticateToken);

router.get('/articulos', requireActionAccess('tickets', 'ver'), kbController.getArticulos);
router.get('/articulos/:id', requireActionAccess('tickets', 'ver'), kbController.getArticuloById);
router.post('/articulos', requireActionAccess('tickets', 'gestionar-estado'), kbController.createArticulo);
router.put('/articulos/:id', requireActionAccess('tickets', 'gestionar-estado'), kbController.updateArticulo);
router.post('/articulos/:id/toggle-activo', requireActionAccess('tickets', 'gestionar-estado'), kbController.toggleActivo);

module.exports = router;
