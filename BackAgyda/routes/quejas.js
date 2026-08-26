const express = require('express');
const router = express.Router();
const quejaController = require('../controllers/quejaController');
const { authenticateToken } = require('../middleware/auth');
const { requireActionAccess } = require('../middleware/moduleAccess');

router.get('/stats', quejaController.getQuejasStats);
router.get('/', quejaController.getQuejas);
router.post('/', quejaController.createQueja);
router.patch('/:quejaId/estatus', authenticateToken, requireActionAccess('quejas', 'gestionar-estatus'), quejaController.updateEstatus);
router.delete('/:quejaId', authenticateToken, requireActionAccess('quejas', 'gestionar-estatus'), quejaController.deleteQueja);
router.get('/:quejaId/comentarios', quejaController.getComentarios);
router.post('/:quejaId/comentarios', quejaController.addComentario);
router.get('/:quejaId/accion-correctiva', authenticateToken, requireActionAccess('quejas', 'accion-correctiva'), quejaController.getAccionCorrectiva);
router.post('/:quejaId/accion-correctiva', authenticateToken, requireActionAccess('quejas', 'accion-correctiva'), quejaController.createAccionCorrectiva);

module.exports = router;
