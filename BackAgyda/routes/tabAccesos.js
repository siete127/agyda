const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/tabAccesosController')
const { authenticateToken, verificarRol } = require('../middleware/auth')

router.get('/mis-permisos', authenticateToken, ctrl.getMisTabPermisos)
router.get('/',  authenticateToken, verificarRol(['AD', 'TI']), ctrl.getTabAccesos)
router.post('/', authenticateToken, verificarRol(['AD', 'TI']), ctrl.setTabAccesos)

module.exports = router
