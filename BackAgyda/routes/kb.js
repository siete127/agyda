const express = require('express');
const router = express.Router();
const kbController = require('../controllers/kbController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

// Público (sin sesión) — la página institucional consume esto para que
// cualquier visitante busque soluciones por su cuenta.
router.get('/publicos', kbController.getArticulosPublicos);
router.get('/publicos/:id', kbController.getArticuloPublicoById);

router.use(authenticateToken);

router.get('/articulos', requireActionAccess('tickets', 'ver'), kbController.getArticulos);
router.get('/articulos/:id', requireActionAccess('tickets', 'ver'), kbController.getArticuloById);
router.post('/articulos', requireActionAccess('tickets', 'gestionar-estado'), kbController.createArticulo);
router.put('/articulos/:id', requireActionAccess('tickets', 'gestionar-estado'), kbController.updateArticulo);
router.post('/articulos/:id/toggle-activo', requireActionAccess('tickets', 'gestionar-estado'), kbController.toggleActivo);

module.exports = router;
