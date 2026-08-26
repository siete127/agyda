const express = require('express');
const router = express.Router();
const aclaracionController = require('../controllers/aclaracionController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/', authenticateToken, requireActionAccess('atencion-cliente', 'ver-aclaraciones'), aclaracionController.getAclaraciones);
router.post('/', authenticateToken, requireActionAccess('atencion-cliente', 'crear-aclaracion'), aclaracionController.createAclaracion);
router.patch('/:aclaracionId/estatus', authenticateToken, requireActionAccess('atencion-cliente', 'ver-aclaraciones'), aclaracionController.updateEstatus);
router.delete('/:aclaracionId', authenticateToken, requireActionAccess('atencion-cliente', 'gestionar-aclaraciones'), aclaracionController.deleteAclaracion);
router.get('/:aclaracionId/comentarios', authenticateToken, requireActionAccess('atencion-cliente', 'ver-aclaraciones'), aclaracionController.getComentarios);
router.post('/:aclaracionId/comentarios', authenticateToken, requireActionAccess('atencion-cliente', 'ver-aclaraciones'), aclaracionController.addComentario);

module.exports = router;
