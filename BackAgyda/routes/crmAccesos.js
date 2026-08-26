const express = require('express')
const router = express.Router()
const ctrl = require('../controllers/crmAccesosController')
const { authenticateToken, verificarRol } = require('../middleware/auth')

router.get('/mis-permisos', authenticateToken, ctrl.getMisPermisos)
router.get('/',     authenticateToken, verificarRol(['AD', 'TI']), ctrl.getAccesos)
router.post('/',    authenticateToken, verificarRol(['AD', 'TI']), ctrl.addAcceso)
router.put('/:id',  authenticateToken, verificarRol(['AD', 'TI']), ctrl.updateAcceso)
router.delete('/:id', authenticateToken, verificarRol(['AD', 'TI']), ctrl.deleteAcceso)

module.exports = router
